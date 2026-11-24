import { createContext } from "react";
import type {
  Album,
  AlbumInput,
  Article,
  ArticleInput,
  Category,
  CollectionPresentation,
  CollectionReference,
  CollectionView,
  ImageAsset,
  Owner,
  PhotoInput,
} from "./types";
export interface ContentValue {
  publicArticles: Article[];
  publicAlbums: Album[];
  publicCollections: CollectionView[];
  publicCollectionPresentation: CollectionPresentation;
  publicCollectionsLoaded: boolean;
  publicLoading: boolean;
  publicError: string;
  adminArticles: Article[];
  adminAlbums: Album[];
  categories: Category[];
  adminCollections: CollectionView[];
  adminCollectionPresentation: CollectionPresentation;
  images: ImageAsset[];
  adminLoading: boolean;
  adminError: string;
  owner?: Owner;
  loadAdmin: () => Promise<"authenticated" | "unauthenticated" | "error">;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  subscribe: (email: string) => Promise<void>;
  createCategory: (name: string) => Promise<void>;
  updateCategory: (id: string, name: string) => Promise<void>;
  moveCategory: (id: string, offset: number) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  createArticle: (
    title: string,
    categoryId: string,
    imageAssetId?: string,
  ) => Promise<void>;
  updateArticle: (id: string, input: Partial<ArticleInput>) => Promise<void>;
  archiveArticle: (id: string, archived: boolean) => Promise<void>;
  createAlbum: (title: string, categoryId: string) => Promise<void>;
  updateAlbum: (id: string, input: Partial<AlbumInput>) => Promise<void>;
  archiveAlbum: (id: string, archived: boolean) => Promise<void>;
  createPhoto: (albumId: string, input: PhotoInput) => Promise<void>;
  updatePhoto: (id: string, input: Partial<PhotoInput>) => Promise<void>;
  deletePhoto: (id: string) => Promise<void>;
  movePhotoOrder: (
    albumId: string,
    id: string,
    offset: number,
  ) => Promise<void>;
  movePhoto: (id: string, albumId: string) => Promise<void>;
  uploadImage: (file: File) => Promise<void>;
  deleteImage: (id: string) => Promise<void>;
  saveCollections: (
    items: CollectionReference[],
    presentation: CollectionPresentation,
  ) => Promise<void>;
}
export const ContentContext = createContext<ContentValue | null>(null);
