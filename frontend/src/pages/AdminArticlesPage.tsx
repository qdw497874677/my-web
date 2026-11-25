import { useEffect, useState } from "react";
import { MixedHeadline } from "../components/editorial";
import { Button, Dialog, SelectField, StatusPill, TextField } from "../components/ui";
import { useContent } from "../domain/useContent";
import type { Article } from "../domain/types";
import { ArticleDialog } from "./AdminDialogs";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请稍后重试。";
export function AdminArticlesPage() {
  const { adminArticles, categories, images, createArticle, archiveArticle } =
    useContent();
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [createOpen, setCreateOpen] = useState(false),
    [editing, setEditing] = useState<Article>(),
    [title, setTitle] = useState(""),
    [categoryId, setCategoryId] = useState(""),
    [imageAssetId, setImageAssetId] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);
  const articles = adminArticles.filter(
    (article) =>
      (status === "all" || article.status === status) &&
      `${article.title} ${article.category} ${article.date}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const create = async () => {
    try {
      await createArticle(
        title || "未命名文章",
        categoryId,
        imageAssetId || undefined,
      );
      setCreateOpen(false);
      setTitle("");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };
  return (
    <>
      <section className="adminHeading">
        <div>
          <p className="eyebrow">ARTICLE DESK</p>
          <MixedHeadline>
            整理每一篇<em>文章</em>
          </MixedHeadline>
        </div>
        <p>{articles.length} 篇当前结果</p>
      </section>
      <section className="toolbar">
        <input
          className="search"
          aria-label="搜索文章"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="search"
          aria-label="筛选状态"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">全部状态</option>
          <option value="published">已发布</option>
          <option value="scheduled">已排期</option>
          <option value="draft">草稿</option>
        </select>
        <Button onClick={() => setCreateOpen(true)}>新建文章</Button>
      </section>
      <p className="error">{error}</p>
      <section className="panel">
        <table className="dataTable">
          <thead>
            <tr>
              <th>文章</th>
              <th>状态</th>
              <th>阅读</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => (
              <tr key={article.id}>
                <td>
                  <strong>{article.title}</strong>
                  <br />
                  <span className="meta">
                    {article.category} / {article.date}
                    {article.archived ? " / 已归档" : ""}
                  </span>
                </td>
                <td>
                  <StatusPill status={article.status} />
                </td>
                <td>{article.readingMinutes || "—"} 分钟</td>
                <td>
                  <div className="rowActions">
                    <button
                      className="ghost"
                      onClick={() => setEditing(article)}
                    >
                      编辑
                    </button>
                    <button
                      className="ghost"
                      onClick={() =>
                        void archiveArticle(
                          article.id,
                          !article.archived,
                        ).catch((reason) => setError(errorMessage(reason)))
                      }
                    >
                      {article.archived ? "恢复" : "归档"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {createOpen && (
        <Dialog
          title="新建文章草稿"
          onClose={() => setCreateOpen(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button onClick={() => void create()}>创建草稿</Button>
            </>
          }
        >
          <div className="formStack">
            <TextField
              label="文章标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <SelectField
              label="栏目"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="文章图片资产"
              value={imageAssetId}
              onChange={(event) => setImageAssetId(event.target.value)}
            >
              <option value="">使用后端默认图片资产</option>
              {images.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.filename}
                </option>
              ))}
            </SelectField>
            {images.length === 0 && (
              <p className="meta">
                当前没有可选图片资产，将由后端使用内置默认资产。
              </p>
            )}
          </div>
        </Dialog>
      )}
      {editing && (
        <ArticleDialog
          article={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
