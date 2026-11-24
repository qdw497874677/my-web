import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, contentApi, fetchApi } from './repository'

describe('API 客户端', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('统一携带认证 Cookie 并解析 JSON', async () => {
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({items:[{id:'article-1'}]}),{status:200,headers:{'Content-Type':'application/json'}}))
    vi.stubGlobal('fetch',fetchMock)
    await expect(fetchApi('/api/public/articles')).resolves.toEqual({items:[{id:'article-1'}]})
    expect(fetchMock).toHaveBeenCalledWith('/api/public/articles',expect.objectContaining({credentials:'include'}))
  })

  it('使用后端错误消息拒绝失败请求', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'邮箱格式不正确'}),{status:400,headers:{'Content-Type':'application/json'}})))
    await expect(fetchApi('/api/public/subscriptions',{method:'POST',body:'{}'})).rejects.toEqual(new ApiError(400,'邮箱格式不正确'))
  })

  it('网络失败使用可操作的统一错误', async () => {
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(fetchApi('/api/health')).rejects.toEqual(new ApiError(0,'无法连接服务器，请检查网络后重试'))
  })

  it('文章和照片写入使用图片资产 ID', async () => {
    const fetchMock=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({id:'saved'}),{status:200,headers:{'Content-Type':'application/json'}})))
    vi.stubGlobal('fetch',fetchMock)
    await contentApi.updateArticle('article-1',{imageAssetId:'asset-article'})
    await contentApi.createPhoto('album-1',{title:'照片',caption:'',alt:'照片',imageAssetId:'asset-photo'})
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({imageAssetId:'asset-article'})
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({title:'照片',caption:'',alt:'照片',imageAssetId:'asset-photo'})
  })

  it('从新收藏端点读取展示策略并原子保存', async () => {
    const payload={items:[],presentation:{defaultTheme:'stamp' as const,enabledThemes:['stamp' as const,'editorial' as const]}}
    const fetchMock=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}})))
    vi.stubGlobal('fetch',fetchMock)
    await expect(contentApi.publicCollections()).resolves.toEqual(payload)
    await contentApi.saveCollections([],payload.presentation)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/public/collections')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/admin/collections')
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual(payload)
  })
})
