import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageConfigurationError, loadImageModels } from "../src/plugins/ai-images/providers.js";
import {
  maxReferenceImageBytes,
  type GenerationInput,
} from "../src/plugins/ai-images/contracts.js";

const png = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
);
const input: GenerationInput = { prompt: "draw", aspectRatio: "2:3", references: [] };
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function config(protocol: "openai-images" | "gemini" = "openai-images") {
  return {
    providers: [
      {
        id: "provider",
        protocol,
        apiKeyEnv: "API_KEY",
        models: [
          {
            id: "public-model",
            label: "Model",
            model: "explicit-model",
            maxReferenceImages: 2,
            aspectRatios: ["1:1", "2:3", "3:2"],
            options: protocol === "gemini" ? { imageSize: "2K" } : { quality: "high" },
          },
        ],
      },
    ],
  };
}
function load(value: unknown, fetcher: typeof fetch) {
  const dir = mkdtempSync(join(tmpdir(), "image-provider-test-"));
  dirs.push(dir);
  const path = join(dir, "config.json");
  writeFileSync(path, JSON.stringify(value));
  return loadImageModels({ AI_IMAGES_CONFIG: path, API_KEY: "secret-key" }, fetcher);
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const image = { bytes: png, mimeType: "image/png" as const };

describe("image provider registry", () => {
  it("loads the default registry if present, and remains off if absent or disabled", () => {
    const dir = mkdtempSync(join(tmpdir(), "image-provider-test-"));
    dirs.push(dir);
    const path = join(dir, "data", "ai-images.json");
    const fetcher = vi.fn<typeof fetch>();
    expect(loadImageModels({}, fetcher, path)).toEqual([]);
    mkdirSync(join(dir, "data"));
    writeFileSync(path, JSON.stringify(config()));
    expect(loadImageModels({ API_KEY: "fake" }, fetcher, path).map((model) => model.id)).toEqual([
      "public-model",
    ]);
    expect(
      loadImageModels({ AI_IMAGES_ENABLED: "true", API_KEY: "fake" }, fetcher, path),
    ).toHaveLength(1);
    expect(
      loadImageModels(
        { AI_IMAGES_ENABLED: "false", AI_IMAGES_CONFIG: "/not/a/config" },
        fetcher,
        path,
      ),
    ).toEqual([]);
    expect(loadImageModels({ AI_IMAGES_ENABLED: "false" }, fetcher, path)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects invalid default config and missing or empty explicit paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "image-provider-test-"));
    dirs.push(dir);
    const path = join(dir, "config.json");
    writeFileSync(path, "{ invalid");
    const fetcher = vi.fn<typeof fetch>();
    expect(() => loadImageModels({}, fetcher, path)).toThrow(/^图片服务配置无效：配置文件$/);
    expect(() =>
      loadImageModels({ AI_IMAGES_CONFIG: join(dir, "missing") }, fetcher, path),
    ).toThrow(/^图片服务配置无效：配置文件$/);
    expect(() => loadImageModels({ AI_IMAGES_CONFIG: "" }, fetcher, path)).toThrow(
      /^图片服务配置无效：配置文件$/,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("classifies expected path, file, parse and model validation failures without exposing inputs", () => {
    const dir = mkdtempSync(join(tmpdir(), "image-provider-test-"));
    dirs.push(dir);
    const path = join(dir, "secret-config.json");
    const fetcher = vi.fn<typeof fetch>();
    const rejectsConfig = (fn: () => unknown) => {
      try {
        fn();
        throw new Error("expected configuration failure");
      } catch (error) {
        expect(error).toBeInstanceOf(ImageConfigurationError);
        expect((error as Error).message).not.toContain("secret");
        expect((error as Error).cause).toBeUndefined();
      }
    };
    rejectsConfig(() => loadImageModels({ AI_IMAGES_CONFIG: path }, fetcher));
    rejectsConfig(() => loadImageModels({ AI_IMAGES_CONFIG: `${path}\0bad` }, fetcher));
    rejectsConfig(() => loadImageModels({ AI_IMAGES_CONFIG: dir }, fetcher));
    writeFileSync(path, Buffer.from([0xff]));
    rejectsConfig(() => loadImageModels({ AI_IMAGES_CONFIG: path }, fetcher));
    writeFileSync(path, "{ invalid secret");
    rejectsConfig(() => loadImageModels({ AI_IMAGES_CONFIG: path }, fetcher));
    writeFileSync(path, Buffer.alloc(1024 * 1024 + 1));
    rejectsConfig(() => loadImageModels({ AI_IMAGES_CONFIG: path }, fetcher));
    writeFileSync(path, JSON.stringify(config()));
    rejectsConfig(() => loadImageModels({ AI_IMAGES_CONFIG: path }, fetcher));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("propagates unexpected errors without reclassifying them", () => {
    const dir = mkdtempSync(join(tmpdir(), "image-provider-test-"));
    dirs.push(dir);
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify(config()));
    const failure = new Error("unexpected internal failure");
    const env: NodeJS.ProcessEnv = {
      AI_IMAGES_CONFIG: path,
      get API_KEY(): string {
        throw failure;
      },
    };
    expect(() => loadImageModels(env, vi.fn())).toThrow(failure);
    try {
      loadImageModels(env, vi.fn());
    } catch (error) {
      expect(error).toBe(failure);
    }
  });

  it.skipIf(process.platform === "win32")(
    "classifies a Unix socket path as invalid configuration",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "image-provider-test-"));
      dirs.push(dir);
      const path = join(dir, "registry.sock");
      const server = createServer();
      await new Promise<void>((resolve, reject) =>
        server.once("error", reject).listen(path, resolve),
      );
      try {
        expect(() => loadImageModels({ AI_IMAGES_CONFIG: path }, vi.fn())).toThrow(
          ImageConfigurationError,
        );
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );

  it("maps OpenAI generations and edits without exposing credentials", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ data: [{ b64_json: png.toString("base64") }] }));
    const model = load(config(), fetcher)[0]!;
    expect(Object.keys(model).sort()).toEqual([
      "aspectRatios",
      "generate",
      "id",
      "label",
      "maxReferenceImages",
    ]);
    const signal = new AbortController().signal;
    expect(await model.generate(input, signal)).toEqual(image);
    const [url, request] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(request).toMatchObject({
      method: "POST",
      redirect: "error",
      signal,
      headers: { Authorization: "Bearer secret-key", "Content-Type": "application/json" },
    });
    expect(JSON.parse(request!.body as string)).toEqual({
      model: "explicit-model",
      prompt: "draw",
      size: "1024x1536",
      n: 1,
      output_format: "png",
      quality: "high",
    });
    fetcher.mockResolvedValueOnce(json({ data: [{ b64_json: png.toString("base64") }] }));
    await model.generate({ ...input, aspectRatio: "3:2", references: [image, image] }, signal);
    const [editUrl, editRequest] = fetcher.mock.calls[1]!;
    expect(editUrl).toBe("https://api.openai.com/v1/images/edits");
    const form = editRequest!.body as FormData;
    expect(form.get("size")).toBe("1536x1024");
    expect(form.get("quality")).toBe("high");
    expect(form.getAll("image[]")).toHaveLength(2);
    expect((form.getAll("image[]")[0] as File).type).toBe("image/png");
  });

  it("maps Gemini generateContent inline references and image options", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        candidates: [
          { finishReason: "SAFETY" },
          { content: {} },
          {
            content: {
              parts: [
                { text: "ok" },
                { inlineData: { mimeType: "image/png", data: png.toString("base64") } },
              ],
            },
          },
        ],
      }),
    );
    const model = load(config("gemini"), fetcher)[0]!;
    expect(
      await model.generate({ ...input, references: [image] }, new AbortController().signal),
    ).toEqual(image);
    const [url, request] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1/models/explicit-model:generateContent",
    );
    expect(request).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { "x-goog-api-key": "secret-key" },
    });
    expect(JSON.parse(request!.body as string)).toEqual({
      contents: [
        {
          parts: [
            { text: "draw" },
            { inline_data: { mime_type: "image/png", data: png.toString("base64") } },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "2:3", imageSize: "2K" },
      },
    });
  });

  it("accepts omitted or empty options and rejects unknown or invalid protocol options", async () => {
    for (const protocol of ["openai-images", "gemini"] as const) {
      for (const options of [undefined, {}]) {
        const cfg = config(protocol);
        Object.assign(cfg.providers[0]!.models[0]!, { options });
        const payload =
          protocol === "gemini"
            ? {
                candidates: [
                  {
                    content: {
                      parts: [
                        { inlineData: { mimeType: "image/png", data: png.toString("base64") } },
                      ],
                    },
                  },
                ],
              }
            : { data: [{ b64_json: png.toString("base64") }] };
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(payload));
        await load(cfg, fetcher)[0]!.generate(input, new AbortController().signal);
        const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
        if (protocol === "gemini")
          expect(request.generationConfig.imageConfig).toEqual({ aspectRatio: "2:3" });
        else expect(request).not.toHaveProperty("quality");
      }
      for (const options of [
        { surprise: true },
        protocol === "gemini" ? { imageSize: "bad" } : { quality: "bad" },
        null,
      ]) {
        const cfg = config(protocol);
        Object.assign(cfg.providers[0]!.models[0]!, { options });
        expect(() => load(cfg, vi.fn())).toThrow(/^图片服务配置无效：providers\.models\.options$/);
      }
    }
  });

  it("loads the checked-in example using fake credentials without making requests", () => {
    const fetcher = vi.fn<typeof fetch>();
    const models = loadImageModels(
      {
        AI_IMAGES_CONFIG: join(process.cwd(), "ai-images.example.json"),
        OPENAI_API_KEY: "fake",
        GEMINI_API_KEY: "fake",
      },
      fetcher,
    );
    expect(models.length).toBeGreaterThan(0);
    const mycodex = loadImageModels(
      {
        AI_IMAGES_CONFIG: join(process.cwd(), "ai-images.mycodex.example.json"),
        MYCODEX_API_KEY: "fake",
      },
      fetcher,
    );
    expect(mycodex.map((model) => model.id)).toEqual(["mycodex-gpt-image-2"]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects malformed, oversized, wrong-type and URL outputs with sanitized errors", async () => {
    const responses = [
      { data: [{ url: "https://example.com/image.png" }] },
      { data: [{ b64_json: "%%%%" }] },
      { data: [{ b64_json: Buffer.from("not an image").toString("base64") }] },
      { data: [{ b64_json: "A".repeat((12 * 1024 * 1024 * 4) / 3 + 4) }] },
    ];
    for (const payload of responses) {
      const model = load(config(), vi.fn<typeof fetch>().mockResolvedValue(json(payload)))[0]!;
      await expect(model.generate(input, new AbortController().signal)).rejects.toThrow(
        /^Image provider request failed$/,
      );
    }
    const model = load(
      config("gemini"),
      vi.fn<typeof fetch>().mockResolvedValue(
        json({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: "image/jpeg", data: png.toString("base64") } }],
              },
            },
          ],
        }),
      ),
    )[0]!;
    await expect(model.generate(input, new AbortController().signal)).rejects.toThrow(
      /^Image provider request failed$/,
    );
  });

  it("aborts while a response body is stalled and limits streaming bytes", async () => {
    let cancelled = false;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      ),
    );
    const model = load(config(), fetcher)[0]!;
    const controller = new AbortController();
    const promise = model.generate(input, controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(promise).rejects.toThrow(/^Image provider request failed$/);
    expect(cancelled).toBe(true);
    const large = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(17 * 1024 * 1024 + 1));
        c.close();
      },
    });
    const oversized = load(
      config(),
      vi.fn<typeof fetch>().mockResolvedValue(new Response(large)),
    )[0]!;
    await expect(oversized.generate(input, new AbortController().signal)).rejects.toThrow(
      /^Image provider request failed$/,
    );
  });

  it("cancels rejected response bodies before reading", async () => {
    for (const init of [
      { status: 500 },
      { status: 200, headers: { "content-length": String(17 * 1024 * 1024 + 1) } },
    ]) {
      let cancelled = false;
      const body = new ReadableStream({
        cancel() {
          cancelled = true;
        },
      });
      const model = load(
        config(),
        vi.fn<typeof fetch>().mockResolvedValue(new Response(body, init)),
      )[0]!;
      await expect(model.generate(input, new AbortController().signal)).rejects.toThrow(
        /^Image provider request failed$/,
      );
      expect(cancelled).toBe(true);
    }
  });

  it("rejects reference images over the shared input cap before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const model = load(config(), fetcher)[0]!;
    const bytes = Buffer.alloc(maxReferenceImageBytes + 1);
    png.copy(bytes);
    await expect(
      model.generate(
        { ...input, references: [{ bytes, mimeType: "image/png" }] },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/^Image provider request failed$/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects unsafe config and hides secrets and paths", () => {
    const badConfigs: unknown[] = [];
    const unsafeUrl = config();
    Object.assign(unsafeUrl.providers[0]!, { baseUrl: "https://secret:password@example.com/v1" });
    badConfigs.push(unsafeUrl);
    const httpUrl = config();
    Object.assign(httpUrl.providers[0]!, { baseUrl: "http://example.com" });
    badConfigs.push(httpUrl);
    const queryUrl = config();
    Object.assign(queryUrl.providers[0]!, { baseUrl: "https://example.com?token=secret" });
    badConfigs.push(queryUrl);
    const unsafeModel = config();
    unsafeModel.providers[0]!.models[0]!.model = "../secret";
    badConfigs.push(unsafeModel);
    const duplicate = config();
    duplicate.providers[0]!.models.push({ ...duplicate.providers[0]!.models[0]! });
    badConfigs.push(duplicate);
    const unsafeOption = config();
    Object.assign(unsafeOption.providers[0]!.models[0]!.options, { quality: "secret" });
    badConfigs.push(unsafeOption);
    const tooMany = config();
    tooMany.providers[0]!.models[0]!.maxReferenceImages = 3;
    badConfigs.push(tooMany);
    for (const value of badConfigs)
      expect(() => load(value, vi.fn())).toThrow(/^图片服务配置无效：/);
    expect(() => loadImageModels({ AI_IMAGES_CONFIG: "/missing/secret-path" }, vi.fn())).toThrow(
      /^图片服务配置无效：配置文件$/,
    );
  });
});
