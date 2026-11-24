import { describe,expect,it,vi } from 'vitest'
import { COLLECTION_THEME_STORAGE_KEY,resolveCollectionTheme } from './collection-theme'

describe('收藏主题偏好',()=>{
  it('禁用已保存主题时回退默认主题并覆盖偏好',()=>{
    const storage={getItem:vi.fn().mockReturnValue('editorial'),setItem:vi.fn()}
    expect(resolveCollectionTheme({defaultTheme:'stamp',enabledThemes:['stamp']},storage)).toBe('stamp')
    expect(storage.setItem).toHaveBeenCalledWith(COLLECTION_THEME_STORAGE_KEY,'stamp')
  })

  it('允许的访客偏好优先于默认主题',()=>{
    const storage={getItem:vi.fn().mockReturnValue('editorial'),setItem:vi.fn()}
    expect(resolveCollectionTheme({defaultTheme:'stamp',enabledThemes:['stamp','editorial']},storage)).toBe('editorial')
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
