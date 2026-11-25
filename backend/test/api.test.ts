import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { buildApp as buildRealApp, type App } from "../src/app.js";
import { migrate } from "../src/database.js";
import type { StorageAdapter } from "../src/storage.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_IMAGE_BYTES, rasterType } from "../src/publication/raster.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);
function multipart(data: Buffer, type = "image/png") {
  const boundary = "----linjian-test";
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pixel.png"\r\nContent-Type: ${type}\r\n\r\n`,
      ),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

describe("raster container validation", () => {
  it("accepts bounded PNG, JPEG, GIF and WebP containers and rejects truncation", () => {
    const samples: [string, Buffer][] = [
      ["image/png", png],
      [
        "image/jpeg",
        Buffer.from(
          "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
          "base64",
        ),
      ],
      [
        "image/gif",
        Buffer.from("R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64"),
      ],
      [
        "image/webp",
        Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA=", "base64"),
      ],
    ];
    for (const [type, bytes] of samples) {
      expect(rasterType(bytes)).toBe(type);
      expect(rasterType(bytes.subarray(0, bytes.length - 1))).toBeUndefined();
      expect(rasterType(Buffer.concat([bytes, Buffer.from("text")]))).toBeUndefined();
    }
  });
});

function buildApp(options: NonNullable<Parameters<typeof buildRealApp>[0]>) {
  return buildRealApp({ ...options, aiImageModels: [] });
}

describe("个人刊物 HTTP API", () => {
  let app: App;
  let cookie = "";
  let currentTime = new Date("2026-07-21T23:59:59+08:00");

  beforeEach(async () => {
    currentTime = new Date("2026-07-21T23:59:59+08:00");
    app = await buildApp({
      databasePath: ":memory:",
      uploadDir: "memory",
      nodeEnv: "test",
      seed: true,
      initializeOwner: { email: "test@test.test", password: "test" },
      nowProvider: () => currentTime,
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@test.test", password: "test" },
    });
    cookie =
      login.cookies[0]?.name && login.cookies[0]?.value
        ? `${login.cookies[0].name}=${login.cookies[0].value}`
        : "";
  });

  afterEach(async () => app.close());

  it("提供健康检查并使用显式初始化的唯一所有者", async () => {
    expect((await app.inject({ method: "GET", url: "/api/health" })).json()).toMatchObject({
      status: "ok",
    });
    const session = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    expect(session.json()).toMatchObject({
      authenticated: true,
      owner: { email: "test@test.test" },
    });
  });

  it("要求编辑部接口登录且支持退出", async () => {
    expect((await app.inject({ method: "GET", url: "/api/admin/articles" })).statusCode).toBe(401);
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);
    expect(
      (await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie } })).json(),
    ).toEqual({ authenticated: false });
  });

  it("栏目支持增改排序且被引用时禁止删除", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/categories",
      headers: { cookie },
      payload: { name: "新栏目" },
    });
    const category = created.json();
    expect(created.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/admin/categories/${category.id}`,
          headers: { cookie },
          payload: { name: "新名字" },
        })
      ).json().name,
    ).toBe("新名字");
    const categories = (
      await app.inject({ method: "GET", url: "/api/admin/categories", headers: { cookie } })
    ).json().items;
    const ids = [
      category.id,
      ...categories
        .filter((item: { id: string }) => item.id !== category.id)
        .map((item: { id: string }) => item.id),
    ];
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/admin/categories/order",
          headers: { cookie },
          payload: { ids },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/admin/categories/category-independent-development",
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(409);
  });

  it("文章支持草稿发布排期归档、置顶和旧 slug 重定向", async () => {
    const draft = (
      await app.inject({
        method: "POST",
        url: "/api/admin/articles",
        headers: { cookie },
        payload: { title: "测试文章", categoryId: "category-daily", body: "# 正文" },
      })
    ).json();
    expect(draft.status).toBe("draft");
    const published = await app.inject({
      method: "PATCH",
      url: `/api/admin/articles/${draft.id}`,
      headers: { cookie },
      payload: { status: "published", slug: "first-path", pinned: true },
    });
    expect(published.statusCode).toBe(200);
    await app.inject({
      method: "PATCH",
      url: `/api/admin/articles/${draft.id}`,
      headers: { cookie },
      payload: { slug: "second-path" },
    });
    expect(
      (await app.inject({ method: "GET", url: "/api/public/articles/first-path" })).statusCode,
    ).toBe(308);
    expect(
      (await app.inject({ method: "GET", url: "/api/public/articles/second-path" })).json(),
    ).toMatchObject({ body: "# 正文", pinned: true });
    await app.inject({
      method: "POST",
      url: `/api/admin/articles/${draft.id}/archive`,
      headers: { cookie },
    });
    expect(
      (await app.inject({ method: "GET", url: "/api/public/articles/second-path" })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/admin/articles/${draft.id}/restore`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("相册和照片维护公开约束、排序、移动与收藏引用保护", async () => {
    const album = (
      await app.inject({
        method: "POST",
        url: "/api/admin/albums",
        headers: { cookie },
        payload: { title: "空相册", categoryId: "category-city" },
      })
    ).json();
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/admin/albums/${album.id}`,
          headers: { cookie },
          payload: { isPrivate: false },
        })
      ).statusCode,
    ).toBe(409);
    const photo = (
      await app.inject({
        method: "POST",
        url: `/api/admin/albums/${album.id}/photos`,
        headers: { cookie },
        payload: { title: "一张照片", image: "/assets/hero.png", alt: "照片" },
      })
    ).json();
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/admin/albums/${album.id}`,
          headers: { cookie },
          payload: { isPrivate: false },
        })
      ).statusCode,
    ).toBe(200);
    await app.inject({
      method: "PUT",
      url: "/api/admin/collections",
      headers: { cookie },
      payload: {
        items: [
          {
            id: "collection-test",
            type: "photo",
            albumId: album.id,
            photoId: photo.id,
            note: "选片",
            visible: true,
          },
        ],
        presentation: { defaultTheme: "stamp", enabledThemes: ["stamp", "editorial"] },
      },
    });
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/admin/photos/${photo.id}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(409);
  });

  it("公开内容隐藏私密或归档来源并幂等收集订阅", async () => {
    const publicAlbums = (await app.inject({ method: "GET", url: "/api/public/albums" })).json();
    expect(publicAlbums.items.some((album: { id: string }) => album.id === "album-desk")).toBe(
      false,
    );
    const first = await app.inject({
      method: "POST",
      url: "/api/public/subscriptions",
      payload: { email: " Reader@Example.COM " },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/public/subscriptions",
      payload: { email: "reader@example.com" },
    });
    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(204);
    expect(first.body).toBe("");
    expect(second.body).toBe("");
  });

  it("排期文章只在指定时刻到达后公开", async () => {
    const before = (
      await app.inject({ method: "GET", url: "/api/public/articles?now=2099-01-01T00:00:00Z" })
    ).json();
    expect(before.items.some((article: { id: string }) => article.id === "article-garden")).toBe(
      false,
    );
    currentTime = new Date("2026-07-22T00:00:00.000Z");
    const after = (await app.inject({ method: "GET", url: "/api/public/articles" })).json();
    expect(after.items.some((article: { id: string }) => article.id === "article-garden")).toBe(
      true,
    );
  });

  it("图片支持 multipart 上传、稳定读取和引用删除保护", async () => {
    const form = multipart(png);
    const upload = await app.inject({
      method: "POST",
      url: "/api/admin/images",
      headers: { cookie, ...form.headers },
      payload: form.payload,
    });
    expect(upload.statusCode).toBe(201);
    expect((await app.inject({ method: "GET", url: upload.json().url })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: "GET", url: upload.json().previewUrl, headers: { cookie } }))
        .rawPayload,
    ).toEqual(png);
    const article = (
      await app.inject({
        method: "POST",
        url: "/api/admin/articles",
        headers: { cookie },
        payload: { title: "引用图片", categoryId: "category-daily", image: upload.json().url },
      })
    ).json();
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/admin/images/${upload.json().id}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(409);
    expect((await app.inject({ method: "GET", url: upload.json().url })).statusCode).toBe(404);
    await app.inject({
      method: "POST",
      url: `/api/admin/articles/${article.id}/archive`,
      headers: { cookie },
    });
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/admin/images/${upload.json().id}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(409);
  });

  it("图片仅由当前公开的结构化引用授权，且媒体响应不可缓存", async () => {
    const form = multipart(png),
      upload = await app.inject({
        method: "POST",
        url: "/api/admin/images",
        headers: { cookie, ...form.headers },
        payload: form.payload,
      }),
      asset = upload.json();
    expect(upload.statusCode).toBe(201);
    expect(
      (await app.inject({ method: "GET", url: "/api/admin/images", headers: { cookie } }))
        .json()
        .items.find((item: { id: string }) => item.id === asset.id),
    ).toMatchObject({ url: asset.url, previewUrl: asset.previewUrl });
    const unknown = await app.inject({ method: "GET", url: "/api/images/not-found" });
    const privateResponse = await app.inject({
      method: "GET",
      url: asset.url,
      headers: { cookie },
    });
    expect(privateResponse.statusCode).toBe(404);
    expect(privateResponse.body).toBe(unknown.body);
    for (const response of [
      unknown,
      privateResponse,
      await app.inject({ method: "HEAD", url: asset.url }),
      await app.inject({ method: "GET", url: asset.previewUrl }),
      await app.inject({ method: "HEAD", url: asset.previewUrl }),
    ]) {
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    }
    expect((await app.inject({ method: "GET", url: asset.previewUrl })).statusCode).toBe(401);
    const article = (
      await app.inject({
        method: "POST",
        url: "/api/admin/articles",
        headers: { cookie },
        payload: {
          title: "排期媒体",
          categoryId: "category-daily",
          image: asset.url,
          status: "scheduled",
          scheduledAt: "2026-07-22T00:00:00Z",
        },
      })
    ).json();
    expect((await app.inject({ method: "GET", url: asset.url })).statusCode).toBe(404);
    currentTime = new Date("2026-07-22T00:00:00Z");
    const shown = await app.inject({ method: "GET", url: asset.url });
    expect(shown.rawPayload).toEqual(png);
    expect(shown.headers["content-type"]).toBe("image/png");
    expect(shown.headers["cache-control"]).toBe("no-store");
    expect((await app.inject({ method: "HEAD", url: asset.url })).statusCode).toBe(200);
    const album = (
      await app.inject({
        method: "POST",
        url: "/api/admin/albums",
        headers: { cookie },
        payload: { title: "共享", categoryId: "category-city" },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/admin/albums/${album.id}/photos`,
      headers: { cookie },
      payload: { title: "共享照片", image: asset.url },
    });
    await app.inject({
      method: "PATCH",
      url: `/api/admin/albums/${album.id}`,
      headers: { cookie },
      payload: { isPrivate: false },
    });
    await app.inject({
      method: "POST",
      url: `/api/admin/articles/${article.id}/archive`,
      headers: { cookie },
    });
    expect((await app.inject({ method: "GET", url: asset.url })).statusCode).toBe(200);
    await app.inject({
      method: "POST",
      url: `/api/admin/albums/${album.id}/archive`,
      headers: { cookie },
    });
    expect((await app.inject({ method: "GET", url: asset.url })).statusCode).toBe(404);
    await app.inject({
      method: "POST",
      url: `/api/admin/albums/${album.id}/restore`,
      headers: { cookie },
    });
    await app.inject({
      method: "PATCH",
      url: `/api/admin/albums/${album.id}`,
      headers: { cookie },
      payload: { isPrivate: true },
    });
    expect(
      (await app.inject({ method: "GET", url: asset.url, headers: { cookie } })).statusCode,
    ).toBe(404);
    await app.inject({
      method: "PATCH",
      url: `/api/admin/articles/${article.id}`,
      headers: { cookie },
      payload: { body: `![x](${asset.url})`, image: "/assets/cta.png", status: "published" },
    });
    await app.inject({
      method: "POST",
      url: `/api/admin/articles/${article.id}/restore`,
      headers: { cookie },
    });
    expect((await app.inject({ method: "GET", url: asset.url })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: "GET", url: asset.previewUrl, headers: { cookie } })).rawPayload,
    ).toEqual(png);
    for (const bad of [multipart(Buffer.from("not a raster")), multipart(png, "image/jpeg")])
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/admin/images",
            headers: { cookie, ...bad.headers },
            payload: bad.payload,
          })
        ).statusCode,
      ).toBe(415);
  });

  it.each(["GET", "HEAD"] as const)(
    "媒体 %s 的成功、未授权和不存在响应均携带安全头",
    async (method) => {
      const form = multipart(png),
        uploaded = await app.inject({
          method: "POST",
          url: "/api/admin/images",
          headers: { cookie, ...form.headers },
          payload: form.payload,
        }),
        asset = uploaded.json();
      expect(uploaded.statusCode).toBe(201);
      const article = await app.inject({
        method: "POST",
        url: "/api/admin/articles",
        headers: { cookie },
        payload: {
          title: "媒体响应矩阵",
          categoryId: "category-daily",
          image: asset.url,
          status: "published",
        },
      });
      expect(article.statusCode).toBe(201);
      const cases = [
        { url: asset.url, headers: {}, status: 200 },
        { url: "/api/images/not-found", headers: {}, status: 404 },
        { url: asset.previewUrl, headers: { cookie }, status: 200 },
        { url: asset.previewUrl, headers: {}, status: 401 },
        { url: "/api/admin/images/not-found", headers: { cookie }, status: 404 },
        { url: "/api/admin/images/not-found", headers: {}, status: 401 },
      ];
      for (const entry of cases) {
        const response = await app.inject({ method, url: entry.url, headers: entry.headers });
        expect(response.statusCode, `${method} ${entry.url}`).toBe(entry.status);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        if (method === "HEAD") expect(response.rawPayload.length).toBe(0);
        else if (entry.status === 200) expect(response.rawPayload).toEqual(png);
      }
    },
  );

  it("拒绝超过大小上限的实际 multipart 上传", async () => {
    const form = multipart(Buffer.alloc(MAX_IMAGE_BYTES + 1)),
      response = await app.inject({
        method: "POST",
        url: "/api/admin/images",
        headers: { cookie, ...form.headers },
        payload: form.payload,
      });
    expect(response.statusCode).toBe(413);
  });

  it("外部资产仅在公开引用时重定向，外部 URL 原样提供给编辑部", async () => {
    const list = (
      await app.inject({ method: "GET", url: "/api/admin/images", headers: { cookie } })
    ).json().items as { id: string; kind: string; url: string; previewUrl: string }[];
    const external = list.find(
      (item) => item.kind === "external" && item.url === "/assets/cta.png",
    )!;
    expect(external.previewUrl).toBe(external.url);
    const article = (
      await app.inject({
        method: "POST",
        url: "/api/admin/articles",
        headers: { cookie },
        payload: {
          title: "外部图片测试",
          categoryId: "category-daily",
          image: external.url,
          status: "published",
        },
      })
    ).json();
    const response = await app.inject({ method: "GET", url: `/api/images/${external.id}` });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(external.url);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(
      (await app.inject({ method: "GET", url: `/api/public/articles/${article.slug}` })).json()
        .image,
    ).toBe(external.url);
  });

  it("真实本地存储校验读取数据并拒绝历史错误类型", async () => {
    const dir = mkdtempSync(join(tmpdir(), "linjian-media-")),
      dbPath = join(dir, "test.sqlite"),
      uploadDir = join(dir, "uploads");
    const local = await buildApp({
      databasePath: dbPath,
      uploadDir,
      nodeEnv: "test",
      seed: true,
      initializeOwner: { email: "test@test.test", password: "test" },
    });
    try {
      const login = await local.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "test@test.test", password: "test" },
        }),
        localCookie = `${login.cookies[0]!.name}=${login.cookies[0]!.value}`,
        form = multipart(png);
      const asset = (
        await local.inject({
          method: "POST",
          url: "/api/admin/images",
          headers: { cookie: localCookie, ...form.headers },
          payload: form.payload,
        })
      ).json();
      await local.inject({
        method: "POST",
        url: "/api/admin/articles",
        headers: { cookie: localCookie },
        payload: {
          title: "本地图片",
          categoryId: "category-daily",
          status: "published",
          image: asset.url,
        },
      });
      expect((await local.inject({ method: "GET", url: asset.url })).rawPayload).toEqual(png);
      writeFileSync(join(uploadDir, asset.path), "innocuous text");
      expect((await local.inject({ method: "GET", url: asset.url })).statusCode).toBe(404);
      expect(
        (
          await local.inject({
            method: "GET",
            url: asset.previewUrl,
            headers: { cookie: localCookie },
          })
        ).statusCode,
      ).toBe(404);
      writeFileSync(
        join(uploadDir, asset.path),
        Buffer.concat([png, Buffer.alloc(MAX_IMAGE_BYTES)]),
      );
      for (const url of [asset.url, asset.previewUrl]) {
        const response = await local.inject({
          method: "GET",
          url,
          headers: { cookie: localCookie },
        });
        expect(response.statusCode).toBe(404);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
      }
    } finally {
      await local.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("订阅规范化后数据库仅保留一行", async () => {
    const dir = mkdtempSync(join(tmpdir(), "linjian-subscriptions-")),
      dbPath = join(dir, "test.sqlite"),
      isolated = await buildApp({
        databasePath: dbPath,
        uploadDir: "memory",
        nodeEnv: "test",
        rateLimit: false,
      });
    try {
      const responses = await Promise.all(
        [" Reader@Example.COM ", "reader@example.com"].map((email) =>
          isolated.inject({ method: "POST", url: "/api/public/subscriptions", payload: { email } }),
        ),
      );
      expect(responses.map((response) => [response.statusCode, response.body])).toEqual([
        [204, ""],
        [204, ""],
      ]);
      const db = new DatabaseSync(dbPath);
      try {
        expect(db.prepare("SELECT email FROM subscriptions").all()).toEqual([
          { email: "reader@example.com" },
        ]);
      } finally {
        db.close();
      }
    } finally {
      await isolated.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("照片可排序并跨相册移动且保持身份", async () => {
    const source = (
      await app.inject({
        method: "POST",
        url: "/api/admin/albums",
        headers: { cookie },
        payload: { title: "来源", categoryId: "category-city" },
      })
    ).json();
    const target = (
      await app.inject({
        method: "POST",
        url: "/api/admin/albums",
        headers: { cookie },
        payload: { title: "目标", categoryId: "category-city" },
      })
    ).json();
    const first = (
      await app.inject({
        method: "POST",
        url: `/api/admin/albums/${source.id}/photos`,
        headers: { cookie },
        payload: { title: "第一张", image: "/assets/hero.png" },
      })
    ).json();
    const second = (
      await app.inject({
        method: "POST",
        url: `/api/admin/albums/${source.id}/photos`,
        headers: { cookie },
        payload: { title: "第二张", image: "/assets/cta.png" },
      })
    ).json();
    const ordered = (
      await app.inject({
        method: "PUT",
        url: `/api/admin/albums/${source.id}/photos/order`,
        headers: { cookie },
        payload: { ids: [second.id, first.id] },
      })
    ).json();
    expect(ordered.photos.map((photo: { id: string }) => photo.id)).toEqual([second.id, first.id]);
    const moved = await app.inject({
      method: "POST",
      url: `/api/admin/photos/${first.id}/move`,
      headers: { cookie },
      payload: { albumId: target.id },
    });
    expect(moved.json().id).toBe(first.id);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/admin/albums/${target.id}`,
          headers: { cookie },
        })
      ).json().photos[0].id,
    ).toBe(first.id);
  });

  it("创建内容时落实排期和公开相册约束", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/articles",
          headers: { cookie },
          payload: { title: "缺少时间", categoryId: "category-daily", status: "scheduled" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/articles",
          headers: { cookie },
          payload: {
            title: "无时区",
            categoryId: "category-daily",
            status: "scheduled",
            scheduledAt: "2026-08-01T08:00:00",
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/albums",
          headers: { cookie },
          payload: { title: "错误公开相册", categoryId: "category-city", isPrivate: false },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/albums",
          headers: { cookie },
          payload: {
            title: "错误封面",
            categoryId: "category-city",
            coverPhotoId: "photo-city-south-01",
          },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("写接口对无效必填字段、枚举、数组和数字返回 400", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/categories",
          headers: { cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/articles",
          headers: { cookie },
          payload: { title: 3, categoryId: "category-daily" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/admin/articles/article-august",
          headers: { cookie },
          payload: { status: "unknown" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/admin/categories/order",
          headers: { cookie },
          payload: { ids: "bad" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/photos/photo-desk-01/move",
          headers: { cookie },
          payload: { albumId: "album-window", position: 1.5 },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("排序要求完整无重复排列且移动位置必须在范围内", async () => {
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/admin/categories/order",
          headers: { cookie },
          payload: { ids: ["category-daily"] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/admin/albums/album-city-south/photos/order",
          headers: { cookie },
          payload: { ids: ["photo-city-south-01", "photo-city-south-01"] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/photos/photo-desk-01/move",
          headers: { cookie },
          payload: { albumId: "album-window", position: 99 },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("照片跨相册移动后同步收藏所属相册", async () => {
    await app.inject({
      method: "POST",
      url: "/api/admin/photos/photo-window-02/move",
      headers: { cookie },
      payload: { albumId: "album-workbench", position: 1 },
    });
    const collection = (
      await app.inject({ method: "GET", url: "/api/admin/collections", headers: { cookie } })
    ).json().items;
    expect(
      collection.find((item: { id: string }) => item.id === "collection-window-photo"),
    ).toMatchObject({ albumId: "album-workbench", photoId: "photo-window-02" });
  });

  it("收藏接口返回展示策略并原子保存内容与主题", async () => {
    const initial = await app.inject({ method: "GET", url: "/api/public/collections" });
    expect(initial.json().presentation).toEqual({
      defaultTheme: "stamp",
      enabledThemes: ["stamp", "editorial"],
    });

    const saved = await app.inject({
      method: "PUT",
      url: "/api/admin/collections",
      headers: { cookie },
      payload: {
        items: [
          {
            id: "collection-rain",
            type: "article",
            articleId: "article-rain",
            note: "雨天收藏",
            visible: true,
          },
        ],
        presentation: { defaultTheme: "editorial", enabledThemes: ["editorial"] },
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      presentation: { defaultTheme: "editorial", enabledThemes: ["editorial"] },
      items: [{ id: "collection-rain", note: "雨天收藏" }],
    });
    expect(
      (await app.inject({ method: "GET", url: "/api/public/collections" })).json(),
    ).toMatchObject({
      presentation: { defaultTheme: "editorial", enabledThemes: ["editorial"] },
      items: [{ id: "collection-rain" }],
    });
  });

  it("收藏展示策略支持镭射卡片主题", async () => {
    const saved = await app.inject({
      method: "PUT",
      url: "/api/admin/collections",
      headers: { cookie },
      payload: {
        items: [],
        presentation: { defaultTheme: "holographic", enabledThemes: ["stamp", "holographic"] },
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().presentation).toEqual({
      defaultTheme: "holographic",
      enabledThemes: ["stamp", "holographic"],
    });
    expect(
      (await app.inject({ method: "GET", url: "/api/public/collections" })).json().presentation,
    ).toEqual({ defaultTheme: "holographic", enabledThemes: ["stamp", "holographic"] });
  });

  it("收藏展示策略支持电影票根和登机牌主题", async () => {
    const saved = await app.inject({
      method: "PUT",
      url: "/api/admin/collections",
      headers: { cookie },
      payload: {
        items: [],
        presentation: { defaultTheme: "cinema", enabledThemes: ["cinema", "boarding"] },
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().presentation).toEqual({
      defaultTheme: "cinema",
      enabledThemes: ["cinema", "boarding"],
    });
  });

  it("收藏策略拒绝空主题和未启用默认主题且失败不改动集合", async () => {
    const before = (
      await app.inject({ method: "GET", url: "/api/admin/collections", headers: { cookie } })
    ).json();
    for (const presentation of [
      { defaultTheme: "stamp", enabledThemes: [] },
      { defaultTheme: "stamp", enabledThemes: ["editorial"] },
      { defaultTheme: "unknown", enabledThemes: ["stamp"] },
      { defaultTheme: "stamp", enabledThemes: ["stamp", "stamp"] },
    ]) {
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/api/admin/collections",
            headers: { cookie },
            payload: { items: [], presentation },
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({ method: "GET", url: "/api/admin/collections", headers: { cookie } })
      ).json(),
    ).toEqual(before);
  });

  it("空相册退出公开展示后仍保留在编辑部收藏编排中", async () => {
    const album = (
      await app.inject({
        method: "POST",
        url: "/api/admin/albums",
        headers: { cookie },
        payload: { title: "待清空相册", categoryId: "category-city" },
      })
    ).json();
    const photo = (
      await app.inject({
        method: "POST",
        url: `/api/admin/albums/${album.id}/photos`,
        headers: { cookie },
        payload: { title: "临时照片", image: "/assets/hero.png" },
      })
    ).json();
    await app.inject({
      method: "PUT",
      url: "/api/admin/collections",
      headers: { cookie },
      payload: {
        items: [
          { id: "collection-empty-album", type: "album", albumId: album.id, note: "保留引用" },
        ],
        presentation: { defaultTheme: "stamp", enabledThemes: ["stamp"] },
      },
    });
    await app.inject({
      method: "DELETE",
      url: `/api/admin/photos/${photo.id}`,
      headers: { cookie },
    });
    const admin = (
      await app.inject({ method: "GET", url: "/api/admin/collections", headers: { cookie } })
    ).json();
    expect(admin.items).toEqual([
      expect.objectContaining({
        id: "collection-empty-album",
        albumId: album.id,
        note: "保留引用",
      }),
    ]);
    expect(
      (await app.inject({ method: "GET", url: "/api/public/collections" })).json().items,
    ).toEqual([]);
  });

  it("收藏拒绝重复来源并清理与类型无关的字段", async () => {
    const duplicate = await app.inject({
      method: "PUT",
      url: "/api/admin/collections",
      headers: { cookie },
      payload: {
        items: [
          { id: "one", type: "article", articleId: "article-rain", albumId: "album-river" },
          { id: "two", type: "article", articleId: "article-rain" },
        ],
        presentation: { defaultTheme: "stamp", enabledThemes: ["stamp", "editorial"] },
      },
    });
    expect(duplicate.statusCode).toBe(400);
    const saved = await app.inject({
      method: "PUT",
      url: "/api/admin/collections",
      headers: { cookie },
      payload: {
        items: [
          {
            id: "clean",
            type: "article",
            articleId: "article-rain",
            albumId: "album-river",
            photoId: "photo-river-01",
          },
        ],
        presentation: { defaultTheme: "stamp", enabledThemes: ["stamp", "editorial"] },
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().items[0]).not.toHaveProperty("albumId");
    expect(saved.json().items[0]).not.toHaveProperty("photoId");
    expect(
      (await app.inject({ method: "GET", url: "/api/admin/featured", headers: { cookie } }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/public/featured" })).statusCode).toBe(404);
  });

  it("文章和相册没有永久删除 HTTP 接口", async () => {
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/admin/articles/article-august",
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/admin/albums/album-desk",
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("连续登录失败会被限流", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/login",
            payload: { email: "test@test.test", password: "wrong" },
          })
        ).statusCode,
      ).toBe(401);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "test@test.test", password: "wrong" },
        })
      ).statusCode,
    ).toBe(429);
  });

  it("应用启动不自动导入 seed 或创建所有者", async () => {
    const empty = await buildApp({
      databasePath: ":memory:",
      uploadDir: "memory",
      nodeEnv: "test",
    });
    expect(
      (
        await empty.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "test@test.test", password: "test" },
        })
      ).statusCode,
    ).toBe(401);
    await empty.close();
  });

  it("production 只要求数据库已有所有者且 Cookie 默认 Secure", async () => {
    await expect(
      buildApp({ databasePath: ":memory:", uploadDir: "memory", nodeEnv: "production" }),
    ).rejects.toThrow("owner:init");
    const production = await buildApp({
      databasePath: ":memory:",
      uploadDir: "memory",
      nodeEnv: "production",
      initializeOwner: { email: "owner@example.com", password: "secret" },
    });
    const login = await production.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "owner@example.com", password: "secret" },
    });
    expect(login.headers["set-cookie"]).toContain("Secure");
    await production.close();
  });

  it("删除图片文件失败时回滚数据库删除", async () => {
    class FailingDeleteStorage implements StorageAdapter {
      private files = new Map<string, Buffer>();
      put(_filename: string, data: Buffer) {
        this.files.set("file.png", data);
        return "file.png";
      }
      read(path: string) {
        return this.files.get(path) ?? Buffer.alloc(0);
      }
      quarantine(): string {
        throw new Error("disk failure");
      }
      restore() {}
      remove() {
        throw new Error("disk failure");
      }
    }
    const isolated = await buildApp({
      databasePath: ":memory:",
      storage: new FailingDeleteStorage(),
      nodeEnv: "test",
      seed: true,
      initializeOwner: { email: "test@test.test", password: "test" },
    });
    const login = await isolated.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@test.test", password: "test" },
    });
    const isolatedCookie = `${login.cookies[0]!.name}=${login.cookies[0]!.value}`;
    const form = multipart(png);
    const upload = await isolated.inject({
      method: "POST",
      url: "/api/admin/images",
      headers: { cookie: isolatedCookie, ...form.headers },
      payload: form.payload,
    });
    expect(
      (
        await isolated.inject({
          method: "DELETE",
          url: `/api/admin/images/${upload.json().id}`,
          headers: { cookie: isolatedCookie },
        })
      ).statusCode,
    ).toBe(500);
    expect(
      (
        await isolated.inject({
          method: "GET",
          url: "/api/admin/images",
          headers: { cookie: isolatedCookie },
        })
      )
        .json()
        .items.some((asset: { id: string }) => asset.id === upload.json().id),
    ).toBe(true);
    await isolated.close();
  });

  it("订阅按 IP 限流且同邮箱在限流内保持幂等", async () => {
    const limited = await buildApp({
      databasePath: ":memory:",
      uploadDir: "memory",
      nodeEnv: "test",
      initializeOwner: { email: "test@test.test", password: "test" },
      rateLimit: { subscriptionMax: 2, loginMax: 5, timeWindow: 60_000 },
    });
    const first = await limited.inject({
      method: "POST",
      url: "/api/public/subscriptions",
      payload: { email: "same@example.com" },
    });
    const second = await limited.inject({
      method: "POST",
      url: "/api/public/subscriptions",
      payload: { email: "same@example.com" },
    });
    const blocked = await limited.inject({
      method: "POST",
      url: "/api/public/subscriptions",
      payload: { email: "other@example.com" },
    });
    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(204);
    expect(first.body).toBe("");
    expect(second.body).toBe("");
    expect(blocked.statusCode).toBe(429);
    await limited.close();
  });

  it("登录同时按 IP 限流，随机邮箱不能绕过或无限创建邮箱键", async () => {
    const limited = await buildApp({
      databasePath: ":memory:",
      uploadDir: "memory",
      nodeEnv: "test",
      initializeOwner: { email: "test@test.test", password: "test" },
      rateLimit: { loginMax: 2, subscriptionMax: 10, timeWindow: 60_000 },
    });
    expect(
      (
        await limited.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "one@example.com", password: "wrong" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await limited.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "two@example.com", password: "wrong" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await limited.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "three@example.com", password: "wrong" },
        })
      ).statusCode,
    ).toBe(429);
    await limited.close();
  });

  it("删除中间栏目后压紧顺序且新增栏目追加到最大位置之后", async () => {
    const first = (
      await app.inject({
        method: "POST",
        url: "/api/admin/categories",
        headers: { cookie },
        payload: { name: "临时一" },
      })
    ).json();
    const middle = (
      await app.inject({
        method: "POST",
        url: "/api/admin/categories",
        headers: { cookie },
        payload: { name: "临时二" },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: "/api/admin/categories",
      headers: { cookie },
      payload: { name: "临时三" },
    });
    await app.inject({
      method: "DELETE",
      url: `/api/admin/categories/${middle.id}`,
      headers: { cookie },
    });
    const added = (
      await app.inject({
        method: "POST",
        url: "/api/admin/categories",
        headers: { cookie },
        payload: { name: "临时四" },
      })
    ).json();
    const items = (
      await app.inject({ method: "GET", url: "/api/admin/categories", headers: { cookie } })
    ).json().items;
    expect(items.map((item: { position: number }) => item.position)).toEqual(
      items.map((_item: unknown, index: number) => index),
    );
    expect(added.position).toBe(items.length - 1);
    expect(items.some((item: { id: string }) => item.id === first.id)).toBe(true);
  });

  it("空库初始化所有者后无需 demo seed 即可创建文章相册和照片", async () => {
    const empty = await buildApp({
      databasePath: ":memory:",
      uploadDir: "memory",
      nodeEnv: "test",
      initializeOwner: { email: "owner@example.com", password: "secret" },
    });
    const login = await empty.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "owner@example.com", password: "secret" },
    });
    const emptyCookie = `${login.cookies[0]!.name}=${login.cookies[0]!.value}`;
    const category = (
      await empty.inject({
        method: "POST",
        url: "/api/admin/categories",
        headers: { cookie: emptyCookie },
        payload: { name: "默认栏目" },
      })
    ).json();
    expect(
      (
        await empty.inject({
          method: "POST",
          url: "/api/admin/articles",
          headers: { cookie: emptyCookie },
          payload: { title: "第一篇", categoryId: category.id },
        })
      ).statusCode,
    ).toBe(201);
    const album = (
      await empty.inject({
        method: "POST",
        url: "/api/admin/albums",
        headers: { cookie: emptyCookie },
        payload: { title: "第一个相册", categoryId: category.id },
      })
    ).json();
    expect(
      (
        await empty.inject({
          method: "POST",
          url: `/api/admin/albums/${album.id}/photos`,
          headers: { cookie: emptyCookie },
          payload: { title: "第一张" },
        })
      ).statusCode,
    ).toBe(201);
    await empty.close();
  });

  it("归档公开相册允许移除或移走最后一张照片", async () => {
    const album = (
      await app.inject({
        method: "POST",
        url: "/api/admin/albums",
        headers: { cookie },
        payload: { title: "待归档相册", categoryId: "category-city" },
      })
    ).json();
    const photo = (
      await app.inject({
        method: "POST",
        url: `/api/admin/albums/${album.id}/photos`,
        headers: { cookie },
        payload: { title: "唯一照片" },
      })
    ).json();
    await app.inject({
      method: "PATCH",
      url: `/api/admin/albums/${album.id}`,
      headers: { cookie },
      payload: { isPrivate: false },
    });
    await app.inject({
      method: "POST",
      url: `/api/admin/albums/${album.id}/archive`,
      headers: { cookie },
    });
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/admin/photos/${photo.id}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/admin/albums/${album.id}`,
          headers: { cookie },
          payload: { title: "归档后编辑" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/admin/albums/${album.id}/restore`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/admin/albums/${album.id}`,
          headers: { cookie },
          payload: { isPrivate: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/admin/albums/${album.id}/restore`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("数据库不变量通过所有相册操作路径保持封面和公开非空约束", async () => {
    const album = (
      await app.inject({
        method: "POST",
        url: "/api/admin/albums",
        headers: { cookie },
        payload: { title: "约束相册", categoryId: "category-city" },
      })
    ).json();
    const photo = (
      await app.inject({
        method: "POST",
        url: `/api/admin/albums/${album.id}/photos`,
        headers: { cookie },
        payload: { title: "封面照片" },
      })
    ).json();
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/admin/albums/${album.id}`,
          headers: { cookie },
          payload: { coverPhotoId: "photo-window-01" },
        })
      ).statusCode,
    ).toBe(400);
    await app.inject({
      method: "PATCH",
      url: `/api/admin/albums/${album.id}`,
      headers: { cookie },
      payload: { coverPhotoId: photo.id, isPrivate: false },
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/admin/photos/${photo.id}/move`,
          headers: { cookie },
          payload: { albumId: "album-window" },
        })
      ).statusCode,
    ).toBe(409);
  });
});

describe("收藏数据库迁移", () => {
  it("将 v2 featured 数据完整迁移为最新 collections 和默认展示策略", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE articles(id TEXT PRIMARY KEY);
      CREATE TABLE albums(id TEXT PRIMARY KEY);
      CREATE TABLE photos(id TEXT PRIMARY KEY, album_id TEXT NOT NULL REFERENCES albums(id));
      CREATE TABLE featured(id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('article','album','photo')), article_id TEXT REFERENCES articles(id), album_id TEXT REFERENCES albums(id), photo_id TEXT REFERENCES photos(id), note TEXT NOT NULL, visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)), position INTEGER NOT NULL UNIQUE, CHECK((type='article' AND article_id IS NOT NULL AND album_id IS NULL AND photo_id IS NULL) OR (type='album' AND article_id IS NULL AND album_id IS NOT NULL AND photo_id IS NULL) OR (type='photo' AND article_id IS NULL AND album_id IS NOT NULL AND photo_id IS NOT NULL)));
      CREATE UNIQUE INDEX featured_article_source ON featured(article_id) WHERE type='article';
      CREATE UNIQUE INDEX featured_album_source ON featured(album_id) WHERE type='album';
      CREATE UNIQUE INDEX featured_photo_source ON featured(photo_id) WHERE type='photo';
      CREATE TRIGGER featured_photo_album_insert BEFORE INSERT ON featured WHEN NEW.type='photo' AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND album_id=NEW.album_id) BEGIN SELECT RAISE(ABORT,'featured photo album mismatch'); END;
      CREATE TRIGGER featured_photo_album_update BEFORE UPDATE OF photo_id,album_id ON featured WHEN NEW.type='photo' AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND album_id=NEW.album_id) BEGIN SELECT RAISE(ABORT,'featured photo album mismatch'); END;
      INSERT INTO articles VALUES ('article-old');
      INSERT INTO albums VALUES ('album-old');
      INSERT INTO photos VALUES ('photo-old','album-old');
      INSERT INTO featured VALUES ('featured-window-photo','photo',NULL,'album-old','photo-old','保留备注',0,4);
      INSERT INTO featured VALUES ('custom-preserved','article','article-old',NULL,NULL,'自定义收藏',1,5);
      PRAGMA user_version = 2;
    `);

    migrate(db);

    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(
      5,
    );
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='featured'").get(),
    ).toBeUndefined();
    expect(db.prepare("SELECT * FROM collections ORDER BY position").all()).toEqual([
      {
        id: "collection-window-photo",
        type: "photo",
        article_id: null,
        album_id: "album-old",
        photo_id: "photo-old",
        note: "保留备注",
        visible: 0,
        position: 4,
      },
      {
        id: "custom-preserved",
        type: "article",
        article_id: "article-old",
        album_id: null,
        photo_id: null,
        note: "自定义收藏",
        visible: 1,
        position: 5,
      },
    ]);
    expect(
      db.prepare("SELECT default_theme,enabled_themes FROM collection_presentation").get(),
    ).toEqual({ default_theme: "stamp", enabled_themes: '["stamp","editorial"]' });
    expect(
      db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE name LIKE 'featured_%'").get(),
    ).toEqual({ count: 0 });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) count FROM sqlite_master WHERE name IN ('collection_article_source','collection_album_source','collection_photo_source','collection_photo_album_insert','collection_photo_album_update')",
        )
        .get(),
    ).toEqual({ count: 5 });
    db.close();
  });

  it("从 v3 升级时保留刊物已有的收藏主题选择", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE collection_presentation(
        singleton INTEGER PRIMARY KEY CHECK(singleton=1),
        default_theme TEXT NOT NULL CHECK(default_theme IN ('stamp','editorial')),
        enabled_themes TEXT NOT NULL,
        CHECK(
          (default_theme='stamp' AND enabled_themes IN ('["stamp"]','["stamp","editorial"]','["editorial","stamp"]'))
          OR (default_theme='editorial' AND enabled_themes IN ('["editorial"]','["stamp","editorial"]','["editorial","stamp"]'))
        )
      );
      INSERT INTO collection_presentation VALUES (1,'editorial','["editorial"]');
      PRAGMA user_version = 3;
    `);

    migrate(db);

    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(
      5,
    );
    expect(
      db.prepare("SELECT default_theme,enabled_themes FROM collection_presentation").get(),
    ).toEqual({ default_theme: "editorial", enabled_themes: '["editorial"]' });
    db.close();
  });

  it("从 v4 升级时保留已有主题并开放票根主题", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE collection_presentation(
        singleton INTEGER PRIMARY KEY CHECK(singleton=1),
        default_theme TEXT NOT NULL CHECK(default_theme IN ('stamp','editorial','holographic')),
        enabled_themes TEXT NOT NULL CHECK(json_valid(enabled_themes) AND json_array_length(enabled_themes)>0)
      );
      CREATE TRIGGER collection_presentation_insert BEFORE INSERT ON collection_presentation
      WHEN EXISTS(SELECT 1 FROM json_each(NEW.enabled_themes) WHERE value NOT IN ('stamp','editorial','holographic'))
      BEGIN SELECT RAISE(ABORT,'invalid collection presentation'); END;
      CREATE TRIGGER collection_presentation_update BEFORE UPDATE ON collection_presentation
      WHEN EXISTS(SELECT 1 FROM json_each(NEW.enabled_themes) WHERE value NOT IN ('stamp','editorial','holographic'))
      BEGIN SELECT RAISE(ABORT,'invalid collection presentation'); END;
      INSERT INTO collection_presentation VALUES (1,'holographic','["stamp","holographic"]');
      PRAGMA user_version = 4;
    `);

    migrate(db);

    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(
      5,
    );
    expect(
      db.prepare("SELECT default_theme,enabled_themes FROM collection_presentation").get(),
    ).toEqual({ default_theme: "holographic", enabled_themes: '["stamp","holographic"]' });
    expect(() =>
      db
        .prepare(
          "UPDATE collection_presentation SET default_theme=?,enabled_themes=? WHERE singleton=1",
        )
        .run("cinema", '["cinema","boarding"]'),
    ).not.toThrow();
    db.close();
  });
});
