import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlbumCard, MixedHeadline, PublicShell, SectionRule } from "../components/editorial";
import { FilterChips } from "../components/ui";
import { getAlbumCover } from "../domain/repository";
import { useContent } from "../domain/useContent";
import type { Album } from "../domain/types";
import { Loading } from "./PublicLoading";

export function ArticlesPage() {
  const {
    publicArticles: articles,
    publicStatus: { articles: status },
  } = useContent();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const categories = ["全部", ...new Set(articles.map((article) => article.category))];
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
          {status.loading ? (
            <Loading />
          ) : !status.error ? (
            <>
              <p className="results" aria-live="polite">
                显示 {filtered.length} 篇文章
              </p>
              <div className="articleList">
                {filtered.map((article) => (
                  <Link className="listItem" key={article.id} to={`/articles/${article.slug}`}>
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
                {filtered.length === 0 && <p>没有找到匹配的文章。换一个关键词或栏目试试。</p>}
              </div>
            </>
          ) : null}
          <p className="error">{status.error}</p>
        </section>
      </main>
    </PublicShell>
  );
}

export function AlbumsPage() {
  const {
    publicAlbums: albums,
    publicStatus: { albums: status },
  } = useContent();
  const [category, setCategory] = useState("全部");
  const [open, setOpen] = useState<Album | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const categories = ["全部", ...new Set(albums.map((album) => album.category))];
  const visible = albums.filter((album) => category === "全部" || album.category === category);
  const currentPhoto = open?.photos[photoIndex];
  const closeAlbum = () => {
    setOpen(null);
    setZoomed(false);
  };
  const move = (offset: number) => {
    if (!open) return;
    setPhotoIndex((index) => (index + offset + open.photos.length) % open.photos.length);
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
        setPhotoIndex((index) => (index - 1 + open.photos.length) % open.photos.length);
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
            meta={!status.loading && !status.error ? `2026 / ${albums.length} 组` : "2026"}
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
        {status.loading ? (
          <Loading />
        ) : !status.error ? (
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
        ) : null}
        <p className="error">{status.error}</p>
      </main>
      {open && currentPhoto && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lightbox-title"
          onMouseDown={(event) => event.target === event.currentTarget && closeAlbum()}
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
