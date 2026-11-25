import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { MixedHeadline, PublicShell } from "../components/editorial";
import { ApiError, contentApi } from "../domain/repository";
import type { Article } from "../domain/types";
import { Loading } from "./PublicLoading";

export function ArticleDetailPage() {
  const { slug } = useParams();
  return <ArticleDetail key={slug} slug={slug} />;
}

function ArticleDetail({ slug }: { slug: string | undefined }) {
  const [article, setArticle] = useState<Article>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setNotFound(false);
    if (!slug) return;
    void contentApi
      .publicArticle(slug, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setArticle(result); })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        if (reason instanceof ApiError && reason.status === 404)
          setNotFound(true);
        else
          setError(reason instanceof Error ? reason.message : "文章加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug]);
  useEffect(() => {
    const update = () =>
      setProgress(
        document.documentElement.scrollHeight > innerHeight
          ? (scrollY / (document.documentElement.scrollHeight - innerHeight)) *
              100
          : 0,
      );
    addEventListener("scroll", update, { passive: true });
    update();
    return () => removeEventListener("scroll", update);
  }, []);
  if (loading)
    return (
      <PublicShell>
        <main className="container intro">
          <Loading message="正在加载文章..." />
        </main>
      </PublicShell>
    );
  if (notFound)
    return (
      <PublicShell>
        <main className="container intro">
          <MixedHeadline>
            这篇文章<em>不存在</em>
          </MixedHeadline>
          <p>它可能尚未发布、已归档，或路径不正确。</p>
          <Link className="textLink" to="/articles">
            返回文章列表
          </Link>
        </main>
      </PublicShell>
    );
  if (error || !article)
    return (
      <PublicShell>
        <main className="container intro">
          <p className="error">{error || "文章加载失败"}</p>
        </main>
      </PublicShell>
    );
  return (
    <PublicShell>
      <div
        style={{
          position: "fixed",
          inset: "0 auto auto 0",
          height: 3,
          width: `${progress}%`,
          background: "var(--coral)",
          zIndex: 70,
        }}
      />
      <main>
        <header className="container articleHeader">
          <span className="meta">
            {article.category} / {article.date} / 林间
          </span>
          <h1>
            {article.title}
            <span className="dot">.</span>
          </h1>
          <p className="lead">{article.excerpt}</p>
        </header>
        <img className="featureImage" src={article.image} alt={article.alt} />
        <div className="container articleLayout">
          <nav className="toc" aria-label="本文目录">
            <Link to="/articles">返回文章列表</Link>
          </nav>
          <article className="prose">
            <ReactMarkdown>{article.body || article.excerpt}</ReactMarkdown>
          </article>
        </div>
      </main>
    </PublicShell>
  );
}
