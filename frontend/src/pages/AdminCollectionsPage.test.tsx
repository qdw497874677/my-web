import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContent } from "../domain/useContent";
import type { ContentValue } from "../domain/content-context";
import type { CollectionPresentation, CollectionView } from "../domain/types";
import { AdminCollectionsPage } from "./AdminCollectionsPage";

vi.mock("../domain/useContent", () => ({ useContent: vi.fn() }));

const item = (note: string): CollectionView => ({
  id: "collection-1",
  type: "文章",
  sourceType: "article",
  articleId: "article-1",
  title: "文章",
  meta: "文章",
  image: "",
  alt: "",
  href: "#",
  note,
  visible: true,
});
const presentation = (defaultTheme: "stamp" | "editorial"): CollectionPresentation => ({
  defaultTheme,
  enabledThemes: ["stamp", "editorial"],
});
function content(
  note: string,
  defaultTheme: "stamp" | "editorial",
  saveCollections = vi.fn().mockResolvedValue(undefined),
) {
  return {
    adminArticles: [],
    adminAlbums: [],
    adminCollections: [item(note)],
    adminCollectionPresentation: presentation(defaultTheme),
    saveCollections,
  } as unknown as ContentValue;
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminCollectionsPage draft hydration", () => {
  it("hydrates untouched fields from authoritative updates", () => {
    vi.mocked(useContent).mockReturnValue(content("初始", "stamp"));
    const { rerender } = render(<AdminCollectionsPage />);
    expect(screen.getByLabelText("第 1 项说明")).toHaveValue("初始");
    vi.mocked(useContent).mockReturnValue(content("服务端更新", "editorial"));
    rerender(<AdminCollectionsPage />);
    expect(screen.getByLabelText("第 1 项说明")).toHaveValue("服务端更新");
    expect(screen.getByLabelText("默认主题")).toHaveValue("editorial");
  });

  it("preserves edits made after save while a background refresh completes", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useContent).mockReturnValue(content("初始", "stamp", save));
    const { rerender } = render(<AdminCollectionsPage />);
    fireEvent.change(screen.getByLabelText("第 1 项说明"), { target: { value: "已保存" } });
    fireEvent.click(screen.getByRole("button", { name: "保存收藏" }));
    await screen.findByText("收藏与展示策略已保存");
    fireEvent.change(screen.getByLabelText("第 1 项说明"), { target: { value: "新草稿" } });
    fireEvent.change(screen.getByLabelText("默认主题"), { target: { value: "editorial" } });
    vi.mocked(useContent).mockReturnValue(content("已保存", "stamp", save));
    rerender(<AdminCollectionsPage />);
    expect(screen.getByLabelText("第 1 项说明")).toHaveValue("新草稿");
    expect(screen.getByLabelText("默认主题")).toHaveValue("editorial");
  });

  it("keeps edits made during an outstanding write, and hydrates untouched sections", async () => {
    let resolve!: () => void;
    const save = vi.fn().mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    vi.mocked(useContent).mockReturnValue(content("初始", "stamp", save));
    const { rerender } = render(<AdminCollectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "保存收藏" }));
    fireEvent.change(screen.getByLabelText("第 1 项说明"), { target: { value: "等待时修改" } });
    resolve();
    await waitFor(() => expect(screen.getByText("收藏与展示策略已保存")).toBeInTheDocument());
    vi.mocked(useContent).mockReturnValue(content("初始", "editorial", save));
    rerender(<AdminCollectionsPage />);
    expect(screen.getByLabelText("第 1 项说明")).toHaveValue("等待时修改");
    expect(screen.getByLabelText("默认主题")).toHaveValue("editorial");
  });

  it("keeps a reordered draft after the saved order is refreshed", async () => {
    const initial = content("第一项", "stamp");
    initial.adminCollections = [
      item("第一项"),
      { ...item("第二项"), id: "collection-2", articleId: "article-2" },
    ];
    vi.mocked(useContent).mockReturnValue(initial);
    const { rerender } = render(<AdminCollectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "保存收藏" }));
    await screen.findByText("收藏与展示策略已保存");
    fireEvent.click(screen.getAllByRole("button", { name: "下移" })[0]);
    vi.mocked(useContent).mockReturnValue({
      ...initial,
      adminCollections: [...initial.adminCollections],
    });
    rerender(<AdminCollectionsPage />);
    expect(screen.getByLabelText("第 1 项说明")).toHaveValue("第二项");
    expect(screen.getByLabelText("第 2 项说明")).toHaveValue("第一项");
  });
});
