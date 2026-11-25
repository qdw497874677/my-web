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

  it('将管理端五个读取请求的信号传给 fetch', async () => {
    const fetchMock=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({items:[],articles:[],albums:[],presentation:{defaultTheme:'stamp',enabledThemes:['stamp']}}),{status:200,headers:{'Content-Type':'application/json'}})))
    vi.stubGlobal('fetch',fetchMock)
    const controller=new AbortController()
    await Promise.all([contentApi.categories(controller.signal),contentApi.articles(controller.signal),contentApi.albums(controller.signal),contentApi.collections(controller.signal),contentApi.images(controller.signal)])
    expect(fetchMock).toHaveBeenCalledTimes(5)
    for(const [, init] of fetchMock.mock.calls) expect(init.signal).toBe(controller.signal)
  })

  it('将三个公开列表请求的信号传给 fetch', async () => {
    const fetchMock=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({items:[],presentation:{defaultTheme:'stamp',enabledThemes:['stamp']}}),{status:200,headers:{'Content-Type':'application/json'}})))
    vi.stubGlobal('fetch',fetchMock)
    const controller=new AbortController()
    await Promise.all([contentApi.publicArticles(controller.signal),contentApi.publicAlbums(controller.signal),contentApi.publicCollections(controller.signal)])
    expect(fetchMock.mock.calls.map(([url])=>url)).toEqual(['/api/public/articles','/api/public/albums','/api/public/collections'])
    for(const [, init] of fetchMock.mock.calls) expect(init.signal).toBe(controller.signal)
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

  it('仅转换私有内容中的本地资产并保留公共链接和外部图片', async () => {
    const article={id:'a',image:'/api/images/asset-a'}
    const photo={id:'p',image:'/api/images/asset-p'}
    const album={id:'b',photos:[photo,{id:'external',image:'https://example.com/a.jpg'},{id:'static',image:'/images/static.jpg'},{id:'query',image:'/api/images/asset-p?x=1'}]}
    const item={id:'c',sourceType:'photo',albumId:'b',photoId:'p',href:'old',image:'/api/images/asset-p'}
    const catalog={articles:[article],albums:[album],items:[item],presentation:{defaultTheme:'stamp',enabledThemes:['stamp']}}
    const asset={id:'asset-a',url:'/api/images/asset-a',previewUrl:'/api/admin/images/asset-a'}
    const fetchMock=vi.fn().mockImplementation((url:string, init?:RequestInit)=>{
      const payload = url === '/api/admin/images' ? {items:[asset,{id:'external',url:'https://example.com/a.jpg'}]} : url.endsWith('/articles') ? {items:[article]} : url.endsWith('/albums') ? {items:[album]} : url.includes('/collections') ? catalog : init?.method === 'PATCH' ? article : photo
      return Promise.resolve(new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}}))
    })
    vi.stubGlobal('fetch',fetchMock)
    expect((await contentApi.articles())[0].image).toBe('/api/admin/images/asset-a')
    expect((await contentApi.publicArticles())[0].image).toBe('/api/images/asset-a')
    const privateAlbum=(await contentApi.albums())[0]
    expect(privateAlbum.photos.map(p=>p.image)).toEqual(['/api/admin/images/asset-p','https://example.com/a.jpg','/images/static.jpg','/api/images/asset-p?x=1'])
    expect((await contentApi.publicAlbums())[0].photos[0].image).toBe('/api/images/asset-p')
    const privateCatalog=await contentApi.collections()
    expect(privateCatalog.articles[0].image).toBe('/api/admin/images/asset-a')
    expect(privateCatalog.albums[0].photos[0].image).toBe('/api/admin/images/asset-p')
    expect(privateCatalog.items[0]).toMatchObject({image:'/api/admin/images/asset-p',href:'/albums/b?photo=p'})
    expect((await contentApi.publicCollections()).items[0].image).toBe('/api/images/asset-p')
    expect((await contentApi.updateArticle('a',{})).image).toBe('/api/admin/images/asset-a')
    expect((await contentApi.images()).map(i=>i.url)).toEqual(['/api/admin/images/asset-a','https://example.com/a.jpg'])
  })
})
