import type { CollectionCardTheme, CollectionPresentation } from './types'

export const COLLECTION_THEME_STORAGE_KEY='linjian.collection-card-theme'

export function resolveCollectionTheme(presentation:CollectionPresentation,storage:Pick<Storage,'getItem'|'setItem'>=localStorage):CollectionCardTheme{
  const preferred=storage.getItem(COLLECTION_THEME_STORAGE_KEY)
  const theme=presentation.enabledThemes.includes(preferred as CollectionCardTheme)?preferred as CollectionCardTheme:presentation.defaultTheme
  if(preferred!==theme)storage.setItem(COLLECTION_THEME_STORAGE_KEY,theme)
  return theme
}
