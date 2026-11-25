export type ArticleStatus = "draft" | "published" | "scheduled";

export interface Category {
  id: string;
  name: string;
  position: number;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  categoryId: string;
  date: string;
  readingMinutes: number;
  image: string;
  imageAssetId: string;
  alt: string;
  body: string;
  status: ArticleStatus;
  scheduledAt?: string;
  pinned: boolean;
  archived: boolean;
}

export interface Photo {
  id: string;
  title: string;
  caption: string;
  image: string;
  imageAssetId: string;
  alt: string;
  position: number;
}

export interface Album {
  id: string;
  title: string;
  description: string;
  category: string;
  categoryId: string;
  location: string;
  date: string;
  coverPhotoId?: string;
  isPrivate: boolean;
  archived: boolean;
  photos: Photo[];
}

export type CollectionReference =
  | {
      id?: string;
      type: "article";
      articleId: string;
      note: string;
      visible?: boolean;
    }
  | {
      id?: string;
      type: "album";
      albumId: string;
      note: string;
      visible?: boolean;
    }
  | {
      id?: string;
      type: "photo";
      albumId: string;
      photoId: string;
      note: string;
      visible?: boolean;
    };

export interface CollectionView {
  id: string;
  type: "文章" | "相册" | "照片";
  sourceType: "article" | "album" | "photo";
  title: string;
  meta: string;
  image: string;
  alt: string;
  href: string;
  note: string;
  visible: boolean;
  articleId?: string;
  albumId?: string;
  photoId?: string;
}

export type CollectionCardTheme = "stamp" | "editorial" | "holographic" | "cinema" | "boarding";
export interface CollectionPresentation {
  defaultTheme: CollectionCardTheme;
  enabledThemes: CollectionCardTheme[];
}
export interface CollectionCatalog {
  articles: Article[];
  albums: Album[];
  items: CollectionView[];
  presentation: CollectionPresentation;
}
export interface ImageAsset {
  id: string;
  filename: string;
  mediaType: string;
  byteSize: number;
  createdAt: string;
  kind?: "local" | "external";
  url?: string;
  previewUrl?: string;
}
export type ArticleInput = Pick<
  Article,
  | "title"
  | "slug"
  | "excerpt"
  | "categoryId"
  | "date"
  | "readingMinutes"
  | "alt"
  | "body"
  | "status"
  | "pinned"
> & { imageAssetId?: string; scheduledAt?: string | null };
export type AlbumInput = Pick<
  Album,
  "title" | "description" | "categoryId" | "location" | "date" | "isPrivate"
> & { coverPhotoId?: string | null };
export type PhotoInput = Pick<Photo, "title" | "caption" | "alt"> & {
  imageAssetId?: string;
};
