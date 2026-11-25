# 林间刊物

基于 Open Design 原型迁移的个人刊物。前端使用 React，后端使用 Fastify 与 SQLite；公开刊物和编辑部均通过后端 API 读写内容。

## 目录

- `frontend/`：Vite + React + TypeScript 前端
- `backend/`：Fastify + TypeScript + SQLite 后端
- `CONTEXT.md`：领域词汇表
- `docs/agents/`：工程技能配置

## 初始化后端

需要 Node.js 24 或更高版本。

```bash
cd backend
npm install
cp .env.example .env
npm run db:init
npm run owner:init
npm run db:seed # 可选：导入演示内容
npm run dev
```

`owner:init` 使用 `.env` 中的 `OWNER_EMAIL` 和 `OWNER_PASSWORD` 创建唯一的刊物所有者。详细配置与 API 说明见 `backend/README.md`。

## 运行前端

```bash
cd frontend
npm install
npm run dev
```

Vite 会输出本地预览地址，默认通常为 `http://localhost:5173`。

开发环境中，Vite 默认将 `/api` 请求代理到 `http://127.0.0.1:3001`，因此前后端需要同时运行。

## AI 生图

个人工作台提供刊物编辑和 AI 生图。生图可通过模板生成或改编图片，并预览、下载结果，不会自动保存或发布。后端默认加载 `backend/data/ai-images.json`，配置模型后无需额外开启；MyCodex 配置和扩展方法见 [AI 生图插件](docs/ai-images.md)。工作台的接入边界见 [ADR 0003](docs/adr/0003-static-owner-workbench.md)。

## 验证

分别在 `backend/` 和 `frontend/` 执行：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

浏览器端到端测试在 `frontend/` 执行：

```bash
npm run test:e2e
```

测试优先使用 `PATH` 中的本机 Chromium，找不到才使用 Playwright 自带的版本（可用 `npx playwright install chromium` 安装）。可设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium` 指定路径，或设为 `bundled` 强制使用 Playwright 版本。

若 Linux 的 `/tmp` 配额不足，可用 `TMPDIR=/dev/shm npm run test:e2e` 将浏览器临时文件放到 `/dev/shm`。

组件陈列页位于 `/components`，不显示在公开刊物导航中。
