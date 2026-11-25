import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useContent } from "../domain/useContent";
import { useImageGenerationCatalog } from "../plugins/ai-images/api";
import type {
  Album,
  Article,
  Photo,
} from "../domain/types";

export function MixedHeadline({
  children,
  as: Tag = "h1",
}: {
  children: ReactNode;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Tag className="display">
      {children}
      <span className="dot">.</span>
    </Tag>
  );
}
export function SectionRule({
  index,
  title,
  meta,
}: {
  index: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="rule">
      <strong>{index}</strong>
      <span>{title}</span>
      <span>{meta}</span>
    </div>
  );
}

export function EditorialHeader() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    addEventListener("keydown", keydown);
    return () => removeEventListener("keydown", keydown);
  }, []);
  return (
    <>
      <div className="topline">
        <div className="container">
          <span>
            林间刊物 / 第 {String(new Date().getMonth() + 1).padStart(2, "0")}{" "}
            章
          </span>
          <span>记录正在发生的日常</span>
        </div>
      </div>
      <header className="siteHeader">
        <div className="container nav">
          <Link className="brand" to="/">
            <span className="brandMark">林</span>
            <span>林间刊物</span>
          </Link>
          <nav className={`navLinks ${open ? "open" : ""}`} aria-label="主导航">
            <NavLink to="/" end>
              首页
            </NavLink>
            <NavLink to="/articles">文章</NavLink>
            <NavLink to="/albums">相册</NavLink>
            <NavLink to="/collections">收藏</NavLink>
            <Link
              className="adminLink"
              to="/admin/login"
              aria-label="进入编辑部"
            >
              编
            </Link>
          </nav>
          <button
            className="menuButton"
            type="button"
            aria-expanded={open}
            aria-label={open ? "收起导航" : "展开导航"}
            onClick={() => setOpen(!open)}
          >
            ☰
          </button>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="siteFooter">
      <div className="container footerGrid">
        <div>
          <h2>林间刊物</h2>
          <p>关于独立开发、城市观察、摄影与田野笔记的个人出版。</p>
        </div>
        <div>
          <p>
            <Link to="/articles">全部文章</Link>
          </p>
          <p>
            <Link to="/albums">全部相册</Link>
          </p>
          <p>
            <Link to="/collections">全部收藏</Link>
          </p>
        </div>
        <div>
          <p>
            <Link to="/admin/login">编辑部入口</Link>
          </p>
          <p>2026 / 持续出版中</p>
        </div>
      </div>
    </footer>
  );
}
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <>
      <EditorialHeader />
      {children}
      <SiteFooter />
    </>
  );
}
export function ArticleCard({ article }: { article: Article }) {
  return (
    <Link className="articleCard" to={`/articles/${article.slug}`}>
      <span className="meta">
        {article.date} / {article.category} /{" "}
        {String(article.readingMinutes).padStart(2, "0")} 分钟
      </span>
      <h3>{article.title}</h3>
      <p>{article.excerpt}</p>
      <span className="cardFoot">继续阅读</span>
    </Link>
  );
}
export function AlbumCard({
  album,
  cover,
  onOpen,
}: {
  album: Album;
  cover?: Photo;
  onOpen: (album: Album) => void;
}) {
  return (
    <article className="albumCardPublic">
      <button type="button" onClick={() => onOpen(album)} disabled={!cover}>
        <div className="albumVisual">
          {cover ? (
            <img src={cover.image} alt={cover.alt} />
          ) : (
            <span>空白相册</span>
          )}
        </div>
        <h2>{album.title}</h2>
        <p>
          {album.category} / {album.location} / {album.photos.length} 张照片
        </p>
      </button>
    </article>
  );
}

export function AdminShell({
  children,
  title,
  viewTo,
}: {
  children: ReactNode;
  title: string;
  viewTo: string;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { owner, loadAdmin, logout, adminLoading, adminError } = useContent();
  const { catalog: imageCatalog } = useImageGenerationCatalog(Boolean(owner));
  useEffect(() => {
    let active = true;
    void loadAdmin().then((result) => {
      if (active && result === "unauthenticated")
        navigate("/admin/login", { replace: true });
    });
    return () => {
      active = false;
    };
  }, [loadAdmin, navigate]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    addEventListener("keydown", keydown);
    return () => removeEventListener("keydown", keydown);
  }, []);
  const signOut = async () => {
    await logout();
    navigate("/admin/login");
  };
  if (adminLoading && !owner)
    return (
      <main className="container intro">
        <p>正在验证编辑部会话...</p>
      </main>
    );
  if (adminError && !owner)
    return (
      <main className="container intro">
        <p className="error">{adminError}</p>
      </main>
    );
  if (!owner) return null;
  return (
    <div className="adminBody">
      <div className="adminShell">
        <aside className={`adminSidebar ${open ? "open" : ""}`}>
          <Link className="brand" to="/admin/dashboard">
            <span className="brandMark">林</span>
            <span>编辑部</span>
          </Link>
          <nav className="adminNav">
            {[
              ["总览", "/admin/dashboard"],
              ["文章", "/admin/articles"],
              ["相册", "/admin/albums"],
              ["收藏", "/admin/collections"],
              ...(imageCatalog?.enabled ? [["AI 生图", "/admin/ai-images"]] : []),
            ].map(([label, to]) => (
              <Link
                key={to}
                className={location.pathname === to ? "active" : ""}
                to={to}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="sidebarFoot">
            <p>{owner.email}</p>
            <button className="ghost" onClick={() => void signOut()}>
              退出登录
            </button>
          </div>
        </aside>
        <main>
          <header className="adminTopbar">
            <button
              className="menuButton"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
            >
              ☰
            </button>
            <p>林间刊物 / {title}</p>
            <Link className="linkButton secondary" to={viewTo}>
              查看公开站
            </Link>
          </header>
          <div className="adminContent">{children}</div>
        </main>
      </div>
    </div>
  );
}
