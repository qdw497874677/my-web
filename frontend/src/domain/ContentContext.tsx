import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { contentApi } from "./repository";
import { ContentContext, type ContentValue } from "./content-context";
import type {
  Album,
  Article,
  Category,
  CollectionPresentation,
  CollectionView,
  ImageAsset,
} from "./types";

const defaultPresentation: CollectionPresentation = {
  defaultTheme: "stamp",
  enabledThemes: ["stamp", "editorial", "holographic", "cinema", "boarding"],
};

export function ContentProvider({
  children,
  scope = "public",
}: {
  children: ReactNode;
  scope?: "public" | "editorial";
}) {
  const [publicArticles, setPublicArticles] = useState<Article[]>([]),
    [publicAlbums, setPublicAlbums] = useState<Album[]>([]),
    [publicCollections, setPublicCollections] = useState<CollectionView[]>([]),
    [publicCollectionPresentation, setPublicCollectionPresentation] =
      useState(defaultPresentation),
    [publicCollectionsLoaded, setPublicCollectionsLoaded] = useState(false),
    [publicLoading, setPublicLoading] = useState(true),
    [publicError, setPublicError] = useState("");
  const [adminArticles, setAdminArticles] = useState<Article[]>([]),
    [adminAlbums, setAdminAlbums] = useState<Album[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [adminCollections, setAdminCollections] = useState<CollectionView[]>([]),
    [adminCollectionPresentation, setAdminCollectionPresentation] =
      useState(defaultPresentation),
    [images, setImages] = useState<ImageAsset[]>([]),
    [adminLoading, setAdminLoading] = useState(scope === "editorial"),
    [adminError, setAdminError] = useState("");
  const generation = useRef(0),
    adminRequest = useRef(0),
    adminLoadingRef = useRef(scope === "editorial"),
    active = useRef(false);
  const loadPublic = useCallback(async () => {
    const expected = generation.current;
    setPublicLoading(true);
    setPublicError("");
    try {
      const [articles, albums, collections] = await Promise.all([
        contentApi.publicArticles(),
        contentApi.publicAlbums(),
        contentApi.publicCollections(),
      ]);
      if (!active.current || expected !== generation.current) return;
      setPublicArticles(articles);
      setPublicAlbums(albums);
      setPublicCollections(collections.items);
      setPublicCollectionPresentation(collections.presentation);
      setPublicCollectionsLoaded(true);
    } catch (error) {
      if (!active.current || expected !== generation.current) return;
      setPublicError(
        error instanceof Error ? error.message : "公开内容加载失败",
      );
    } finally {
      if (active.current && expected === generation.current)
        setPublicLoading(false);
    }
  }, []);
  const loadAdminData = useCallback(async () => {
    if (!active.current) return;
    const expected = generation.current,
      request = ++adminRequest.current;
    const isCurrent = () =>
      active.current &&
      expected === generation.current &&
      request === adminRequest.current;
    try {
      const [nextCategories, articles, albums, collections, nextImages] =
        await Promise.all([
          contentApi.categories(),
          contentApi.articles(),
          contentApi.albums(),
          contentApi.collections(),
          contentApi.images(),
        ]);
      if (!isCurrent()) return;
      setCategories(nextCategories);
      setAdminArticles(articles);
      setAdminAlbums(albums);
      setAdminCollections(collections.items);
      setAdminCollectionPresentation(collections.presentation);
      setImages(nextImages);
      setAdminError("");
    } catch (error) {
      if (isCurrent() && adminLoadingRef.current)
        setAdminError(error instanceof Error ? error.message : "编辑部加载失败");
      throw error;
    } finally {
      if (isCurrent() && adminLoadingRef.current) {
        adminLoadingRef.current = false;
        setAdminLoading(false);
      }
    }
  }, []);
  const reloadAdmin = useCallback(async () => {
    if (!active.current || scope !== "editorial") return;
    adminLoadingRef.current = true;
    setAdminLoading(true);
    setAdminError("");
    try {
      await loadAdminData();
    } catch {
      // The current request records its failure in adminError.
    }
  }, [loadAdminData, scope]);
  useEffect(() => {
    active.current = true;
    generation.current++;
    if (scope === "public") void loadPublic();
    else void reloadAdmin();
    return () => {
      active.current = false;
      generation.current++;
    };
  }, [loadPublic, reloadAdmin, scope]);
  const refreshAdmin = async () => loadAdminData();
  const value: ContentValue = {
    publicArticles,
    publicAlbums,
    publicCollections,
    publicCollectionPresentation,
    publicCollectionsLoaded,
    publicLoading,
    publicError,
    adminArticles,
    adminAlbums,
    categories,
    adminCollections,
    adminCollectionPresentation,
    images,
    adminLoading,
    adminError,
    reloadAdmin,
    subscribe: async (email) => {
      await contentApi.subscribe(email);
    },
    createCategory: async (name) => {
      await contentApi.createCategory(name);
      await refreshAdmin();
    },
    updateCategory: async (id, name) => {
      await contentApi.updateCategory(id, name);
      await refreshAdmin();
    },
    moveCategory: async (id, offset) => {
      const index = categories.findIndex((item) => item.id === id),
        target = index + offset;
      if (index < 0 || target < 0 || target >= categories.length) return;
      const ids = categories.map((item) => item.id);
      [ids[index], ids[target]] = [ids[target], ids[index]];
      await contentApi.orderCategories(ids);
      await refreshAdmin();
    },
    deleteCategory: async (id) => {
      await contentApi.deleteCategory(id);
      await refreshAdmin();
    },
    createArticle: async (title, categoryId, imageAssetId) => {
      await contentApi.createArticle(title, categoryId, imageAssetId);
      await refreshAdmin();
    },
    updateArticle: async (id, input) => {
      await contentApi.updateArticle(id, input);
      await refreshAdmin();
    },
    archiveArticle: async (id, archived) => {
      await contentApi.archiveArticle(id, archived);
      await refreshAdmin();
    },
    createAlbum: async (title, categoryId) => {
      await contentApi.createAlbum(title, categoryId);
      await refreshAdmin();
    },
    updateAlbum: async (id, input) => {
      await contentApi.updateAlbum(id, input);
      await refreshAdmin();
    },
    archiveAlbum: async (id, archived) => {
      await contentApi.archiveAlbum(id, archived);
      await refreshAdmin();
    },
    createPhoto: async (albumId, input) => {
      await contentApi.createPhoto(albumId, input);
      await refreshAdmin();
    },
    updatePhoto: async (id, input) => {
      await contentApi.updatePhoto(id, input);
      await refreshAdmin();
    },
    deletePhoto: async (id) => {
      await contentApi.deletePhoto(id);
      await refreshAdmin();
    },
    movePhotoOrder: async (albumId, id, offset) => {
      const album = adminAlbums.find((item) => item.id === albumId),
        index = album?.photos.findIndex((item) => item.id === id) ?? -1,
        target = index + offset;
      if (!album || index < 0 || target < 0 || target >= album.photos.length)
        return;
      const ids = album.photos.map((item) => item.id);
      [ids[index], ids[target]] = [ids[target], ids[index]];
      await contentApi.orderPhotos(albumId, ids);
      await refreshAdmin();
    },
    movePhoto: async (id, albumId) => {
      await contentApi.movePhoto(id, albumId);
      await refreshAdmin();
    },
    uploadImage: async (file) => {
      await contentApi.uploadImage(file);
      await refreshAdmin();
    },
    deleteImage: async (id) => {
      await contentApi.deleteImage(id);
      await refreshAdmin();
    },
    saveCollections: async (items, presentation) => {
      await contentApi.saveCollections(items, presentation);
      await refreshAdmin();
    },
  };
  return (
    <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
  );
}
