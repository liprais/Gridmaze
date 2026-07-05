# 中文本地化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Gridmaze 增加中英双语切换，包含 HUD、日志、开始界面、图例和 3D 地砖标签的实时翻译，并记住用户选择。

**Architecture：** 新增 `src/i18n.ts` 作为唯一翻译源，通过 `data-i18n` 属性驱动 DOM 文本更新；日志和描述函数使用翻译键；地砖标签在 `dungeon.ts` 中根据当前语言生成；切换语言时重生成地牢以刷新标签。

**Tech Stack：** TypeScript, Vite, Three.js, localStorage

---

## 文件结构

| 文件 | 责任 |
|------|------|
| `src/i18n.ts`（新增） | 定义字典、当前语言状态、翻译函数、切换函数、DOM 应用函数 |
| `index.html`（修改） | 给需要翻译的节点加 `data-i18n`/`data-i18n-html`，增加语言切换按钮和样式 |
| `src/dungeon.ts`（修改） | `tileLabel` 接收语言参数；生成/揭示标签时按当前语言渲染 |
| `src/main.ts`（修改） | 初始化 i18n；改写 `addLog`/`describeTile`；绑定语言切换按钮；切换后重生成地牢 |

---

## Task 1: 创建 `src/i18n.ts` 翻译模块

**Files:**
- Create: `src/i18n.ts`

- [ ] **Step 1: 编写翻译模块**

创建 `src/i18n.ts`，内容如下：

```typescript
export type Lang = 'en' | 'zh';

const STORAGE_KEY = 'gridmaze-lang';

const translations = {
  en: {
    ui: {
      title: 'Gridmaze',
      floor: 'Floor {floor} / {max}',
      floorClear: 'CLEAR!',
      position: 'Position',
      shieldActive: 'Shield active',
      langButton: '中 / EN',
    },
    overlay: {
      subtitle: 'Escape the dungeon!\u003cbr\u003eReach the \u003cspan style="color:#06d6a0"\u003eExit ▨\u003c/span\u003e on each floor to descend.\u003cbr\u003eClear all \u003cb\u003e99 floors\u003c/b\u003e to win.',
      controlsTitle: '▸ Controls',
      controls: '\u003cb\u003eWASD\u003c/b\u003e / \u003cb\u003eArrow Keys\u003c/b\u003e — Move one tile\u003cbr\u003e\u003cb\u003eScroll\u003c/b\u003e — Zoom · \u003cb\u003eRight-drag\u003c/b\u003e — Rotate view\u003cbr\u003e\u003cb\u003eSwipe\u003c/b\u003e on mobile to move',
      tileTypesTitle: '▸ Tile Types',
      dismiss: 'Click anywhere to begin',
    },
    legend: {
      title: 'Tile Types',
      exit: 'Exit',
      empty: 'Empty',
      wall: 'Wall',
      reset: 'Reset',
      resetEffect: '→start',
      teleport: 'Teleport',
      randomMap: 'Random',
      randomMapEffect: 'reshuffle',
      compass: 'Compass',
      compassEffect: '→exit',
      scan: 'Scan',
      scanEffect: 'nearby',
      shield: 'Shield',
      shieldEffect: 'block 1',
    },
    log: {
      cannotMove: 'Cannot move there.',
      moveTo: 'Move to ({x}, {y}) — {tile}',
      escaped: 'You escaped the dungeon!',
      descended: 'Descended to Floor {floor} / {max}!',
      shieldAbsorbed: 'Shield absorbed the effect!',
      sentBack: 'Sent back to start!',
      teleported: 'Teleported to ({x}, {y})!',
      dungeonShifts: 'The dungeon shifts around you...',
      exitLocated: 'Exit located at ({x}, {y})!',
      scanned: 'Scanned nearby area!',
      gainedShield: 'Gained a shield! Next hazard will be blocked.',
      debug: 'Debug: at ({x},{y}) moving={moving} floor={floor}',
      proximity: [
        'You feel a warm breeze... the exit is near.',
        'A faint glow emanates from nearby.',
        'The air feels different here. The exit is close.',
      ],
    },
    tileLabels: {
      [0]: '',        // Empty
      [1]: '↺',       // Reset
      [2]: '↗',       // Teleport
      [3]: '?',       // RandomMap
      [4]: '⌖',       // Compass
      [5]: '◎',       // Scan
      [6]: '◈',       // Shield
      [7]: 'EX',      // Exit
      [8]: '',        // Wall
      [9]: '',        // Start
    },
    tileNames: {
      empty: 'Empty',
      reset: 'Reset',
      teleport: 'Teleport',
      randomMap: 'Random Map',
      compass: 'Compass',
      scan: 'Scan',
      shield: 'Shield',
      exit: 'Exit!',
      start: 'Start',
      unknown: '?',
    },
  },
  zh: {
    ui: {
      title: 'Gridmaze',
      floor: '第 {floor} / {max} 层',
      floorClear: '通关！',
      position: '位置',
      shieldActive: '护盾生效中',
      langButton: 'EN / 中',
    },
    overlay: {
      subtitle: '逃离迷宫！\u003cbr\u003e抵达每层的 \u003cspan style="color:#06d6a0"\u003e出口 ▨\u003c/span\u003e 向下深入。\u003cbr\u003e通关全部 \u003cb\u003e99 层\u003c/b\u003e 即可获胜。',
      controlsTitle: '▸ 操作方式',
      controls: '\u003cb\u003eWASD\u003c/b\u003e / \u003cb\u003e方向键\u003c/b\u003e — 移动一格\u003cbr\u003e\u003cb\u003e滚轮\u003c/b\u003e — 缩放 · \u003cb\u003e右键拖拽\u003c/b\u003e — 旋转视角\u003cbr\u003e手机上 \u003cb\u003e滑动\u003c/b\u003e 移动',
      tileTypesTitle: '▸ 地砖类型',
      dismiss: '点击任意位置开始',
    },
    legend: {
      title: '地砖类型',
      exit: '出口',
      empty: '空地',
      wall: '墙壁',
      reset: '回起点',
      resetEffect: '→起点',
      teleport: '传送',
      randomMap: '随机地图',
      randomMapEffect: '重洗牌',
      compass: '指南针',
      compassEffect: '→出口',
      scan: '扫描',
      scanEffect: '附近',
      shield: '护盾',
      shieldEffect: '挡 1 次',
    },
    log: {
      cannotMove: '无法移动到那里。',
      moveTo: '移动到 ({x}, {y}) — {tile}',
      escaped: '你逃出了迷宫！',
      descended: '已抵达第 {floor} / {max} 层！',
      shieldAbsorbed: '护盾抵消了效果！',
      sentBack: '被送回起点！',
      teleported: '传送到了 ({x}, {y})！',
      dungeonShifts: '迷宫在你周围变幻……',
      exitLocated: '出口位于 ({x}, {y})！',
      scanned: '扫描了附近区域！',
      gainedShield: '获得护盾！下一次危险效果将被阻挡。',
      debug: '调试：位于 ({x},{y}) 移动中={moving} 层数={floor}',
      proximity: [
        '你感到一阵暖风……出口就在附近。',
        '附近散发出微弱的光芒。',
        '这里的空气不一样。出口很近了。',
      ],
    },
    tileLabels: {
      [0]: '',    // Empty
      [1]: '回',  // Reset
      [2]: '传',  // Teleport
      [3]: '乱',  // RandomMap
      [4]: '指',  // Compass
      [5]: '扫',  // Scan
      [6]: '盾',  // Shield
      [7]: '出',  // Exit
      [8]: '',    // Wall
      [9]: '',    // Start
    },
    tileNames: {
      empty: '空地',
      reset: '回起点',
      teleport: '传送',
      randomMap: '随机地图',
      compass: '指南针',
      scan: '扫描',
      shield: '护盾',
      exit: '出口！',
      start: '起点',
      unknown: '?',
    },
  },
};

let currentLang: Lang = 'en';

function detectDefaultLang(): Lang {
  if (typeof navigator !== 'undefined' \u0026\u0026 navigator.language \u0026\u0026 navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lang);
  }
  applyTranslations();
}

export function init(): Lang {
  let saved: Lang | null = null;
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'en' || raw === 'zh') saved = raw;
  }
  currentLang = saved ?? detectDefaultLang();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, currentLang);
  }
  applyTranslations();
  return currentLang;
}

export function t(key: string, params?: Record\u003cstring, string | number\u003e): string {
  const dict = translations[currentLang] as any;
  const parts = key.split('.');
  let value: any = dict;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') return key;
    value = value[part];
  }
  if (typeof value !== 'string') return key;

  if (params) {
    return value.replace(/\{([^{}]+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
  }
  return value;
}

export function applyTranslations(): void {
  if (typeof document === 'undefined') return;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    el.textContent = t(key);
  });

  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (!key) return;
    el.innerHTML = t(key);
  });
}

export function getTileLabel(type: number): string {
  return translations[currentLang].tileLabels[type as keyof typeof translations.en.tileLabels] ?? '';
}

export function getTileName(key: keyof typeof translations.en.tileNames): string {
  return translations[currentLang].tileNames[key] ?? key;
}

export function getProximityMessage(index: number): string {
  const msgs = translations[currentLang].log.proximity;
  return msgs[index % msgs.length];
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无新增错误（此时模块未被导入，不会报错）。

- [ ] **Step 3: Commit**

```bash
git add src/i18n.ts
git commit -m "feat(i18n): add translation module with en/zh dictionaries"
```

---

## Task 2: 修改 `index.html` 增加翻译标记和语言按钮

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 修改 body 字体栈**

将 `body` 的 `font-family` 从 `monospace` 改为：

```css
font-family: 'SF Mono', 'Menlo', 'Consolas', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', monospace;
```

- [ ] **Step 2: 给 overlay 节点添加翻译属性**

将 `#overlay-card` 内需要翻译的节点修改如下：

```html
\u003ch1\u003eGridmaze\u003c/h1\u003e
\u003cdiv class="subtitle" data-i18n-html="overlay.subtitle"\u003e
  Escape the dungeon!\u003cbr\u003eReach the \u003cspan style="color:#06d6a0"\u003eExit ▨\u003c/span\u003e on each floor to descend.\u003cbr\u003eClear all \u003cb\u003e99 floors\u003c/b\u003e to win.
\u003c/div\u003e

\u003ch3 data-i18n="overlay.controlsTitle"\u003e▸ Controls\u003c/h3\u003e
\u003cp data-i18n-html="overlay.controls"\u003e
  \u003cb\u003eWASD\u003c/b\u003e / \u003cb\u003eArrow Keys\u003c/b\u003e — Move one tile\u003cbr\u003e
  \u003cb\u003eScroll\u003c/b\u003e — Zoom · \u003cb\u003eRight-drag\u003c/b\u003e — Rotate view\u003cbr\u003e
  \u003cb\u003eSwipe\u003c/b\u003e on mobile to move
\u003c/p\u003e

\u003ch3 data-i18n="overlay.tileTypesTitle"\u003e▸ Tile Types\u003c/h3\u003e

\u003cdiv class="dismiss" data-i18n="overlay.dismiss"\u003eClick anywhere to begin\u003c/div\u003e
```

- [ ] **Step 3: 修改 HUD 增加语言按钮**

将 `#hud` 区域改为：

```html
\u003cdiv id="hud"\u003e
  \u003cdiv style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;"\u003e
    \u003cdiv\u003e
      \u003cdiv class="title"\u003eGridmaze\u003c/div\u003e
      \u003cdiv data-i18n-html="ui.floor"\u003eFloor \u003cspan id="floor-num"\u003e1 / 99\u003c/span\u003e\u003c/div\u003e
      \u003cdiv\u003e\u003cspan data-i18n="ui.position"\u003ePosition\u003c/span\u003e \u003cspan class="coord" id="player-pos"\u003e0,0\u003c/span\u003e\u003c/div\u003e
      \u003cdiv id="shield-indicator" style="color:#ffd166;opacity:0" data-i18n="ui.shieldActive"\u003eShield active\u003c/div\u003e
    \u003c/div\u003e
    \u003cbutton id="lang-toggle" data-i18n="ui.langButton"\u003e中 / EN\u003c/button\u003e
  \u003c/div\u003e
\u003c/div\u003e
```

- [ ] **Step 4: 给 legend 节点添加翻译属性**

将 `#legend` 区域改为：

```html
\u003cdiv id="legend"\u003e
  \u003cdiv class="legend-title" data-i18n="legend.title"\u003eTile Types\u003c/div\u003e
  \u003cdiv class="legend-row"\u003e\u003cspan class="legend-swatch" style="background:#06d6a0"\u003e\u003c/span\u003e \u003cspan data-i18n="legend.exit"\u003eExit\u003c/span\u003e\u003c/div\u003e
  \u003cdiv class="legend-row"\u003e\u003cspan class="legend-swatch" style="background:#eeeeee"\u003e\u003c/span\u003e \u003cspan data-i18n="legend.empty"\u003eEmpty\u003c/span\u003e\u003c/div\u003e
  \u003cdiv class="legend-row"\u003e\u003cspan class="legend-swatch" style="background:#1a1a2e"\u003e\u003c/span\u003e \u003cspan data-i18n="legend.wall"\u003eWall\u003c/span\u003e\u003c/div\u003e
  \u003cdiv class="legend-row"\u003e\u003cspan class="legend-swatch" style="background:#457b9d"\u003e\u003c/span\u003e \u003cspan data-i18n="legend.reset"\u003eReset\u003c/span\u003e \u003cspan class="legend-effect" data-i18n="legend.resetEffect"\u003e→start\u003c/span\u003e\u003c/div\u003e
  \u003cdiv class="legend-row"\u003e\u003cspan class="legend-swatch" style="background:#9b5de5"\u003e\u003c/span\u003e \u003cspan data-i18n="legend.teleport"\u003eTeleport\u003c/span\u003e\u003c/div\u003e
  \u003cdiv class="legend-row"\u003e\u003cspan class="legend-swatch" style="background:#e63946"\u003e\u003c/span\u003e \u003cspan data-i18n="legend.randomMap"\u003eRandom\u003c/span\u003e \u003cspan class="legend-effect" data-i18n="legend.randomMapEffect"\u003ereshuffle\u003c/span\u003e\u003c/div\u003e
  \u003cdiv class="legend-row"\u003e\u003cspan class="legend-swatch" style="background:#f4a261"\u003e\u003c/span\u003e \u003cspan data-i18n="legend.compass"\u003eCompass\u003c/span\u003e \u003cspan class="legend-effect" data-i18n="legend.compassEffect"\u003e→exit\u003c/span\u003e\u003c/div\u003e
  \u003cdiv class="legend-row"\u003e\u003cspan class="legend-swatch" style="background:#00bbf9"\u003e\u003c/span\u003e \u003cspan data-i18n="legend.scan"\u003eScan\u003c/span\u003e \u003cspan class="legend-effect" data-i18n="legend.scanEffect"\u003enearby\u003c/span\u003e\u003c/div\u003e
  \u003cdiv class="legend-row"\u003e\u003cspan class="legend-swatch" style="background:#ffd166"\u003e\u003c/span\u003e \u003cspan data-i18n="legend.shield"\u003eShield\u003c/span\u003e \u003cspan class="legend-effect" data-i18n="legend.shieldEffect"\u003eblock 1\u003c/span\u003e\u003c/div\u003e
\u003c/div\u003e
```

- [ ] **Step 5: 添加语言按钮样式**

在 `\u003cstyle\u003e` 内新增：

```css
#lang-toggle {
  background: rgba(240, 240, 245, 0.9);
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: 6px;
  padding: 4px 10px;
  font-family: inherit;
  font-size: 13px;
  color: #111;
  cursor: pointer;
  pointer-events: auto;
}
#lang-toggle:hover {
  background: rgba(255, 255, 255, 1);
}
```

- [ ] **Step 6: 验证 HTML 无语法错误**

Run: `npx vite build`
Expected: 构建成功（HTML 语法问题会在构建阶段暴露）。

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(i18n): add translation markers and language toggle button"
```

---

## Task 3: 修改 `src/dungeon.ts` 支持按语言生成标签

**Files:**
- Modify: `src/dungeon.ts`

- [ ] **Step 1: 导入 i18n 并修改 tileLabel 签名**

在文件顶部添加：

```typescript
import { getLang, getTileLabel } from './i18n';
```

将 `tileLabel` 函数改为：

```typescript
function tileLabel(type: TileType): string {
  switch (type) {
    case TileType.Reset:     return getTileLabel(TileType.Reset);
    case TileType.Teleport:  return getTileLabel(TileType.Teleport);
    case TileType.RandomMap: return getTileLabel(TileType.RandomMap);
    case TileType.Compass:   return getTileLabel(TileType.Compass);
    case TileType.Scan:      return getTileLabel(TileType.Scan);
    case TileType.Shield:    return getTileLabel(TileType.Shield);
    case TileType.Empty:     return Math.random() \u003c 0.1 ? String(Math.floor(Math.random() * 9)) : '';
    default:                 return '';
  }
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/dungeon.ts
git commit -m "feat(i18n): make tile labels respect current language"
```

---

## Task 4: 修改 `src/main.ts` 接入 i18n

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: 导入 i18n 模块**

在文件顶部添加：

```typescript
import { init as initI18n, setLang, getLang, t, getTileName, getProximityMessage } from './i18n';
```

- [ ] **Step 2: 初始化 i18n**

在 `// ── Start overlay ────────────────────────────────────────────` 之前（或文件顶部合适位置）添加：

```typescript
// ── i18n ─────────────────────────────────────────────────────
initI18n();
```

- [ ] **Step 3: 修改 updateHUD**

将 `updateHUD` 改为：

```typescript
function updateHUD() {
  hudPos.textContent = `${player.x},${player.y}`;

  if (gameWon) {
    hudFloor.textContent = t('ui.floorClear');
    hudFloor.style.color = '#06d6a0';
  } else {
    hudFloor.textContent = t('ui.floor', { floor: floorNum, max: MAX_FLOOR });
    hudFloor.style.color = '';
  }

  hudShield.style.opacity = player.hasShield ? '1' : '0';
}
```

- [ ] **Step 4: 修改 addLog 和 describeTile**

将 `describeTile` 改为：

```typescript
function describeTile(type: TileType, label: string): string {
  switch (type) {
    case TileType.Empty:     return label ? `${t('tileNames.empty')} ${label}` : getTileName('empty');
    case TileType.Reset:     return getTileName('reset');
    case TileType.Teleport:  return getTileName('teleport');
    case TileType.RandomMap: return getTileName('randomMap');
    case TileType.Compass:   return getTileName('compass');
    case TileType.Scan:      return getTileName('scan');
    case TileType.Shield:    return getTileName('shield');
    case TileType.Exit:      return getTileName('exit');
    case TileType.Start:     return getTileName('start');
    default:                 return getTileName('unknown');
  }
}
```

- [ ] **Step 5: 替换所有日志字符串为翻译键**

在 `handleInput` 和 `window.addEventListener('keydown', ...)` 中，把硬编码日志替换：

1. `addLog('▌ Cannot move there.');` → `addLog('▌ ' + t('log.cannotMove'));`
2. `addLog(\`▌ Move to (${action.x}, ${action.y}) — ${describeTile(action.tileType, action.label)}\`);` → `addLog('▌ ' + t('log.moveTo', { x: action.x, y: action.y, tile: describeTile(action.tileType, action.label) }));`
3. `addLog('▌ You escaped the dungeon!');` → `addLog('▌ ' + t('log.escaped'));`
4. `addLog(\`▌ Descended to Floor ${floorNum} / ${MAX_FLOOR}!\`);` → `addLog('▌ ' + t('log.descended', { floor: floorNum, max: MAX_FLOOR }));`
5. `addLog('▌ Shield absorbed the effect!');` → `addLog('▌ ' + t('log.shieldAbsorbed'));`
6. `addLog('▌ Sent back to start!');` → `addLog('▌ ' + t('log.sentBack'));`
7. `addLog(\`▌ Teleported to (${tx}, ${ty})!\`);` → `addLog('▌ ' + t('log.teleported', { x: tx, y: ty }));`
8. `addLog('▌ The dungeon shifts around you...');` → `addLog('▌ ' + t('log.dungeonShifts'));`
9. `addLog(\`▌ Exit located at (${ex}, ${ey})!\`);` → `addLog('▌ ' + t('log.exitLocated', { x: ex, y: ey }));`
10. `addLog('▌ Scanned nearby area!');` → `addLog('▌ ' + t('log.scanned'));`
11. `addLog('▌ Gained a shield! Next hazard will be blocked.');` → `addLog('▌ ' + t('log.gainedShield'));`
12. Debug 日志：
    ```typescript
    addLog('▌ ' + t('log.debug', { x: player.x, y: player.y, moving: player.isMoving ? 1 : 0, floor: floorNum }));
    ```
13. 近出口提示：
    ```typescript
    addLog('▌ ' + getProximityMessage(Math.floor(Math.random() * 3)));
    ```

- [ ] **Step 6: 绑定语言切换按钮**

在 `// ── Start overlay ────────────────────────────────────────────` 之前添加：

```typescript
const langToggle = document.getElementById('lang-toggle')!;
langToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const next = getLang() === 'en' ? 'zh' : 'en';
  setLang(next);
  regenerateDungeon();
});
```

- [ ] **Step 7: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 8: Commit**

```bash
git add src/main.ts
git commit -m "feat(i18n): wire up i18n to HUD, logs, and language toggle"
```

---

## Task 5: 端到端验证

**Files:**
- None (verification only)

- [ ] **Step 1: 构建验证**

Run: `npm run build`
Expected: `dist/` 生成成功，终端无类型错误。

- [ ] **Step 2: 启动开发服务器手动验证**

Run: `npm run dev`
打开浏览器访问终端输出的本地地址。

验证清单：
- [ ] 首次打开时根据浏览器语言显示中文或英文。
- [ ] 点击右上角语言按钮切换语言。
- [ ] 切换后 HUD、开始界面、图例文本变为对应语言。
- [ ] 切换后 3D 地砖标签（如 Reset 从 ↺ 变为 回）更新。
- [ ] 移动、触发事件时日志为当前语言。
- [ ] 刷新页面后保持上次选择的语言（通过 `localStorage`）。
- [ ] 英文模式下显示原有英文符号和文本。

- [ ] **Step 3: Commit 验证结果或截图（可选）**

如果测试通过：

```bash
git commit --allow-empty -m "test(i18n): verify bilingual toggle end-to-end"
```

---

## Self-Review

1. **Spec coverage**
   - 双语切换：Task 4 Step 6 绑定按钮，Task 1 提供字典。
   - 界面按钮切换：Task 2 Step 3。
   - localStorage 记住：Task 1 `setLang` / `init`。
   - 3D 地砖标签随语言切换：Task 3 + Task 4 切换后 `regenerateDungeon()`。
   - 系统中文字体：Task 2 Step 1。
   - 自动检测浏览器语言：Task 1 `detectDefaultLang()`。
   - 标题保持英文：Task 1 字典中 `ui.title` 和 HTML `h1` 均未汉化。
   - 验收标准：Task 5 覆盖。

2. **Placeholder scan**
   - 无 TBD、TODO、implement later。
   - 每个步骤包含具体代码/命令/预期输出。

3. **类型一致性**
   - `getTileLabel(type: number)` 与 `TileType` 枚举值一致。
   - `getTileName(key: keyof typeof translations.en.tileNames)` 与 `tileNames` 键一致。
   - `t` 的参数类型为 `Record<string, string | number>`，与使用处一致。
