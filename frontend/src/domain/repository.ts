import type {
  Album,
  AlbumInput,
  Article,
  ArticleInput,
  Category,
  CollectionCatalog,
  CollectionPresentation,
  CollectionReference,
  CollectionView,
  ImageAsset,
  Photo,
  PhotoInput,
  Session,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "无法连接服务器，请检查网络后重试");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ApiError(
      response.status,
      payload?.error ?? `请求失败（${response.status}）`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
const json = (value: unknown) => JSON.stringify(value);
const collectionHref = (item: CollectionView) =>
  item.sourceType === "photo" && item.photoId
    ? { ...item, href: `/albums/${item.albumId}?photo=${item.photoId}` }
    : item;

export const contentApi = {
  publicArticles: async () =>
    (await fetchApi<{ items: Article[] }>("/api/public/articles")).items,
  publicArticle: (slug: string, signal?: AbortSignal) =>
    fetchApi<Article>(`/api/public/articles/${encodeURIComponent(slug)}`, {
      signal,
    }),
  publicAlbums: async () =>
    (await fetchApi<{ items: Album[] }>("/api/public/albums")).items,
  publicAlbum: (id: string, signal?: AbortSignal) =>
    fetchApi<Album>(`/api/public/albums/${encodeURIComponent(id)}`, { signal }),
  publicCollections: async () => {
    const result = await fetchApi<{
      items: CollectionView[];
      presentation: CollectionPresentation;
    }>("/api/public/collections");
    return {
      ...result,
      items: result.items.map(collectionHref),
    };
  },
  subscribe: (email: string) =>
    fetchApi("/api/public/subscriptions", {
      method: "POST",
      body: json({ email }),
    }),
  session: () => fetchApi<Session>("/api/auth/session"),
  login: (email: string, password: string) =>
    fetchApi<Session>("/api/auth/login", {
      method: "POST",
      body: json({ email, password }),
    }),
  logout: () => fetchApi<void>("/api/auth/logout", { method: "POST" }),
  categories: async () =>
    (await fetchApi<{ items: Category[] }>("/api/admin/categories")).items,
  createCategory: (name: string) =>
    fetchApi<Category>("/api/admin/categories", {
      method: "POST",
      body: json({ name }),
    }),
  updateCategory: (id: string, name: string) =>
    fetchApi<Category>(`/api/admin/categories/${id}`, {
      method: "PATCH",
      body: json({ name }),
    }),
  orderCategories: async (ids: string[]) =>
    (
      await fetchApi<{ items: Category[] }>("/api/admin/categories/order", {
        method: "PUT",
        body: json({ ids }),
      })
    ).items,
  deleteCategory: (id: string) =>
    fetchApi<void>(`/api/admin/categories/${id}`, { method: "DELETE" }),
  articles: async () =>
    (await fetchApi<{ items: Article[] }>("/api/admin/articles")).items,
  createArticle: (title: string, categoryId: string, imageAssetId?: string) =>
    fetchApi<Article>("/api/admin/articles", {
      method: "POST",
      body: json({
        title,
        categoryId,
        status: "draft",
        excerpt: "这是一篇刚刚建立的文章草稿。",
        ...(imageAssetId ? { imageAssetId } : {}),
      }),
    }),
  updateArticle: (id: string, input: Partial<ArticleInput>) =>
    fetchApi<Article>(`/api/admin/articles/${id}`, {
      method: "PATCH",
      body: json(input),
    }),
  archiveArticle: (id: string, archived: boolean) =>
    fetchApi<Article>(
      `/api/admin/articles/${id}/${archived ? "archive" : "restore"}`,
      { method: "POST" },
    ),
  albums: async () =>
    (await fetchApi<{ items: Album[] }>("/api/admin/albums")).items,
  createAlbum: (title: string, categoryId: string) =>
    fetchApi<Album>("/api/admin/albums", {
      method: "POST",
      body: json({
        title,
        categoryId,
        isPrivate: true,
        description: "这是一个刚刚建立的空白相册。",
      }),
    }),
  updateAlbum: (id: string, input: Partial<AlbumInput>) =>
    fetchApi<Album>(`/api/admin/albums/${id}`, {
      method: "PATCH",
      body: json(input),
    }),
  archiveAlbum: (id: string, archived: boolean) =>
    fetchApi<Album>(
      `/api/admin/albums/${id}/${archived ? "archive" : "restore"}`,
      { method: "POST" },
    ),
  createPhoto: (albumId: string, input: PhotoInput) =>
    fetchApi<Photo>(`/api/admin/albums/${albumId}/photos`, {
      method: "POST",
      body: json(input),
    }),
  updatePhoto: (id: string, input: Partial<PhotoInput>) =>
    fetchApi<Photo>(`/api/admin/photos/${id}`, {
      method: "PATCH",
      body: json(input),
    }),
  deletePhoto: (id: string) =>
    fetchApi<void>(`/api/admin/photos/${id}`, { method: "DELETE" }),
  orderPhotos: (albumId: string, ids: string[]) =>
    fetchApi<Album>(`/api/admin/albums/${albumId}/photos/order`, {
      method: "PUT",
      body: json({ ids }),
    }),
  movePhoto: (id: string, albumId: string, position?: number) =>
    fetchApi<Photo>(`/api/admin/photos/${id}/move`, {
      method: "POST",
      body: json({ albumId, position }),
    }),
  collections: async () => {
    const result = await fetchApi<CollectionCatalog>("/api/admin/collections");
    return { ...result, items: result.items.map(collectionHref) };
  },
  saveCollections: (
    items: CollectionReference[],
    presentation: CollectionPresentation,
  ) =>
    fetchApi<CollectionCatalog>("/api/admin/collections", {
      method: "PUT",
      body: json({ items, presentation }),
    }),
  images: async () =>
    (await fetchApi<{ items: ImageAsset[] }>("/api/admin/images")).items.map(
      (item) => ({ ...item, url: `/api/images/${item.id}` }),
    ),
  uploadImage: (file: File) => {
    const body = new FormData();
    body.set("file", file);
    return fetchApi<ImageAsset>("/api/admin/images", { method: "POST", body });
  },
  deleteImage: (id: string) =>
    fetchApi<void>(`/api/admin/images/${id}`, { method: "DELETE" }),
};
export const getAlbumCover = (album: Album) =>
  album.photos.find((photo) => photo.id === album.coverPhotoId) ??
  album.photos[0];
