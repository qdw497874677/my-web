import { expect, request as playwrightRequest, test, type BrowserContext, type Page } from '@playwright/test'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const catalog = {
  enabled: true,
  templates: [
    { id: 'text-only', label: '测试无参考模板', description: '不需要参考图', referenceImageCount: 0, aspectRatio: '1:1', modelIds: ['test-model'] },
    { id: 'with-reference', label: '测试参考模板', description: '需要一张参考图', referenceImageCount: 1, aspectRatio: '1:1', modelIds: ['test-model'] },
  ],
  models: [{ id: 'test-model', label: '测试模型' }],
}
let authCookies: Parameters<BrowserContext['addCookies']>[0] = []
const publicationLists = new Set([
  '/api/public/articles', '/api/public/albums', '/api/public/collections',
  '/api/admin/categories', '/api/admin/articles', '/api/admin/albums', '/api/admin/collections', '/api/admin/images',
])
const catalogPath = '/api/admin/ai-images/catalog'

function watchDataRequests(page: Page) {
  const publications: string[] = []
  const catalogs: string[] = []
  const aiRequests: string[] = []
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (request.method() === 'GET' && publicationLists.has(path)) publications.push(path)
    if (path === catalogPath) catalogs.push(path)
    if (path.startsWith('/api/admin/ai-images/')) aiRequests.push(path)
  })
  return { publications, catalogs, aiRequests }
}

async function openAdminMenuIfNeeded(page: Page) {
  const toggle = page.locator('button.menuButton')
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
}

test.beforeAll(async () => {
  const api = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:4187' })
  const response = await api.post('/api/auth/login', { data: { email: 'test@test.test', password: 'test' } })
  expect(response.ok()).toBe(true)
  authCookies = (await api.storageState()).cookies.map(({ name, value, expires, httpOnly, secure, sameSite }) => ({ name, value, expires, httpOnly, secure, sameSite, url: 'http://127.0.0.1:4187' }))
  await api.dispose()
})

test('生成无参考图及参考图图片，预览并下载', async ({ page }, testInfo) => {
  const dataRequests = watchDataRequests(page)
  await page.context().addCookies(authCookies)
  await page.route('**/api/admin/ai-images/catalog', route => route.fulfill({ json: catalog }))
  const requests: string[] = []
  await page.route('**/api/admin/ai-images/generate', async route => {
    expect(route.request().method()).toBe('POST')
    requests.push(route.request().postDataBuffer()?.toString('latin1') ?? '')
    await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
  })
  await page.goto('/admin/ai-images')
  await expect(page.getByRole('heading', { name: 'AI 生图' })).toBeVisible()
  await page.getByRole('radio', { name: /测试无参考模板/ }).check()
  await page.getByLabel('选择模型').selectOption('test-model')
  await page.getByLabel(/补充说明/).fill('测试画面')
  await page.getByRole('button', { name: '生成图片 ↗' }).click()
  await expect(page.getByRole('img', { name: '本次生成的图片' })).toBeVisible()
  await testInfo.attach('ai-images-generated', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  expect(requests[0]).toContain('name="templateId"\r\n\r\ntext-only')
  expect(requests[0]).not.toContain('name="reference"')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载图片 ↓' }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('ai-image.png')

  await page.getByRole('radio', { name: /测试参考模板/ }).check()
  await page.getByLabel('选择模型').selectOption('test-model')
  await page.getByLabel(/参考图.*需要 1 张/).setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: pixel })
  await page.getByRole('button', { name: '生成图片 ↗' }).click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1]).toContain('name="templateId"\r\n\r\nwith-reference')
  expect(requests[1]).toContain('name="reference"; filename="reference.png"')
  await expect(page.getByRole('img', { name: '本次生成的图片' })).toBeVisible()
  expect(dataRequests.publications).toEqual([])
  expect(dataRequests.catalogs).toHaveLength(1)
})

test('刊物加载失败不影响通过导航使用生图，共用一次模板目录', async ({ page }) => {
  const dataRequests = watchDataRequests(page)
  await page.context().addCookies(authCookies)
  await page.route('**/api/admin/categories', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }))
  await page.route('**/api/admin/ai-images/catalog', route => route.fulfill({ json: catalog }))
  await page.route('**/api/admin/ai-images/generate', route => route.fulfill({ status: 200, contentType: 'image/png', body: pixel }))

  await page.goto('/admin/dashboard')
  await expect(page.getByRole('alert').filter({ hasText: '刊物编辑数据加载失败' })).toBeVisible()
  const aiLink = page.getByRole('link', { name: 'AI 生图' })
  await openAdminMenuIfNeeded(page)
  const publicationsBeforeNavigation = [...dataRequests.publications]
  await aiLink.click()
  await expect(page.getByRole('heading', { name: 'AI 生图' })).toBeVisible()
  await page.getByRole('radio', { name: /测试无参考模板/ }).check()
  await page.getByLabel('选择模型').selectOption('test-model')
  await page.getByRole('button', { name: '生成图片 ↗' }).click()
  await expect(page.getByRole('img', { name: '本次生成的图片' })).toBeVisible()
  expect(dataRequests.publications).toEqual(publicationsBeforeNavigation)
  expect(dataRequests.catalogs).toHaveLength(1)
})

test('未登录直接访问生图只跳转登录，不请求私有或公开数据', async ({ page }) => {
  const dataRequests = watchDataRequests(page)
  await page.route('**/api/admin/ai-images/catalog', route => route.fulfill({ json: catalog }))
  await page.goto('/admin/ai-images')
  await expect(page).toHaveURL(/\/admin\/login/)
  await expect(page.getByRole('button', { name: '进入工作台' })).toBeVisible()
  expect(dataRequests.publications).toEqual([])
  expect(dataRequests.aiRequests).toEqual([])
})

test('未启用时不显示导航和生成控件', async ({ page }) => {
  await page.context().addCookies(authCookies)
  await page.route('**/api/admin/ai-images/catalog', route => route.fulfill({ json: { enabled: false, templates: [], models: [] } }))
  const catalogResponse = page.waitForResponse(response => response.url().includes('/api/admin/ai-images/catalog'))
  await page.goto('/admin/dashboard')
  await catalogResponse
  await expect(page.getByRole('link', { name: /AI 生图/ })).toHaveCount(0)
  await page.goto('/admin/ai-images')
  await expect(page.getByText('AI 生图暂未启用。')).toBeVisible()
  await expect(page.getByRole('button', { name: '生成图片 ↗' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '下载图片 ↓' })).toHaveCount(0)
})

// Keep logout last: the real backend revokes the beforeAll session shared by this file.
test('退出使延迟的会话复核失效，直接重访私有生图页不会取得数据', async ({ page }) => {
  const dataRequests = watchDataRequests(page)
  await page.context().addCookies(authCookies)
  await page.route('**/api/admin/ai-images/catalog', route => route.fulfill({ json: catalog }))
  await page.goto('/admin/ai-images')
  await expect(page.getByRole('heading', { name: 'AI 生图' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /测试无参考模板/ })).toBeVisible()
  expect(dataRequests.catalogs).toHaveLength(1)

  let releaseRecheck!: () => void
  let recheckObserved!: () => void
  let recheckFinished!: () => void
  const release = new Promise<void>(resolve => { releaseRecheck = resolve })
  const observed = new Promise<void>(resolve => { recheckObserved = resolve })
  const finished = new Promise<void>(resolve => { recheckFinished = resolve })
  await page.route('**/api/auth/session', async route => {
    try {
      const response = await route.fetch()
      expect(response.ok()).toBe(true)
      expect(await response.json()).toMatchObject({ authenticated: true, owner: { email: 'test@test.test' } })
      recheckObserved()
      await release
      try {
        await route.fulfill({ response })
      } catch (error) {
        if (!route.request().failure()) throw error
      }
    } finally {
      recheckFinished()
    }
  }, { times: 1 })
  await openAdminMenuIfNeeded(page)
  await page.getByRole('link', { name: '总览' }).click()
  await observed
  const logout = page.getByRole('button', { name: '退出登录' })
  await openAdminMenuIfNeeded(page)
  const logoutResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/logout')
  await logout.click()
  await expect(page).toHaveURL(/\/admin\/login/)
  await expect(page.getByRole('button', { name: '进入工作台' })).toBeVisible()
  expect((await logoutResponse).ok()).toBe(true)
  releaseRecheck()
  await finished
  await expect(page).toHaveURL(/\/admin\/login/)
  await expect(page.getByRole('button', { name: '退出登录' })).toHaveCount(0)
  const publicationsBeforeRevisit = [...dataRequests.publications]
  const aiRequestsBeforeRevisit = [...dataRequests.aiRequests]
  await page.goto('/admin/ai-images')
  await expect(page).toHaveURL(/\/admin\/login/)
  await expect(page.getByRole('button', { name: '进入工作台' })).toBeVisible()
  expect(dataRequests.publications).toEqual(publicationsBeforeRevisit)
  expect(dataRequests.aiRequests).toEqual(aiRequestsBeforeRevisit)
  await expect(page.getByRole('heading', { name: 'AI 生图' })).toHaveCount(0)
})
