import type {
  Album,
  Article,
  CollectionCardTheme,
  CollectionPresentation,
  CollectionReference,
  CollectionView,
} from "./types";

export interface CollectionCatalogItem {
  reference: CollectionReference;
  title: string;
  image: string;
  type: string;
}

export function previewCollection(
  selected: CollectionReference[],
  catalog: CollectionCatalogItem[],
  saved: CollectionView[],
): CollectionView | undefined {
  const reference = selected[0];
  if (!reference) return saved[0];
  const existing = saved.find(
    (item) => keyOf(toReference(item)) === keyOf(reference),
  );
  if (existing)
    return {
      ...existing,
      note: reference.note,
      visible: reference.visible !== false,
    };
  const source = catalog.find(
    (item) => keyOf(item.reference) === keyOf(reference),
  );
  if (!source) return saved[0];
  return {
    id: reference.id ?? `preview-${keyOf(reference)}`,
    type:
      reference.type === "article"
        ? "文章"
        : reference.type === "album"
          ? "相册"
          : "照片",
    sourceType: reference.type,
    title: source.title,
    meta: source.type,
    image: source.image,
    alt: "",
    href: "#",
    note: reference.note,
    visible: reference.visible !== false,
    ...(reference.type === "article" ? { articleId: reference.articleId } : {}),
    ...(reference.type === "album" ? { albumId: reference.albumId } : {}),
    ...(reference.type === "photo"
      ? { albumId: reference.albumId, photoId: reference.photoId }
      : {}),
  };
}

export function keyOf(item: CollectionReference) {
  return item.type === "article"
    ? `article:${item.articleId}`
    : item.type === "album"
      ? `album:${item.albumId}`
      : `photo:${item.photoId}`;
}

export function toReference(item: CollectionView): CollectionReference {
  if (item.sourceType === "article") {
    return {
      id: item.id,
      type: "article",
      articleId: item.articleId!,
      note: item.note,
      visible: item.visible,
    };
  }
  if (item.sourceType === "album") {
    return {
      id: item.id,
      type: "album",
      albumId: item.albumId!,
      note: item.note,
      visible: item.visible,
    };
  }
  return {
    id: item.id,
    type: "photo",
    albumId: item.albumId!,
    photoId: item.photoId!,
    note: item.note,
    visible: item.visible,
  };
}

export function buildCollectionCatalog(
  articles: Article[],
  albums: Album[],
): CollectionCatalogItem[] {
  return [
    ...articles.map((article) => ({
      reference: {
        type: "article" as const,
        articleId: article.id,
        note: "编辑部收藏",
        visible: true,
      },
      title: article.title,
      image: article.image,
      type: "文章",
    })),
    ...albums.flatMap((album) => {
      const cover =
        album.photos.find((photo) => photo.id === album.coverPhotoId) ??
        album.photos[0];
      return cover
        ? [
            {
              reference: {
                type: "album" as const,
                albumId: album.id,
                note: "影像收藏",
                visible: true,
              },
              title: album.title,
              image: cover.image,
              type: `相册 / ${album.photos.length} 张`,
            },
          ]
        : [];
    }),
    ...albums.flatMap((album) =>
      album.photos.map((photo, index) => ({
        reference: {
          type: "photo" as const,
          albumId: album.id,
          photoId: photo.id,
          note: "收藏照片",
          visible: true,
        },
        title: photo.title,
        image: photo.image,
        type: `照片 / 《${album.title}》 / ${index + 1}`,
      })),
    ),
  ];
}

export function toggleCollectionReference(
  items: CollectionReference[],
  reference: CollectionReference,
) {
  return items.some((item) => keyOf(item) === keyOf(reference))
    ? items.filter((item) => keyOf(item) !== keyOf(reference))
    : [...items, reference];
}

export function moveCollectionReference(
  items: CollectionReference[],
  index: number,
  offset: number,
) {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function updateCollectionReference(
  items: CollectionReference[],
  index: number,
  changes: Partial<Pick<CollectionReference, "note" | "visible">>,
) {
  return items.map((item, itemIndex) =>
    itemIndex === index ? { ...item, ...changes } : item,
  );
}

export function toggleCollectionTheme(
  presentation: CollectionPresentation,
  theme: CollectionCardTheme,
  checked: boolean,
): CollectionPresentation {
  if (checked) {
    return presentation.enabledThemes.includes(theme)
      ? presentation
      : {
          ...presentation,
          enabledThemes: [...presentation.enabledThemes, theme],
        };
  }
  if (presentation.enabledThemes.length === 1) return presentation;
  const enabledThemes = presentation.enabledThemes.filter(
    (item) => item !== theme,
  );
  return {
    enabledThemes,
    defaultTheme:
      presentation.defaultTheme === theme
        ? enabledThemes[0]
        : presentation.defaultTheme,
  };
}
