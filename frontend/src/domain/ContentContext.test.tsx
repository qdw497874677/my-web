import { StrictMode, useContext } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentProvider } from "./ContentContext";
import { ContentContext, type ContentValue } from "./content-context";
import { contentApi } from "./repository";

vi.mock("./repository", () => ({
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
    await waitFor(() => expect(current.publicLoading).toBe(false));
    expect(current.publicCollectionsLoaded).toBe(true);
    expect(contentApi.publicArticles).toHaveBeenCalledTimes(1);
    expect(contentApi.publicAlbums).toHaveBeenCalledTimes(1);
    expect(contentApi.publicCollections).toHaveBeenCalledTimes(1);
    expect(contentApi.categories).not.toHaveBeenCalled();
    expect(contentApi.articles).not.toHaveBeenCalled();
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
    await act(async () => current.reloadAdmin());
    expect(current.adminLoading).toBe(false);
    await act(async () => { resolveOld([{ id: "old", name: "old" }] as never); await oldRequest; });
    expect(current.categories).toEqual([]);
    expect(current.adminError).toBe("");
  });
});
