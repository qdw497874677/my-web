import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AdminShell, MixedHeadline } from "../components/editorial";
import {
  Button,
  Dialog,
  FilterChips,
  SelectField,
  StatusPill,
  TextField,
} from "../components/ui";
import { getAlbumCover } from "../domain/repository";
import { useContent } from "../domain/useContent";
import type { Album, Article } from "../domain/types";
import {
  AlbumDialog,
  ArticleDialog,
  CategoryDialog,
  ImagesDialog,
} from "./AdminDialogs";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请稍后重试。";
export function LoginPage() {
  const navigate = useNavigate(),
    { login } = useContent();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(email, password);
      navigate("/admin/dashboard");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="loginPage">
      <section className="loginStory">
        <a className="brand" href="/">
          <span className="brandMark">林</span>
          <span>林间刊物</span>
        </a>
        <div>
          <p className="eyebrow">EDITORIAL DESK / 04</p>
          <MixedHeadline as="h2">
            回到文字与影像的<em>工作台</em>
          </MixedHeadline>
          <p className="lead">
            编辑、编排并发布林间刊物的文章与相册。这里仅向刊物所有者开放。
          </p>
        </div>
      </section>
      <section className="loginPanel">
        <div className="loginCard">
          <p className="eyebrow">仅刊物所有者</p>
          <MixedHeadline>
            进入<em>编辑部</em>
          </MixedHeadline>
          <form className="formStack" onSubmit={(event) => void submit(event)}>
            <TextField
              id="admin-email"
              label="电子邮箱"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <TextField
              id="admin-password"
              label="密码"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? "正在登录..." : "进入工作台"}
            </Button>
            <p className="error" aria-live="polite">
              {error}
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}

export function DashboardPage() {
  const {
    adminArticles: articles,
    adminAlbums: albums,
    categories,
    createArticle,
  } = useContent();
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
    <AdminShell title="运营总览" viewTo="/">
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
          <strong>
            {
              articles.filter((a) => a.status === "published" && !a.archived)
                .length
            }
          </strong>
          <small>当前公开列表</small>
        </article>
        <article className="stat">
          <span>草稿</span>
          <strong>
            {articles.filter((a) => a.status === "draft" && !a.archived).length}
          </strong>
          <small>等待继续编辑</small>
        </article>
        <article className="stat">
          <span>公开相册</span>
          <strong>
            {albums.filter((a) => !a.isPrivate && !a.archived).length}
          </strong>
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
      {categoriesOpen && (
        <CategoryDialog onClose={() => setCategoriesOpen(false)} />
      )}
    </AdminShell>
  );
}

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
    <AdminShell title="文章管理" viewTo="/articles">
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
    </AdminShell>
  );
}

export function AdminAlbumsPage() {
  const { adminAlbums, categories, createAlbum, archiveAlbum } = useContent();
  const [category, setCategory] = useState("全部"),
    [createOpen, setCreateOpen] = useState(false),
    [imagesOpen, setImagesOpen] = useState(false),
    [editing, setEditing] = useState<Album>(),
    [title, setTitle] = useState(""),
    [categoryId, setCategoryId] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);
  const albums = adminAlbums.filter(
    (album) => category === "全部" || album.category === category,
  );
  const create = async () => {
    try {
      await createAlbum(title || "未命名相册", categoryId);
      setCreateOpen(false);
      setTitle("");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };
  return (
    <AdminShell title="相册管理" viewTo="/albums">
      <section className="adminHeading">
        <div>
          <p className="eyebrow">ALBUM ROOM</p>
          <MixedHeadline>
            给照片一张<em>目录卡</em>
          </MixedHeadline>
        </div>
        <div className="rowActions">
          <Button variant="secondary" onClick={() => setImagesOpen(true)}>
            管理图片
          </Button>
          <Button onClick={() => setCreateOpen(true)}>新建相册</Button>
        </div>
      </section>
      <FilterChips
        label="相册分类"
        options={["全部", ...new Set(categories.map((item) => item.name))]}
        value={category}
        onChange={setCategory}
      />
      <p className="error">{error}</p>
      <section className="adminAlbumGrid">
        {albums.map((album) => {
          const cover = getAlbumCover(album);
          return (
            <article
              className="adminAlbum"
              data-album-id={album.id}
              key={album.id}
            >
              {cover ? (
                <img src={cover.image} alt={cover.alt} />
              ) : (
                <div className="albumVisual">空白相册</div>
              )}
              <div className="adminAlbumBody">
                <StatusPill status={album.isPrivate ? "private" : "public"} />
                <h2>{album.title}</h2>
                <p>{album.description}</p>
                <p className="meta">
                  {album.photos.length} 张照片
                  {album.archived ? " / 已归档" : ""}
                </p>
                <div className="rowActions">
                  <button className="ghost" onClick={() => setEditing(album)}>
                    编辑
                  </button>
                  <button
                    className="ghost"
                    onClick={() =>
                      void archiveAlbum(album.id, !album.archived).catch(
                        (reason) => setError(errorMessage(reason)),
                      )
                    }
                  >
                    {album.archived ? "恢复" : "归档"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
      {createOpen && (
        <Dialog
          title="新建空白相册"
          onClose={() => setCreateOpen(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button onClick={() => void create()}>创建相册</Button>
            </>
          }
        >
          <div className="formStack">
            <TextField
              label="相册标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <SelectField
              label="栏目"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          </div>
        </Dialog>
      )}
      {imagesOpen && <ImagesDialog onClose={() => setImagesOpen(false)} />}{" "}
      {editing && (
        <AlbumDialog album={editing} onClose={() => setEditing(undefined)} />
      )}
    </AdminShell>
  );
}
