import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, contentApi } from "./repository";
import { ContentContext, type ContentValue } from "./content-context";
import type {
  Album,
  Article,
  Category,
  CollectionPresentation,
  CollectionView,
  ImageAsset,
  Owner,
} from "./types";

const defaultPresentation: CollectionPresentation = {
  defaultTheme: "stamp",
  enabledThemes: ["stamp", "editorial", "holographic", "cinema", "boarding"],
};

export function ContentProvider({ children }: { children: ReactNode }) {
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
    [adminLoading, setAdminLoading] = useState(false),
    [adminError, setAdminError] = useState(""),
    [owner, setOwner] = useState<Owner>();
  const generation = useRef(0);
  const loadPublic = useCallback(async () => {
    setPublicLoading(true);
    setPublicError("");
    try {
      const [articles, albums, collections] = await Promise.all([
        contentApi.publicArticles(),
        contentApi.publicAlbums(),
        contentApi.publicCollections(),
      ]);
      setPublicArticles(articles);
      setPublicAlbums(albums);
      setPublicCollections(collections.items);
      setPublicCollectionPresentation(collections.presentation);
      setPublicCollectionsLoaded(true);
    } catch (error) {
      setPublicError(
        error instanceof Error ? error.message : "公开内容加载失败",
      );
    } finally {
      setPublicLoading(false);
    }
  }, []);
  const loadAdminData = useCallback(async (expected = generation.current) => {
    const [nextCategories, articles, albums, collections, nextImages] =
      await Promise.all([
        contentApi.categories(),
        contentApi.articles(),
        contentApi.albums(),
        contentApi.collections(),
        contentApi.images(),
      ]);
    if (expected !== generation.current) return;
    setCategories(nextCategories);
    setAdminArticles(articles);
    setAdminAlbums(albums);
    setAdminCollections(collections.items);
    setAdminCollectionPresentation(collections.presentation);
    setImages(nextImages);
  }, []);
  const loadAdmin = useCallback(async () => {
    const expected = generation.current;
    setAdminLoading(true);
    setAdminError("");
    try {
      const session = await contentApi.session();
      if (expected !== generation.current) return "unauthenticated";
      if (!session.authenticated || !session.owner) {
        setOwner(undefined);
        return "unauthenticated";
      }
      setOwner(session.owner);
      await loadAdminData(expected);
      return "authenticated";
    } catch (error) {
      if (expected !== generation.current) return "unauthenticated";
      if (error instanceof ApiError && error.status === 401) {
        setOwner(undefined);
        return "unauthenticated";
      }
      setAdminError(error instanceof Error ? error.message : "编辑部加载失败");
      return "error";
    } finally {
      if (expected === generation.current) setAdminLoading(false);
    }
  }, [loadAdminData]);
  useEffect(() => {
    void loadPublic();
  }, [loadPublic]);
  const refreshAdmin = async () => loadAdminData(generation.current),
    refreshAll = async () => Promise.all([refreshAdmin(), loadPublic()]);
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
    owner,
    loadAdmin,
    login: async (email, password) => {
      generation.current++;
      const expected = generation.current;
      const session = await contentApi.login(email, password);
      if (expected !== generation.current) return;
      setOwner(session.owner);
      await loadAdminData(expected);
    },
    logout: async () => {
      generation.current++;
      setOwner(undefined);
      setAdminArticles([]);
      setAdminAlbums([]);
      setCategories([]);
      setAdminCollections([]);
      setAdminCollectionPresentation(defaultPresentation);
      setImages([]);
      setAdminError("");
      try {
        await contentApi.logout();
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      }
    },
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
      await refreshAll();
    },
    archiveArticle: async (id, archived) => {
      await contentApi.archiveArticle(id, archived);
      await refreshAll();
    },
    createAlbum: async (title, categoryId) => {
      await contentApi.createAlbum(title, categoryId);
      await refreshAdmin();
    },
    updateAlbum: async (id, input) => {
      await contentApi.updateAlbum(id, input);
      await refreshAll();
    },
    archiveAlbum: async (id, archived) => {
      await contentApi.archiveAlbum(id, archived);
      await refreshAll();
    },
    createPhoto: async (albumId, input) => {
      await contentApi.createPhoto(albumId, input);
      await refreshAll();
    },
    updatePhoto: async (id, input) => {
      await contentApi.updatePhoto(id, input);
      await refreshAll();
    },
    deletePhoto: async (id) => {
      await contentApi.deletePhoto(id);
      await refreshAll();
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
      await refreshAll();
    },
    movePhoto: async (id, albumId) => {
      await contentApi.movePhoto(id, albumId);
      await refreshAll();
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
      await refreshAll();
    },
  };
  return (
    <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
  );
}
