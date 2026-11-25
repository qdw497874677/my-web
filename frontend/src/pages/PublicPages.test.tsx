import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, contentApi } from "../domain/repository";
import { useContent } from "../domain/useContent";
import type { ContentValue } from "../domain/content-context";
import type { Album, Article } from "../domain/types";
import { AlbumDetailPage } from "./AlbumDetailPage";
import { ArticleDetailPage } from "./ArticleDetailPage";
import { CollectionsPage } from "./CollectionsPage";
import { ComponentsPage } from "./ComponentsPage";
import { HomePage } from "./HomePage";
import { AlbumsPage, ArticlesPage } from "./PublicLists";

vi.mock("../domain/useContent", () => ({ useContent: vi.fn() }));

const article = { id: "a", slug: "a", title: "文章一", excerpt: "摘要", category: "随笔", date: "2026", image: "/a", alt: "", readingMinutes: 2, body: "正文" } as Article;
const album = (id: string): Album => ({ id, title: `相册 ${id}`, description: "说明", category: "照片", categoryId: "c", location: "城市", date: "2026", isPrivate: false, archived: false, photos: [
  { id: "p1", title: "照片一", caption: "一", image: "/1", alt: "一", imageAssetId: "1", position: 0 },
  { id: "p2", title: "照片二", caption: "二", image: "/2", alt: "二", imageAssetId: "2", position: 1 },
] });
const ready = { loading: false, error: "" };
const data = (status: ContentValue["publicStatus"]): ContentValue => ({
  publicArticles: [article], publicAlbums: [album("one")], publicCollections: [],
  publicCollectionPresentation: { defaultTheme: "stamp", enabledThemes: ["stamp"] }, publicStatus: status,
} as unknown as ContentValue);

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(cleanup);

describe("public section status", () => {
  it("renders the available home album while articles load and collections fail", () => {
    vi.mocked(useContent).mockReturnValue(data({ articles: { loading: true, error: "" }, albums: ready, collections: { loading: false, error: "collections offline" } }));
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByText("相册 one")).toBeInTheDocument();
    expect(screen.getByText("正在加载刊物内容...")).toBeInTheDocument();
    expect(screen.queryByText("collections offline")).not.toBeInTheDocument();
  });

  it("isolates article and album errors and does not treat a failed collection as empty", () => {
    vi.mocked(useContent).mockReturnValue(data({ articles: { loading: false, error: "articles offline" }, albums: ready, collections: { loading: false, error: "collections offline" } }));
    const view = render(<MemoryRouter><ArticlesPage /></MemoryRouter>);
    expect(screen.getByText("articles offline")).toBeInTheDocument();
    expect(screen.queryByText(/没有找到匹配/)).not.toBeInTheDocument();
    view.rerender(<MemoryRouter><AlbumsPage /></MemoryRouter>);
    expect(screen.getByText("相册 one")).toBeInTheDocument();
    expect(screen.queryByText("articles offline")).not.toBeInTheDocument();
    view.rerender(<MemoryRouter><CollectionsPage /></MemoryRouter>);
    expect(screen.getByText("collections offline")).toBeInTheDocument();
    expect(screen.queryByText(/本期收藏正在/)).not.toBeInTheDocument();
  });

  it("keeps available component samples even if another list fails", () => {
    vi.mocked(useContent).mockReturnValue(data({ articles: { loading: false, error: "offline" }, albums: ready, collections: { loading: true, error: "" } }));
    render(<MemoryRouter><ComponentsPage /></MemoryRouter>);
    expect(screen.getByText("相册 one")).toBeInTheDocument();
  });
});

function NavigateButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>navigate</button>;
}

describe("public detail navigation", () => {
  it("replaces the previous loaded album with loading on an id change", async () => {
    vi.spyOn(contentApi, "publicAlbum").mockImplementation((id) => id === "old" ? Promise.resolve(album(id)) : new Promise(() => {}));
    render(<MemoryRouter initialEntries={["/albums/old"]}><NavigateButton to="/albums/new" /><Routes><Route path="/albums/:id" element={<AlbumDetailPage />} /></Routes></MemoryRouter>);
    await screen.findByText("相册 old");
    fireEvent.click(screen.getByText("navigate"));
    expect(screen.queryByText("相册 old")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载相册...")).toBeInTheDocument();
  });

  it("does not show a stale album, ignores aborted success, and does not refetch on photo query changes", async () => {
    let resolveOld!: (value: Album) => void;
    const load = vi.spyOn(contentApi, "publicAlbum").mockImplementation((id) => id === "old" ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve(album(id)));
    render(<MemoryRouter initialEntries={["/albums/old"]}><NavigateButton to="/albums/new" /><Routes><Route path="/albums/:id" element={<AlbumDetailPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const oldSignal = load.mock.calls[0][1];
    fireEvent.click(screen.getByText("navigate"));
    expect(oldSignal?.aborted).toBe(true);
    await screen.findByText("相册 new");
    await act(async () => resolveOld(album("old")));
    expect(screen.queryByText("相册 old")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "查看第 2 张照片：照片二" }));
    expect(screen.getByRole("heading", { name: "照片二" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("clears an album error when changing id", async () => {
    vi.spyOn(contentApi, "publicAlbum").mockImplementation((id) => id === "bad" ? Promise.reject(new Error("offline")) : Promise.resolve(album(id)));
    render(<MemoryRouter initialEntries={["/albums/bad"]}><NavigateButton to="/albums/good" /><Routes><Route path="/albums/:id" element={<AlbumDetailPage />} /></Routes></MemoryRouter>);
    await screen.findByText("offline");
    fireEvent.click(screen.getByText("navigate"));
    await screen.findByText("相册 good");
    expect(screen.queryByText("offline")).not.toBeInTheDocument();
  });

  it("keeps article 404 behavior after a late old success", async () => {
    let resolveOld!: (value: Article) => void;
    vi.spyOn(contentApi, "publicArticle").mockImplementation((slug) => slug === "old" ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.reject(new ApiError(404, "missing")));
    render(<MemoryRouter initialEntries={["/articles/old"]}><NavigateButton to="/articles/missing" /><Routes><Route path="/articles/:slug" element={<ArticleDetailPage />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByText("navigate"));
    await screen.findByText(/这篇文章/);
    await act(async () => resolveOld(article));
    expect(screen.queryByText("文章一")).not.toBeInTheDocument();
    expect(screen.getByText("返回文章列表")).toBeInTheDocument();
  });
});
