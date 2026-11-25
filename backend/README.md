# 林间刊物后端

Node.js 24、TypeScript、Fastify 与内置 `node:sqlite` 实现的单进程后端。SQLite 启用外键、事务与 schema version，上传图片通过本地存储适配器保存。

## 初始化

应用启动只打开并迁移数据库，不自动创建所有者，也不自动导入演示内容。

```bash
npm install
cp .env.example .env
npm run db:init
npm run owner:init
npm run db:seed # 可选演示数据
npm run dev
```

`owner:init` 要求 `OWNER_EMAIL` 和 `OWNER_PASSWORD`。应用运行时只检查数据库中是否已经存在唯一所有者，不要求长期保留密码环境变量；非 `test` 环境数据库没有所有者时会拒绝启动并提示执行 `owner:init`。`test@test.test / test` 不再是运行时默认值。`npm run dev` 和 `npm start` 会读取本目录下的 `.env`（若存在），进程环境变量优先。生产环境 Cookie 默认启用 `Secure`，本地 HTTP 开发可显式设置 `COOKIE_SECURE=false`。

如前端 E2E 需要演示内容，应在测试启动脚本中先执行 `npm run db:init && npm run owner:init && npm run db:seed`。也可由测试代码调用 `buildApp({ seed: true, initializeOwner: ... })`；普通服务启动不会读取 `SEED_ON_START` 自动写数据，避免误污染生产库。

## API

- `GET /api/health`
- `POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/session`
- `/api/admin/categories`：栏目 CRUD 与完整排列排序
- `/api/admin/articles`：文章创建、读取、更新、归档与恢复
- `/api/admin/albums`：相册创建、读取、更新、归档与恢复
- `/api/admin/albums/:id/photos`、`/api/admin/photos/:id`：照片创建、编辑、排序、移动、移除
- `/api/admin/images`：multipart 上传、列表和引用保护删除
- `GET /api/admin/ai-images/catalog`、`POST /api/admin/ai-images/generate`：[AI 生图插件](../docs/ai-images.md)，默认加载本地模型配置
- `GET/PUT /api/admin/featured`：精选目录、排序与可见性
- `/api/public/articles`、`/api/public/albums`、`/api/public/featured`
- `POST /api/public/subscriptions`
- `GET /api/images/:id`：上传图片静态读取

文章和相册不提供永久删除 HTTP 接口。排期发布时间只接受带 `Z` 或明确 offset 的 ISO 时刻；公开 API 使用服务端时钟，不接受客户端指定当前时间。登录和订阅分别按 IP 限流，使用 `@fastify/rate-limit` 的有容量上限缓存，随机邮箱不会创建无限增长的应用 Map。不存在账户的登录也会执行 dummy password hash，降低明显的账户枚举时间差。

## 图片资产

文章和照片在数据库中通过 `asset_id` 外键引用图片。Migration 始终登记创建首篇文章和首张照片所需的 `/assets/cta.png`、`/assets/hero.png` 内置资产，因此不导入 demo seed 也能正常创建内容。Seed 中其他 `/assets/...` 图片会登记为 external/preloaded assets；上传文件登记为 local assets。API 继续返回前端兼容的 `image` URL。被文章或照片引用的资产不能删除。

SQLite triggers 维护相册封面必须属于本相册、照片精选的相册必须匹配，以及非归档公开相册不得为空。归档或私密相册允许为空。

删除本地图片采用 `原文件 -> quarantine -> 删除数据库记录 -> 删除 quarantine`。数据库删除失败会恢复原文件；最终清理 quarantine 失败不会返回失败，因为数据库和公开引用已经一致，残留隔离文件可由运维清理。SQLite 提交和本地文件系统重命名无法形成真正的跨资源原子事务，进程在极小的步骤间崩溃时可能留下可恢复的 quarantine 文件，但不会成功响应后留下指向已删除文件的数据库记录。

## 命令

- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm start`
- `npm run db:init`
- `npm run owner:init`
- `npm run db:seed`
