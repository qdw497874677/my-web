import { useState } from "react";
import { MixedHeadline } from "../components/editorial";
import { Button, StatusPill } from "../components/ui";
import { useContent } from "../domain/useContent";
import { CategoryDialog } from "./AdminDialogs";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请稍后重试。";
export function DashboardPage() {
  const { adminArticles: articles, adminAlbums: albums, categories, createArticle } = useContent();
  const [categoriesOpen, setCategoriesOpen] = useState(false),
    [error, setError] = useState("");
  const create = async () => {
    const category = categories[0];
    if (!category) return;
    try {
      await createArticle("新的文章草稿", category.id);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };
  return (
    <>
      <section className="adminHeading">
        <div>
          <p className="eyebrow">EDITORIAL OVERVIEW</p>
          <MixedHeadline>
            晚上好，回到<em>工作台</em>
          </MixedHeadline>
        </div>
        <div className="rowActions">
          <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
            管理栏目
          </Button>
          <Button onClick={() => void create()}>新建文章草稿</Button>
        </div>
      </section>
      <section className="stats">
        <article className="stat">
          <span>已发布文章</span>
          <strong>{articles.filter((a) => a.status === "published" && !a.archived).length}</strong>
          <small>当前公开列表</small>
        </article>
        <article className="stat">
          <span>草稿</span>
          <strong>{articles.filter((a) => a.status === "draft" && !a.archived).length}</strong>
          <small>等待继续编辑</small>
        </article>
        <article className="stat">
          <span>公开相册</span>
          <strong>{albums.filter((a) => !a.isPrivate && !a.archived).length}</strong>
          <small>进入相册管理</small>
        </article>
        <article className="stat">
          <span>栏目</span>
          <strong>{categories.length}</strong>
          <small>内容分类</small>
        </article>
      </section>
      <section className="panel">
        <div className="panelHead">
          <h2>近期内容</h2>
          <span>最新更新</span>
        </div>
        {articles.slice(0, 5).map((article) => (
          <article className="contentRow" key={article.id}>
            <img src={article.image} alt={article.alt} />
            <div>
              <p className="meta">
                {article.category} / {article.date}
              </p>
              <h3>{article.title}</h3>
            </div>
            <StatusPill status={article.status} />
          </article>
        ))}
        <p className="error">{error}</p>
      </section>
      {categoriesOpen && <CategoryDialog onClose={() => setCategoriesOpen(false)} />}
    </>
  );
}
