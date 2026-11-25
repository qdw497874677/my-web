import { expect, request as playwrightRequest, test, type BrowserContext } from '@playwright/test'

let authCookies:Parameters<BrowserContext['addCookies']>[0]=[]
test.beforeAll(async()=>{
  const api=await playwrightRequest.newContext({baseURL:'http://127.0.0.1:4187'})
  const response=await api.post('/api/auth/login',{data:{email:'test@test.test',password:'test'}})
  expect(response.ok()).toBe(true)
  authCookies=(await api.storageState()).cookies.map(({name,value,expires,httpOnly,secure,sameSite})=>({name,value,expires,httpOnly,secure,sameSite,url:'http://127.0.0.1:4187'}))
  await api.dispose()
})
const authenticate=(context:BrowserContext)=>context.addCookies(authCookies)
const enableAllCollectionThemes=async(context:BrowserContext)=>{
  await authenticate(context)
  const catalog=await context.request.get('/api/admin/collections')
  expect(catalog.ok()).toBe(true)
  const payload=await catalog.json() as {items:Array<{id:string;sourceType:'article'|'album'|'photo';articleId?:string;albumId?:string;photoId?:string;note:string;visible:boolean}>}
  const items=payload.items.map(item=>item.sourceType==='article'
    ?{id:item.id,type:'article',articleId:item.articleId,note:item.note,visible:item.visible}
    :item.sourceType==='album'
      ?{id:item.id,type:'album',albumId:item.albumId,note:item.note,visible:item.visible}
      :{id:item.id,type:'photo',albumId:item.albumId,photoId:item.photoId,note:item.note,visible:item.visible})
  const saved=await context.request.put('/api/admin/collections',{data:{items,presentation:{defaultTheme:'stamp',enabledThemes:['stamp','editorial','holographic','cinema','boarding']}}})
  expect(saved.ok()).toBe(true)
}

test('全部公开路由和组件陈列页可访问', async ({ page }) => {
  for (const [path, heading] of [
    ['/', '把日子放慢'],
    ['/articles', '把每一次停留'],
    ['/articles/personal-tool-light', '给个人工具留一盏不会催促你的灯'],
    ['/albums', '把路过的光'],
    ['/collections', '一些值得被多看一会儿'],
    ['/components', '林间刊物的组件档案'],
  ] as const) {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: new RegExp(heading) }).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  }

  await page.goto('/')
  await page.getByLabel('订阅邮箱').fill('reader@example.com')
  await page.getByRole('button', { name: '订阅近况' }).click()
  await expect(page.getByText('邮箱已经记下。有新东西时，再写信给你。')).toBeVisible()
})

test('文章筛选和相册灯箱可操作', async ({ page }) => {
  await page.goto('/articles', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '摄影' }).click()
  await expect(page.getByText('显示 1 篇文章')).toBeVisible()
  await page.getByRole('searchbox', { name: '搜索文章' }).fill('不存在')
  await expect(page.getByText('没有找到匹配的文章')).toBeVisible()

  await page.goto('/albums', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /城南，雨水退去后/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('《城南，雨水退去后》 / 01 / 04')).toBeVisible()
  await expect(page.getByRole('heading', { name: '雨停后的菜场门口' })).toBeVisible()
  await page.getByRole('button', { name: '放大照片' }).click()
  await expect(page.getByRole('button', { name: '恢复原始大小' })).toBeVisible()
  await expect(page.getByText('当前缩放 200%')).toBeVisible()
  await page.getByRole('button', { name: '恢复原始大小' }).click()
  await page.getByRole('button', { name: '下一张照片' }).click()
  await expect(page.getByText('《城南，雨水退去后》 / 02 / 04')).toBeVisible()
  await expect(page.getByRole('heading', { name: '旧楼连廊' })).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('文章列表不等待相册，也不受精选读取失败影响', async ({ page }) => {
  let releaseAlbums!: () => void
  const albumsPending = new Promise<void>(resolve => { releaseAlbums = resolve })
  await page.route('**/api/public/albums', async route => {
    await albumsPending
    await route.continue()
  })
  await page.route('**/api/public/collections', route =>
    route.fulfill({ status: 503, json: { error: '精选暂不可用' } }))
  try {
    await page.goto('/articles', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '给个人工具留一盏不会催促你的灯' })).toBeVisible()
    await expect(page.getByText('精选暂不可用')).not.toBeVisible()
  } finally {
    releaseAlbums()
  }
})

test('相册详情切换 ID 清除旧错误，切换照片不重读相册', async ({ page }) => {
  let albumReads = 0
  await page.route('**/api/public/albums/album-id-missing', route =>
    route.fulfill({ status: 404, json: { error: '旧相册不存在' } }))
  await page.route('**/api/public/albums/album-city-south', route => {
    albumReads++
    return route.continue()
  })
  await page.goto('/albums/album-id-missing', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('旧相册不存在')).toBeVisible()
  // Simulate a same-document router navigation, not a fresh mount via page.goto.
  await page.evaluate(() => {
    history.pushState(history.state, '', '/albums/album-city-south')
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
  })
  await expect(page.getByRole('heading', { name: '城南，雨水退去后' })).toBeVisible()
  await expect(page.getByText('旧相册不存在')).not.toBeVisible()
  await page.getByRole('link', { name: '查看第 2 张照片：旧楼连廊' }).click()
  await expect(page.getByRole('heading', { name: '旧楼连廊' })).toBeVisible()
  expect(albumReads).toBe(1)
})

test('管理员登录后写入数据库并可由公开 API 读取', async ({ page }, testInfo) => {
  const title = `数据库路径文章-${testInfo.project.name}`
  await page.goto('/admin/articles')
  await expect(page).toHaveURL(/\/admin\/login/)

  await page.goto('/admin/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('电子邮箱').fill('test@test.test')
  await page.getByLabel('密码').fill('test')
  await page.getByRole('button', { name: '进入工作台' }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)

  for (const path of ['/admin/dashboard', '/admin/articles', '/admin/albums', '/admin/collections']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('编辑部').first()).toBeVisible()
  }

  await page.goto('/admin/articles', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '新建文章' }).click()
  await page.getByLabel('文章标题').fill(title)
  await page.getByRole('button', { name: '创建草稿' }).click()
  await expect(page.getByText(title)).toBeVisible()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText(title)).toBeVisible()

  const row = page.getByRole('row').filter({ hasText: title })
  await row.getByRole('button', { name: '编辑' }).click()
  await page.getByLabel('发布状态').selectOption('published')
  await page.getByRole('button', { name: '保存文章' }).click()

  await page.goto('/articles')
  await expect(page.getByText(title)).toBeVisible()
  await page.getByText(title).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  const response = await page.request.get('/api/public/articles')
  expect(response.ok()).toBe(true)
  const payload = await response.json() as { items: Array<{ title: string }> }
  expect(payload.items.some((article) => article.title === title)).toBe(true)
})

test('收藏主题可切换、持久化并从旧路径重定向', async ({ page }) => {
  await enableAllCollectionThemes(page.context())
  await page.goto('/favorites')
  await expect(page).toHaveURL(/\/collections$/)
  await expect(page.getByRole('heading', { name: /一些值得被多看一会儿/ })).toBeVisible()
  const firstCard = page.locator('[data-collection-card]').first()
  await expect(firstCard).toHaveAttribute('data-theme', 'stamp')
  await page.getByRole('button', { name: '编辑排版' }).click()
  await expect(firstCard).toHaveAttribute('data-theme', 'editorial')
  await page.getByRole('button', { name: '镭射' }).click()
  await expect(firstCard).toHaveAttribute('data-theme', 'holographic')
  await page.getByRole('button', { name: '电影票根' }).click()
  await expect(firstCard).toHaveAttribute('data-theme', 'cinema')
  await expect(firstCard.locator('[data-cinema-ticket]')).toContainText('票种 / 场次')
  await expect(firstCard.locator('[data-ticket-image] img')).toBeVisible()
  await page.getByRole('button', { name: '登机牌' }).click()
  await expect(firstCard).toHaveAttribute('data-theme', 'boarding')
  await expect(firstCard.locator('[data-boarding-pass]')).toContainText('登机口')
  await expect(firstCard.locator('[data-boarding-image] img')).toBeVisible()
  const boardingLayout = await firstCard.locator('[data-boarding-pass]').evaluate((pass) => {
    const image = pass.querySelector<HTMLElement>('[data-boarding-image]')
    const main = pass.querySelector<HTMLElement>('.collectionBoardingMain')
    const stub = pass.querySelector<HTMLElement>('.collectionBoardingStub')
    if (!image || !main || !stub) return null
    return {
      imageRatio: image.getBoundingClientRect().height / pass.getBoundingClientRect().height,
      mainFits: main.scrollHeight <= main.clientHeight,
      sectionsOverlap: main.getBoundingClientRect().bottom > stub.getBoundingClientRect().top + 0.5,
    }
  })
  expect(boardingLayout?.imageRatio).toBeCloseTo(0.5, 2)
  expect(boardingLayout?.mainFits).toBe(true)
  expect(boardingLayout?.sectionsOverlap).toBe(false)
  await page.reload()
  await expect(page.locator('[data-collection-card]').first()).toHaveAttribute('data-theme', 'boarding')
  await page.locator('[data-collection-card]').first().click()
  await expect(page).toHaveURL(/\/collections$/)
  const preview=page.getByRole('dialog',{name:/收藏预览/})
  await expect(preview).toBeVisible()
  await expect(page.locator('[data-collection-page]')).toHaveClass(/collectionPageBlurred/)
  await preview.getByRole('link',{name:'打开内容'}).click()
  await expect(page).not.toHaveURL(/\/collections$/)
})

test('收藏预览可通过 Escape 和遮罩关闭', async ({ page }) => {
  await page.goto('/collections')
  await page.locator('[data-collection-card]').first().click()
  const dialog=page.getByRole('dialog',{name:/收藏预览/})
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.collectionPreviewActions')).toBeVisible()
  await expect(dialog.getByRole('button',{name:'关闭收藏预览'})).not.toHaveCSS('position','absolute')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveAttribute('data-closing','true')
  await expect.poll(async()=>page.locator('[data-collection-page]').evaluate(element=>getComputedStyle(element).filter),{timeout:250}).toBe('none')
  await expect(dialog).not.toBeVisible()
  await page.locator('[data-collection-card]').first().click()
  await page.locator('.collectionPreviewBackdrop').click({position:{x:8,y:8}})
  await expect(page.getByRole('dialog',{name:/收藏预览/})).not.toBeVisible()
})

test('桌面收藏卡片会随鼠标产生可见的3D悬浮', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', '触屏按设计保持静态')
  await enableAllCollectionThemes(page.context())
  await page.goto('/collections')
  await page.getByRole('button', { name: '镭射' }).click()
  const card = page.locator('[data-collection-card]').first()
  const securityText = card.locator('[data-security-text]')
  await expect(securityText).toContainText('林间防伪')
  await expect(securityText).toHaveCSS('grid-template-columns', '154px 154px 154px')
  const positionsBefore = await securityText.locator('span').evaluateAll(elements => elements.slice(0, 6).map(element => ({ x: (element as HTMLElement).offsetLeft, y: (element as HTMLElement).offsetTop })))
  const stage = card.locator('..')
  const box = await stage.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width * .9, box!.y + box!.height * .1)
  await expect(stage).toHaveCSS('--collection-pointer-center', /.+/)
  await expect.poll(async()=>stage.evaluate(element=>getComputedStyle(element).getPropertyValue('--collection-pointer-center'))).not.toBe('0')
  await expect.poll(async()=>stage.evaluate(element=>getComputedStyle(element).getPropertyValue('--collection-spectrum-x'))).not.toBe('50%')
  expect(await securityText.locator('span').evaluateAll(elements => elements.slice(0, 6).map(element => ({ x: (element as HTMLElement).offsetLeft, y: (element as HTMLElement).offsetTop })))).toEqual(positionsBefore)
  await expect.poll(async()=>card.evaluate(element=>getComputedStyle(element).transform)).not.toBe('matrix(1, 0, 0, 1, 0, 0)')
  await expect.poll(async()=>card.evaluate(element=>getComputedStyle(element).filter)).not.toBe('none')
  await page.mouse.move(0, 0)
  await expect.poll(async()=>stage.evaluate(element=>getComputedStyle(element).getPropertyValue('--collection-spectrum-x'))).toBe('50%')
  await expect.poll(async()=>stage.evaluate(element=>getComputedStyle(element).getPropertyValue('--collection-label-a'))).toBe('0.34')
})

test('编辑部原子保存收藏展示策略并即时预览', async ({ page }) => {
  await authenticate(page.context())
  await page.goto('/admin/collections')
  await expect(page.getByRole('heading', { name: /决定哪些内容值得再看/ })).toBeVisible()
  await page.getByLabel('启用编辑排版主题').uncheck()
  await expect(page.getByLabel('默认主题')).toHaveValue('stamp')
  await expect(page.locator('[data-collection-preview]')).toHaveAttribute('data-theme', 'stamp')
  await page.getByRole('button', { name: '保存收藏' }).click()
  await expect(page.getByText('收藏与展示策略已保存')).toBeVisible()

  await page.goto('/collections')
  await expect(page.getByRole('button', { name: '编辑排版' })).toHaveCount(0)
  await expect(page.locator('[data-collection-card]').first()).toHaveAttribute('data-theme', 'stamp')

  await page.goto('/admin/collections')
  await page.getByLabel('启用编辑排版主题').check()
  await Promise.all([
    page.waitForResponse(response=>response.url().includes('/api/admin/collections')&&response.request().method()==='PUT'&&response.ok()),
    page.getByRole('button', { name: '保存收藏' }).click(),
  ])
  await expect(page.getByText('收藏与展示策略已保存')).toBeVisible()
})

test('文章完整编辑后安全渲染 Markdown', async ({ page }, testInfo) => {
  const title = `Markdown文章-${testInfo.project.name}`
  const slug = `markdown-${testInfo.project.name}`
  await authenticate(page.context())
  await page.goto('/admin/articles')
  await page.getByRole('button', { name: '新建文章' }).click()
  await page.getByLabel('文章标题').fill(title)
  await page.getByRole('button', { name: '创建草稿' }).click()
  const row = page.getByRole('row').filter({ hasText: title })
  await row.getByRole('button', { name: '编辑' }).click()
  await page.getByLabel('文章路径').fill(slug)
  await page.getByLabel('文章摘要').fill('Markdown 验证摘要')
  await page.getByLabel('Markdown 正文').fill('## 安全标题\n\n- 第一项\n- 第二项\n\n> 保持安静\n\n[返回文章列表](/articles)\n\n`safeCode()`')
  await page.getByLabel('发布状态').selectOption('published')
  await Promise.all([
    page.waitForResponse(response=>response.url().includes('/api/admin/articles/')&&response.request().method()==='PATCH'&&response.ok()),
    page.getByRole('button', { name: '保存文章' }).click(),
  ])
  await page.goto(`/articles/${slug}`)
  await expect(page.getByRole('heading', { name: '安全标题' })).toBeVisible()
  await expect(page.locator('.prose li').filter({ hasText: '第一项' })).toBeVisible()
  await expect(page.getByText('保持安静')).toBeVisible()
  await expect(page.getByRole('article').getByRole('link', { name: '返回文章列表' })).toHaveAttribute('href', '/articles')
  await expect(page.getByText('safeCode()')).toBeVisible()
})

test('排期按上海本地时间显示并保存为 +08:00 ISO', async ({ page }, testInfo) => {
  const title = `上海排期-${testInfo.project.name}`
  await authenticate(page.context())
  await page.goto('/admin/articles')
  await page.getByRole('button', { name: '新建文章' }).click()
  await page.getByLabel('文章标题').fill(title)
  await page.getByRole('button', { name: '创建草稿' }).click()
  const row = page.getByRole('row').filter({ hasText: title })
  await row.getByRole('button', { name: '编辑' }).click()
  await page.getByLabel('发布状态').selectOption('scheduled')
  await page.getByLabel('排期时间').fill('2030-08-01T08:30')
  const [saveRequest] = await Promise.all([
    page.waitForRequest(request=>request.method()==='PATCH'&&request.url().includes('/api/admin/articles/')),
    page.getByRole('button', { name: '保存文章' }).click(),
  ])
  expect(saveRequest.postDataJSON().scheduledAt).toBe('2030-08-01T08:30:00+08:00')
  await row.getByRole('button', { name: '编辑' }).click()
  await expect(page.getByLabel('排期时间')).toHaveValue('2030-08-01T08:30')

  const response = await page.request.get('/api/admin/articles')
  const payload = await response.json() as { items: Array<{ title: string; scheduledAt?: string }> }
  expect(new Date(payload.items.find(article=>article.title===title)?.scheduledAt??0).toISOString()).toBe('2030-08-01T00:30:00.000Z')
})

test('栏目、图片资产和照片可通过编辑部管理', async ({ page }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const category = `测试栏目-${suffix}`
  const album = `测试相册-${suffix}`
  const filename = `pixel-${suffix}.png`
  await authenticate(page.context())
  await page.goto('/admin/dashboard')
  await page.getByRole('button', { name: '管理栏目' }).click()
  await page.getByLabel('新栏目名称').fill(category)
  await page.getByRole('button', { name: '新增栏目' }).click()
  await expect(page.getByLabel(`${category}名称`)).toHaveValue(category)

  await page.goto('/admin/albums')
  await page.getByRole('button', { name: '管理图片' }).click()
  await page.getByLabel('上传图片').setInputFiles({ name: filename, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') })
  const [upload] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/admin/images') && response.request().method() === 'POST'),
    page.getByRole('button', { name: '上传资产' }).click(),
  ])
  expect(upload.status()).toBe(201)
  const { id: imageId } = await upload.json() as { id: string }
  const image = page.locator('.catalogItem').filter({ hasText: filename }).locator('img')
  await expect(image).toBeVisible()
  await expect(image).toHaveAttribute('src', `/api/admin/images/${imageId}`)
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  expect((await page.request.get(`/api/admin/images/${imageId}`)).status()).toBe(200)
  const anonymous = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:4187' })
  try {
    expect((await anonymous.get(`/api/admin/images/${imageId}`)).status()).toBe(401)
    expect((await anonymous.get(`/api/images/${imageId}`)).status()).toBe(404)
    expect((await page.request.get(`/api/images/${imageId}`)).status()).toBe(404)
    await page.getByRole('button', { name: '关闭图片管理' }).click()

    await page.getByRole('button', { name: '新建相册' }).click()
    await page.getByLabel('相册标题').fill(album)
    await page.getByLabel('栏目').selectOption({ label: category })
    await page.getByRole('button', { name: '创建相册' }).click()
    const card = page.locator('.adminAlbum').filter({ hasText: album })
    await card.getByRole('button', { name: '编辑' }).click()
    await page.getByRole('button', { name: '新增照片' }).click()
    await page.getByLabel('照片标题').fill('一像素照片')
    await page.getByLabel('照片图片', { exact: true }).selectOption({ label: filename })
    await page.getByRole('button', { name: '保存照片' }).click()
    await expect(page.locator('.catalogItem strong').filter({ hasText: '一像素照片' })).toBeVisible()
    expect((await anonymous.get(`/api/images/${imageId}`)).status()).toBe(404)
    await page.getByText('公开相册').click()
    const albumId = await card.getAttribute('data-album-id')
    expect(albumId).toBeTruthy()
    await page.getByRole('button', { name: '保存相册' }).click()
    await expect(page.getByRole('dialog', { name: '编辑相册' })).not.toBeVisible()
    expect((await anonymous.get(`/api/images/${imageId}`)).status()).toBe(200)
    await page.goto(`/albums/${albumId}?photo=0`)
    await expect(page.getByRole('heading', { name: album })).toBeVisible()
    expect((await page.request.patch(`/api/admin/albums/${albumId}`, { data: { isPrivate: true } })).ok()).toBe(true)
    expect((await anonymous.get(`/api/images/${imageId}`)).status()).toBe(404)
  } finally {
    await anonymous.dispose()
  }
})

test('创建成功但列表刷新失败时可重试而不重复创建', async ({ page }, testInfo) => {
  const title = `刷新失败文章-${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  await authenticate(page.context())
  await page.goto('/admin/articles')
  await page.getByRole('button', { name: '新建文章' }).click()
  const dialog = page.getByRole('dialog', { name: '新建文章草稿' })
  await dialog.getByLabel('文章标题').fill(title)

  let postCount = 0
  let postStatus = 0
  let failNextGet = false
  let failedGetCount = 0
  let getCount = 0
  let refreshGetStarted = false
  let releaseRefresh = () => {}
  const refreshGate = new Promise<void>(resolve => { releaseRefresh = resolve })
  await page.route('**/api/admin/articles', async route => {
    const method = route.request().method()
    if (method === 'POST') {
      postCount++
      const response = await route.fetch()
      postStatus = response.status()
      if (response.ok()) failNextGet = true
      await route.fulfill({ response })
    } else if (method === 'GET' && failNextGet) {
      getCount++
      failNextGet = false
      refreshGetStarted = true
      await refreshGate
      failedGetCount++
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '测试列表刷新失败' }) })
    } else {
      if (method === 'GET') getCount++
      await route.continue()
    }
  })
  try {
    await dialog.getByRole('button', { name: '创建草稿' }).click()
    await expect.poll(() => refreshGetStarted).toBe(true)
    await expect(dialog).not.toBeVisible()
    expect(postCount).toBe(1)
    expect(postStatus).toBe(201)
    expect(getCount).toBe(1)
    expect(failedGetCount).toBe(0)
    releaseRefresh()
    await expect(page.getByText('已保存，列表未刷新')).toBeVisible()
    expect(failedGetCount).toBe(1)
    await page.getByRole('button', { name: '重试刷新' }).click()
    await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible()
    expect(getCount).toBe(2)
    expect(postCount).toBe(1)
  } finally {
    releaseRefresh()
    await page.unroute('**/api/admin/articles')
  }
})
