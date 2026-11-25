import { StrictMode, useContext } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentProvider } from "./ContentContext";
import { ContentContext, type ContentValue } from "./content-context";
import { ApiError, contentApi } from "./repository";

vi.mock("./repository", () => ({
  ApiError: class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } },
  contentApi: {
    publicArticles: vi.fn(), publicAlbums: vi.fn(), publicCollections: vi.fn(),
    categories: vi.fn(), articles: vi.fn(), albums: vi.fn(),
    collections: vi.fn(), images: vi.fn(), updateArticle: vi.fn(),
  },
}));

const presentation = { defaultTheme: "stamp" as const, enabledThemes: ["stamp" as const] };
let current: ContentValue;
function Consumer() {
  current = useContext(ContentContext)!;
  return null;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(contentApi.publicArticles).mockResolvedValue([]);
  vi.mocked(contentApi.publicAlbums).mockResolvedValue([]);
  vi.mocked(contentApi.publicCollections).mockResolvedValue({ items: [], presentation });
  vi.mocked(contentApi.categories).mockResolvedValue([]);
  vi.mocked(contentApi.articles).mockResolvedValue([]);
  vi.mocked(contentApi.albums).mockResolvedValue([]);
  vi.mocked(contentApi.collections).mockResolvedValue({ items: [], articles: [], albums: [], presentation });
  vi.mocked(contentApi.images).mockResolvedValue([]);
  vi.mocked(contentApi.updateArticle).mockResolvedValue(undefined as never);
});
afterEach(cleanup);

describe("ContentProvider scopes", () => {
  it("loads only public lists in public scope", async () => {
    render(<ContentProvider><Consumer /></ContentProvider>);
    await waitFor(() => expect(current.publicStatus.collections.loading).toBe(false));
    expect(current.publicStatus).toEqual({
      articles: { loading: false, error: "" },
      albums: { loading: false, error: "" },
      collections: { loading: false, error: "" },
    });
    expect(contentApi.publicArticles).toHaveBeenCalledTimes(1);
    expect(contentApi.publicAlbums).toHaveBeenCalledTimes(1);
    expect(contentApi.publicCollections).toHaveBeenCalledTimes(1);
    expect(contentApi.categories).not.toHaveBeenCalled();
    expect(contentApi.articles).not.toHaveBeenCalled();
    expect(contentApi.albums).not.toHaveBeenCalled();
    expect(contentApi.collections).not.toHaveBeenCalled();
    expect(contentApi.images).not.toHaveBeenCalled();
  });

  it("settles successful lists independently when one rejects and another hangs", async () => {
    const albums = [{ id: "album" }] as never;
    vi.mocked(contentApi.publicArticles).mockRejectedValueOnce(new Error("articles offline"));
    vi.mocked(contentApi.publicAlbums).mockResolvedValueOnce(albums);
    vi.mocked(contentApi.publicCollections).mockReturnValueOnce(new Promise(() => {}));
    const view = render(<ContentProvider><Consumer /></ContentProvider>);
    await waitFor(() => expect(current.publicStatus.articles.error).toBe("articles offline"));
    expect(current.publicStatus).toEqual({
      articles: { loading: false, error: "articles offline" },
      albums: { loading: false, error: "" },
      collections: { loading: true, error: "" },
    });
    expect(current.publicAlbums).toEqual(albums);
    const signal = vi.mocked(contentApi.publicArticles).mock.lastCall?.[0];
    expect(signal).toBeDefined();
    expect(vi.mocked(contentApi.publicAlbums).mock.lastCall?.[0]).toBe(signal);
    expect(vi.mocked(contentApi.publicCollections).mock.lastCall?.[0]).toBe(signal);
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("ignores late success and failure after scope changes even when requests ignore abort", async () => {
    let resolveOld!: (value: Awaited<ReturnType<typeof contentApi.publicArticles>>) => void;
    let rejectOld!: (error: Error) => void;
    vi.mocked(contentApi.publicArticles).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    vi.mocked(contentApi.publicAlbums).mockReturnValueOnce(new Promise((_, reject) => { rejectOld = reject; }));
    const view = render(<ContentProvider><Consumer /></ContentProvider>);
    const oldSignal = vi.mocked(contentApi.publicArticles).mock.lastCall?.[0];
    view.rerender(<ContentProvider scope="editorial"><Consumer /></ContentProvider>);
    expect(oldSignal?.aborted).toBe(true);
    await waitFor(() => expect(current.adminLoading).toBe(false));
    view.rerender(<ContentProvider><Consumer /></ContentProvider>);
    await waitFor(() => expect(current.publicStatus.albums.loading).toBe(false));
    await act(async () => {
      resolveOld([{ id: "stale" }] as never);
      rejectOld(new Error("stale failure"));
    });
    expect(current.publicArticles).toEqual([]);
    expect(current.publicStatus.articles).toEqual({ loading: false, error: "" });
    expect(current.publicStatus.albums).toEqual({ loading: false, error: "" });
  });

  it("ignores obsolete public StrictMode results", async () => {
    let resolveOld!: (value: Awaited<ReturnType<typeof contentApi.publicCollections>>) => void;
    vi.mocked(contentApi.publicCollections).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    render(<StrictMode><ContentProvider><Consumer /></ContentProvider></StrictMode>);
    const oldSignal = vi.mocked(contentApi.publicCollections).mock.calls[0][0];
    expect(oldSignal?.aborted).toBe(true);
    await waitFor(() => expect(current.publicStatus.collections.loading).toBe(false));
    await act(async () => resolveOld({ items: [{ id: "stale" }] as never, presentation }));
    expect(current.publicCollections).toEqual([]);
    expect(current.publicStatus.collections).toEqual({ loading: false, error: "" });
  });

  it("loads editorial lists, captures failure and retries without public requests", async () => {
    vi.mocked(contentApi.categories).mockRejectedValueOnce(new Error("offline"));
    let firstLoading: boolean | undefined;
    function InitialConsumer() {
      const value = useContext(ContentContext)!;
      firstLoading ??= value.adminLoading;
      current = value;
      return null;
    }
    render(<ContentProvider scope="editorial"><InitialConsumer /></ContentProvider>);
    expect(firstLoading).toBe(true);
    await waitFor(() => expect(current.adminError).toBe("offline"));
    expect(current.adminLoading).toBe(false);
    await act(async () => current.reloadAdmin());
    expect(current.adminError).toBe("");
    expect(current.adminLoading).toBe(false);
    expect(contentApi.categories).toHaveBeenCalledTimes(2);
    expect(contentApi.articles).toHaveBeenCalledTimes(2);
    expect(contentApi.albums).toHaveBeenCalledTimes(2);
    expect(contentApi.collections).toHaveBeenCalledTimes(2);
    expect(contentApi.images).toHaveBeenCalledTimes(2);
    await act(async () => current.updateArticle("id", {}));
    expect(contentApi.categories).toHaveBeenCalledTimes(3);
    expect(contentApi.publicArticles).not.toHaveBeenCalled();
    expect(contentApi.publicAlbums).not.toHaveBeenCalled();
    expect(contentApi.publicCollections).not.toHaveBeenCalled();
  });

  it("ignores obsolete StrictMode requests", async () => {
    let resolveOld!: (value: Awaited<ReturnType<typeof contentApi.categories>>) => void;
    vi.mocked(contentApi.categories).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    render(<StrictMode><ContentProvider scope="editorial"><Consumer /></ContentProvider></StrictMode>);
    await waitFor(() => expect(current.adminLoading).toBe(false));
    await act(async () => resolveOld([{ id: "old", name: "old" }] as never));
    expect(current.categories).toEqual([]);
  });

  it("does not let an older reload overwrite a newer reload", async () => {
    render(<ContentProvider scope="editorial"><Consumer /></ContentProvider>);
    await waitFor(() => expect(current.adminLoading).toBe(false));
    let resolveOld!: (value: Awaited<ReturnType<typeof contentApi.categories>>) => void;
    vi.mocked(contentApi.categories).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    let oldRequest!: Promise<void>;
    act(() => { oldRequest = current.reloadAdmin(); });
    const oldSignal = vi.mocked(contentApi.categories).mock.lastCall?.[0];
    await act(async () => current.reloadAdmin());
    expect(oldSignal?.aborted).toBe(true);
    expect(current.adminLoading).toBe(false);
    await act(async () => { resolveOld([{ id: "old", name: "old" }] as never); await oldRequest; });
    expect(current.categories).toEqual([]);
    expect(current.adminError).toBe("");
  });

  it("keeps saved data on refresh failure and retries reads without replaying the write", async () => {
    const previous = [{ id: "article-1", title: "before" }] as never;
    vi.mocked(contentApi.articles).mockResolvedValueOnce(previous);
    render(<ContentProvider scope="editorial"><Consumer /></ContentProvider>);
    await waitFor(() => expect(current.adminLoading).toBe(false));
    vi.mocked(contentApi.categories).mockRejectedValueOnce(new Error("offline"));
    await act(async () => current.updateArticle("article-1", { title: "saved" }));
    expect(current.adminRefreshError).toBe("offline");
    expect(current.adminLoading).toBe(false);
    expect(current.adminError).toBe("");
    expect(current.adminArticles).toEqual(previous);
    await act(async () => current.retryAdminRefresh());
    expect(current.adminRefreshError).toBe("");
    expect(contentApi.updateArticle).toHaveBeenCalledTimes(1);
    expect(contentApi.categories).toHaveBeenCalledTimes(3);
  });

  it("resolves a successful write while its refresh is pending, then reports its failure", async () => {
    const previous = [{ id: "article-1", title: "before" }] as never;
    vi.mocked(contentApi.articles).mockResolvedValueOnce(previous);
    render(<ContentProvider scope="editorial"><Consumer /></ContentProvider>);
    await waitFor(() => expect(current.adminLoading).toBe(false));
    let rejectRefresh!: (error: Error) => void;
    vi.mocked(contentApi.categories).mockReturnValueOnce(new Promise((_, reject) => { rejectRefresh = reject; }));
    let resolved = false;
    await act(async () => {
      await current.updateArticle("article-1", { title: "saved" });
      resolved = true;
    });
    expect(resolved).toBe(true);
    expect(current.adminRefreshing).toBe(true);
    expect(current.adminArticles).toEqual(previous);
    await act(async () => { rejectRefresh(new Error("offline")); });
    expect(current.adminRefreshError).toBe("offline");
    expect(current.adminRefreshing).toBe(false);
    await act(async () => current.retryAdminRefresh());
    expect(current.adminRefreshError).toBe("");
    expect(contentApi.updateArticle).toHaveBeenCalledTimes(1);
  });

  it("times out a stuck background refresh and permits a read-only retry", async () => {
    render(<ContentProvider scope="editorial"><Consumer /></ContentProvider>);
    await waitFor(() => expect(current.adminLoading).toBe(false));
    vi.useFakeTimers();
    try {
      vi.mocked(contentApi.categories).mockImplementationOnce((signal) => new Promise((_, reject) => {
        signal?.addEventListener("abort", () => reject(new ApiError(0, "aborted")), { once: true });
      }));
      await act(async () => current.updateArticle("id", {}));
      const signal = vi.mocked(contentApi.categories).mock.lastCall?.[0];
      expect(signal).toBeDefined();
      for (const method of [contentApi.articles, contentApi.albums, contentApi.collections, contentApi.images]) {
        expect(vi.mocked(method).mock.lastCall?.[0]).toBe(signal);
      }
      expect(current.adminRefreshing).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(15_000));
      expect(signal?.aborted).toBe(true);
      expect(current.adminRefreshing).toBe(false);
      expect(current.adminRefreshError).toBe("编辑部刷新超时，请重试");
      await act(async () => current.retryAdminRefresh());
      expect(vi.mocked(contentApi.categories).mock.lastCall?.[0]).not.toBe(signal);
      expect(current.adminRefreshError).toBe("");
      expect(contentApi.updateArticle).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts the initial admin load on teardown even when a mock ignores cancellation", async () => {
    let resolveOld!: (value: Awaited<ReturnType<typeof contentApi.categories>>) => void;
    vi.mocked(contentApi.categories).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    const view = render(<ContentProvider scope="editorial"><Consumer /></ContentProvider>);
    const signal = vi.mocked(contentApi.categories).mock.lastCall?.[0];
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { resolveOld([{ id: "old", name: "old" }] as never); });
  });

  it("rejects an actual write failure without refreshing", async () => {
    render(<ContentProvider scope="editorial"><Consumer /></ContentProvider>);
    await waitFor(() => expect(current.adminLoading).toBe(false));
    vi.mocked(contentApi.updateArticle).mockRejectedValueOnce(new Error("write failed"));
    await expect(current.updateArticle("id", {})).rejects.toThrow("write failed");
    expect(contentApi.categories).toHaveBeenCalledTimes(1);
    expect(current.adminRefreshError).toBe("");
  });

  it("suppresses a 401 background refresh warning", async () => {
    render(<ContentProvider scope="editorial"><Consumer /></ContentProvider>);
    await waitFor(() => expect(current.adminLoading).toBe(false));
    vi.mocked(contentApi.categories).mockRejectedValueOnce(new ApiError(401, "unauthorized"));
    await act(async () => current.updateArticle("id", {}));
    await waitFor(() => expect(current.adminRefreshing).toBe(false));
    expect(current.adminRefreshError).toBe("");
  });

  it("ignores an older refresh failure after a newer refresh succeeds", async () => {
    render(<ContentProvider scope="editorial"><Consumer /></ContentProvider>);
    await waitFor(() => expect(current.adminLoading).toBe(false));
    let rejectOld!: (error: Error) => void;
    vi.mocked(contentApi.categories).mockReturnValueOnce(new Promise((_, reject) => { rejectOld = reject; }));
    let old!: Promise<void>;
    act(() => { old = current.retryAdminRefresh(); });
    expect(current.adminRefreshing).toBe(true);
    await act(async () => current.retryAdminRefresh());
    await act(async () => { rejectOld(new Error("obsolete")); await old; });
    expect(current.adminRefreshError).toBe("");
    expect(current.adminRefreshing).toBe(false);
  });
});
