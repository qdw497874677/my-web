import { useState, type ChangeEvent } from "react";
import { Button, Dialog, SelectField, TextAreaField, TextField } from "../components/ui";
import { useContent } from "../domain/useContent";
import { fromShanghaiDateTimeLocal, toShanghaiDateTimeLocal } from "../domain/shanghai-time";
import type { Album, Article, ImageAsset, Photo } from "../domain/types";

const message = (error: unknown) => (error instanceof Error ? error.message : "操作失败");
const ImageSelect = ({
  label,
  value,
  onChange,
  images,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  images: ImageAsset[];
  required?: boolean;
}) => (
  <SelectField
    label={label}
    value={value}
    required={required}
    onChange={(event) => onChange(event.target.value)}
  >
    <option value="">{images.length ? "请选择图片资产" : "暂无图片资产"}</option>
    {images.map((item) => (
      <option key={item.id} value={item.id}>
        {item.filename}
      </option>
    ))}
  </SelectField>
);

export function CategoryDialog({ onClose }: { onClose: () => void }) {
  const { categories, createCategory, updateCategory, moveCategory, deleteCategory } = useContent();
  const [name, setName] = useState(""),
    [error, setError] = useState("");
  const run = async (action: () => Promise<void>) => {
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(message(reason));
    }
  };
  return (
    <Dialog title="管理栏目" onClose={onClose} actions={<Button onClick={onClose}>完成</Button>}>
      <div className="formStack">
        <TextField
          label="新栏目名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          onClick={() =>
            void run(async () => {
              await createCategory(name);
              setName("");
            })
          }
        >
          新增栏目
        </Button>
        {categories.map((category) => (
          <div className="catalogItem" key={category.id}>
            <input
              aria-label={`${category.name}名称`}
              defaultValue={category.name}
              onBlur={(event) => {
                if (event.target.value !== category.name)
                  void run(() => updateCategory(category.id, event.target.value));
              }}
            />
            <div className="rowActions">
              <button
                className="ghost"
                onClick={() => void run(() => moveCategory(category.id, -1))}
              >
                上移
              </button>
              <button
                className="ghost"
                onClick={() => void run(() => moveCategory(category.id, 1))}
              >
                下移
              </button>
              <button className="ghost" onClick={() => void run(() => deleteCategory(category.id))}>
                删除
              </button>
            </div>
          </div>
        ))}
        <p className="error">{error}</p>
      </div>
    </Dialog>
  );
}

export function ImagesDialog({ onClose }: { onClose: () => void }) {
  const { images, uploadImage, deleteImage } = useContent();
  const [file, setFile] = useState<File>(),
    [error, setError] = useState("");
  const upload = async () => {
    if (!file) return;
    try {
      await uploadImage(file);
      setFile(undefined);
    } catch (reason) {
      setError(message(reason));
    }
  };
  return (
    <Dialog
      title="图片资产"
      onClose={onClose}
      actions={<Button onClick={onClose}>关闭图片管理</Button>}
    >
      <div className="formStack">
        <label>
          上传图片
          <input
            aria-label="上传图片"
            aria-describedby="image-upload-formats"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0])}
          />
          <small id="image-upload-formats">支持 PNG、JPEG、GIF 和 WebP 格式</small>
        </label>
        <Button onClick={() => void upload()}>上传资产</Button>
        {images.map((asset) => (
          <div className="catalogItem" key={asset.id}>
            <img src={asset.url} alt="" />
            <div>
              <strong>{asset.filename}</strong>
              <p>{Math.ceil(asset.byteSize / 1024)} KB</p>
            </div>
            <button
              className="ghost"
              onClick={() =>
                void deleteImage(asset.id).catch((reason) => setError(message(reason)))
              }
            >
              删除
            </button>
          </div>
        ))}
        <p className="error">{error}</p>
      </div>
    </Dialog>
  );
}

export function ArticleDialog({ article, onClose }: { article: Article; onClose: () => void }) {
  const { categories, images, updateArticle } = useContent();
  const [form, setForm] = useState({
      ...article,
      scheduledAt: toShanghaiDateTimeLocal(article.scheduledAt),
    }),
    [error, setError] = useState("");
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    try {
      await updateArticle(article.id, {
        title: form.title,
        slug: form.slug,
        excerpt: form.excerpt,
        body: form.body,
        categoryId: form.categoryId,
        date: form.date,
        readingMinutes: Number(form.readingMinutes),
        imageAssetId: form.imageAssetId,
        alt: form.alt,
        status: form.status,
        scheduledAt:
          form.status === "scheduled" ? fromShanghaiDateTimeLocal(form.scheduledAt) : null,
        pinned: form.pinned,
      });
      onClose();
    } catch (reason) {
      setError(message(reason));
    }
  };
  return (
    <Dialog
      title="编辑文章"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void save()}>保存文章</Button>
        </>
      }
    >
      <div className="formGrid">
        <TextField
          label="文章标题"
          value={form.title}
          onChange={(event) => set("title", event.target.value)}
        />
        <TextField
          label="文章路径"
          value={form.slug}
          onChange={(event) => set("slug", event.target.value)}
        />
        <TextAreaField
          label="文章摘要"
          value={form.excerpt}
          onChange={(event) => set("excerpt", event.target.value)}
        />
        <TextAreaField
          label="Markdown 正文"
          rows={10}
          value={form.body}
          onChange={(event) => set("body", event.target.value)}
        />
        <SelectField
          label="栏目"
          value={form.categoryId}
          onChange={(event) => set("categoryId", event.target.value)}
        >
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="日期"
          value={form.date}
          onChange={(event) => set("date", event.target.value)}
        />
        <TextField
          label="阅读分钟"
          type="number"
          value={form.readingMinutes}
          onChange={(event) => set("readingMinutes", Number(event.target.value))}
        />
        <ImageSelect
          label="文章图片"
          value={form.imageAssetId}
          onChange={(value) => set("imageAssetId", value)}
          images={images}
        />
        <TextField
          label="图片替代文本"
          value={form.alt}
          onChange={(event) => set("alt", event.target.value)}
        />
        <SelectField
          label="发布状态"
          value={form.status}
          onChange={(event) => set("status", event.target.value as Article["status"])}
        >
          <option value="draft">草稿</option>
          <option value="published">已发布</option>
          <option value="scheduled">已排期</option>
        </SelectField>
        {form.status === "scheduled" && (
          <TextField
            label="排期时间"
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(event) => set("scheduledAt", event.target.value)}
          />
        )}
        <label>
          <input
            type="checkbox"
            checked={form.pinned}
            onChange={(event) => set("pinned", event.target.checked)}
          />{" "}
          置顶
        </label>
        <p className="error">{error}</p>
      </div>
    </Dialog>
  );
}

function PhotoForm({ album, photo, onDone }: { album: Album; photo?: Photo; onDone: () => void }) {
  const { images, createPhoto, updatePhoto } = useContent();
  const [title, setTitle] = useState(photo?.title ?? ""),
    [caption, setCaption] = useState(photo?.caption ?? ""),
    [imageAssetId, setImageAssetId] = useState(photo?.imageAssetId ?? images[0]?.id ?? ""),
    [alt, setAlt] = useState(photo?.alt ?? ""),
    [error, setError] = useState("");
  const save = async () => {
    try {
      const input = { title, caption, imageAssetId, alt: alt || title };
      if (photo) await updatePhoto(photo.id, input);
      else await createPhoto(album.id, input);
      onDone();
    } catch (reason) {
      setError(message(reason));
    }
  };
  return (
    <div className="formStack">
      <TextField
        label="照片标题"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <TextAreaField
        label="照片说明"
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
      />
      <ImageSelect
        label="照片图片"
        value={imageAssetId}
        onChange={setImageAssetId}
        images={images}
      />
      <TextField
        label="照片替代文本"
        value={alt}
        onChange={(event) => setAlt(event.target.value)}
      />
      <Button onClick={() => void save()}>保存照片</Button>
      <p className="error">{error}</p>
    </div>
  );
}

export function AlbumDialog({ album, onClose }: { album: Album; onClose: () => void }) {
  const { adminAlbums, categories, updateAlbum, deletePhoto, movePhotoOrder, movePhoto } =
    useContent();
  const [form, setForm] = useState(album),
    [photo, setPhoto] = useState<Photo | null | undefined>(undefined),
    [error, setError] = useState("");
  const current = adminAlbums.find((item) => item.id === album.id) ?? form;
  const save = async () => {
    try {
      await updateAlbum(album.id, {
        title: form.title,
        description: form.description,
        categoryId: form.categoryId,
        location: form.location,
        date: form.date,
        coverPhotoId: form.coverPhotoId || null,
        isPrivate: form.isPrivate,
      });
      onClose();
    } catch (reason) {
      setError(message(reason));
    }
  };
  return (
    <Dialog
      title="编辑相册"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void save()}>保存相册</Button>
        </>
      }
    >
      <div className="formGrid">
        <TextField
          label="相册标题"
          value={form.title}
          onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
        />
        <TextAreaField
          label="相册描述"
          value={form.description}
          onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
        />
        <SelectField
          label="栏目"
          value={form.categoryId}
          onChange={(event) => setForm((value) => ({ ...value, categoryId: event.target.value }))}
        >
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="地点"
          value={form.location}
          onChange={(event) => setForm((value) => ({ ...value, location: event.target.value }))}
        />
        <TextField
          label="日期"
          value={form.date}
          onChange={(event) => setForm((value) => ({ ...value, date: event.target.value }))}
        />
        <SelectField
          label="封面照片"
          value={form.coverPhotoId ?? ""}
          onChange={(event) =>
            setForm((value) => ({ ...value, coverPhotoId: event.target.value || undefined }))
          }
        >
          <option value="">第一张照片</option>
          {current.photos.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </SelectField>
        <label>
          <input
            type="checkbox"
            checked={!form.isPrivate}
            onChange={(event) =>
              setForm((value) => ({ ...value, isPrivate: !event.target.checked }))
            }
          />{" "}
          公开相册
        </label>
        <Button variant="secondary" onClick={() => setPhoto(null)}>
          新增照片
        </Button>
        {photo !== undefined && (
          <PhotoForm
            album={current}
            photo={photo ?? undefined}
            onDone={() => setPhoto(undefined)}
          />
        )}
        <section>
          {current.photos.map((item) => (
            <div className="catalogItem" key={item.id}>
              <img src={item.image} alt="" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.caption}</p>
              </div>
              <div className="rowActions">
                <button className="ghost" onClick={() => setPhoto(item)}>
                  编辑
                </button>
                <button
                  className="ghost"
                  onClick={() => void movePhotoOrder(current.id, item.id, -1)}
                >
                  上移
                </button>
                <button
                  className="ghost"
                  onClick={() => void movePhotoOrder(current.id, item.id, 1)}
                >
                  下移
                </button>
                <select
                  aria-label={`移动照片 ${item.title}`}
                  value={current.id}
                  onChange={(event) => void movePhoto(item.id, event.target.value)}
                >
                  {adminAlbums.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.title}
                    </option>
                  ))}
                </select>
                <button
                  className="ghost"
                  onClick={() =>
                    void deletePhoto(item.id).catch((reason) => setError(message(reason)))
                  }
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </section>
        <p className="error">{error}</p>
      </div>
    </Dialog>
  );
}
