import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  AlbumCard,
  ArticleCard,
  MixedHeadline,
  PublicShell,
  SectionRule,
} from "../components/editorial";
import { FilterChips } from "../components/ui";
import { ApiError, contentApi, getAlbumCover } from "../domain/repository";
import { useContent } from "../domain/useContent";
import type { Album, Article } from "../domain/types";

const Loading = ({ message = "正在加载刊物内容..." }: { message?: string }) => (
  <p className="results" role="status">
    {message}
  </p>
);

export function HomePage() {
  const {
    publicArticles,
    publicAlbums,
    publicLoading,
    publicError,
    subscribe,
  } = useContent();
  const articles = publicArticles.slice(0, 3);
  const album = publicAlbums[0];
  const albumCover = album ? getAlbumCover(album) : undefined;
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = new FormData(form).get("email");
    setSubmitting(true);
    setMessage("");
    try {
      await subscribe(String(email ?? ""));
      setMessage("邮箱已经记下。有新东西时，再写信给你。");
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "订阅失败，请稍后重试。",
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <PublicShell>
      <main>
        <section className="container hero">
          <div>
            <p className="eyebrow">第 07 章 / 盛夏日常</p>
            <MixedHeadline>
              把日子放慢，<em>看清</em>眼前的光
            </MixedHeadline>
            <p className="lead">
              这里写产品，也收下散步途中拍到的照片。更新不赶时间，只记那些过几天仍会想起的事。
            </p>
            <div className="heroActions">
              <Link className="linkButton" to="/articles">
                读一篇近作
              </Link>
              <Link className="linkButton secondary" to="/albums">
                看看最近的照片
              </Link>
            </div>
          </div>
          <figure className="heroArt">
            <img
              src="/assets/hero.png"
              alt="暖色纸张与植物形状构成的刊物封面拼贴"
            />
          </figure>
        </section>
        <section className="section container">
          <SectionRule
            index="Ⅱ."
            title="最近写下"
            meta={`${articles.length} 篇文章`}
          />
          <div className="sectionHead">
            <MixedHeadline as="h2">
              近日写下的<em>几件小事</em>
            </MixedHeadline>
            <Link className="textLink" to="/articles">
              查看全部文章
            </Link>
          </div>
          {publicLoading ? (
            <Loading />
          ) : (
            <div className="articleGrid">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
          <p className="error">{publicError}</p>
        </section>
        {album && albumCover && (
          <section className="section container">
            <SectionRule
              index="Ⅲ."
              title="最近整理"
              meta={`${album.location} / ${album.date}`}
            />
            <article className="albumFeature">
              <img src={albumCover.image} alt={albumCover.alt} />
              <div className="albumCopy">
                <span className="meta">
                  相册 / {album.photos.length} 张照片
                </span>
                <MixedHeadline as="h2">{album.title}</MixedHeadline>
                <p>{album.description}</p>
                <Link className="textLink" to="/albums">
                  打开相册
                </Link>
              </div>
            </article>
          </section>
        )}
        <section className="section container aboutGrid">
          <div>
            <SectionRule index="Ⅳ." title="关于刊物" meta="慢慢更新" />
            <MixedHeadline as="h2">
              把工作与日常，<em>慢慢记下</em>
            </MixedHeadline>
            <p className="lead">
              平时做产品，也拍照片。这里没有固定选题，只留下做东西时想明白的事，以及走路时偶然遇见的光。
            </p>
          </div>
          <figure className="aboutArt">
            <img
              src="/assets/about.png"
              alt="由纸张、线条和人物剪影组成的编辑拼贴"
            />
          </figure>
        </section>
        <section className="container newsletter">
          <p className="eyebrow">偶尔来信</p>
          <MixedHeadline as="h2">
            有新东西时，寄来一封<em>近况</em>
          </MixedHeadline>
          <p>
            可能是一篇新文章、几张刚整理好的照片，或最近反复读的一本书。不会太频繁。
          </p>
          <form className="subscribe" onSubmit={(event) => void submit(event)}>
            <label className="sr-only" htmlFor="subscription-email">
              订阅邮箱
            </label>
            <input
              id="subscription-email"
              name="email"
              type="email"
              required
              placeholder="你的邮箱"
            />
            <button type="submit" disabled={submitting}>
              {submitting ? "正在提交..." : "订阅近况"}
            </button>
          </form>
          <p aria-live="polite">{message}</p>
        </section>
      </main>
    </PublicShell>
  );
}

export function ArticlesPage() {
  const { publicArticles: articles, publicLoading, publicError } = useContent();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const categories = [
    "全部",
    ...new Set(articles.map((article) => article.category)),
  ];
  const filtered = articles.filter(
    (article) =>
      (category === "全部" || article.category === category) &&
      `${article.title} ${article.excerpt} ${article.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <PublicShell>
      <main className="container">
        <section className="intro">
          <SectionRule index="Ⅰ." title="阅读档案" meta="2026" />
          <MixedHeadline>
            把每一次<em>停留</em>写成可回看的页
          </MixedHeadline>
          <p className="lead">
            关于独立开发、城市观察、摄影与田野笔记。用关键词找到一段记忆，也可以从一个栏目出发。
          </p>
        </section>
        <section>
          <div className="filters">
            <input
              className="search"
              type="search"
              aria-label="搜索文章"
              placeholder="搜索标题、摘要或栏目"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <FilterChips
              label="文章栏目筛选"
              options={categories}
              value={category}
              onChange={setCategory}
            />
          </div>
          {publicLoading ? (
            <Loading />
          ) : (
            <>
              <p className="results" aria-live="polite">
                显示 {filtered.length} 篇文章
              </p>
              <div className="articleList">
                {filtered.map((article) => (
                  <Link
                    className="listItem"
                    key={article.id}
                    to={`/articles/${article.slug}`}
                  >
                    <img src={article.image} alt={article.alt} />
                    <div>
                      <span className="meta">
                        {article.category} / {article.date}
                      </span>
                      <h2>{article.title}</h2>
                      <p>{article.excerpt}</p>
                    </div>
                    <span className="reading">
                      {String(article.readingMinutes).padStart(2, "0")} 分钟
                    </span>
                  </Link>
                ))}
                {filtered.length === 0 && (
                  <p>没有找到匹配的文章。换一个关键词或栏目试试。</p>
                )}
              </div>
            </>
          )}
          <p className="error">{publicError}</p>
        </section>
      </main>
    </PublicShell>
  );
}

export function ArticleDetailPage() {
  const { slug } = useParams();
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
      .then(setArticle)
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

export function AlbumDetailPage() {
  const { id } = useParams();
  const [album, setAlbum] = useState<Album>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requested = new URLSearchParams(location.search).get("photo");
  useEffect(() => {
    const controller = new AbortController();
    if (!id) return;
    setLoading(true);
    void contentApi
      .publicAlbum(id, controller.signal)
      .then(setAlbum)
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "相册加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);
  if (loading)
    return (
      <PublicShell>
        <main className="container intro">
          <Loading message="正在加载相册..." />
        </main>
      </PublicShell>
    );
  if (error || !album)
    return (
      <PublicShell>
        <main className="container intro">
          <MixedHeadline>
            这本相册<em>无法打开</em>
          </MixedHeadline>
          <p className="error">{error}</p>
        </main>
      </PublicShell>
    );
  const numeric = Number(requested),
    index = requested
      ? Number.isInteger(numeric) && numeric >= 0
        ? numeric
        : album.photos.findIndex((photo) => photo.id === requested)
      : 0,
    photo = album.photos[Math.max(0, index)] ?? album.photos[0];
  return (
    <PublicShell>
      <main className="container">
        <section className="intro">
          <SectionRule
            index="Ⅱ."
            title={album.category}
            meta={`${album.location} / ${album.date}`}
          />
          <MixedHeadline>{album.title}</MixedHeadline>
          <p className="lead">{album.description}</p>
        </section>
        {photo && (
          <section className="albumFeature">
            <img src={photo.image} alt={photo.alt} />
            <div className="albumCopy">
              <span className="meta">
                {String(album.photos.indexOf(photo) + 1).padStart(2, "0")} /{" "}
                {String(album.photos.length).padStart(2, "0")}
              </span>
              <h2>{photo.title}</h2>
              <p>{photo.caption}</p>
              <div className="photoThumbs">
                {album.photos.map((item, itemIndex) => (
                  <Link
                    key={item.id}
                    aria-label={`查看第 ${itemIndex + 1} 张照片：${item.title}`}
                    to={`/albums/${album.id}?photo=${item.id}`}
                  >
                    <img src={item.image} alt="" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </PublicShell>
  );
}

export function AlbumsPage() {
  const { publicAlbums: albums, publicLoading, publicError } = useContent();
  const [category, setCategory] = useState("全部");
  const [open, setOpen] = useState<Album | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const categories = [
    "全部",
    ...new Set(albums.map((album) => album.category)),
  ];
  const visible = albums.filter(
    (album) => category === "全部" || album.category === category,
  );
  const currentPhoto = open?.photos[photoIndex];
  const closeAlbum = () => {
    setOpen(null);
    setZoomed(false);
  };
  const move = (offset: number) => {
    if (!open) return;
    setPhotoIndex(
      (index) => (index + offset + open.photos.length) % open.photos.length,
    );
    setZoomed(false);
  };
  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null);
        setZoomed(false);
      }
      if (event.key === "ArrowLeft") {
        setPhotoIndex(
          (index) => (index - 1 + open.photos.length) % open.photos.length,
        );
        setZoomed(false);
      }
      if (event.key === "ArrowRight") {
        setPhotoIndex((index) => (index + 1) % open.photos.length);
        setZoomed(false);
      }
      if (event.key === "+" || event.key === "=") setZoomed(true);
      if (event.key === "-") setZoomed(false);
    };
    addEventListener("keydown", keydown);
    return () => removeEventListener("keydown", keydown);
  }, [open]);
  return (
    <PublicShell>
      <main className="container">
        <section className="intro">
          <SectionRule
            index="Ⅱ."
            title="影像档案"
            meta={`2026 / ${albums.length} 组`}
          />
          <MixedHeadline>
            把路过的<em>光</em>收进一个慢慢打开的抽屉
          </MixedHeadline>
          <p className="lead">
            这些照片来自散步、出差和工作间隙。打开相册后可以看到每张照片的所属相册、序号与说明。
          </p>
        </section>
        <FilterChips
          label="相册分类筛选"
          options={categories}
          value={category}
          onChange={setCategory}
        />
        {publicLoading ? (
          <Loading />
        ) : (
          <section className="albumGrid">
            {visible.map((album) => (
              <AlbumCard
                key={album.id}
                album={album}
                cover={getAlbumCover(album)}
                onOpen={(value) => {
                  setOpen(value);
                  setPhotoIndex(0);
                  setZoomed(false);
                }}
              />
            ))}
          </section>
        )}
        <p className="error">{publicError}</p>
      </main>
      {open && currentPhoto && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lightbox-title"
          onMouseDown={(event) =>
            event.target === event.currentTarget && closeAlbum()
          }
        >
          <div className="lightboxPanel photoLightbox">
            <div className="lightboxControls">
              <button
                className="lightboxControl"
                type="button"
                aria-label={zoomed ? "恢复原始大小" : "放大照片"}
                aria-pressed={zoomed}
                onClick={() => setZoomed((value) => !value)}
              >
                <span aria-hidden="true">{zoomed ? "−" : "+"}</span>
                {zoomed ? "恢复" : "放大"}
              </button>
              <button
                className="lightboxControl closeControl"
                type="button"
                aria-label="关闭相册"
                onClick={closeAlbum}
              >
                <span aria-hidden="true">×</span>关闭
              </button>
            </div>
            <div>
              <div className={`photoViewport ${zoomed ? "zoomed" : ""}`}>
                <img
                  className="lightboxMainImage"
                  src={currentPhoto.image}
                  alt={currentPhoto.alt}
                />
              </div>
              <p className="zoomStatus" aria-live="polite">
                {zoomed ? "当前缩放 200%" : "原始大小"}
              </p>
              <div className="photoThumbs" aria-label={`${open.title}照片列表`}>
                {open.photos.map((photo, index) => (
                  <button
                    key={photo.id}
                    className={index === photoIndex ? "active" : ""}
                    aria-label={`查看第 ${index + 1} 张照片：${photo.title}`}
                    aria-pressed={index === photoIndex}
                    onClick={() => {
                      setPhotoIndex(index);
                      setZoomed(false);
                    }}
                  >
                    <img src={photo.image} alt="" />
                  </button>
                ))}
              </div>
            </div>
            <div className="lightboxInfo">
              <p className="eyebrow">
                《{open.title}》 / {String(photoIndex + 1).padStart(2, "0")} /{" "}
                {String(open.photos.length).padStart(2, "0")}
              </p>
              <h2 id="lightbox-title" className="display">
                {currentPhoto.title}
              </h2>
              <p>{currentPhoto.caption}</p>
              <div className="photoNav">
                <button aria-label="上一张照片" onClick={() => move(-1)}>
                  上一张
                </button>
                <button aria-label="下一张照片" onClick={() => move(1)}>
                  下一张
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PublicShell>
  );
}
