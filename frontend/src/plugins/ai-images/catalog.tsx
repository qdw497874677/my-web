import { createContext, useContext, type ReactNode } from "react";
import { useImageGenerationCatalog } from "./api";

const CatalogContext = createContext<ReturnType<typeof useImageGenerationCatalog> | null>(null);

export function AiImagesCatalogProvider({ children }: { children: ReactNode }) {
  const catalog = useImageGenerationCatalog(true);
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

export function useAiImagesCatalog() {
  const catalog = useContext(CatalogContext);
  if (!catalog) throw new Error("AI image catalog provider is missing");
  return catalog;
}
