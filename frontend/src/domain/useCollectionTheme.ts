import { useEffect, useState } from "react";
import { COLLECTION_THEME_STORAGE_KEY, resolveCollectionTheme } from "./collection-theme";
import type { CollectionCardTheme, CollectionPresentation } from "./types";

export function useCollectionTheme(presentation: CollectionPresentation, loaded: boolean) {
  const [theme, setTheme] = useState(presentation.defaultTheme);

  useEffect(() => {
    if (loaded) setTheme(resolveCollectionTheme(presentation));
  }, [loaded, presentation]);

  const options = [
    presentation.defaultTheme,
    ...presentation.enabledThemes.filter((option) => option !== presentation.defaultTheme),
  ];
  const switchTheme = (next: CollectionCardTheme) => {
    localStorage.setItem(COLLECTION_THEME_STORAGE_KEY, next);
    setTheme(next);
  };

  return { theme, options, switchTheme };
}
