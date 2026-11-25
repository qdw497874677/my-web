import { expect, request as playwrightRequest, test, type SetCookieParam } from '@playwright/test'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const catalog = {
  enabled: true,
  templates: [
    { id: 'text-only', label: '测试无参考模板', description: '不需要参考图', referenceImageCount: 0, aspectRatio: '1:1', modelIds: ['test-model'] },
    { id: 'with-reference', label: '测试参考模板', description: '需要一张参考图', referenceImageCount: 1, aspectRatio: '1:1', modelIds: ['test-model'] },
  ],
  models: [{ id: 'test-model', label: '测试模型' }],
}
let authCookies: SetCookieParam[] = []

test.beforeAll(async () => {
  const api = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:4187' })
  const response = await api.post('/api/auth/login', { data: { email: 'test@test.test', password: 'test' } })
  expect(response.ok()).toBe(true)
  authCookies = (await api.storageState()).cookies.map(({ name, value, expires, httpOnly, secure, sameSite }) => ({ name, value, expires, httpOnly, secure, sameSite, url: 'http://127.0.0.1:4187' }))
  await api.dispose()
})

test('生成无参考图及参考图图片，预览并下载', async ({ page }, testInfo) => {
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
