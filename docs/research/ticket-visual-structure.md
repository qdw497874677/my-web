# 电影票根与航空登机牌的视觉和信息结构

> 研究日期：2026-08-02  
> 目标：指导 `my-web` 收藏卡片中的“电影票根”和“登机牌”主题重构。本文只提供视觉与信息架构建议，不修改应用代码。  
> 取材原则：优先采用 IATA、Apple、航空公司、影院票务平台、票券打印设备厂商的第一方资料，并以 Smithsonian 馆藏实物校验历史形态。规范事实与面向网页卡片的设计综合分开表述。

## 结论摘要

1. **真实感首先来自信息职责，而不是锯齿、阴影和做旧滤镜。** 电影票要回答“看什么、在哪里、哪一场、坐哪里、如何验票”；登机牌要回答“谁、从哪里到哪里、哪一班、何时登机、哪个登机口、坐哪里、如何验票”。先建立稳定的信息层级，再添加纸张和穿孔。
2. **主券/副券是可信结构，但不是必须套用的统一标准。** 历史影院票可以极小、无海报、只保留票种、价格和连续票号；移动电影票可以只有二维码。纸质登机牌也存在不同尺寸和无可撕副券的版本。网页主题若使用副券，应把它解释为“重复关键识别信息的检票留根”，而不是单纯的装饰侧栏。
3. **电影票建议采用约 72:28 的主券/副券横向结构。** 主券承载海报缩略图、片名、影院、日期场次、影厅和座位；副券重复短片名或票号、场次、影厅/座位，并放置小型条码或检票标记。二者之间使用单条穿孔线及上下半圆缺口即可。
4. **海报图可以出现，但应是票面的一部分，不应把卡片变成普通海报卡。** Apple 的 event ticket 模板允许 `strip`、`background` 或 `thumbnail` 图像，并明确 strip 与 background/thumbnail 不同时使用。对收藏卡更合适的是窄幅海报裁切或约 25%–35% 宽的缩略图，文字票面仍占主导。
5. **登机牌建议采用约 76:24 的主券/副券结构，航线代码是最大视觉锚点。** 主券以 `SHA → HND` 之类的机场代码对为核心，旅客、航班、日期、登机时间、登机口、座位形成规则字段网格；副券重复旅客姓氏、航班、座位、登机组或序号，避免成为第二张完整票。
6. **登机牌的目的地图片必须比电影海报更克制。** Apple 的 boarding-pass 样式只支持 logo、icon 和靠近条码的 footer 图像，不支持 event-ticket 式 strip/background/thumbnail。目的地图片宜做低对比窄条、局部地标剪影或淡色水印，占票面约 12%–20%，不得压过机场代码、登机口、时间、座位和条码。
7. **条码要像一个扫描区域，而不是随手生成的纹理。** IATA Resolution 792 的 BCBP 是机器可读二维条码格式；纸质登机牌默认曾采用 PDF417，规范也允许 Aztec、Data Matrix 和 QR。电影移动票的第一方说明同样以可扫描 QR 为核心。条码周围应留安静区，不叠纹理、文字、缺口或高对比图片。
8. **最有效的拟真细节是有限重复、非对称层级、设备痕迹和业务缩写。** 比起满版虚构小字，更真实的是：票号在主副券重复一次、字段标签与值大小不同、日期时间采用机器式排版、票面保留打印边距、条码有人工输入备用码、穿孔只出现一次、纸张轻微偏色且不均匀。

## 1. 电影票：合理的视觉和信息结构

### 1.1 真实票券并不存在单一模板

Smithsonian 馆藏的 1950 年代 Vernon Theatre 入场券只有约 `1 × 2 in`，使用棕黄色纸张、黑红两色印刷、粗边框、票种/价格、`ADMIT ONE` 和连续票号。票号 `028007` 在左右区域重复，票面没有片名、场次、座位、条码或海报。这说明历史影院票首先是**低成本入场凭证**，不应反向把现代字段或海报视为所有“真实电影票”的必要条件。[Smithsonian NMAAHC: Ticket for the "Colored Balcony" of the Vernon Theatre](https://nmaahc.si.edu/object/nmaahc_2011.160.9)

现代数字票则把验票能力放在首位。Fandango 的官方帮助说明，Mobile Ticket 以 QR code 交付，观众可直接到检票点扫描；一个移动票可包含同一订单中的全部票，而且首次扫描后才授予入场。这支持网页卡片把条码视为**订单/凭证入口**，而不是为每个座位无意义地复制多个大二维码。[Fandango Support: What is a Mobile Ticket?](https://support.fandango.com/fandangosupport/s/article/What-is-a-Mobile-Ticket)

因此，收藏卡主题应选择一种明确年代语汇：

- **纪念纸票语汇**：主券 + 可撕副券、票号、单色/双色印刷、少量海报图。
- **现代移动票语汇**：无副券，信息块更规整，二维码更显著。
- 当前主题名是“电影票根”，更适合第一种，但可借用现代票的条码和选座信息，形成可信的“纪念票”混合体。

### 1.2 推荐主券/副券结构

建议桌面横卡使用约 `72:28`，移动端可将副券折到下方，仍保持一条穿孔分界：

```text
┌───────────────────────────────┬───────────┐
│ 海报/影片视觉  片名            ┆ ADMIT ONE │
│               影院 · 影厅      ┆ 票号      │
│               日期 · 开场时间  ┆ 场次      │
│               ROW / SEAT      ┆ 座位      │
│ 票种 / 格式 / 订单短码   条码   ┆ 小条码/章 │
└───────────────────────────────┴───────────┘
                                ↑ 穿孔线
```

**主券职责**

- 最大文本是片名，不是主题名“电影票根”。
- 第二层是影院名、影厅/银幕、日期和开场时间。
- 座位应以一个紧凑组合突出，例如 `ROW H · SEAT 12` 或 `8排 12座`；只有真实内容数据支持时才显示，不要用每张卡都相同的假座位。
- 条码位于底部或靠副券一侧，旁边可有订单短码/票号作为人工备用识别。
- 内容类型、收藏日期等网站元信息如果必须出现，应降为出票系统式小字，不抢票面业务字段。

**副券职责**

- 重复检票后仍需辨认的最小集合：短片名或票号、场次、影厅、座位。
- 可加入 `ADMIT ONE`、`AUDITORIUM 06`、`SEQ 028007` 等短标签。
- 不要把完整摘要、作者、分类、日期再次复制到副券；真实副券的价值是冗余识别，不是信息镜像。

**穿孔与缺口**

- 只在主副券之间设置一条穿孔线；上下边缘各做一个与穿孔对齐的半圆缺口即可。
- 使用短虚线、点状切口或细密 perforation，避免巨大的波浪齿、邮票四边齿孔或撕纸锯齿。邮票齿孔与票券穿孔是不同工艺语言。
- 穿孔附近应减少重要文字，条码也不要跨越穿孔。
- Boca Systems 的官方影院票纸规格强调打印机黑标、进纸方向、红外对比和禁印/禁打孔区域，说明真实票面会受设备和纸材约束，不是任意满版排版。网页中可用稳定边距、局部空白和一处对位标记模拟这种设备约束。[Boca Systems: Cinema / XATM-DC Ticket Specifications](https://www.bocasystems.com/tickets_specs4.html)

### 1.3 场次、座位与条码的层级

建议优先级如下：

1. 片名。
2. 日期 + 开场时间。
3. 影院/影厅 + 座位。
4. 条码 + 票号/订单短码。
5. 票种、版本、语言、格式、价格等辅助字段。

日期和时间宜成对出现，例如 `02 AUG 2026 · 19:40`，而不是把日期藏在普通正文。影院官方预留座位服务的业务本质是购票时选择并保留具体座位，因此已分配座位应在票面上具有明显位置，而不是混在标签列表中。[AMC: Reserved Seating](https://www.amctheatres.com/reserved-seating)

条码建议：

- 纸票语汇优先使用横向一维码或紧凑 PDF417 风格块；移动票语汇使用 QR。
- 视觉模拟条码也要有明确白色/浅色安静区。
- 条码下保留 `028007 06 1940` 一类短人工码，字符间距略宽。
- 不把真实内容标题直接编码成可扫描条码后宣称可验票；收藏卡中的条码是视觉语义，除非产品确有对应跳转/识别功能。

### 1.4 海报图如何融入

Apple Wallet 把电影归入 event ticket。其官方设计规范允许 event ticket 使用 `strip`、`background`、`thumbnail`，但如果使用 strip，就不要同时使用 background 或 thumbnail；图像会按分配区域等比填充并被裁切。这提供了一个重要原则：**一张票只选一种主要图像角色。**[Apple Wallet Developer Guide: Pass Design and Creation](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html)

对本项目推荐两种方案，二选一：

- **左侧缩略海报**：占主券宽度约 25%–35%，使用 2:3 海报裁切；片名和票务字段在右侧。最适合文章/相册/照片都有封面图的收藏卡。
- **顶部窄幅 strip**：占票面高度约 22%–30%，从封面中取横向局部；下方保留完整票务信息网格。

不推荐：

- 全幅清晰海报作为背景，再在上面叠大量白字。
- 同时放海报缩略图、横幅图和背景水印。
- 海报占据 60% 以上，使卡片退化为普通内容封面卡。
- 为了“电影感”加入胶片孔、场记板、爆米花、放映机等一整套图标；真实票面通常不会同时承载这些符号。

## 2. 登机牌：合理的视觉和信息结构

### 2.1 先以航程为核心，而不是以旅游海报为核心

Apple 的 boarding-pass 字段示例把两个 primary fields 用于始发地和目的地，例如 `SFO → LHR`；登机口是 secondary field，座位和旅客是 auxiliary fields。官方说明 boarding pass 最多可有两个 primary fields 和五个 auxiliary fields。这表明视觉层级应以**航线两端**为最大锚点，其他字段围绕实际登机动作组织。[Apple Wallet Developer Guide: Fields Contain Text Displayed on the Pass](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html#//apple_ref/doc/uid/TP40012195-CH4-SW47)

IATA Resolution 792 定义 Bar Coded Boarding Pass 的机器可读二维条码数据；IATA 说明纸质和移动设备都可生成这种登机牌。Version 7 的实施说明指出，纸质登机牌默认采用 PDF417，同时扩展允许 Aztec、Data Matrix 和 QR。这意味着“像登机牌”的核心不是随机竖条，而是**一个有明确扫描职责的二维代码区**。[IATA: Common Use Standards, Resolution 792](https://www.iata.org/en/programs/passenger/common-use/)；[IATA: BCBP Implementation Guide Version 7 (PDF)](https://www.iata.org/contentassets/1dccc9ed041b4f3bbdcf8ee8682e75c4/2021_03_02-bcbp-implementation-guide-version-7-.pdf)

### 2.2 推荐主券/副券结构

桌面横卡建议约 `76:24`：

```text
┌──────────────────────────────────┬──────────┐
│ AIRLINE / FLIGHT       DATE       ┆ NAME     │
│                                  ┆ FLIGHT   │
│ SHA  ───────────────→  HND        ┆ SEAT 18A │
│ Shanghai              Tokyo      ┆ GROUP 3  │
│                                  ┆ SEQ 042  │
│ PASSENGER   BOARDING   GATE SEAT  ┆ 小条码   │
│ 二维条码 / 人工识别码              ┆          │
└──────────────────────────────────┴──────────┘
                                   ↑ 穿孔线
```

**主券职责**

- 最大文本是两个机场代码和方向关系。
- 城市全名以小一级文字辅助代码，避免只写城市而失去航空系统感。
- 旅客名、航班号、日期、登机时间、登机口、座位应形成规整字段网格。
- `GATE`、`BOARDING`、`SEAT` 的值要比标签明显大，尤其是登机口和座位。
- 条码置于底部独立扫描区，可附人工读取码。

**副券职责**

- 重复旅客姓氏/简称、航班号、座位、登机组/序号。
- 可重复目的地代码，但不需要再复制完整航线和所有时间。
- 副券宽度要足以容纳 `18A`、`MU271` 等短值，不应窄到只能竖排每个字符。
- 若卡片在移动端垂直堆叠，副券可转为底部横条，但穿孔关系仍需清楚。

Smithsonian 馆藏的一张 Independence Air 纸质登机牌仅约 `3 1/8 × 2 1/8 in`，说明真实登机牌并不总是现代印象中的超长横票；收藏卡可以保持适合网格的比例，而不必机械复刻某一种纸张尺寸。[National Air and Space Museum: Boarding Pass, Independence Air](https://airandspace.si.edu/collection-objects/boarding-pass/nasm_A20100036000)

Smithsonian 还收藏了 Southwest circa 2000 的可重复使用塑料登机牌：以颜色区分航班/分组，双面只突出 `First Boarding Group` 和顺序号码。它说明真实票券的信息密度由业务流程决定；“塞满字段”并不天然更真实。[National Air and Space Museum: Southwest Airlines Red Boarding Pass](https://airandspace.si.edu/collection-objects/boarding-pass-southwest-airlines-red/nasm_A20010070005)

### 2.3 字段排序与视觉权重

推荐优先级：

1. 始发机场代码 → 目的机场代码。
2. 登机时间、登机口、座位。
3. 旅客名、航班号、日期。
4. 条码和人工识别码。
5. 舱等、登机组、序号、常旅客状态等辅助信息。

Singapore Airlines 的官方登机说明明确指出 boarding time 会打印在登机牌上，登机口在起飞前 15 分钟关闭。这支持把 `BOARDING` 与普通出发时间区分，并将其作为高优先级字段，而不是只显示一个含义模糊的时间。[Singapore Airlines: Boarding](https://www.singaporeair.com/en_UK/sg/travel-info/check-in/boarding/)

Delta 说明旅客可以打印登机牌或取得移动 eBoarding Pass，机场自助机还能打印登机牌、变更座位。这进一步说明纸面/移动样式可以不同，但座位与可扫描凭证是实际流程字段。[Delta: How to Check In](https://www.delta.com/us/en/check-in-security/overview)

### 2.4 条码布局

- 纸质语汇首选横向 PDF417 风格二维块，置于主券底部，占主券宽度约 34%–48%。
- 如果卡片较窄，可使用方形 Aztec/QR 风格码，但不要同时再放一条纯装饰一维码。
- 条码四周保留至少一个明显字符高度的空白；不要让穿孔线、阴影、目的地图片或纸张噪点进入扫描区。
- 在条码下方加入短备用码，例如 `M1DOE/QUANDAWEI MU0271 18A` 的抽象化片段，但不要堆整段不可读 BCBP 数据。
- Apple 说明条码通常承载指向后台记录的唯一 ID，并可提供无法扫描时人工输入的替代文本；因此条码旁的一行短码比随机微缩文字更可信。[Apple Wallet Developer Guide: Barcodes Link Passes to Your Records](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html#//apple_ref/doc/uid/TP40012195-CH4-SW50)

### 2.5 目的地图片如何适度融入

Apple 的官方 pass-style 表中，boarding pass 支持 `logo`、`icon`、`footer`，不支持 event ticket 的 `strip`、`background` 或 `thumbnail`；footer 图像位于条码附近且区域很窄。由此推导，目的地照片不应成为登机牌主视觉。[Apple Wallet Developer Guide: Pass styles, images, and layout](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html#//apple_ref/doc/uid/TP40012195-CH4-SW45)

推荐方式：

- 在航线代码后方放 5%–10% 不透明度的单色地标剪影。
- 在主券最上或最下放高度约 12%–18% 的窄幅目的地照片，并覆盖统一色调。
- 将封面图裁成类似 footer 的细长窗口，紧邻但不侵入条码安静区。
- 对照片使用低饱和、双色调或网点化，使它看起来像航空品牌印刷，而不是旅游广告图。

不推荐：

- 目的地照片覆盖半张票。
- 在照片上叠机场代码、登机口和座位。
- 同时使用飞机插画、世界地图、虚线路径、云层、护照章、地标拼贴。
- 为所有内容强行生成虚假的真实机场代码；若内容没有地点语义，可使用稳定的主题化“刊物代码”，但应在产品内部保持映射一致，而不是每次随机。

## 3. 哪些细节最能避免“模板感”

### 3.1 高价值细节

**字段标签和值使用不同字体角色**

- 标签：窄体无衬线、全大写、较小字号、略宽字距，如 `BOARDING`、`AUDITORIUM`。
- 值：更粗、更大、更紧凑，如 `19:40`、`G12`、`18A`。
- 标题可用品牌字体，但票号、时间、座位、航班号应使用等宽或近等宽数字。

**有限且有理由的重复**

- 票号在主券和副券各出现一次。
- 座位可在主券字段网格与副券重复。
- 不重复完整标题、摘要、作者和所有元数据。

**稳定的机器边距**

- 条码、黑标、穿孔和重要文字之间有明确避让。
- 边距略不对称比完美居中的营销卡更像打印系统产物。
- 留出一小块“没有内容的功能空白”，不要把每个角落填满。

**连续编号和短代码体系**

- 使用长度稳定的 `SEQ 042`、`TKT 028007`、`AUD 06`、`ROW H / SEAT 12`。
- 同一张卡的编号在各处必须一致。
- 不要混用三四种毫无关系的随机编号。

**克制的纸张与印刷误差**

- 暖白、浅灰、浅黄或航空品牌色纸面。
- 1%–3% 的细微纸纤维/热敏噪点即可。
- 可有极轻的油墨浓淡、套色偏移或边缘磨损，但正文不能模糊。
- 历史电影票可用双色印刷；现代登机牌更适合清晰单色/品牌色块。

**真实的状态痕迹**

- 一处检票章、打孔或撕去副券后的状态，比全票面做旧更有叙事。
- 同一网格中可对少量卡片改变章的位置、序号或纸色，但结构保持一致。
- 不要每张卡都有相同角度的咖啡渍、折痕和印章。

### 3.2 最容易显得像模板的做法

- 每张卡都使用同样的假日期、假座位、假登机口。
- 把内容摘要塞进真实票券不会出现的大正文区。
- 电影票与登机牌共用同一个三列元数据网格，只换图标和颜色。
- 条码只是 CSS 随机条纹，没有安静区、编号或固定位置。
- 穿孔线有三四条，或整张票四边都做邮票齿孔。
- 使用过多旅游/电影符号，让票券变成主题插画板。
- 所有元素都严格居中、等宽、等距，缺乏业务优先级。
- 用全幅图片 + 渐变遮罩 + 白字，这是通用内容卡模式，不是票券模式。

## 4. 面向 `my-web` 收藏卡的落地建议

### 电影票根主题

- 保留横向主券/副券和单条检票虚线。
- 图片选“左侧海报缩略图”或“顶部 strip”之一。
- 主券字段建议：内容标题、内容类型/影院替代标签、发布日期或拍摄日期/场次替代值、稳定生成的影厅与座位展示值、票号、条码。
- 副券只重复：短标题、场次、座位、票号。
- 对文章、相册、照片使用同一票务语法，但用 `FEATURE`、`ALBUM`、`STILL` 等小型票种标签区分，不改变主结构。

### 登机牌主题

- 以两个稳定代码表示“来源 → 内容目标”，但代码映射必须可解释且稳定；如果没有真实地点数据，不要伪装成真实航班事实。
- 主券字段建议：来源/目的代码、内容标题对应的城市名位置、发布日期/登机日期、内容类型/舱等、序号/座位、条码。
- 副券重复：短标题或所有者简称、代码对中的目的代码、座位/序号、票号。
- 封面图只做窄幅 footer、双色剪影或低对比水印。
- `GATE`、`BOARDING`、`SEAT` 等标签可以借用航空语言，但值应由稳定规则生成并在同一内容上保持不变，否则随机感会破坏收藏品属性。

### 两个主题必须拉开的差异

| 维度 | 电影票根 | 登机牌 |
| --- | --- | --- |
| 最大视觉锚点 | 片名 | 始发/目的代码对 |
| 图片角色 | 海报缩略图或 strip，可较明显 | footer/水印/剪影，必须克制 |
| 主副券比例 | 约 72:28 | 约 76:24 |
| 关键动作字段 | 场次、影厅、排/座 | 登机时间、登机口、座位 |
| 条码倾向 | 一维码、QR 或小型二维块 | PDF417/Aztec/QR 风格二维块 |
| 色彩 | 暖纸、黑红双色、影院品牌色 | 冷白/浅色纸、航空品牌色、高信息清晰度 |
| 质感 | 纪念票、轻微磨损、检票章 | 系统打印、规整网格、设备留白 |

## 来源

### 行业规范与第一方设计文档

- [IATA: Common Use Standards / Resolution 792 - Bar Coded Boarding Pass](https://www.iata.org/en/programs/passenger/common-use/)
- [IATA: Bar Coded Boarding Pass Implementation Guide, Version 7 (PDF)](https://www.iata.org/contentassets/1dccc9ed041b4f3bbdcf8ee8682e75c4/2021_03_02-bcbp-implementation-guide-version-7-.pdf)
- [Apple Wallet Developer Guide: Pass Design and Creation](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html)
- [Boca Systems: Cinema / XATM-DC Ticket Specifications](https://www.bocasystems.com/tickets_specs4.html)
- [Boca Systems: General Ticket Specifications](https://www.bocasystems.com/tickets_specs9.html)

### 影院、票务平台与航空公司

- [Fandango Support: What is a Mobile Ticket?](https://support.fandango.com/fandangosupport/s/article/What-is-a-Mobile-Ticket)
- [AMC: Reserved Seating](https://www.amctheatres.com/reserved-seating)
- [Singapore Airlines: Boarding](https://www.singaporeair.com/en_UK/sg/travel-info/check-in/boarding/)
- [Delta: How to Check In](https://www.delta.com/us/en/check-in-security/overview)
- [United Airlines: The United App](https://www.united.com/en/us/fly/travel-experience/united-app.html)

### Smithsonian 馆藏

- [NMAAHC: Ticket for the "Colored Balcony" of the Vernon Theatre, 1950s](https://nmaahc.si.edu/object/nmaahc_2011.160.9)
- [National Air and Space Museum: Boarding Pass, Independence Air](https://airandspace.si.edu/collection-objects/boarding-pass/nasm_A20100036000)
- [National Air and Space Museum: Southwest Airlines Red Boarding Pass](https://airandspace.si.edu/collection-objects/boarding-pass-southwest-airlines-red/nasm_A20010070005)
- [National Air and Space Museum: Southwest Airlines Yellow Boarding Pass](https://airandspace.si.edu/collection-objects/boarding-pass-southwest-airlines-yellow/nasm_A20010070007)

## 研究边界

- IATA 的公开页面和实施指南主要规范条码数据与互操作性，不规定所有航空公司的完整视觉模板；本文对主副券比例、图片占比和网页响应式行为属于基于资料的设计综合。
- Apple Wallet 是数字票券模板，不等同于所有纸票，但其字段优先级、图像角色和条码区域对网页卡片非常有参考价值。
- 影院实体票受不同国家、年代、影院链、售票系统和打印设备影响，不能把“主券 + 副券 + 海报 + 座位 + 条码”宣称为普遍历史标准；它是适合本项目主题目标的可信组合。
