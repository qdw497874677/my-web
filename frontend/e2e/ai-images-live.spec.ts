import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// The catalog ID opts into a real, potentially billable provider request.
// It is not the upstream provider's model name or an API credential.
const modelId = process.env.AI_IMAGES_LIVE_MODEL_ID;
const templateId = process.env.AI_IMAGES_LIVE_TEMPLATE ?? "editorial-cover";
const withReference = templateId === "photo-illustration";

test.use({ trace: "off" });

test(`live: 管理员使用${withReference ? "照片插画" : "刊物封面"}生成并下载图片`, async ({
  page,
}, testInfo) => {
  test.skip(!modelId, "Set AI_IMAGES_LIVE_MODEL_ID to opt into a paid live generation");
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Run the paid smoke only once on desktop",
  );
  test.skip(testInfo.retry > 0, "Never retry a potentially billable generation");
  expect(["editorial-cover", "photo-illustration"]).toContain(templateId);
  test.setTimeout(240_000);

  // No route interception: authentication, catalog, and generation all use the real server.
  await page.goto("/admin/login");
  await page.getByLabel("电子邮箱").fill("test@test.test");
  await page.getByLabel("密码").fill("test");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await page.goto("/admin/ai-images");
  await expect(page.getByRole("heading", { name: "AI 生图" })).toBeVisible();
  const template = page.getByRole("radio", { name: withReference ? /照片插画/ : /刊物封面/ });
  await expect(template).toHaveValue(templateId);
  await template.check();
  await page.getByLabel("选择模型").selectOption(modelId!);
  if (withReference) {
    const reference = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#e6e9da";
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = "#44715a";
      ctx.arc(256, 256, 120, 0, Math.PI * 2);
      ctx.fill();
      return canvas.toDataURL("image/png").split(",")[1]!;
    });
    await page.getByLabel(/参考图.*需要 1 张/).setInputFiles({
      name: "synthetic-reference.png",
      mimeType: "image/png",
      buffer: Buffer.from(reference, "base64"),
    });
  }
  await page
    .getByLabel(/补充说明/)
    .fill(
      withReference
        ? "保留参考图的绿色圆形主体，将它画成简约的纸质剪贴画。"
        : "一只白色陶瓷杯放在浅灰色背景前，柔和自然光。",
    );

  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/ai-images/generate") &&
        response.request().method() === "POST",
      { timeout: 210_000 },
    ),
    page.getByRole("button", { name: "生成图片 ↗" }).click(),
  ]);
  const contentType = (response.headers()["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  // Do not attach response bodies or request headers, which may contain private data.
  await testInfo.attach("generation-status", {
    body: `HTTP ${response.status()}\nContent-Type: ${contentType}\n`,
    contentType: "text/plain",
  });
  expect(response.status(), `Generation returned HTTP ${response.status()}`).toBe(200);
  expect(["image/png", "image/jpeg", "image/webp"]).toContain(contentType);

  const preview = page.getByRole("img", { name: "本次生成的图片" });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(
      () => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      { timeout: 15_000 },
    )
    .toBe(true);
  const screenshotPath = testInfo.outputPath("preview.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("live-image-preview", { path: screenshotPath, contentType: "image/png" });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载图片 ↓" }).click();
  const download = await downloadPromise;
  const extension =
    contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`, "i"));
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.length).toBeGreaterThan(0);
  if (contentType === "image/png")
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/jpeg")
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([255, 216, 255]));
  if (contentType === "image/webp") {
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
  }
  const generatedPath = testInfo.outputPath(`generated.${extension}`);
  await writeFile(generatedPath, bytes);
  await testInfo.attach("downloaded-image", { path: generatedPath, contentType });
});
