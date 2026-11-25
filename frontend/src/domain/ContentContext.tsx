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
} from "./types";

const defaultPresentation: CollectionPresentation = {
  defaultTheme: "stamp",
  enabledThemes: ["stamp", "editorial", "holographic", "cinema", "boarding"],
};
const adminRefreshTimeoutMs = 15_000;
const initialPublicStatus = (): ContentValue["publicStatus"] => ({
  articles: { loading: true, error: "" },
  albums: { loading: true, error: "" },
  collections: { loading: true, error: "" },
});

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
    [publicStatus, setPublicStatus] = useState(initialPublicStatus);
  const [adminArticles, setAdminArticles] = useState<Article[]>([]),
    [adminAlbums, setAdminAlbums] = useState<Album[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [adminCollections, setAdminCollections] = useState<CollectionView[]>([]),
    [adminCollectionPresentation, setAdminCollectionPresentation] =
      useState(defaultPresentation),
    [images, setImages] = useState<ImageAsset[]>([]),
    [adminLoading, setAdminLoading] = useState(scope === "editorial"),
    [adminError, setAdminError] = useState(""),
    [adminRefreshError, setAdminRefreshError] = useState(""),
    [adminRefreshing, setAdminRefreshing] = useState(false);
  const generation = useRef(0),
    adminRequest = useRef(0),
    adminController = useRef<AbortController | null>(null),
    adminLoadingRef = useRef(scope === "editorial"),
    active = useRef(false);
  const loadPublic = useCallback((signal: AbortSignal) => {
    const expected = generation.current;
    setPublicStatus(initialPublicStatus());
    const load = async <T,>(
      key: keyof ContentValue["publicStatus"],
      request: () => Promise<T>,
      apply: (value: T) => void,
    ) => {
      try {
        const value = await request();
        if (!active.current || expected !== generation.current || signal.aborted) return;
        apply(value);
        setPublicStatus((previous) => ({ ...previous, [key]: { loading: false, error: "" } }));
      } catch (error) {
        if (!active.current || expected !== generation.current || signal.aborted) return;
        setPublicStatus((previous) => ({
          ...previous,
          [key]: { loading: false, error: error instanceof Error ? error.message : "公开内容加载失败" },
        }));
      }
    };
    void load("articles", () => contentApi.publicArticles(signal), setPublicArticles);
    void load("albums", () => contentApi.publicAlbums(signal), setPublicAlbums);
    void load("collections", () => contentApi.publicCollections(signal), (collections) => {
      setPublicCollections(collections.items);
      setPublicCollectionPresentation(collections.presentation);
    });
  }, []);
  const loadAdminData = useCallback(async () => {
    if (!active.current) return;
    const expected = generation.current,
      request = ++adminRequest.current;
    adminController.current?.abort();
    const controller = new AbortController();
    adminController.current = controller;
    const initial = adminLoadingRef.current;
    if (!initial) setAdminRefreshing(true);
    const isCurrent = () =>
      active.current &&
      expected === generation.current &&
      request === adminRequest.current;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const requests = Promise.all([
          contentApi.categories(controller.signal),
          contentApi.articles(controller.signal),
          contentApi.albums(controller.signal),
          contentApi.collections(controller.signal),
          contentApi.images(controller.signal),
        ]);
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });
      if (!initial)
        timeout = setTimeout(() => controller.abort(new Error("编辑部刷新超时，请重试")), adminRefreshTimeoutMs);
      const [nextCategories, articles, albums, collections, nextImages] =
        await Promise.race([requests, aborted]);
      if (!isCurrent()) return;
      setCategories(nextCategories);
      setAdminArticles(articles);
      setAdminAlbums(albums);
      setAdminCollections(collections.items);
      setAdminCollectionPresentation(collections.presentation);
      setImages(nextImages);
      setAdminError("");
      setAdminRefreshError("");
    } catch (error) {
      const cause = controller.signal.aborted ? controller.signal.reason : error;
      controller.abort();
      if (isCurrent()) {
        const message = cause instanceof Error ? cause.message : "编辑部加载失败";
        if (initial) setAdminError(message);
        else setAdminRefreshError(cause instanceof ApiError && cause.status === 401 ? "" : message);
      }
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (onAbort) controller.signal.removeEventListener("abort", onAbort);
      if (adminController.current === controller) adminController.current = null;
      if (isCurrent() && adminLoadingRef.current) {
        adminLoadingRef.current = false;
        setAdminLoading(false);
      }
      if (isCurrent()) setAdminRefreshing(false);
    }
  }, []);
  const reloadAdmin = useCallback(async () => {
    if (!active.current || scope !== "editorial") return;
    adminLoadingRef.current = true;
    setAdminLoading(true);
    setAdminError("");
    setAdminRefreshError("");
    setAdminRefreshing(false);
    await loadAdminData();
  }, [loadAdminData, scope]);
  useEffect(() => {
    active.current = true;
    generation.current++;
    const publicController = new AbortController();
    if (scope === "public") loadPublic(publicController.signal);
    else void reloadAdmin();
    return () => {
      active.current = false;
      generation.current++;
      publicController.abort();
      adminController.current?.abort();
    };
  }, [loadPublic, reloadAdmin, scope]);
  const refreshAdmin = async () => {
    if (scope === "editorial") await loadAdminData();
  };
  const persist = async (write: () => Promise<unknown>) => {
    const expected = generation.current;
    await write();
    if (active.current && expected === generation.current)
      void refreshAdmin().catch((error: unknown) => {
        console.error("编辑部刷新发生意外错误", error);
      });
  };
  const value: ContentValue = {
    publicArticles,
    publicAlbums,
    publicCollections,
    publicCollectionPresentation,
    publicStatus,
    adminArticles,
    adminAlbums,
    categories,
    adminCollections,
    adminCollectionPresentation,
    images,
    adminLoading,
    adminError,
    adminRefreshError,
    adminRefreshing,
    reloadAdmin,
    retryAdminRefresh: refreshAdmin,
    subscribe: async (email) => {
      await contentApi.subscribe(email);
    },
    createCategory: async (name) => {
      await persist(() => contentApi.createCategory(name));
    },
    updateCategory: async (id, name) => {
      await persist(() => contentApi.updateCategory(id, name));
    },
    moveCategory: async (id, offset) => {
      const index = categories.findIndex((item) => item.id === id),
        target = index + offset;
      if (index < 0 || target < 0 || target >= categories.length) return;
      const ids = categories.map((item) => item.id);
      [ids[index], ids[target]] = [ids[target], ids[index]];
      await persist(() => contentApi.orderCategories(ids));
    },
    deleteCategory: async (id) => {
      await persist(() => contentApi.deleteCategory(id));
    },
    createArticle: async (title, categoryId, imageAssetId) => {
      await persist(() => contentApi.createArticle(title, categoryId, imageAssetId));
    },
    updateArticle: async (id, input) => {
      await persist(() => contentApi.updateArticle(id, input));
    },
    archiveArticle: async (id, archived) => {
      await persist(() => contentApi.archiveArticle(id, archived));
    },
    createAlbum: async (title, categoryId) => {
      await persist(() => contentApi.createAlbum(title, categoryId));
    },
    updateAlbum: async (id, input) => {
      await persist(() => contentApi.updateAlbum(id, input));
    },
    archiveAlbum: async (id, archived) => {
      await persist(() => contentApi.archiveAlbum(id, archived));
    },
    createPhoto: async (albumId, input) => {
      await persist(() => contentApi.createPhoto(albumId, input));
    },
    updatePhoto: async (id, input) => {
      await persist(() => contentApi.updatePhoto(id, input));
    },
    deletePhoto: async (id) => {
      await persist(() => contentApi.deletePhoto(id));
    },
    movePhotoOrder: async (albumId, id, offset) => {
      const album = adminAlbums.find((item) => item.id === albumId),
        index = album?.photos.findIndex((item) => item.id === id) ?? -1,
        target = index + offset;
      if (!album || index < 0 || target < 0 || target >= album.photos.length)
        return;
      const ids = album.photos.map((item) => item.id);
      [ids[index], ids[target]] = [ids[target], ids[index]];
      await persist(() => contentApi.orderPhotos(albumId, ids));
    },
    movePhoto: async (id, albumId) => {
      await persist(() => contentApi.movePhoto(id, albumId));
    },
    uploadImage: async (file) => {
      await persist(() => contentApi.uploadImage(file));
    },
    deleteImage: async (id) => {
      await persist(() => contentApi.deleteImage(id));
    },
    saveCollections: async (items, presentation) => {
      await persist(() => contentApi.saveCollections(items, presentation));
    },
  };
  return (
    <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
  );
}
