export type ArticleStatus = "draft" | "published" | "scheduled";

export interface ArticleInput {
  title: string;
  slug?: string;
  excerpt?: string;
  categoryId: string;
  date?: string;
  readingMinutes?: number;
  image?: string;
  imageAssetId?: string;
  alt?: string;
  body?: string;
  status?: ArticleStatus;
  scheduledAt?: string | null;
  pinned?: boolean;
}

export interface AlbumInput {
  title: string;
  description?: string;
  categoryId: string;
  location?: string;
  date?: string;
  coverPhotoId?: string | null;
  isPrivate?: boolean;
}

export interface CollectionInput {
  id?: string;
  type: "article" | "album" | "photo";
  articleId?: string;
  albumId?: string;
  photoId?: string;
  note?: string;
  visible?: boolean;
}

export type CollectionTheme = "stamp" | "editorial" | "holographic" | "cinema" | "boarding";

export interface CollectionPresentationInput {
  defaultTheme: CollectionTheme;
  enabledThemes: CollectionTheme[];
}

export class DomainError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
