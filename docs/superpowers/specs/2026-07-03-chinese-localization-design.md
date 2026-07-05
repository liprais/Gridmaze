# 游戏中文本地化设计

## 目标

为 Gridmaze 增加中文界面支持，同时保留英文，实现中英双语切换。

## 需求确认

| 问题 | 结论 |
|------|------|
| 中文/英文关系 | 做成中英双语切换 |
| 切换方式 | 界面右上角按钮 |
| 是否记住选择 | 使用 `localStorage` 记住 |
| 3D 地砖标签 | 随语言切换为中文符号 |
| 字体策略 | 使用系统中文字体，优先等宽字体显示英文 |
| 默认语言 | 自动检测浏览器语言（`navigator.language`） |
| 标题是否汉化 | 保持 `Gridmaze` 不变 |

## 方案

采用**集中式字典 + 运行时 DOM 更新**。

### 原因

- 项目规模小，翻译文本数量可控，无需引入 JSON 异步加载或第三方 i18n 库。
- 所有翻译集中在一个文件，便于维护。
- 无需额外依赖，改动最小。

## 架构与数据流

1. **初始化**：`main.ts` 启动时调用 `i18n.init()`。
   - 读取 `localStorage` 中保存的语言（`gridmaze-lang`）。
   - 无保存值时，根据 `navigator.language` 判断是否以 `zh` 开头，决定默认语言。
   - 保存当前选择到 `localStorage`。
   - 返回当前语言。
2. **应用翻译**：`i18n.init()` 和 `i18n.setLang()` 会扫描 `data-i18n` / `data-i18n-html` 节点，替换其文本/HTML。
3. **切换语言**：点击 HUD 右上角按钮 → 调用 `i18n.setLang(lang)` → 更新 `localStorage` → 更新静态 DOM → 触发 `regenerateDungeon()` 重建地砖标签。
4. **日志**：`addLog()` 接收消息键和参数，内部调用 `i18n.t(key, params)` 实时生成当前语言字符串。
5. **地砖描述**：`describeTile()` 改为从 `i18n` 字典读取地砖名称。

## 文件改动

### 新增 `src/i18n.ts`

- 导出 `type Lang = 'en' | 'zh'`。
- 提供字典，结构如下：
  - `ui.title`、`ui.position`、`ui.floor`、`ui.shieldActive` 等 HUD 文案。
  - `overlay.subtitle`、`overlay.controlsTitle`、`overlay.tileTypesTitle`、`overlay.dismiss` 等开始界面文案。
  - `legend.title`、`legend.effect.*` 等图例文案。
  - `log.*` 各类日志模板。
  - `tileLabels.*` 中英地砖符号映射（中文：Reset→回、Teleport→传、RandomMap→乱、Compass→指、Scan→扫、Shield→盾、Exit→出）。
  - `tileNames.*` 中英地砖名称映射。
- 导出函数：
  - `init(): Lang`
  - `getLang(): Lang`
  - `setLang(lang: Lang): void`
  - `t(key: string, params?: Record<string, string | number>): string`
  - `applyTranslations(): void`

### 修改 `index.html`

- 给需要翻译的节点添加 `data-i18n` 或 `data-i18n-html` 属性。
- 在 `#hud` 内增加语言切换按钮 `<button id="lang-toggle">中 / EN</button>`。
- 调整 `body` 字体栈：
  ```css
  font-family: 'SF Mono', 'Menlo', 'Consolas', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', monospace;
  ```
- 为 `#lang-toggle` 增加基础样式。

### 修改 `src/dungeon.ts`

- `tileLabel(type, lang)` 增加 `lang` 参数，根据语言返回对应符号。
- `createDungeonMesh`、`revealTile`、`showLabel` 调用 `tileLabel` 时传入 `i18n.getLang()`。
- `generateDungeon` 生成的 label 随当前语言变化。

### 修改 `src/main.ts`

- 导入 `i18n`。
- 启动时调用 `i18n.init()`。
- `addLog()` 改为接收键名和参数，内部调用 `i18n.t()`。
- `describeTile()` 改为从 `i18n.tileNames` 取值。
- 为 `#lang-toggle` 绑定点击事件，切换语言后调用 `regenerateDungeon()`。

## 翻译字符串示例

| 用途 | 英文 | 中文 |
|------|------|------|
| 标题 | `Gridmaze` | `Gridmaze` |
| 开始界面副标题 | `Escape the dungeon! Reach the Exit on each floor to descend. Clear all 99 floors to win.` | `逃离迷宫！抵达每层出口即可向下。通关全部 99 层即可获胜。` |
| 操作说明 | `WASD / Arrow Keys — Move one tile` | `WASD / 方向键 — 移动一格` |
| 图例标题 | `Tile Types` | `地砖类型` |
| 护盾提示 | `Shield active` | `护盾生效中` |
| 日志：无法移动 | `Cannot move there.` | `无法移动到那里。` |
| 日志：下楼 | `Descended to Floor {floor} / {max}!` | `已抵达第 {floor} / {max} 层！` |
| 日志：获胜 | `You escaped the dungeon!` | `你逃出了迷宫！` |

地砖中文符号：

| TileType | 中文符号 | 英文符号 |
|----------|----------|----------|
| Reset | 回 | ↺ |
| Teleport | 传 | ↗ |
| RandomMap | 乱 | ? |
| Compass | 指 | ⌖ |
| Scan | 扫 | ◎ |
| Shield | 盾 | ◈ |
| Exit | 出 | EX |

## 持久化

使用 `localStorage`：

- 键：`gridmaze-lang`
- 值：`'en'` 或 `'zh'`

## 兼容性

- 仅影响 UI 文本和 3D 标签，不影响游戏逻辑、存档、操作方式。
- 中文符号使用单个字符，Canvas 绘制时字号与现有符号保持一致。
- 字体回退方案保证在 macOS / Windows / Linux 上均可正常显示。

## 验收标准

- [ ] 首次打开时根据浏览器语言自动选择中文或英文。
- [ ] 点击语言按钮可在中文和英文之间切换。
- [ ] 切换后所有 HUD、日志、图例、开始界面文本即时更新。
- [ ] 切换后 3D 地砖标签符号（回/传/乱/指/扫/盾/出）即时更新。
- [ ] 刷新页面后保持上次选择的语言。
- [ ] 英文模式下显示原有英文符号和文本。
- [ ] `npm run build` 无类型错误和构建错误。
