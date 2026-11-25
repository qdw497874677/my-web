# AI 生图插件

刊主可在编辑部选择生图模板、兼容模型和选填说明。有些模板只用文字，有些要求上传参考图。结果可预览、下载，不会自动保存为图片资产或发布。参考图和说明会发给所选供应商；生成可能计费。

## 默认加载与供应商配置

1. 在 `backend/` 下执行 `mkdir -p data && cp ai-images.example.json data/ai-images.json`。只保留要用的供应商，并确认账号支持所填型号和接口。默认读取此文件；如果文件不存在，编辑部仍能正常使用，只是不提供生图。用 `AI_IMAGES_CONFIG` 可指定其他路径。
2. 在 `backend/.env` 或后端进程环境中设置供应商密钥。JSON 中的 `apiKeyEnv` 只填环境变量名，不填密钥。`npm run dev` 和 `npm start` 会自动加载 `.env`；不要在前端或 Git 中保存密钥。
3. `FRONTEND_ORIGIN` 必须与浏览器打开编辑部的源完全一致（如 `http://localhost:5173`，不要带末尾斜杠）。重启后端，以刊主身份在编辑部打开「AI 生图」。若要停用，设置 `AI_IMAGES_ENABLED=false` 后重启；无需数据库迁移。

接入 MyCodex：将 [`ai-images.mycodex.example.json`](../backend/ai-images.mycodex.example.json) 复制为 `backend/data/ai-images.json`，把 `baseUrl` 换成自己的 MyCodex HTTPS API 基地址（包含 `/v1`），并在后端设置 `MYCODEX_API_KEY`。示例使用 `gpt-image-2`。

插件只接受 PNG、JPEG、WebP 参考图，单张至多 5 MiB，每次至多两张，由模板指定确切数量。单进程同时只处理一次生成，且每十分钟至多发出六次生成请求；等待供应商响应最多 180 秒，没有自动重试。这些限制在重启时重置，不是供应商账单上限；超时的请求仍可能被供应商计费。

若部署在反向代理后，请让生图接口的代理超时覆盖上传和生成耗时，避免代理在后端返回结果前断开连接。

## 真实浏览器测试

从 `frontend/` 执行：

```bash
AI_IMAGES_LIVE_MODEL_ID=mycodex-gpt-image-2 npm run test:e2e -- --project=desktop-chromium ai-images-live.spec.ts
```

此用例使用独立测试数据库，不拦截生图 API，会向已配置的供应商发送一次可能计费的请求，并检查浏览器能预览、下载返回的图片。`AI_IMAGES_LIVE_MODEL_ID` 填本地配置的模型 `id`；不设置时跳过此用例，普通浏览器测试不会使用真实生图供应商。

默认测试不需要参考图的「刊物封面」；加上 `AI_IMAGES_LIVE_TEMPLATE=photo-illustration` 可改测「照片插画」，上传一张测试生成的合成参考图。

## 配置与扩展

- **添加模型或兼容供应商**：在本地 JSON 注册一个或多个 `providers`。每个供应商指定唯一 `id`、`protocol`、`apiKeyEnv` 和 `models`。`baseUrl` 可选，仅使用你信任的 HTTPS API 基地址，须包含 API 版本路径（原生 OpenAI 为 `https://api.openai.com/v1`，原生 Gemini 为 `https://generativelanguage.googleapis.com/v1`）。密钥会发到这个地址。
- **模型能力**：模型 `id` 在整份配置中唯一，`label` 是编辑部的显示名，`model` 是供应商型号字符串。`maxReferenceImages` 为 `0`、`1` 或 `2`；设为 `0` 即仅接受文字。`aspectRatios` 是非空列表，由 `1:1`、`2:3`、`3:2` 组成。按实际账户和型号填写；只有满足模板参考图数量和比例的模型才可选。
- **协议与参数**：`openai-images` 协议适用于返回内联图片的 GPT Image 接口，文本生成发 JSON，参考图编辑发 multipart，分别走 `/images/generations`、`/images/edits`。三种比例映射到 `1024x1024`、`1024x1536`、`1536x1024`；可配 `options.quality` 为 `auto`、`low`、`medium` 或 `high`。`gemini` 走原生 `generateContent`，将参考图放在 `inline_data`，用 `imageConfig.aspectRatio` 传比例；支持时可配 `options.imageSize` 为 `1K`、`2K` 或 `4K`。参数是后端模型配置，不接受浏览器覆盖。
- **新增模板**：在 [`templates.ts`](../backend/src/plugins/ai-images/templates.ts) 中增加模板，定义展示文案、后端提示词、成图比例及参考图数量。不需要修改前端或供应商协议。
- **新增协议**：在后端插件的 [`providers.ts`](../backend/src/plugins/ai-images/providers.ts) 的 `adapters` 注册适配器。通过 `bind` 校验该协议的 `options` 并绑定到生成函数；生成函数负责请求参数映射，并把返回转换成 [`ImageModel`](../backend/src/plugins/ai-images/contracts.ts) 定义的内联图像。不跟随供应商返回的图片 URL；不需要修改公共配置加载器、编辑部界面、模板或刊物数据库。

型号和接口可查阅 [OpenAI GPT Image 型号说明](https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst)、[Gemini Nano Banana 型号说明](https://aistudio.google.com/docs/models/gemini-nano-banana-2.1)及 [Gemini v1 接口定义](https://generativelanguage.googleapis.com/$discovery/rest?version=v1)。启动时只校验本地配置，不向供应商验证账号权限或可用型号。

## 接口

两个接口都需要刊主会话。`GET /api/admin/ai-images/catalog` 返回可用模板及模型；关闭时返回 `enabled: false`。`POST /api/admin/ai-images/generate` 还需要匹配的 `Origin`，接收 multipart 格式的 `templateId`、`modelId`、可选 `instructions`（最多 1000 字符）以及模板要求的零个或多个 `reference` 文件字段，成功时返回单张图片的二进制。模型名、版本和配额因供应商账号而异；配置示例不会替你请求或开通账号权限。
