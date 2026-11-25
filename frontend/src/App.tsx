import { BrowserRouter, matchPath, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { ContentProvider } from "./domain/ContentContext";
import { useContent } from "./domain/useContent";
import { AdminAlbumsPage, AdminArticlesPage, DashboardPage } from "./pages/AdminPages";
import { AdminCollectionsPage } from "./pages/AdminCollectionsPage";
import { CollectionsPage } from "./pages/CollectionsPage";
import { ComponentsPage } from "./pages/ComponentsPage";
import { AiImagesPage } from "./plugins/ai-images/AiImagesPage";
import { AiImagesCatalogProvider, useAiImagesCatalog } from "./plugins/ai-images/catalog";
import {
  AlbumDetailPage,
  AlbumsPage,
  ArticleDetailPage,
  ArticlesPage,
  HomePage,
} from "./pages/PublicPages";
import { LoginPage } from "./workbench/LoginPage";
import { OwnerSessionProvider, RequireOwner } from "./workbench/OwnerSessionProvider";
import { WorkbenchShell } from "./workbench/WorkbenchShell";
import { useOwnerSession } from "./workbench/owner-session";
import "./editorial-notice.css";

const editorialPages = [
  { id: "dashboard", to: "/admin/dashboard", label: "总览", title: "运营总览", viewTo: "/", Page: DashboardPage },
  { id: "articles", to: "/admin/articles", label: "文章", title: "文章管理", viewTo: "/articles", Page: AdminArticlesPage },
  { id: "albums", to: "/admin/albums", label: "相册", title: "相册管理", viewTo: "/albums", Page: AdminAlbumsPage },
  { id: "collections", to: "/admin/collections", label: "收藏", title: "收藏编排", viewTo: "/collections", Page: AdminCollectionsPage },
];
const aiImages = { id: "ai-images", to: "/admin/ai-images", label: "AI 生图", title: "AI 生图", viewTo: "/" };

// Composition only: the shell receives ordinary links; it knows no tool APIs.
function WorkbenchLayout() {
  const { pathname } = useLocation();
  const { owner, logout } = useOwnerSession();
  const { catalog } = useAiImagesCatalog();
  const page = [...editorialPages, aiImages].find(({ to }) => matchPath(to, pathname));
  if (!owner || !page) return null;
  const navigation = catalog?.enabled || catalog?.issue === "invalid_configuration" ? [...editorialPages, aiImages] : editorialPages;
  return (
    <WorkbenchShell
      title={page.title}
      viewTo={page.viewTo}
      navigation={navigation}
      ownerEmail={owner.email}
      onLogout={() => void logout()}
    >
      <Outlet />
    </WorkbenchShell>
  );
}

function EditorialOutlet() {
  const { adminLoading, adminError, reloadAdmin, adminRefreshError, adminRefreshing, retryAdminRefresh } = useContent();
  if (adminLoading) return <p role="status">正在加载刊物编辑数据…</p>;
  if (adminError) return (
    <div>
      <p className="error" role="alert">刊物编辑数据加载失败：{adminError}</p>
      <button type="button" className="ghost" onClick={() => void reloadAdmin()}>重新加载</button>
    </div>
  );
  return (
    <>
      {adminRefreshError && (
        <div className="editorialRefreshNotice">
          <p role="status">已保存，列表未刷新{adminRefreshing ? "，正在刷新…" : ""}</p>
          <button type="button" className="ghost" disabled={adminRefreshing} onClick={() => void retryAdminRefresh()}>重试刷新</button>
        </div>
      )}
      <Outlet />
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<ContentProvider><Outlet /></ContentProvider>}>
        <Route index element={<HomePage />} />
        <Route path="articles" element={<ArticlesPage />} />
        <Route path="articles/:slug" element={<ArticleDetailPage />} />
        <Route path="albums" element={<AlbumsPage />} />
        <Route path="albums/:id" element={<AlbumDetailPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="favorites" element={<Navigate to="/collections" replace />} />
        <Route path="components" element={<ComponentsPage />} />
      </Route>
      <Route path="/admin">
        <Route index element={<Navigate to="/" replace />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route element={<RequireOwner />}>
          <Route element={<AiImagesCatalogProvider><WorkbenchLayout /></AiImagesCatalogProvider>}>
            <Route element={<ContentProvider scope="editorial"><EditorialOutlet /></ContentProvider>}>
              {editorialPages.map(({ id, to, Page }) => <Route key={id} path={to} element={<Page />} />)}
            </Route>
            <Route path={aiImages.to} element={<AiImagesPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Keep cookie mutations serialized even when navigating between public and private routes. */}
      <OwnerSessionProvider><AppRoutes /></OwnerSessionProvider>
    </BrowserRouter>
  );
}
