import type { FastifyPluginAsync } from "fastify";
import { DomainError } from "../../types.js";
import {
  detectRasterMime,
  maxImageOutputBytes,
  maxReferenceImageBytes,
  type ImageModel,
  type RasterImage,
} from "./contracts.js";
import { imageTemplates, supportsTemplate } from "./templates.js";

export interface AiImagesOptions {
  models: readonly ImageModel[];
  trustedOrigin: string;
  issue?: "invalid_configuration";
}

const windowMs = 10 * 60 * 1000;
const deadlineMs = 180 * 1000;
const uploadDeadlineMs = 60 * 1000;

export const aiImagesPlugin: FastifyPluginAsync<AiImagesOptions> = async (app, options) => {
  const availableModels = options.issue ? [] : options.models;
  const catalog = imageTemplates
    .map((template) => ({
      id: template.id,
      label: template.label,
      description: template.description,
      referenceImageCount: template.referenceImageCount,
      aspectRatio: template.aspectRatio,
      modelIds: availableModels
        .filter((model) => supportsTemplate(model, template))
        .map((model) => model.id),
    }))
    .filter((template) => template.modelIds.length > 0);
  const enabled = catalog.length > 0;
  const modelIds = new Set(catalog.flatMap((template) => template.modelIds));
  const models = availableModels
    .filter((model) => modelIds.has(model.id))
    .map(({ id, label }) => ({ id, label }));
  let busy = false;
  let attempts: number[] = [];

  app.get("/catalog", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return { enabled, templates: catalog, models, ...(options.issue && { issue: options.issue }) };
  });

  app.post(
    "/generate",
    {
      preHandler: async (request, reply) => {
        if (!enabled) return reply.code(404).send({ error: "图片生成未启用" });
        if (request.headers.origin !== options.trustedOrigin)
          return reply.code(403).send({ error: "来源不受信任" });
      },
    },
    async (request, reply) => {
      if (busy) throw new DomainError(429, "图片生成正在进行");
      attempts = attempts.filter((time) => time > Date.now() - windowMs);
      if (attempts.length >= 6) throw new DomainError(429, "图片生成次数过多");
      // Reserve before reading the multipart stream, not merely before dispatch.
      busy = true;
      let releaseHere = true;
      // Bound the reservation even when an authenticated client stalls mid-upload.
      let uploadExpired = false;
      const uploadTimer = setTimeout(() => {
        uploadExpired = true;
        request.raw.destroy();
      }, uploadDeadlineMs);
      try {
        if (!request.isMultipart()) throw new DomainError(400, "需要 multipart 表单");
        const fields: Record<string, string> = Object.create(null) as Record<string, string>;
        const references: RasterImage[] = [];
        let totalSize = 0;
        for await (const part of request.parts({
          limits: {
            files: 2,
            fields: 3,
            parts: 5,
            fileSize: maxReferenceImageBytes + 1,
            fieldSize: 4096,
          },
        })) {
          if (part.type === "file") {
            if (part.fieldname !== "reference") {
              part.file.resume();
              throw new DomainError(400, "不支持的文件字段");
            }
            const bytes = await part.toBuffer();
            totalSize += bytes.length;
            if (bytes.length > maxReferenceImageBytes || totalSize > 2 * maxReferenceImageBytes)
              throw new DomainError(413, "参考图片过大");
            const mimeType = detectRasterMime(bytes);
            if (!mimeType || mimeType !== part.mimetype)
              throw new DomainError(400, "参考图片格式无效");
            references.push({ bytes, mimeType });
          } else {
            if (
              !["templateId", "modelId", "instructions"].includes(part.fieldname) ||
              Object.hasOwn(fields, part.fieldname) ||
              part.fieldnameTruncated ||
              part.valueTruncated ||
              typeof part.value !== "string"
            ) {
              throw new DomainError(400, "表单字段无效");
            }
            fields[part.fieldname] = part.value;
          }
        }
        clearTimeout(uploadTimer);
        if (uploadExpired || request.raw.aborted) throw new DomainError(400, "上传未完成");
        if ((fields.instructions?.length ?? 0) > 1000) throw new DomainError(400, "补充说明过长");
        const template = imageTemplates.find((item) => item.id === fields.templateId);
        const model = availableModels.find((item) => item.id === fields.modelId);
        if (
          !template ||
          !model ||
          !supportsTemplate(model, template) ||
          references.length !== template.referenceImageCount
        )
          throw new DomainError(400, "模板、模型或参考图片不匹配");

        const prompt =
          template.prompt + (fields.instructions ? `\n用户补充说明：${fields.instructions}` : "");
        const controller = new AbortController();
        attempts.push(Date.now());
        // Keep the reservation until the provider settles even if it ignores abort.
        const generation = Promise.resolve().then(() =>
          model.generate(
            { prompt, aspectRatio: template.aspectRatio, references },
            controller.signal,
          ),
        );
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new DomainError(504, "图片生成超时"));
          }, deadlineMs);
        });
        try {
          const result = await Promise.race([generation, timeout]);
          if (
            !Buffer.isBuffer(result.bytes) ||
            result.bytes.length > maxImageOutputBytes ||
            detectRasterMime(result.bytes) !== result.mimeType ||
            !result.mimeType
          )
            throw new Error("Invalid image output");
          return reply
            .type(result.mimeType)
            .header("Cache-Control", "no-store")
            .header("X-Content-Type-Options", "nosniff")
            .send(result.bytes);
        } catch {
          if (controller.signal.aborted) {
            releaseHere = false;
            void generation.then(
              () => {
                busy = false;
              },
              () => {
                busy = false;
              },
            );
            throw new DomainError(504, "图片生成超时");
          }
          throw new DomainError(502, "图片生成服务不可用");
        } finally {
          if (timer) clearTimeout(timer);
        }
      } finally {
        clearTimeout(uploadTimer);
        if (releaseHere) busy = false;
      }
    },
  );
};
