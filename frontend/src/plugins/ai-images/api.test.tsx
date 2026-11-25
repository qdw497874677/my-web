import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateImage, useImageGenerationCatalog } from "./api";
import {
  advanceOwnerSessionEpoch,
  registerOwnerSessionInvalidation,
} from "../../workbench/owner-session-events";

const catalog = {
  enabled: true,
  templates: [
    {
      id: "cover",
      label: "Cover",
      description: "",
      referenceImageCount: 0,
      aspectRatio: "1:1",
      modelIds: ["model"],
    },
  ],
  models: [{ id: "model", label: "Model" }],
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const image = () => new Response(png, { headers: { "Content-Type": "image/png" } });
const input = { templateId: "cover", modelId: "model", instructions: "", references: [] as File[] };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("image generation catalog", () => {
  it("does not fetch without an authenticated caller and clears when disabled", async () => {
    const fetch = vi.fn().mockResolvedValue(json(catalog));
    vi.stubGlobal("fetch", fetch);
    const { result, rerender } = renderHook(({ enabled }) => useImageGenerationCatalog(enabled), {
      initialProps: { enabled: false },
    });
    expect(fetch).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.catalog).toEqual(catalog));
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/ai-images/catalog",
      expect.objectContaining({ credentials: "include", signal: expect.any(AbortSignal) }),
    );
    rerender({ enabled: false });
    expect(result.current).toEqual({
      catalog: null,
      loading: false,
      error: null,
      retry: expect.any(Function),
    });
  });

  it("supports a disabled catalog and rejects malformed data", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ enabled: false, templates: [], models: [] }))
      .mockResolvedValueOnce(json({ enabled: true, templates: [{}], models: [] }));
    vi.stubGlobal("fetch", fetch);
    const { result, rerender } = renderHook(({ enabled }) => useImageGenerationCatalog(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(false));
    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.error).toBe("图片生成配置无效，请稍后重试"));
    expect(result.current.catalog).toBeNull();
  });

  it("accepts the configuration issue and rejects unknown issues", async () => {
    const invalid = { enabled: false, issue: "invalid_configuration", templates: [], models: [] };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(invalid))
        .mockResolvedValueOnce(json({ ...invalid, issue: "unknown" })),
    );
    const { result } = renderHook(() => useImageGenerationCatalog(true));
    await waitFor(() => expect(result.current.catalog).toEqual(invalid));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBe("图片生成配置无效，请稍后重试"));
    expect(result.current.catalog).toBeNull();
  });

  it("retries a failed catalog request", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(json(catalog));
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useImageGenerationCatalog(true));
    await waitFor(() => expect(result.current.error).toBe("无法连接服务器，请检查网络后重试"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.catalog).toEqual(catalog));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts an old request and ignores a late response after re-enabling", async () => {
    let resolveFirst!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(json({ ...catalog, enabled: false }));
    vi.stubGlobal("fetch", fetch);
    const { result, rerender } = renderHook(({ enabled }) => useImageGenerationCatalog(enabled), {
      initialProps: { enabled: true },
    });
    const signal = (fetch.mock.calls[0][1] as RequestInit).signal!;
    rerender({ enabled: false });
    expect(signal.aborted).toBe(true);
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(false));
    await act(async () => {
      resolveFirst(json(catalog));
      await Promise.resolve();
    });
    expect(result.current.catalog?.enabled).toBe(false);
  });

  it("exposes server and network errors", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "未登录" }, 401))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    const { result, rerender } = renderHook(({ enabled }) => useImageGenerationCatalog(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.error).toBe("未登录"));
    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.error).toBe("无法连接服务器，请检查网络后重试"));
  });
});

describe("generateImage", () => {
  it("posts multipart data with repeated references and returns the image without another fetch", async () => {
    const fetch = vi.fn().mockResolvedValue(image());
    vi.stubGlobal("fetch", fetch);
    const references = [
      new File(["a"], "one.png", { type: "image/png" }),
      new File(["b"], "two.png", { type: "image/png" }),
    ];
    const controller = new AbortController();
    const blob = await generateImage(
      { ...input, instructions: "A scene", references },
      controller.signal,
    );
    expect(blob.type).toBe("image/png");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/ai-images/generate");
    expect(options).toMatchObject({
      method: "POST",
      credentials: "include",
      signal: controller.signal,
    });
    expect(options.headers).toBeUndefined();
    const form = options.body as FormData;
    expect(form.get("templateId")).toBe("cover");
    expect(form.get("modelId")).toBe("model");
    expect(form.get("instructions")).toBe("A scene");
    expect(form.getAll("reference")).toEqual(references);
  });

  it("omits empty instructions and references", async () => {
    const fetch = vi.fn().mockResolvedValue(image());
    vi.stubGlobal("fetch", fetch);
    await generateImage(input);
    const form = (fetch.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.has("instructions")).toBe(false);
    expect(form.getAll("reference")).toEqual([]);
  });

  it("reports local errors, status fallback, and network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ error: "生成失败" }, 400))
        .mockResolvedValueOnce(new Response("bad", { status: 502 }))
        .mockRejectedValueOnce(new TypeError("offline")),
    );
    await expect(generateImage(input)).rejects.toThrow("生成失败");
    await expect(generateImage(input)).rejects.toThrow("请求失败（502）");
    await expect(generateImage(input)).rejects.toThrow("无法连接服务器，请检查网络后重试");
  });

  it("rejects invalid content types, empty data, and mismatched image bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({}))
        .mockResolvedValueOnce(new Response("", { headers: { "Content-Type": "image/png" } }))
        .mockResolvedValueOnce(
          new Response("not an image", { headers: { "Content-Type": "image/png" } }),
        ),
    );
    for (let i = 0; i < 3; i++)
      await expect(generateImage(input)).rejects.toThrow("服务器返回的图片格式无效");
  });

  it("preserves cancellation", async () => {
    const controller = new AbortController();
    const aborted = new DOMException("Aborted", "AbortError");
    controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));
    await expect(generateImage(input, controller.signal)).rejects.toBe(aborted);
  });

  it("only invalidates the current, non-aborted admin request", async () => {
    const invalidate = vi.fn();
    const unregister = registerOwnerSessionInvalidation(invalidate);
    try {
      let resolve!: (response: Response) => void;
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise<Response>((done) => {
                resolve = done;
              }),
          )
          .mockImplementation(() => Promise.resolve(json({ error: "未登录" }, 401))),
      );
      const old = generateImage(input);
      advanceOwnerSessionEpoch();
      resolve(json({ error: "未登录" }, 401));
      await expect(old).rejects.toThrow("未登录");
      expect(invalidate).not.toHaveBeenCalled();
      const controller = new AbortController();
      controller.abort();
      await expect(generateImage(input, controller.signal)).rejects.toThrow("未登录");
      expect(invalidate).not.toHaveBeenCalled();
      await expect(generateImage(input)).rejects.toThrow("未登录");
      expect(invalidate).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });
});
