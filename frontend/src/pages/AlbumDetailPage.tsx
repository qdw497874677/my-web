import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { MixedHeadline, PublicShell, SectionRule } from "../components/editorial";
import { contentApi } from "../domain/repository";
import type { Album } from "../domain/types";
import { Loading } from "./PublicLoading";

export function AlbumDetailPage() {
  const { id } = useParams();
  return <AlbumDetail key={id} id={id} />;
}

function AlbumDetail({ id }: { id: string | undefined }) {
  const [album, setAlbum] = useState<Album>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { search } = useLocation();
  const requested = new URLSearchParams(search).get("photo");
  useEffect(() => {
    const controller = new AbortController();
    if (!id) return;
    setLoading(true);
    setError("");
    void contentApi
      .publicAlbum(id, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setAlbum(result); })
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
