import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArticleCard, MixedHeadline, PublicShell, SectionRule } from "../components/editorial";
import { getAlbumCover } from "../domain/repository";
import { useContent } from "../domain/useContent";
import { Loading } from "./PublicLoading";

export function HomePage() {
  const { publicArticles, publicAlbums, publicStatus, subscribe } = useContent();
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
      setMessage(error instanceof Error ? error.message : "订阅失败，请稍后重试。");
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
            <img src="/assets/hero.png" alt="暖色纸张与植物形状构成的刊物封面拼贴" />
          </figure>
        </section>
        <section className="section container">
          <SectionRule
            index="Ⅱ."
            title="最近写下"
            meta={
              !publicStatus.articles.loading && !publicStatus.articles.error
                ? `${articles.length} 篇文章`
                : ""
            }
          />
          <div className="sectionHead">
            <MixedHeadline as="h2">
              近日写下的<em>几件小事</em>
            </MixedHeadline>
            <Link className="textLink" to="/articles">
              查看全部文章
            </Link>
          </div>
          {publicStatus.articles.loading ? (
            <Loading />
          ) : !publicStatus.articles.error ? (
            <div className="articleGrid">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          ) : null}
          <p className="error">{publicStatus.articles.error}</p>
        </section>
        {(publicStatus.albums.loading || publicStatus.albums.error) && (
          <section className="section container">
            <SectionRule index="Ⅲ." title="最近整理" meta="" />
            {publicStatus.albums.loading ? (
              <Loading />
            ) : (
              <p className="error">{publicStatus.albums.error}</p>
            )}
          </section>
        )}
        {!publicStatus.albums.loading && !publicStatus.albums.error && album && albumCover && (
          <section className="section container">
            <SectionRule index="Ⅲ." title="最近整理" meta={`${album.location} / ${album.date}`} />
            <article className="albumFeature">
              <img src={albumCover.image} alt={albumCover.alt} />
              <div className="albumCopy">
                <span className="meta">相册 / {album.photos.length} 张照片</span>
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
            <img src="/assets/about.png" alt="由纸张、线条和人物剪影组成的编辑拼贴" />
          </figure>
        </section>
        <section className="container newsletter">
          <p className="eyebrow">偶尔来信</p>
          <MixedHeadline as="h2">
            有新东西时，寄来一封<em>近况</em>
          </MixedHeadline>
          <p>可能是一篇新文章、几张刚整理好的照片，或最近反复读的一本书。不会太频繁。</p>
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
