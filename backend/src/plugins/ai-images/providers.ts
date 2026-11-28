import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import {
  aspectRatios,
  detectRasterMime,
  maxImageOutputBytes,
  maxReferenceImageBytes,
  type AspectRatio,
  type ImageModel,
  type RasterImage,
} from "./contracts.js";

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 17 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UPSTREAM_ERROR = "Image provider request failed";
const CONFIG_ERROR = "图片服务配置无效";

type ConfigContext =
  | "配置文件"
  | "providers"
  | "providers.protocol"
  | "providers.apiKeyEnv"
  | "providers.baseUrl"
  | "providers.models"
  | "providers.models.options";
export class ImageConfigurationError extends Error {
  constructor(context: ConfigContext = "配置文件") {
    super(`${CONFIG_ERROR}：${context}`);
    this.name = "ImageConfigurationError";
  }
}

type ObjectValue = Record<string, unknown>;
interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
}
interface ModelConfig {
  id: string;
  label: string;
  model: string;
  maxReferenceImages: number;
  aspectRatios: AspectRatio[];
}
interface Adapter {
  defaultBaseUrl: string | undefined;
  validateBaseUrl?(value: string): void;
  validateModel?(model: ModelConfig): void;
  bind(
    provider: ProviderConfig,
    model: ModelConfig,
    rawOptions: unknown,
    fetcher: typeof fetch,
  ): ImageModel["generate"];
}

function object(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[] = allowed,
): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ImageConfigurationError();
  const result = value as ObjectValue;
  if (
    Object.keys(result).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(result, key))
  )
    throw new ImageConfigurationError();
  return result;
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new ImageConfigurationError();
  return value;
}

function baseUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || /[\\\s?#]/.test(value))
    throw new ImageConfigurationError();
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    if (error instanceof TypeError) throw new ImageConfigurationError();
    throw error;
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ImageConfigurationError();
  return url.href.replace(/\/$/, "");
}

function readConfig(path: string, missingOk: boolean): unknown {
  if (typeof path !== "string" || path.includes("\0")) throw new ImageConfigurationError();
  const expectedErrnos = new Set([
    "ENOENT",
    "EACCES",
    "EPERM",
    "ENOTDIR",
    "EISDIR",
    "ELOOP",
    "ENAMETOOLONG",
  ]);
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (missingOk && code === "ENOENT") return undefined;
    // Unix sockets can fail at open before the regular-file check.
    if (code === "ENXIO" || (code && expectedErrnos.has(code))) throw new ImageConfigurationError();
    throw error;
  }
  try {
    let bytes: Buffer;
    let length = 0;
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) throw new ImageConfigurationError();
      bytes = Buffer.alloc(MAX_CONFIG_BYTES + 1);
      while (length < bytes.length) {
        const count = readSync(fd, bytes, length, bytes.length - length, null);
        if (!count) break;
        length += count;
      }
      if (length > MAX_CONFIG_BYTES) throw new ImageConfigurationError();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code && expectedErrnos.has(code)) throw new ImageConfigurationError();
      throw error;
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
    } catch (error) {
      if (error instanceof TypeError) throw new ImageConfigurationError();
      throw error;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) throw new ImageConfigurationError();
      throw error;
    }
  } finally {
    closeSync(fd);
  }
}

function decodeImage(value: unknown, declaredMime?: unknown): RasterImage {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil(maxImageOutputBytes / 3) * 4 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error(UPSTREAM_ERROR);
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > maxImageOutputBytes || bytes.toString("base64") !== value)
    throw new Error(UPSTREAM_ERROR);
  const mimeType = detectRasterMime(bytes);
  if (!mimeType || (declaredMime !== undefined && declaredMime !== mimeType))
    throw new Error(UPSTREAM_ERROR);
  return { bytes, mimeType };
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.ok || !response.body || signal.aborted) {
    if (response.body) void response.body.cancel().catch(() => {});
    throw new Error(UPSTREAM_ERROR);
  }
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) {
    void response.body.cancel().catch(() => {});
    throw new Error(UPSTREAM_ERROR);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      void reader.cancel().catch(() => {});
      reject(new Error(UPSTREAM_ERROR));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), aborted]);
      if (signal.aborted) throw new Error(UPSTREAM_ERROR);
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_JSON_BYTES) throw new Error(UPSTREAM_ERROR);
      chunks.push(part.value);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total)),
    ) as unknown;
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function responseObject(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(UPSTREAM_ERROR);
  return value as ObjectValue;
}

const sizes: Record<AspectRatio, string> = {
  "1:1": "1024x1024",
  "2:3": "1024x1536",
  "3:2": "1536x1024",
};
const adapters = {
  "bailian-openai-images": {
    // Bailian regions have different endpoints; the deployment must select one explicitly.
    defaultBaseUrl: undefined,
    validateBaseUrl(value) {
      if (!new URL(value).pathname.endsWith("/compatible-mode/v1"))
        throw new ImageConfigurationError();
    },
    validateModel({ model }) {
      if (model !== "qwen-image-3.0-pro" && model !== "qwen-image-3.0")
        throw new ImageConfigurationError();
    },
    bind(provider, model, rawOptions, fetcher) {
      const options =
        rawOptions === undefined ? {} : object(rawOptions, ["promptExtend", "watermark"], []);
      const { promptExtend, watermark } = options;
      if (
        (promptExtend !== undefined && typeof promptExtend !== "boolean") ||
        (watermark !== undefined && typeof watermark !== "boolean")
      )
        throw new ImageConfigurationError();
      return async (input, signal) => {
        const response = await fetcher(`${provider.baseUrl}/images/generations`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model.model,
            prompt: input.prompt,
            n: 1,
            size: sizes[input.aspectRatio],
            response_format: "b64_json",
            ...(input.references.length
              ? {
                  image: input.references.map(
                    (reference) =>
                      `data:${reference.mimeType};base64,${reference.bytes.toString("base64")}`,
                  ),
                }
              : {}),
            ...(promptExtend !== undefined ? { prompt_extend: promptExtend } : {}),
            ...(watermark !== undefined ? { watermark } : {}),
          }),
          signal,
          redirect: "error",
        });
        const data = responseObject(await readJson(response, signal)).data;
        if (!Array.isArray(data) || data.length === 0) throw new Error(UPSTREAM_ERROR);
        return decodeImage(responseObject(data[0]).b64_json);
      };
    },
  },
  "openai-images": {
    defaultBaseUrl: "https://api.openai.com/v1",
    bind(provider, model, rawOptions, fetcher) {
      // Optional quality is an OpenAI-specific enum; absence leaves the provider default.
      const options = rawOptions === undefined ? {} : object(rawOptions, ["quality"], []);
      const quality = options.quality;
      if (
        quality !== undefined &&
        quality !== "low" &&
        quality !== "medium" &&
        quality !== "high" &&
        quality !== "auto"
      )
        throw new ImageConfigurationError();
      return async (input, signal) => {
        const params = {
          model: model.model,
          prompt: input.prompt,
          size: sizes[input.aspectRatio],
          n: 1,
          output_format: "png",
          ...(quality ? { quality } : {}),
        };
        let body: BodyInit;
        const headers: Record<string, string> = { Authorization: `Bearer ${provider.apiKey}` };
        if (input.references.length) {
          const form = new FormData();
          for (const [key, value] of Object.entries(params)) form.append(key, String(value));
          for (const reference of input.references)
            form.append(
              "image[]",
              new Blob([Uint8Array.from(reference.bytes)], { type: reference.mimeType }),
              `reference.${reference.mimeType.split("/")[1]}`,
            );
          body = form;
        } else {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify(params);
        }
        const response = await fetcher(
          `${provider.baseUrl}/images/${input.references.length ? "edits" : "generations"}`,
          { method: "POST", headers, body, signal, redirect: "error" },
        );
        const data = responseObject(await readJson(response, signal)).data;
        if (!Array.isArray(data) || data.length === 0) throw new Error(UPSTREAM_ERROR);
        return decodeImage(responseObject(data[0]).b64_json);
      };
    },
  },
  gemini: {
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1",
    bind(provider, model, rawOptions, fetcher) {
      // Optional imageSize is a Gemini-specific enum; absence leaves the provider default.
      const options = rawOptions === undefined ? {} : object(rawOptions, ["imageSize"], []);
      const imageSize = options.imageSize;
      if (imageSize !== undefined && imageSize !== "1K" && imageSize !== "2K" && imageSize !== "4K")
        throw new ImageConfigurationError();
      return async (input, signal) => {
        const parts = [
          { text: input.prompt },
          ...input.references.map((reference) => ({
            inline_data: {
              mime_type: reference.mimeType,
              data: reference.bytes.toString("base64"),
            },
          })),
        ];
        const body = JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio: input.aspectRatio, ...(imageSize ? { imageSize } : {}) },
          },
        });
        const response = await fetcher(
          `${provider.baseUrl}/models/${model.model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": provider.apiKey },
            body,
            signal,
            redirect: "error",
          },
        );
        const candidates = responseObject(await readJson(response, signal)).candidates;
        if (!Array.isArray(candidates)) throw new Error(UPSTREAM_ERROR);
        for (const candidate of candidates) {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
          const content = (candidate as ObjectValue).content;
          if (
            !content ||
            typeof content !== "object" ||
            Array.isArray(content) ||
            !Array.isArray((content as ObjectValue).parts)
          )
            continue;
          const parts = (content as ObjectValue).parts as unknown[];
          for (const part of parts) {
            if (!part || typeof part !== "object" || Array.isArray(part)) continue;
            const item = part as ObjectValue;
            if (item.inlineData !== undefined) {
              const inline = responseObject(item.inlineData);
              if (typeof inline.mimeType !== "string") throw new Error(UPSTREAM_ERROR);
              return decodeImage(inline.data, inline.mimeType);
            }
          }
        }
        throw new Error(UPSTREAM_ERROR);
      };
    },
  },
} satisfies Record<string, Adapter>;
type Protocol = keyof typeof adapters;

/** Load and validate the registry once at startup; never expose provider credentials. */
export function loadImageModels(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
  defaultPath = "./data/ai-images.json",
): ImageModel[] {
  if (env.AI_IMAGES_ENABLED === "false") return [];
  let context: ConfigContext = "配置文件";
  try {
    const explicitPath = env.AI_IMAGES_CONFIG;
    const rawConfig = readConfig(
      explicitPath === undefined ? defaultPath : explicitPath,
      explicitPath === undefined,
    );
    if (rawConfig === undefined) return [];
    const config = object(rawConfig, ["providers"]);
    if (!Array.isArray(config.providers)) throw new ImageConfigurationError();
    const ids = new Set<string>();
    const providerIds = new Set<string>();
    const result: ImageModel[] = [];
    for (const rawProvider of config.providers) {
      context = "providers";
      const item = object(
        rawProvider,
        ["id", "protocol", "apiKeyEnv", "baseUrl", "models"],
        ["id", "protocol", "apiKeyEnv", "models"],
      );
      const id = safeId(item.id);
      if (providerIds.has(id)) throw new ImageConfigurationError();
      providerIds.add(id);
      context = "providers.protocol";
      if (typeof item.protocol !== "string" || !Object.hasOwn(adapters, item.protocol))
        throw new ImageConfigurationError();
      const protocol = item.protocol as Protocol;
      const adapter: Adapter = adapters[protocol];
      context = "providers.apiKeyEnv";
      if (typeof item.apiKeyEnv !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.apiKeyEnv))
        throw new ImageConfigurationError();
      const apiKey = env[item.apiKeyEnv];
      if (typeof apiKey !== "string" || !apiKey || /[\x00-\x20\x7f]/.test(apiKey))
        throw new ImageConfigurationError();
      context = "providers.baseUrl";
      const provider: ProviderConfig = {
        baseUrl: baseUrl(item.baseUrl === undefined ? adapter.defaultBaseUrl : item.baseUrl),
        apiKey,
      };
      adapter.validateBaseUrl?.(provider.baseUrl);
      context = "providers.models";
      if (!Array.isArray(item.models)) throw new ImageConfigurationError();
      for (const rawModel of item.models) {
        context = "providers.models";
        const entry = object(
          rawModel,
          ["id", "label", "model", "maxReferenceImages", "aspectRatios", "options"],
          ["id", "label", "model", "maxReferenceImages", "aspectRatios"],
        );
        const modelId = safeId(entry.id);
        if (ids.has(modelId)) throw new ImageConfigurationError();
        ids.add(modelId);
        if (
          typeof entry.label !== "string" ||
          !entry.label.trim() ||
          entry.label.length > 200 ||
          /[\x00-\x1f\x7f]/.test(entry.label)
        )
          throw new ImageConfigurationError();
        if (
          !Number.isInteger(entry.maxReferenceImages) ||
          (entry.maxReferenceImages as number) < 0 ||
          (entry.maxReferenceImages as number) > 2
        )
          throw new ImageConfigurationError();
        if (
          !Array.isArray(entry.aspectRatios) ||
          entry.aspectRatios.length === 0 ||
          entry.aspectRatios.some((ratio) => !aspectRatios.includes(ratio)) ||
          new Set(entry.aspectRatios).size !== entry.aspectRatios.length
        )
          throw new ImageConfigurationError();
        const model: ModelConfig = {
          id: modelId,
          label: entry.label,
          model: safeId(entry.model),
          maxReferenceImages: entry.maxReferenceImages as number,
          aspectRatios: [...entry.aspectRatios] as AspectRatio[],
        };
        adapter.validateModel?.(model);
        context = "providers.models.options";
        const generate = adapter.bind(provider, model, entry.options, fetcher);
        result.push({
          id: model.id,
          label: model.label,
          maxReferenceImages: model.maxReferenceImages,
          aspectRatios: [...model.aspectRatios],
          async generate(input, signal) {
            try {
              if (
                signal.aborted ||
                typeof input.prompt !== "string" ||
                !model.aspectRatios.includes(input.aspectRatio) ||
                !Array.isArray(input.references) ||
                input.references.length > model.maxReferenceImages
              )
                throw new Error(UPSTREAM_ERROR);
              for (const reference of input.references) {
                if (
                  !Buffer.isBuffer(reference.bytes) ||
                  reference.bytes.length > maxReferenceImageBytes ||
                  detectRasterMime(reference.bytes) !== reference.mimeType
                )
                  throw new Error(UPSTREAM_ERROR);
              }
              const image = await generate(input, signal);
              if (signal.aborted) throw new Error(UPSTREAM_ERROR);
              return image;
            } catch {
              throw new Error(UPSTREAM_ERROR);
            }
          },
        });
      }
    }
    return result;
  } catch (error) {
    if (error instanceof ImageConfigurationError) throw new ImageConfigurationError(context);
    throw error;
  }
}
