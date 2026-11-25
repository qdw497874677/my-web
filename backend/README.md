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
- `/api/admin/images`：multipart 上传、列表和引用保护删除；`GET /api/admin/images/:id` 供刊主预览
- `GET /api/admin/ai-images/catalog`、`POST /api/admin/ai-images/generate`：[AI 生图插件](../docs/ai-images.md)，默认加载本地模型配置
- `GET/PUT /api/admin/collections`：收藏目录、排序与可见性
- `/api/public/articles`、`/api/public/albums`、`/api/public/collections`
- `POST /api/public/subscriptions`：新订阅和重复提交均返回 `204` 空响应，不返回邮箱或既有记录
- `GET /api/images/:id`：只读取有当前公开引用的图片；未公开或不存在均为 `404`

文章和相册不提供永久删除 HTTP 接口。排期发布时间只接受带 `Z` 或明确 offset 的 ISO 时刻；公开 API 使用服务端时钟，不接受客户端指定当前时间。登录和订阅分别按 IP 限流，使用 `@fastify/rate-limit` 的有容量上限缓存，随机邮箱不会创建无限增长的应用 Map。不存在账户的登录也会执行 dummy password hash，降低明显的账户枚举时间差。

## 图片资产

文章展示图和照片通过外键引用图片。迁移会登记 `/assets/cta.png`、`/assets/hero.png`，不用导入演示内容也能正常创建文章和照片。其他预置 `/assets/...` 仍是静态资源；上传文件登记为本地资产。上传保留原有 `url` 供 `image` 输入引用，另提供刊主 `previewUrl` 用于编辑预览。被文章或照片引用的资产不能删除。

只接受 PNG、JPEG、GIF 和 WebP。读取历史上传时也会检查格式；无法识别、不受支持或类型不符的旧文件不会以内联图片返回，但不会删除。公开读取按请求时的状态判断：到达发布时间且未归档的排期文章、已发布且未归档的文章、未归档的公开相册都可以授权其结构化引用的图片。同一资产只要还有一处公开引用，另一处改为私密不会让图片下线。Markdown 正文里的图片地址不是结构化引用。

**已有数据升级前**：可以用 `sqlite3 -readonly /path/to/linjian.sqlite`（有 WAL 时使用可读的完整库目录）运行以下只读查询。第一条仅筛选正文使用了本地图片地址的候选文章，第二条仅检查所登记的格式；两条都不替代人工查看或实际字节验证。

```sql
SELECT id, slug FROM articles WHERE instr(body, '/api/images/') > 0;
SELECT id, media_type FROM assets
WHERE kind = 'local' AND lower(media_type) NOT IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp');
```

仅在正文被引用而需要继续公开的图片，应先明确其公开用途，再加入公开相册或作为公开文章的展示图。需要保留旧 SVG 等格式的视觉内容时，从原文件在本地转换成受支持的栅格格式，再上传并改引。两个图片 API 不应经过代理缓存或直接映射上传目录；部署时清除可控的旧代理缓存，保留 API 的 `no-store`。此前已缓存或下载的图片副本无法撤回。

SQLite triggers 维护相册封面必须属于本相册、照片精选的相册必须匹配，以及非归档公开相册不得为空。归档或私密相册允许为空。

删除本地图片采用 `原文件 -> quarantine -> 删除数据库记录 -> 删除 quarantine`。数据库删除失败会恢复原文件；最终清理 quarantine 失败不会返回失败，因为数据库和公开引用已经一致，残留隔离文件可由运维清理。SQLite 提交和本地文件系统重命名无法形成真正的跨资源原子事务，进程在极小的步骤间崩溃时可能留下可恢复的 quarantine 文件，但不会成功响应后留下指向已删除文件的数据库记录。

## 离线检查、备份与恢复

**先停止后端，以及所有可能写入数据库或上传目录的命令。** 数据库与图片是同一套数据；不要在服务运行时分别复制。维护命令不能判断写入者是否已停止。以下命令在 `backend/` 内运行，路径按实际部署替换，目标目录必须尚不存在：

```bash
npm run data -- check /srv/linjian/linjian.sqlite /srv/linjian/uploads
npm run data -- backup /srv/linjian/linjian.sqlite /srv/linjian/uploads /backups/linjian-2026-11-25
npm run data -- restore /backups/linjian-2026-11-25 /srv/linjian-restore
```

检查和备份不会用 SQLite 打开或修改源库。它们复制主库及存在的 WAL，在副本上合并 WAL，然后检查 SQLite 完整性、外键及本地图片登记与文件是否匹配。请使用受信任的 Linux 本地文件系统和原始部署路径，不要通过绑定挂载等别名读写同一位置。不支持非空回滚日志、符号链接、有硬链接的主库或上传子目录；不要删除源库的 WAL 或日志来绕过检查。备份成功时包含 `linjian.sqlite`、`uploads/` 和最后写入的 `manifest.json`。恢复验证清单、文件长度与 SHA-256，并检查恢复副本；不会覆盖原部署，也不会自动启用恢复结果。退出码：`0` 成功，`1` 发现数据不一致或备份校验不通过，`2` 参数、路径、输入格式或 I/O 错误。失败残留的目标目录不应作为可用备份。

备份包括私密内容、密码哈希、会话与订阅邮箱，应限制访问并妥善保管。清单用于检查损坏，不证明备份来源可信。恢复先指向新目录，在不对外开放的环境验证登录、公开内容和图片，再切换实际部署配置；保留原数据目录以便回退。升级前也先做同样的离线备份；应用启动按版本事务迁移，当前 schema 版本不变。

如果报告缺失、大小不符、孤立或 `.trash-…` 隔离文件，不要自动删除。先保留原始文件，再在独立副本上调查。仅当缺失文件名与唯一隔离候选的原始文件名完全匹配、目标仍不存在、大小及可用的既有摘要匹配时，才在副本中恢复原名，并重新运行 `check`。无法确认时，优先使用已验证的备份。

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
