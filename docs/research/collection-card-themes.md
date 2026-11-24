# 收藏卡片主题与交互技术调研

> 研究日期：2026-07-26  
> 范围：将公开界面的“精选”改名为“收藏”，支持卡片展示主题切换，新增邮票风格卡片，轻量 3D 悬停，并保持点击进入详情的可访问性。本文只给出技术与交互建议，不包含业务代码。

## 结论摘要

1. **邮票齿孔首选 CSS gradient mask，普通矩形作为无支持时的自然降级。** 使用 4 个沿边重复的 `radial-gradient()` mask 能以少量参数控制孔径、节距和内缩，适合响应式卡片。`mask-image` 已是 MDN Baseline 2023，但仍建议放在 `@supports (mask-image: radial-gradient(...))` 中；若项目浏览器矩阵包含较旧 Safari，可同时提供 `-webkit-mask-*` 声明。
2. **不要把 mask 与 3D 子层直接放在同一个元素上。** CSS Transforms 规定 `mask-image`、`clip-path`、非 `none` 的 `filter` 等分组属性会使 `transform-style: preserve-3d` 的已用值扁平化。推荐分层：外层负责 `perspective`，中层负责整体倾斜，内层视觉壳负责邮票 mask，内容层只做很小的 `translateZ()` 或完全不做 Z 轴分层。
3. **轻量倾斜不必默认引入持续动画循环。** 每次 `pointermove` 只计算一次卡片局部坐标并写两个 CSS 自定义属性，现代浏览器通常足够。只有在性能测量显示事件过密、或需要惯性插值时，再用“最多挂起一个”的 `requestAnimationFrame()` 合帧；不要建立永久 rAF 循环。
4. **3D 只是一种增强，不是进入详情的提示或前置条件。** 仅在 `(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)` 下启用。触屏、粗指针、键盘和减少动态场景保持稳定卡片，仍可直接点击或按 Enter 打开。
5. **整张卡片应继续使用带 `href` 的原生链接。** WAI-ARIA APG 明确优先原生 `<a href>`；不要把 `div` 加 `role="link"`，也不要用点击处理器模拟导航。提供清晰、常驻的 `:focus-visible` 指示，不让焦点态依赖倾斜或阴影。
6. **主题数据模型先做全局展示主题。** 当前收藏项是对文章、相册、照片的有序引用，主题首先是集合级展示偏好，而不是内容事实。第一阶段用全局 `collectionCardTheme`（例如 `editorial | stamp`）统一切换，不改每条引用；只有确认编辑者需要混排时，才为单项增加可选 `themeOverride`，而不是立刻给每条收藏写入必填 `theme`。
7. **推荐参数要克制。** 倾角上限建议每轴 `2.5deg–4deg`，上移 `2–5px`，缩放 `1–1.015`，透视 `800–1200px`，状态过渡 `140–220ms`。邮票孔半径约 `3–5px`、节距 `10–16px`、视觉边带 `8–14px`。避免超过 `6deg` 倾角、`1.025` 缩放或明显持续漂浮。

## 当前项目观察

- 路由已经使用 `/favorites`，公开导航和页面文案仍写“精选”；因此“改名为收藏”首先可以是**产品文案改名**，不必同步改 URL、API 和内部类型名。
- 当前 `FeaturedCard` 已经以 React Router `Link` 包裹整张卡片，天然具备链接导航和键盘 Enter 激活语义。
- 当前指针位置算法把卡片中心归一化到 `-0.5...0.5`，再乘以 `8deg`，所以实际每轴最大倾角是 **±4deg**，落在本文建议范围内。
- 当前 `onPointerMove` 会响应 mouse、pen 和 touch；CSS 虽在 `hover:none` 时强制移除 transform，但脚本仍会持续写 CSS 变量。后续实现应在事件层也检查交互能力或 `event.pointerType`，减少触屏无效工作。
- 当前全局 `:focus-visible` 已有 `2px` 轮廓和 `2px` 偏移，是合格起点。邮票 mask 不应裁掉该轮廓，焦点环应画在未被 mask 裁切的链接外层或 wrapper 上。
- 当前领域文档把该集合定义为“编辑精选”。若本需求只是公开产品语言改成“收藏”，建议暂不重命名 `FeaturedReference`、API `/featured` 和领域术语；若“收藏”代表领域含义也变化，应另开领域决策，而不是在视觉主题需求中顺带迁移。

## 1. 邮票齿孔边缘方案

真实邮票的齿孔来自邮票之间成排打孔，目的是便于手工撕开；美国国家邮政博物馆也将其描述为 stamps 之间的 rows of holes。视觉实现应表现为**规则的小型半圆缺口**，而不是锯齿、撕裂纸或夸张花边。[National Postal Museum: Finishing the Job](https://postalmuseum.si.edu/exhibition/stamps-take-flight-creating-america%E2%80%99s-stamps/finishing-the-job)

### 方案 A：`mask-image` + 边缘 `radial-gradient()`

**原理**

- `mask-image` 接受 CSS gradient 作为 `<image>`；透明区域隐藏元素，实色区域显示元素。[MDN: mask-image](https://developer.mozilla.org/en-US/docs/Web/CSS/mask-image)
- 每条边使用一个重复的径向渐变制造圆孔，4 个 mask layer 合成四边齿孔。
- 孔径、节距、边带可以集中为 CSS 自定义属性，例如 `--hole-radius`、`--hole-step`、`--stamp-gutter`。

**优点**

- 响应式好，卡片尺寸变化时无需重算 polygon 点位。
- 视觉上能产生真正“挖掉”的圆形缺口，四边一致。
- 参数化程度最高，便于不同主题复用。
- 不增加 DOM，也不需要图片资产。

**代价与风险**

- 多层 mask 的方向、尺寸和合成关系比普通背景难读，维护时需要注释和集中变量。
- MDN 将 `mask-image` 标为 Baseline 2023；对只支持旧浏览器的项目仍需降级策略。
- 较旧 WebKit 实现可能需要 `-webkit-mask-*`。是否保留前缀应以项目实际浏览器矩阵和 BrowserStack/真机测试为准，而不是无条件永久复制两套规则。
- mask 会影响元素自身的绘制边界；如果焦点 outline、阴影或角标也放在被 mask 的元素上，可能被裁切或产生不理想边缘。
- **关键 3D 限制：** `mask-image` 会触发后代 3D 扁平化，因此 mask 应放在倾斜层内部的视觉壳，不要放在承担 `preserve-3d` 的父层。[MDN: transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style)

**建议定位**

- 作为邮票主题的首选增强方案。
- 基线仍是正常矩形卡片；不支持 mask 时只失去齿孔，不失去内容、链接、焦点或布局。

### 方案 B：普通 `background` 的 `radial-gradient()`

这里要区分两种做法：

- **仅用 background 绘制孔洞颜色：** 在卡片边缘画与页面背景同色的圆点，看起来像缺口。
- **gradient 作为 mask：** 实际属于方案 A，会真正裁去形状。

**优点**

- 纯 background 的兼容性和调试成本最低。
- 不裁切内容，不影响链接命中区域或焦点环。
- 不会因为 `mask-image` 自身触发 3D 扁平化。

**代价与风险**

- 它并没有真正挖孔，只是在单一背景上“伪装”；页面背景有纹理、渐变、图片或卡片跨越不同底色时会露馅。
- 卡片阴影仍按矩形绘制，近看不如 mask 可信。
- 要同步页面背景色，主题之间容易出现耦合。

**建议定位**

- 如果站点背景长期固定且优先追求低复杂度，可作为务实备选。
- 不建议把它当成通用设计系统能力。

### 方案 C：`clip-path`

**原理**

- `clip-path` 定义元素可见区域，区域外内容被隐藏；可使用 `polygon()`、`path()`、SVG `<clipPath>` 等。[MDN: clip-path](https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path)

**优点**

- `clip-path` 基础能力已是 MDN Baseline 2020。
- 固定形状用 `polygon()` 很直接；SVG path 可以精确复刻异形边缘。
- 真正改变绘制可见区域，不依赖页面背景色伪装。

**代价与风险**

- `polygon()` 只擅长直线段。圆形齿孔需要大量点近似，CSS 会变长，且响应式尺寸变化会让孔距或圆度不稳定。
- `path()` 的坐标和缩放维护成本高，CSS `shape()` 等更新语法的实现成熟度也不应默认假设。
- 非 `none` 的 `clip-path` 会创建 stacking context，并与 mask 一样使 `preserve-3d` 后代扁平化。[MDN: clip-path](https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path)；[MDN: transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style)
- 被裁后的边缘会影响视觉命中判断；交互区域和 WCAG target size 仍应按真实可点击区域检查。

**建议定位**

- 适合少量、固定比例、由设计工具导出的特殊邮票轮廓。
- 不适合当前这种需要主题化、响应式和易调参的通用收藏卡片。

### 方案 D：伪元素

**原理**

- 用 `::before` / `::after` 承载重复径向背景、SVG background、边带、邮戳或内框。
- 两个伪元素本身通常不够独立覆盖四条边，因此常见做法是一个伪元素画横向边，另一个画纵向边，或把多层 gradient 全部放进一个伪元素。

**优点**

- 视觉装饰与实际链接内容分离，`pointer-events: none` 后不会抢交互。
- 可把焦点环、阴影保留在真实链接上，装饰层单独裁切。
- 非常适合邮票主题的辅助语言：内框、纸张纹理、面值角标、轻微邮戳，而不只是齿孔。

**代价与风险**

- 若只是用背景色覆盖边缘，仍有方案 B 的背景耦合问题。
- 伪元素数量有限，复杂视觉容易把单个伪元素塞入过多职责。
- stacking context 和 `z-index` 管理要明确，否则装饰可能盖住文字或焦点。

**建议定位**

- 不单独作为“齿孔算法”的首选，而是作为**结构容器**：伪元素承载 mask/gradient 装饰，真实链接保持语义、焦点和点击区域。

### 推荐组合

推荐采用四层结构概念：

1. `card-stage`：提供 `perspective`，不裁切。
2. `card-link`：原生链接，接收整体 rotate/translate，保留可见 focus ring。
3. `card-surface`：主题视觉壳；邮票主题在这里应用 mask，普通主题保持矩形。
4. `card-content`：图片和文字。仅在确有必要时做极小 Z 轴分层。

这样能隔离三个容易冲突的职责：导航语义、3D transform、邮票裁切。

### 兼容与降级策略

```css
/* 基线：完整、可点击的矩形卡片 */
.card-surface {
  background: var(--card-bg);
}

/* 增强：只在支持 gradient mask 时启用齿孔 */
@supports (mask-image: radial-gradient(circle, #000 50%, transparent 51%)) {
  .card[data-theme="stamp"] .card-surface {
    /* 四边 mask，参数由主题 token 提供。 */
  }
}
```

降级成功的判断不是“旧浏览器看起来完全一致”，而是：

- 内容不丢失；
- 点击和键盘导航不变；
- 焦点仍清晰；
- 卡片尺寸和网格不跳动；
- 只损失装饰性齿孔。

## 2. 轻量 3D hover

### `perspective`、`transform` 与 `transform-style`

- `perspective` 属性设置在父元素上，对其 3D 子元素建立共同视角。数值越大，透视越弱；数值越小，效果越强。非 `none` 时会创建 stacking context。[MDN: perspective](https://developer.mozilla.org/en-US/docs/Web/CSS/perspective)
- `perspective()` 函数写在被变换元素自身的 `transform` 列表中；它与父元素的 `perspective` 属性用途不同。[MDN: perspective()](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/perspective)
- 如果只是整张卡片作为一个平面做 `rotateX()` / `rotateY()`，**并不需要** `transform-style: preserve-3d`。
- 只有图片、文字、角标等子层真的用了 `translateZ()` 时，才需要 `preserve-3d`；该属性不继承，且多种分组属性会强制扁平化。[MDN: transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style)

因此当前需求建议先从“单平面倾斜 + 阴影变化”开始，而不是堆叠多个 Z 层。视觉已经能传达轻微浮动，结构和兼容风险更低。

### 指针位置驱动

推荐算法：

1. 在 `pointermove` 中读取卡片 `getBoundingClientRect()`。
2. 将 `(clientX, clientY)` 映射为卡片局部的 `-1...1`。
3. 对结果 clamp，分别映射到 `rotateY` 和反向 `rotateX`。
4. 只写 `--rotate-x`、`--rotate-y` 等 CSS 变量，不写 `top/left/width/height`。
5. `pointerleave`、`pointercancel`、失去页面可见性时重置为 0。

输入门控建议同时做两层：

- CSS：`@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)`。
- JS：仅处理鼠标；若设计确认压感笔悬停体验良好，可允许 `pen`。`PointerEvent.pointerType` 的标准值是 `mouse`、`pen`、`touch`。[MDN: pointerType](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pointerType)

### `requestAnimationFrame()` 是否必要

**默认不必要。** 当前效果每次事件只做一次矩形读取、少量算术和两次 CSS 变量写入，没有惯性或连续物理模拟。先保持直接更新，避免过早复杂化。

以下情况才值得加入 rAF：

- 性能面板显示一帧内处理多次 `pointermove`，主线程或样式更新出现可见抖动；
- 页面同屏卡片很多，且事件委托/命中逻辑带来额外开销；
- 需要 lerp/spring 的惯性跟随，而不是即时映射；
- 同一帧还有光泽位置、阴影方向等多项视觉属性要统一提交。

使用时应采用“latest event wins”：保存最新坐标；如果本帧尚无 rAF，则请求一次；回调中统一写样式并清空 request id。不要在 hover 开始后运行无限循环。

MDN 说明 `requestAnimationFrame()` 会在下一次重绘前调用，调用频率通常匹配显示器刷新率，并在多数后台标签页暂停；它是 one-shot，需要再次调用才会继续。[MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)

### 性能注意

- 动态属性只使用 `transform`，阴影若变化应非常克制；不要逐帧改变布局属性。
- 不要默认给所有卡片永久设置 `will-change: transform`。MDN 明确建议把 `will-change` 当作解决已存在性能问题的最后手段，滥用会增加内存和合成成本。[MDN: will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)
- 如果实测需要，可只在即将 hover 的活动卡片上短暂设置 `will-change`，离开和过渡结束后恢复 `auto`。
- 避免在同一个事件周期里先写样式、再读取几何、再写样式。每次先完成所有读取，再集中写入。

## 3. 动态偏好、键盘、触屏与点击语义

### `prefers-reduced-motion`

`prefers-reduced-motion: reduce` 表示用户要求移除、减少或替换非必要动态。MDN 特别指出缩放和大范围平移可能触发前庭不适。[MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

本需求建议在 reduce 下：

- 禁用指针跟随倾斜；
- 禁用 hover 上移和 scale；
- 保留非运动反馈，例如边框颜色、文字下划线、静态阴影或背景色变化；
- 焦点环不做动画；
- 若 JS 注册了 `matchMedia` 监听，在用户运行时修改系统偏好后立即停止并重置 transform。

不建议使用全局 `* { transition: none !important; animation: none !important; }` 作为长期方案，因为它可能关闭与本卡片无关、且对理解状态有帮助的过渡。更稳妥的是只覆盖收藏卡片相关选择器。

### hover 与触屏

- `(hover: hover)` 表示**主输入机制**可以方便地悬停；`hover: none` 包括许多触屏设备以及只能通过不便的长按模拟 hover 的设备。[MDN: hover](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/hover)
- `(pointer: fine)` 表示主指针精度高，例如鼠标；`pointer: coarse` 常见于手指触屏。[MDN: pointer](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/pointer)
- 建议用二者交集启用 3D，而不是只检测 viewport 宽度，也不要用“是否支持触摸”推断设备类别。
- 混合设备可能同时有触屏和鼠标。CSS 以主输入做默认，JS 再以每个 `pointerType` 过滤事件，能避免触摸滑动时意外倾斜。
- 触屏上一次 tap 应直接进入详情，不要设计成“第一次点亮 hover、第二次才进入”。

### 键盘焦点

WCAG 2.2 SC 2.4.7 要求键盘焦点可见；W3C 推荐用户代理默认焦点或作者提供的明显 focus indicator。[W3C: Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)

建议：

- 在整张链接上使用 `:focus-visible`，不要只给内部标题加样式。
- 焦点环至少 `2px`，与卡片和页面背景均有清晰对比，外偏移 `2–4px`。
- 邮票 mask 放在内层，焦点环放在外层，避免齿孔裁切 outline。
- 焦点态可以共享 hover 的静态强调（例如边框、标题下划线），但不应自动启动指针跟随倾斜。
- DOM 顺序必须与视觉网格顺序一致；主题切换只改变样式，不改变 tab 顺序。

### 点击卡片语义

WAI-ARIA APG 强烈建议使用原生 `<a href>`。ARIA `role="link"` 不会自动提供浏览器导航、上下文菜单等标准行为，若使用就需要作者自行补齐。[WAI-ARIA APG: Link Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/link/)

对“点击进入详情”的建议：

- 整张卡片是一条导航动作时，使用一个覆盖整卡的原生链接或 React Router `Link`。
- 链接的可访问名称应包含清楚的内容标题；“打开内容”可作为辅助文案，但不应成为唯一名称。
- 图片 `alt` 描述图片本身时可保留；如果图片纯粹重复标题语义，可考虑空 `alt`，避免读屏重复，具体取决于图片是否传达独立信息。
- 不在整卡链接内部嵌套“收藏/分享/更多”按钮。若未来增加独立操作，应改成卡片容器 + 标题链接/覆盖链接的明确结构，并处理重叠命中区域。
- HTML 标准中，带 `href` 的 `<a>` 创建 hyperlink 并由用户代理执行跟随链接的标准行为。[WHATWG HTML: Links](https://html.spec.whatwg.org/multipage/links.html#links-created-by-a-and-area-elements)

### 点击目标尺寸

整张卡片作为链接天然远大于 WCAG 2.2 SC 2.5.8 的 `24 × 24 CSS px` 最小目标。若主题切换器使用图标按钮或色样按钮，也应保证至少 `24 × 24px`，更建议按触屏舒适度做到 `40–44px`。[W3C: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

### hover 新增内容

3D 倾斜本身不显示额外内容，不直接落入 WCAG 1.4.13 的附加内容要求。仍建议不要把标题、类型、进入详情提示等关键信息只放在 hover 后出现。如果未来 hover 会出现说明浮层，需满足可关闭、可悬停、持续显示，并且键盘焦点也能触发。[W3C: Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)

## 4. 主题切换的数据建模

### 选项一：全局展示主题

示意：

```ts
type CollectionCardTheme = 'editorial' | 'stamp'

interface CollectionPresentation {
  cardTheme: CollectionCardTheme
}
```

**含义：** 当前收藏集合在公开页统一使用一种卡片视觉。

**优点**

- 符合“支持切换卡片主题”的最小解释：切换整个展示主题。
- 一次配置即可更新所有卡片，编辑界面清晰。
- 不污染每条内容引用；新增主题只扩展展示 token 和 renderer。
- 迁移成本低，已有收藏数据不必批量回填。
- 视觉一致性更强，邮票主题不会与旧主题随机混排。

**缺点**

- 无法为某张收藏单独强调或修正特殊素材。
- 如果未来明确要做“每张卡片像独立邮品”的编排，需要再扩展 override。

### 选项二：每张收藏必填 `theme`

示意：

```ts
type FeaturedReference = {
  // existing reference fields...
  theme: CollectionCardTheme
}
```

**优点**

- 支持混排和逐卡艺术指导。
- 可以逐条 A/B 或强调特定收藏。

**缺点**

- 每次新增主题都影响已有记录、表单、API 校验和默认值策略。
- 编辑者需要逐条维护，容易出现无意混排。
- 主题从“集合展示偏好”变成“收藏项持久属性”，耦合更深。
- 删除或重命名主题时需要处理历史数据。
- 当前 `FeaturedReference` 本质是内容引用和编排信息；视觉字段直接混入会让领域对象承担展示系统职责。

### 选项三：全局默认 + 单项可选覆盖

示意：

```ts
interface CollectionPresentation {
  cardTheme: CollectionCardTheme
}

interface CollectionItemPresentation {
  themeOverride?: CollectionCardTheme
}

const effectiveTheme = item.themeOverride ?? collection.cardTheme
```

这是长期最灵活的模型，但**不应在第一阶段直接全部实现**。只有出现以下明确需求时才增加 override：

- 编辑者需要同一页面混排不同主题；
- 某些素材在默认主题下确实无法使用；
- 主题承担内容语义，而不只是视觉偏好；
- 已有用户行为证明逐卡编排价值高于维护成本。

### 推荐的渐进式落地

#### 阶段 0：文案与内部边界

- 公开界面将“精选”改为“收藏”。
- 保持 `/favorites`、`/featured`、`FeaturedReference` 等内部稳定标识，除非产品确认领域含义已改变。
- 将主题键定义为稳定 ASCII 枚举，展示名称单独本地化，不把“邮票风格”中文直接当数据库值。

#### 阶段 1：纯前端主题原型

- 全局固定一个主题常量或开发态开关，验证普通主题与 `stamp` 主题的 CSS 结构。
- 不改后端数据；验证图片比例、标题长度、网格高度、焦点和移动端。
- 这一步可确认主题是否只影响视觉，还是还需要不同内容密度/信息架构。

#### 阶段 2：持久化全局主题

- 在集合展示配置或站点展示配置中保存 `cardTheme`。
- API 返回主题键；前端对未知键回退到 `editorial`。
- 数据库默认值使用 `editorial`，避免现有部署迁移后外观突然改变。
- 主题 renderer 以显式映射处理，不把任意后端字符串拼进 class name。

#### 阶段 3：按需增加单项覆盖

- 仅在验证了混排需求后，为收藏项增加可选 `themeOverride`。
- `null/undefined` 表示继承全局主题，不要把当前默认值复制到每一行。
- 编辑器提供“跟随全局 / 普通 / 邮票”三态，而不是只有两个互斥主题。
- 删除主题时先清理 override，再移除 renderer；未知值仍回退全局默认。

### 模型命名建议

- 公开产品名：`收藏`。
- 展示主题类型：`CollectionCardTheme`。
- 稳定主题键：`editorial`、`stamp`。
- 如果继续沿用现有领域概念，API/代码内部暂保留 `FeaturedReference`，减少非必要迁移。
- 如果未来“收藏”不再是编辑精选，而是用户主动收藏、允许多人或带收藏时间，则它已经是新领域概念，需要独立建模，不能只靠改名完成。

## 5. 推荐参数范围

以下数值是产品调校起点，不是 Web 标准要求。目标是让用户感到卡片有材质和方向响应，而不是制作游戏卡牌特效。

| 参数 | 推荐起点 | 可接受范围 | 避免 |
| --- | ---: | ---: | ---: |
| `perspective` | `1000px` | `800–1200px` | `<600px`，透视容易夸张 |
| `rotateX` / `rotateY` 最大值 | `3deg` | `2.5–4deg` | `>6deg` |
| hover 上移 | `-3px` | `-2px` 至 `-5px` | `<-8px` |
| hover scale | `1.008` | `1–1.015` | `>1.025` |
| 进入/复位 transition | `180ms` | `140–220ms` | `>300ms`，显得拖沓 |
| easing | `cubic-bezier(.2,.7,.2,1)` | 轻缓 ease-out | 弹簧式过冲 |
| 内容 `translateZ` | `0–6px` | `0–10px` | `>16px` |
| 阴影 Y 偏移 | `14px` | `10–20px` | 大面积浓黑阴影 |
| 阴影 blur | `28px` | `20–36px` | `>50px` |
| 阴影 alpha | `0.14` | `0.10–0.20` | `>0.28` |
| 齿孔半径 | `4px` | `3–5px` | `>7px` |
| 齿孔节距 | `13px` | `10–16px` | 小于直径，形成锯齿 |
| 邮票视觉边带 | `10px` | `8–14px` | `>18px`，挤压内容 |
| 邮票内框 | `1px` | `1–2px` | 多重粗框 |
| 焦点环 | `2px` + `3px` offset | `2–3px` | 只靠阴影或倾斜表示焦点 |

### 参数关系

- 卡片越大，最大倾角应越小。大卡片 `2.5–3deg` 已足够；小卡片可接近 `4deg`。
- `perspective` 越小，旋转越明显，因此不要同时使用低 perspective 和高角度。
- 如果加 scale，就降低上移和阴影变化，避免三种“浮起”信号叠加过量。
- 邮票孔径应小于节距的一半，保留清晰纸齿；节距最好使用整数像素以减少边缘发虚。
- 文字和图片不需要显著独立漂浮。邮票视觉本身已经有较强识别度，3D 应退居辅助。

## 推荐实现决策

### 推荐方案

- 卡片语义：整卡原生链接。
- 主题策略：先全局 `editorial | stamp`。
- 邮票边缘：内层 surface 使用 4 边 gradient mask；无支持时回退矩形。
- 3D：外层 perspective，链接平面旋转；默认不启用 `preserve-3d`。
- 指针更新：直接事件驱动，实测有压力再用单帧 rAF 合并。
- 能力门控：`hover: hover` + `pointer: fine` + `prefers-reduced-motion: no-preference`，并过滤 `pointerType`。
- 焦点：外层链接显示独立 outline，不被 mask 裁切。
- 动态参数：最大 ±3deg 起步，最多不超过 ±4deg。

### 不推荐方案

- 为视觉改名同步重命名全部 API、路由和领域类型。
- 第一版就给所有收藏项写入必填 `theme`。
- 用 `div onClick` + `role="link"` 模拟整卡导航。
- 只靠 hover 才显示“可点击”信息。
- 在触屏上保留 pointermove 倾斜，或要求二次点击进入。
- 在同一元素上同时承担 mask、`preserve-3d` 容器和 focus outline。
- 永久给所有卡片设置 `will-change: transform`。
- 使用超过 6 度倾斜、明显 scale、弹簧回弹和持续自动漂浮。

## 验证清单

- Chrome、Safari、Firefox 当前稳定版验证四边 mask、图片裁切和阴影。
- iOS Safari 与 Android Chrome 验证单次 tap 直接导航，无 sticky hover。
- macOS/Windows 开启减少动态后，倾斜、上移和 scale 均停止。
- 纯键盘 Tab 遍历，所有卡片焦点清楚，Enter 正常进入详情。
- 200% 与 400% 页面缩放下，焦点环不被裁，内容不溢出齿孔边带。
- 高对比/forced colors 场景下，链接仍有可识别焦点；邮票装饰丢失不影响理解。
- 混合输入设备分别用触摸、鼠标、触控笔测试，触摸滚动不触发无效倾斜。
- 长标题、无图片、竖图、横图、照片详情 URL 参数等现有收藏类型均正常。
- 主题切换不改变 DOM 顺序、链接 href、网格尺寸和页面滚动位置。
- 性能面板检查 pointermove：无持续 layout thrashing，无永久 rAF，无大规模合成层增长。

## 关键来源

### CSS 与浏览器行为

- [MDN: `mask-image`](https://developer.mozilla.org/en-US/docs/Web/CSS/mask-image)
- [MDN: `radial-gradient()`](https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/radial-gradient)
- [MDN: `clip-path`](https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path)
- [MDN: `perspective`](https://developer.mozilla.org/en-US/docs/Web/CSS/perspective)
- [MDN: `perspective()`](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/perspective)
- [MDN: `transform-style`](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style)
- [MDN: `requestAnimationFrame()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [MDN: `will-change`](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)
- [MDN: `PointerEvent.pointerType`](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pointerType)
- [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [MDN: `hover`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/hover)
- [MDN: `pointer`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/pointer)

### 无障碍与 HTML 语义

- [WAI-ARIA APG: Link Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/link/)
- [W3C WCAG 2.2: Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
- [W3C WCAG 2.2: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [W3C WCAG 2.2: Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)
- [WHATWG HTML: Links created by `a` and `area`](https://html.spec.whatwg.org/multipage/links.html#links-created-by-a-and-area-elements)

### 邮票视觉依据

- [Smithsonian National Postal Museum: Finishing the Job](https://postalmuseum.si.edu/exhibition/stamps-take-flight-creating-america%E2%80%99s-stamps/finishing-the-job)
- [Smithsonian National Postal Museum: Early Rotary Perforation Machine](https://postalmuseum.si.edu/collections/object-spotlight/early-rotary-perforation-machine)
- [Smithsonian National Postal Museum: Tools of the Hobby](https://postalmuseum.si.edu/tools-of-the-hobby)
