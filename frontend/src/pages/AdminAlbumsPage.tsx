import { useEffect, useState } from "react";
import { MixedHeadline } from "../components/editorial";
import { Button, Dialog, FilterChips, SelectField, StatusPill, TextField } from "../components/ui";
import { getAlbumCover } from "../domain/repository";
import { useContent } from "../domain/useContent";
import type { Album } from "../domain/types";
import { AlbumDialog, ImagesDialog } from "./AdminDialogs";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请稍后重试。";
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
    <>
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
    </>
  );
}
