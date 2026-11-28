import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { maxImageOutputBytes, type ImageModel } from "../src/plugins/ai-images/contracts.js";

const origin = "http://localhost:5173";
const png = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082",
  "hex",
);
type Part = { name: string; value: string } | { name: string; bytes: Buffer; mime: string };
function form(parts: Part[]) {
  const boundary = "ai-image-test-boundary";
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${"bytes" in part ? '; filename="test.png"' : ""}\r\n${"bytes" in part ? `Content-Type: ${part.mime}\r\n` : ""}\r\n`,
      ),
    );
    chunks.push("bytes" in part ? part.bytes : Buffer.from(part.value));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
const fields = (templateId = "editorial-cover", modelId = "fake"): Part[] => [
  { name: "templateId", value: templateId },
  { name: "modelId", value: modelId },
];
const reference: Part = { name: "reference", bytes: png, mime: "image/png" };

describe("AI 图片接口", () => {
  let app: App | undefined;
  let cookie = "";
  const generate = vi.fn<ImageModel["generate"]>();
  const model: ImageModel = {
    id: "fake",
    label: "测试模型",
    maxReferenceImages: 1,
    aspectRatios: ["1:1"],
    generate,
  };
  const appOptions = {
    databasePath: ":memory:",
    uploadDir: "memory",
    nodeEnv: "test",
    frontendOrigin: origin,
    initializeOwner: { email: "test@test.test", password: "test" },
  };

  async function start(models: readonly ImageModel[] = [model]) {
    generate.mockReset().mockResolvedValue({ bytes: png, mimeType: "image/png" });
    app = await buildApp({ ...appOptions, aiImageModels: models });
    await loginOwner();
  }
  async function loginOwner() {
    const login = await app!.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: appOptions.initializeOwner,
    });
    expect(login.statusCode).toBe(200);
    cookie = `${login.cookies[0]!.name}=${login.cookies[0]!.value}`;
  }
  function post(parts: Part[], headers: Record<string, string> = {}) {
    const body = form(parts);
    return app!.inject({
      method: "POST",
      url: "/api/admin/ai-images/generate",
      headers: { cookie, origin, "content-type": body.contentType, ...headers },
      payload: body.payload,
    });
  }
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("requires owner and disables routes without models", async () => {
    await start([]);
    expect(
      (await app!.inject({ method: "GET", url: "/api/admin/ai-images/catalog" })).statusCode,
    ).toBe(401);
    expect(
      (await app!.inject({ method: "POST", url: "/api/admin/ai-images/generate" })).statusCode,
    ).toBe(401);
    expect(
      (
        await app!.inject({
          method: "GET",
          url: "/api/admin/ai-images/catalog",
          headers: { cookie },
        })
      ).json(),
    ).toEqual({ enabled: false, templates: [], models: [] });
    expect((await post(fields())).statusCode).toBe(404);
  });

  it("isolates an invalid registry, exposes only a safe owner issue, and never dispatches generation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "linjian-image-config-"));
    const configPath = join(dir, "private-config.json");
    const fetcher = vi.fn();
    writeFileSync(configPath, '{"secret-value":"do-not-disclose"');
    vi.stubEnv("AI_IMAGES_ENABLED", "true");
    vi.stubEnv("AI_IMAGES_CONFIG", configPath);
    vi.stubGlobal("fetch", fetcher);
    try {
      // Even with an origin unusable for generation, the invalid registry cannot enable it.
      app = await buildApp({ ...appOptions, frontendOrigin: `${origin}/`, seed: true });
      expect((await app.inject("/api/health")).statusCode).toBe(200);
      const publicArticles = await app.inject("/api/public/articles");
      expect(publicArticles.statusCode).toBe(200);
      expect(publicArticles.json().items.length).toBeGreaterThan(0);
      const path = "/api/admin/ai-images/catalog";
      const anonymous = await app.inject(path);
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.body).not.toContain("invalid_configuration");
      await loginOwner();
      expect(
        (await app.inject({ url: "/api/admin/articles", headers: { cookie } })).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/admin/categories",
            headers: { cookie },
            payload: { name: "配置故障期间的新栏目" },
          })
        ).statusCode,
      ).toBe(201);
      const catalog = await app.inject({ url: path, headers: { cookie } });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.headers["cache-control"]).toBe("no-store");
      expect(catalog.json()).toEqual({
        enabled: false,
        templates: [],
        models: [],
        issue: "invalid_configuration",
      });
      expect((await post(fields())).statusCode).toBe(404);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still refuses to start with configured models and a noncanonical trusted origin", async () => {
    await expect(
      buildApp({ ...appOptions, frontendOrigin: `${origin}/`, aiImageModels: [model] }),
    ).rejects.toThrow("AI 生图要求 FRONTEND_ORIGIN");
  });

  it("exposes only compatible public catalog metadata and generates both workflows", async () => {
    await start();
    const catalog = (
      await app!.inject({ method: "GET", url: "/api/admin/ai-images/catalog", headers: { cookie } })
    ).json();
    expect(catalog.enabled).toBe(true);
    expect(catalog.models).toEqual([{ id: "fake", label: "测试模型" }]);
    expect(catalog.templates.map((t: { id: string }) => t.id)).toEqual([
      "editorial-cover",
      "photo-illustration",
    ]);
    expect(JSON.stringify(catalog)).not.toContain("prompt");
    const result = await post([...fields(), { name: "instructions", value: "雨天" }]);
    expect(result.statusCode).toBe(200);
    expect(result.headers["content-type"]).toBe("image/png");
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.headers["x-content-type-options"]).toBe("nosniff");
    expect(result.rawPayload).toEqual(png);
    expect(generate.mock.calls[0]![0]).toMatchObject({
      aspectRatio: "1:1",
      references: [],
      prompt: expect.stringContaining("雨天"),
    });
    expect((await post([...fields("photo-illustration"), reference])).statusCode).toBe(200);
    expect(generate.mock.calls[1]![0].references).toEqual([{ bytes: png, mimeType: "image/png" }]);
  });

  it("loads the Bailian example and serves both Qwen generation modes through the owner API", async () => {
    const configPath = fileURLToPath(new URL("../ai-images.bailian.example.json", import.meta.url));
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ data: [{ b64_json: png.toString("base64") }] }),
    );
    vi.stubEnv("AI_IMAGES_ENABLED", "true");
    vi.stubEnv("AI_IMAGES_CONFIG", configPath);
    vi.stubEnv("DASHSCOPE_API_KEY", "example-test-only-key");
    vi.stubGlobal("fetch", fetcher);
    try {
      app = await buildApp(appOptions);
      expect(fetcher).not.toHaveBeenCalled();
      await loginOwner();
      const catalog = await app.inject({
        url: "/api/admin/ai-images/catalog",
        headers: { cookie },
      });
      expect(catalog.statusCode).toBe(200);
      const modelId = "bailian-qwen-image-3-pro";
      expect(catalog.json()).toMatchObject({
        enabled: true,
        models: [{ id: modelId, label: "百炼 · 千问图像 3.0 Pro" }],
        templates: [
          { id: "editorial-cover", modelIds: [modelId] },
          { id: "photo-illustration", modelIds: [modelId] },
          { id: "landscape-banner", modelIds: [modelId] },
        ],
      });
      expect(catalog.body).not.toContain("example-test-only-key");
      expect(catalog.body).not.toContain("maas.aliyuncs.com");
      for (const parts of [
        fields("editorial-cover", modelId),
        [...fields("photo-illustration", modelId), reference],
      ]) {
        const result = await post(parts);
        expect(result.statusCode).toBe(200);
        expect(result.headers["content-type"]).toBe("image/png");
        expect(result.rawPayload).toEqual(png);
      }
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("rejects invalid origin, fields, images and incompatible pairs without dispatch", async () => {
    await start();
    expect((await post(fields(), { origin: "http://evil.test" })).statusCode).toBe(403);
    const noOrigin = form(fields());
    expect(
      (
        await app!.inject({
          method: "POST",
          url: "/api/admin/ai-images/generate",
          headers: { cookie, "content-type": noOrigin.contentType },
          payload: noOrigin.payload,
        })
      ).statusCode,
    ).toBe(403);
    for (const parts of [
      [...fields(), { name: "prompt", value: "x" }],
      [...fields(), { name: "modelId", value: "fake" }],
      [...fields(), { name: "instructions", value: "x".repeat(1001) }],
      fields("landscape-banner"),
      fields("missing"),
      fields("photo-illustration"),
      [...fields(), reference],
      [...fields("photo-illustration"), { name: "reference", bytes: png, mime: "image/jpeg" }],
      [
        ...fields("photo-illustration"),
        { name: "reference", bytes: Buffer.from("not an image"), mime: "image/png" },
      ],
      [
        ...fields("photo-illustration"),
        { name: "reference", bytes: Buffer.alloc(5 * 1024 * 1024 + 1), mime: "image/png" },
      ],
      [...fields("photo-illustration"), reference, reference, reference],
    ] as Part[][])
      expect((await post(parts)).statusCode).toBeGreaterThanOrEqual(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it("accepts exactly three fields and two file parts at the parser boundary", async () => {
    await start([{ ...model, maxReferenceImages: 2 }]);
    const fiveParts = [
      ...fields("photo-illustration"),
      { name: "instructions", value: "测试" },
      reference,
      reference,
    ];
    // No built-in template currently uses two references. Reaching this specific
    // validation error proves all five parts were parsed without a limit error.
    const response = await post(fiveParts);
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("模板、模型或参考图片不匹配");
    expect(
      (await post([...fiveParts, { name: "extra", value: "x" }])).statusCode,
    ).toBeGreaterThanOrEqual(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it("enforces concurrency and six dispatches in a rolling window", async () => {
    await start();
    let resolve!: (result: { bytes: Buffer; mimeType: "image/png" }) => void;
    generate.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = post(fields());
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect((await post(fields())).statusCode).toBe(429);
    resolve({ bytes: png, mimeType: "image/png" });
    expect((await pending).statusCode).toBe(200);
    for (let i = 0; i < 5; i++) expect((await post(fields())).statusCode).toBe(200);
    expect((await post(fields())).statusCode).toBe(429);
    expect(generate).toHaveBeenCalledTimes(6);
  });

  it("maps provider failures and invalid output to safe 502", async () => {
    await start();
    generate
      .mockRejectedValueOnce(new Error("secret provider detail"))
      .mockResolvedValueOnce({ bytes: Buffer.from("bad"), mimeType: "image/png" });
    const failed = await post(fields());
    expect(failed.statusCode).toBe(502);
    expect(failed.body).not.toContain("secret");
    expect((await post(fields())).statusCode).toBe(502);
  });

  it("honors the shared output size limit", async () => {
    await start();
    const output = Buffer.alloc(maxImageOutputBytes + 1);
    png.copy(output);
    generate
      .mockResolvedValueOnce({
        bytes: output.subarray(0, maxImageOutputBytes),
        mimeType: "image/png",
      })
      .mockResolvedValueOnce({ bytes: output, mimeType: "image/png" });
    expect((await post(fields())).statusCode).toBe(200);
    expect((await post(fields())).statusCode).toBe(502);
  });
});
