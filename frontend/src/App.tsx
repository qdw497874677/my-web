import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ContentProvider } from "./domain/ContentContext";
import { AdminAlbumsPage, AdminArticlesPage, DashboardPage, LoginPage } from "./pages/AdminPages";
import { AdminCollectionsPage } from "./pages/AdminCollectionsPage";
import { CollectionsPage } from "./pages/CollectionsPage";
import { ComponentsPage } from "./pages/ComponentsPage";
import { AiImagesPage } from "./plugins/ai-images/AiImagesPage";
import {
  AlbumDetailPage,
  AlbumsPage,
  ArticleDetailPage,
  ArticlesPage,
  HomePage,
} from "./pages/PublicPages";

export default function App() {
  return (
    <BrowserRouter>
      <ContentProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/articles" element={<ArticlesPage />} />
          <Route path="/articles/:slug" element={<ArticleDetailPage />} />
          <Route path="/albums" element={<AlbumsPage />} />
          <Route path="/albums/:id" element={<AlbumDetailPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route
            path="/favorites"
            element={<Navigate to="/collections" replace />}
          />
          <Route path="/components" element={<ComponentsPage />} />
          <Route path="/admin/login" element={<LoginPage />} />
          <Route path="/admin/dashboard" element={<DashboardPage />} />
          <Route path="/admin/articles" element={<AdminArticlesPage />} />
          <Route path="/admin/albums" element={<AdminAlbumsPage />} />
          <Route path="/admin/collections" element={<AdminCollectionsPage />} />
          <Route path="/admin/ai-images" element={<AiImagesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ContentProvider>
    </BrowserRouter>
  );
}
