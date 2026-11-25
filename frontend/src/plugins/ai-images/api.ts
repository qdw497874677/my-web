import { useCallback, useEffect, useState } from "react";
import { captureAdminUnauthorized } from "../../workbench/admin-http";

export interface ImageTemplate {
  id: string;
  label: string;
  description: string;
  referenceImageCount: number;
  aspectRatio: string;
  modelIds: string[];
}

export interface ImageGenerationCatalog {
  enabled: boolean;
  issue?: "invalid_configuration";
  templates: ImageTemplate[];
  models: { id: string; label: string }[];
}

type CatalogState = {
  catalog: ImageGenerationCatalog | null;
  loading: boolean;
  error: string | null;
};

const emptyState: CatalogState = { catalog: null, loading: false, error: null };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string";
const isNonemptyText = (value: unknown): value is string =>
  isText(value) && value.trim().length > 0;

function parseCatalog(value: unknown): ImageGenerationCatalog {
  if (
    !isRecord(value) ||
    typeof value.enabled !== "boolean" ||
    (value.issue !== undefined && value.issue !== "invalid_configuration") ||
    !Array.isArray(value.templates) ||
    !Array.isArray(value.models) ||
    !value.templates.every(
      (item: unknown) =>
        isRecord(item) &&
        isNonemptyText(item.id) &&
        isNonemptyText(item.label) &&
        isText(item.description) &&
        Number.isSafeInteger(item.referenceImageCount) &&
        (item.referenceImageCount as number) >= 0 &&
        isNonemptyText(item.aspectRatio) &&
        Array.isArray(item.modelIds) &&
        item.modelIds.every(isNonemptyText),
    ) ||
    !value.models.every(
      (item: unknown) => isRecord(item) && isNonemptyText(item.id) && isNonemptyText(item.label),
    )
  ) {
    throw new Error("图片生成配置无效，请稍后重试");
  }
  return value as unknown as ImageGenerationCatalog;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const invalidateSession = captureAdminUnauthorized();
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: "include" });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new Error("无法连接服务器，请检查网络后重试");
  }
  if (!response.ok) {
    if (response.status === 401 && !init.signal?.aborted) invalidateSession();
    const payload: unknown = await response.json().catch(() => null);
    const message =
      isRecord(payload) && isNonemptyText(payload.error)
        ? payload.error
        : `请求失败（${response.status}）`;
    throw new Error(message);
  }
  return response;
}

/** Only pass enabled=true after the administrator session has been confirmed. */
export function useImageGenerationCatalog(enabled = false): CatalogState & { retry: () => void } {
  const [state, setState] = useState<CatalogState>(emptyState);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState(emptyState);
      return;
    }
    const controller = new AbortController();
    setState({ catalog: null, loading: true, error: null });
    void (async () => {
      try {
        const response = await request("/api/admin/ai-images/catalog", {
          signal: controller.signal,
        });
        const catalog = parseCatalog(await response.json().catch(() => null));
        if (!controller.signal.aborted) setState({ catalog, loading: false, error: null });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            catalog: null,
            loading: false,
            error: error instanceof Error ? error.message : "图片生成配置加载失败",
          });
        }
      }
    })();
    return () => controller.abort();
  }, [enabled, attempt]);

  return { ...(enabled ? state : emptyState), retry };
}

export async function generateImage(
  input: { templateId: string; modelId: string; instructions: string; references: readonly File[] },
  signal?: AbortSignal,
): Promise<Blob> {
  const body = new FormData();
  body.set("templateId", input.templateId);
  body.set("modelId", input.modelId);
  if (input.instructions) body.set("instructions", input.instructions);
  input.references.forEach((file) => body.append("reference", file));
  const response = await request("/api/admin/ai-images/generate", { method: "POST", body, signal });
  const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (!mime || !["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    throw new Error("服务器返回的图片格式无效");
  }
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp =
    bytes.length >= 12 &&
    [82, 73, 70, 70].every((byte, index) => bytes[index] === byte) &&
    [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte);
  if (
    blob.type.toLowerCase().split(";", 1)[0].trim() !== mime ||
    !(mime === "image/png" ? png : mime === "image/jpeg" ? jpeg : webp)
  ) {
    throw new Error("服务器返回的图片格式无效");
  }
  return blob;
}
