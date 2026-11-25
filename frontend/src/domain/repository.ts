import { fetchApi } from "../shared/http";
import { fetchAdminApi } from "../workbench/admin-http";
export { ApiError, fetchApi } from "../shared/http";
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
} from "./types";

const json = (value: unknown) => JSON.stringify(value);
const collectionHref = (item: CollectionView) =>
  item.sourceType === "photo" && item.photoId
    ? { ...item, href: `/albums/${item.albumId}?photo=${item.photoId}` }
    : item;
const adminImage = (url: string) =>
  typeof url === "string" && /^\/api\/images\/asset-[^/?#]+$/.test(url)
    ? url.replace("/api/images/", "/api/admin/images/")
    : url;
const adminArticle = (item: Article): Article => ({ ...item, image: adminImage(item.image) });
const adminPhoto = (item: Photo): Photo => ({ ...item, image: adminImage(item.image) });
const adminAlbum = (item: Album): Album => ({
  ...item,
  photos: item.photos?.map(adminPhoto),
});
const adminCollection = (item: CollectionView): CollectionView =>
  collectionHref({ ...item, image: adminImage(item.image) });
const adminCatalog = (result: CollectionCatalog): CollectionCatalog => ({
  ...result,
  articles: result.articles?.map(adminArticle),
  albums: result.albums?.map(adminAlbum),
  items: result.items.map(adminCollection),
});
const adminAsset = (item: ImageAsset): ImageAsset => ({
  ...item,
  url: item.previewUrl ?? item.url,
});

export const contentApi = {
  publicArticles: async (signal?: AbortSignal) =>
    (await fetchApi<{ items: Article[] }>("/api/public/articles", { signal })).items,
  publicArticle: (slug: string, signal?: AbortSignal) =>
    fetchApi<Article>(`/api/public/articles/${encodeURIComponent(slug)}`, {
      signal,
    }),
  publicAlbums: async (signal?: AbortSignal) =>
    (await fetchApi<{ items: Album[] }>("/api/public/albums", { signal })).items,
  publicAlbum: (id: string, signal?: AbortSignal) =>
    fetchApi<Album>(`/api/public/albums/${encodeURIComponent(id)}`, { signal }),
  publicCollections: async (signal?: AbortSignal) => {
    const result = await fetchApi<{
      items: CollectionView[];
      presentation: CollectionPresentation;
    }>("/api/public/collections", { signal });
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
  categories: async (signal?: AbortSignal) =>
    (await fetchAdminApi<{ items: Category[] }>("/api/admin/categories", { signal })).items,
  createCategory: (name: string) =>
    fetchAdminApi<Category>("/api/admin/categories", {
      method: "POST",
      body: json({ name }),
    }),
  updateCategory: (id: string, name: string) =>
    fetchAdminApi<Category>(`/api/admin/categories/${id}`, {
      method: "PATCH",
      body: json({ name }),
    }),
  orderCategories: async (ids: string[]) =>
    (
      await fetchAdminApi<{ items: Category[] }>("/api/admin/categories/order", {
        method: "PUT",
        body: json({ ids }),
      })
    ).items,
  deleteCategory: (id: string) =>
    fetchAdminApi<void>(`/api/admin/categories/${id}`, { method: "DELETE" }),
  articles: async (signal?: AbortSignal) =>
    (await fetchAdminApi<{ items: Article[] }>("/api/admin/articles", { signal })).items.map(
      adminArticle,
    ),
  createArticle: (title: string, categoryId: string, imageAssetId?: string) =>
    fetchAdminApi<Article>("/api/admin/articles", {
      method: "POST",
      body: json({
        title,
        categoryId,
        status: "draft",
        excerpt: "这是一篇刚刚建立的文章草稿。",
        ...(imageAssetId ? { imageAssetId } : {}),
      }),
    }).then(adminArticle),
  updateArticle: (id: string, input: Partial<ArticleInput>) =>
    fetchAdminApi<Article>(`/api/admin/articles/${id}`, {
      method: "PATCH",
      body: json(input),
    }).then(adminArticle),
  archiveArticle: (id: string, archived: boolean) =>
    fetchAdminApi<Article>(`/api/admin/articles/${id}/${archived ? "archive" : "restore"}`, {
      method: "POST",
    }).then(adminArticle),
  albums: async (signal?: AbortSignal) =>
    (await fetchAdminApi<{ items: Album[] }>("/api/admin/albums", { signal })).items.map(
      adminAlbum,
    ),
  createAlbum: (title: string, categoryId: string) =>
    fetchAdminApi<Album>("/api/admin/albums", {
      method: "POST",
      body: json({
        title,
        categoryId,
        isPrivate: true,
        description: "这是一个刚刚建立的空白相册。",
      }),
    }).then(adminAlbum),
  updateAlbum: (id: string, input: Partial<AlbumInput>) =>
    fetchAdminApi<Album>(`/api/admin/albums/${id}`, {
      method: "PATCH",
      body: json(input),
    }).then(adminAlbum),
  archiveAlbum: (id: string, archived: boolean) =>
    fetchAdminApi<Album>(`/api/admin/albums/${id}/${archived ? "archive" : "restore"}`, {
      method: "POST",
    }).then(adminAlbum),
  createPhoto: (albumId: string, input: PhotoInput) =>
    fetchAdminApi<Photo>(`/api/admin/albums/${albumId}/photos`, {
      method: "POST",
      body: json(input),
    }).then(adminPhoto),
  updatePhoto: (id: string, input: Partial<PhotoInput>) =>
    fetchAdminApi<Photo>(`/api/admin/photos/${id}`, {
      method: "PATCH",
      body: json(input),
    }).then(adminPhoto),
  deletePhoto: (id: string) => fetchAdminApi<void>(`/api/admin/photos/${id}`, { method: "DELETE" }),
  orderPhotos: (albumId: string, ids: string[]) =>
    fetchAdminApi<Album>(`/api/admin/albums/${albumId}/photos/order`, {
      method: "PUT",
      body: json({ ids }),
    }).then(adminAlbum),
  movePhoto: (id: string, albumId: string, position?: number) =>
    fetchAdminApi<Photo>(`/api/admin/photos/${id}/move`, {
      method: "POST",
      body: json({ albumId, position }),
    }).then(adminPhoto),
  collections: async (signal?: AbortSignal) => {
    const result = await fetchAdminApi<CollectionCatalog>("/api/admin/collections", { signal });
    return adminCatalog(result);
  },
  saveCollections: (items: CollectionReference[], presentation: CollectionPresentation) =>
    fetchAdminApi<CollectionCatalog>("/api/admin/collections", {
      method: "PUT",
      body: json({ items, presentation }),
    }).then(adminCatalog),
  images: async (signal?: AbortSignal) =>
    (await fetchAdminApi<{ items: ImageAsset[] }>("/api/admin/images", { signal })).items.map(
      adminAsset,
    ),
  uploadImage: (file: File) => {
    const body = new FormData();
    body.set("file", file);
    return fetchAdminApi<ImageAsset>("/api/admin/images", { method: "POST", body }).then(
      adminAsset,
    );
  },
  deleteImage: (id: string) => fetchAdminApi<void>(`/api/admin/images/${id}`, { method: "DELETE" }),
};
export const getAlbumCover = (album: Album) =>
  album.photos.find((photo) => photo.id === album.coverPhotoId) ?? album.photos[0];
