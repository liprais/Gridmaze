# Gridmaze 第一章纵向切片实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 P0/P1 代码基础上实现可玩的 11 层第一章切片，包含一次性奖励地砖、隐藏数据核心、稳定度、三个区域规则变化、第 5 层遗物选择与首批 6 个规则型遗物。

**Architecture:** 所有新规则收敛到 `src/game/` 下的纯逻辑模块（engine/generation/chapter/relics），`src/main.ts` 只负责把引擎事件翻译为 Three.js 渲染和 DOM 更新。数据模型扩展 `consumed`、`coreX/Y`、`stability`、`relics` 等字段；区域规则通过 `chapter.ts` 按楼层查询；遗物效果通过 `relics.ts` 集中计算，便于测试。

**Tech Stack:** TypeScript, Vite, Three.js, Vitest

---

## 文件结构

| 文件 | 责任 |
|------|------|
| `src/types.ts` | 扩展 `Tile`（`consumed`）、`DungeonData`（`coreX/coreY`），新增 `RelicId` 联合类型。 |
| `src/game/chapter.ts` | 定义第一章三个区域的规则（revealRadius、RandomMap 权重加成、预警开关），提供 `getChapterRules(floor)`。 |
| `src/game/relics.ts` | 定义首批 6 个遗物的 ID、名称、效果描述；提供 `revealRadiusBonus`、`isTeleportSafe`、`shouldWarnHazard` 等计算函数。 |
| `src/game/generation.ts` | 扩展地图生成：按楼层应用区域权重、放置数据核心（封锁测试 + 回退重生成）、处理 RandomMap 后核心生命周期。 |
| `src/game/engine.ts` | 扩展 `EngineState`；处理一次性地砖消耗、核心收集、稳定度扣减/恢复、章节失败、遗物选择事件。 |
| `src/dungeon.ts` | 暗区中显示相邻 Wall 轮廓；一次性地砖消耗后把 mesh 颜色/标签更新为 Empty。 |
| `src/main.ts` | 新增 HUD（稳定度、核心距离、核心计数、出口箭头）；渲染遗物选择覆盖层；处理危险预警标记。 |
| `src/i18n.ts` | 增加中英文文案：稳定度、核心距离、遗物名称/描述、区域提示、失败提示等。 |
| `index.html` | 增加稳定度、核心距离、核心计数、出口箭头的 DOM 元素；增加遗物选择覆盖层。 |
| `src/__tests__/chapter.test.ts` | 区域规则测试。 |
| `src/__tests__/relics.test.ts` | 遗物效果计算测试。 |
| `src/__tests__/generation.test.ts` | 核心放置规则测试（扩展已有文件）。 |
| `src/__tests__/engine.test.ts` | 一次性地砖、稳定度、核心收集、失败回退测试（扩展已有文件）。 |

---

## Task 1: 扩展类型定义

**Files:**
- Modify: `src/types.ts`
- Test: `src/__tests__/engine.test.ts`（间接使用）

- [ ] **Step 1: 在 `Tile` 接口增加 `consumed`**

```ts
export interface Tile {
  x: number;
  y: number;
  type: TileType;
  label: string;
  explored: boolean;
  steppedOn: boolean;
  consumed: boolean;
}
```

- [ ] **Step 2: 在 `DungeonData` 接口增加核心坐标**

```ts
export interface DungeonData {
  width: number;
  height: number;
  exitX: number;
  exitY: number;
  coreX: number;
  coreY: number;
  tiles: Tile[][];
}
```

- [ ] **Step 3: 新增 `RelicId` 联合类型与 `ChapterZone` 类型**

```ts
export type RelicId =
  | 'afterglow'
  | 'backupShield'
  | 'stableAnchor'
  | 'teleportCalib'
  | 'exitWhisper'
  | 'deepCache';

export type ChapterZone = 'survey' | 'dark' | 'unstable';
```

- [ ] **Step 4: 运行 TypeScript 检查确认无拼写错误**

Run: `npx tsc --noEmit`
Expected: 仅因后续未实现字段使用而产生的错误；若此时报错超过 10 条，检查拼写。

- [ ] **Step 5: Commit**

```bash
git add src/types.ts
git commit -m "types: add consumed flag, core coords, RelicId, ChapterZone"
```

---

## Task 2: 区域规则模块

**Files:**
- Create: `src/game/chapter.ts`
- Test: `src/__tests__/chapter.test.ts`

- [ ] **Step 1: 写失败测试 `src/__tests__/chapter.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { getZoneForFloor, getChapterRules, ChapterZone } from '../game/chapter';

describe('chapter rules', () => {
  it('maps floors to zones', () => {
    expect(getZoneForFloor(1)).toBe('survey');
    expect(getZoneForFloor(4)).toBe('survey');
    expect(getZoneForFloor(5)).toBe('dark');
    expect(getZoneForFloor(8)).toBe('dark');
    expect(getZoneForFloor(9)).toBe('unstable');
    expect(getZoneForFloor(11)).toBe('unstable');
  });

  it('survey has reveal radius 1 and no warning', () => {
    const rules = getChapterRules(2);
    expect(rules.revealRadius).toBe(1);
    expect(rules.warnRandomMap).toBe(false);
    expect(rules.randomMapWeightBonus).toBe(0);
  });

  it('dark has reveal radius 0', () => {
    const rules = getChapterRules(6);
    expect(rules.revealRadius).toBe(0);
    expect(rules.showAdjacentWalls).toBe(true);
  });

  it('unstable boosts RandomMap and enables warning', () => {
    const rules = getChapterRules(10);
    expect(rules.randomMapWeightBonus).toBeGreaterThan(0);
    expect(rules.warnRandomMap).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/__tests__/chapter.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/game/chapter.ts`**

```ts
import { ChapterZone } from '../types';

export interface ChapterRules {
  zone: ChapterZone;
  revealRadius: number;
  /** Dark zone: always show wall silhouettes in the four adjacent tiles. */
  showAdjacentWalls: boolean;
  randomMapWeightBonus: number;
  warnRandomMap: boolean;
}

export function getZoneForFloor(floor: number): ChapterZone {
  if (floor >= 1 && floor <= 4) return 'survey';
  if (floor >= 5 && floor <= 8) return 'dark';
  return 'unstable';
}

export function getChapterRules(floor: number): ChapterRules {
  const zone = getZoneForFloor(floor);
  switch (zone) {
    case 'survey':
      return { zone, revealRadius: 1, showAdjacentWalls: false, randomMapWeightBonus: 0, warnRandomMap: false };
    case 'dark':
      return { zone, revealRadius: 0, showAdjacentWalls: true, randomMapWeightBonus: 0, warnRandomMap: false };
    case 'unstable':
      return { zone, revealRadius: 1, showAdjacentWalls: false, randomMapWeightBonus: 12, warnRandomMap: true };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:run -- src/__tests__/chapter.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/game/chapter.ts src/__tests__/chapter.test.ts
git commit -m "feat(chapter): add zone rules for chapter 1"
```

---

## Task 3: 遗物定义模块

**Files:**
- Create: `src/game/relics.ts`
- Test: `src/__tests__/relics.test.ts`

- [ ] **Step 1: 写失败测试 `src/__tests__/relics.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  ALL_RELICS,
  getRelicChoiceCount,
  getRevealRadiusBonus,
  isTeleportSafe,
  getExitWhisperDirection,
  shouldGainBackupShield,
  shouldResetCostStability,
  deepCacheRestoresStability,
} from '../game/relics';
import type { RelicId } from '../types';

describe('relics', () => {
  it('has 6 relics', () => {
    expect(ALL_RELICS.length).toBe(6);
  });

  it('choice count scales with cores', () => {
    expect(getRelicChoiceCount(0)).toBe(2);
    expect(getRelicChoiceCount(3)).toBe(2);
    expect(getRelicChoiceCount(4)).toBe(3);
    expect(getRelicChoiceCount(7)).toBe(3);
    expect(getRelicChoiceCount(8)).toBe(3);
  });

  it('afterglow adds reveal radius', () => {
    expect(getRevealRadiusBonus(['afterglow'])).toBe(1);
    expect(getRevealRadiusBonus([])).toBe(0);
  });

  it('teleport calibration avoids hazards', () => {
    expect(isTeleportSafe(['teleportCalib'])).toBe(true);
    expect(isTeleportSafe([])).toBe(false);
  });

  it('exit whisper returns screen-relative direction', () => {
    const dir = getExitWhisperDirection(
      { playerX: 0, playerY: 0, exitX: 2, exitY: 0, cameraAngle: 0 },
      ['exitWhisper'],
    );
    expect(dir).toBe('right');
  });

  it('backup shield granted at chapter start', () => {
    expect(shouldGainBackupShield(['backupShield'])).toBe(true);
    expect(shouldGainBackupShield([])).toBe(false);
  });

  it('stable anchor skips first reset stability cost', () => {
    expect(shouldResetCostStability(['stableAnchor'], 0)).toBe(false);
    expect(shouldResetCostStability(['stableAnchor'], 1)).toBe(true);
    expect(shouldResetCostStability([], 0)).toBe(true);
  });

  it('deep cache restores stability every 3 cores', () => {
    expect(deepCacheRestoresStability(['deepCache'], 2)).toBe(0);
    expect(deepCacheRestoresStability(['deepCache'], 3)).toBe(1);
    expect(deepCacheRestoresStability(['deepCache'], 6)).toBe(2);
    expect(deepCacheRestoresStability([], 3)).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/__tests__/relics.test.ts`
Expected: FAIL，模块/函数不存在。

- [ ] **Step 3: 实现 `src/game/relics.ts`**

```ts
import { RelicId } from '../types';

export interface RelicInfo {
  id: RelicId;
  nameKey: string;
  descKey: string;
}

export const ALL_RELICS: RelicInfo[] = [
  { id: 'afterglow', nameKey: 'relic.afterglow.name', descKey: 'relic.afterglow.desc' },
  { id: 'backupShield', nameKey: 'relic.backupShield.name', descKey: 'relic.backupShield.desc' },
  { id: 'stableAnchor', nameKey: 'relic.stableAnchor.name', descKey: 'relic.stableAnchor.desc' },
  { id: 'teleportCalib', nameKey: 'relic.teleportCalib.name', descKey: 'relic.teleportCalib.desc' },
  { id: 'exitWhisper', nameKey: 'relic.exitWhisper.name', descKey: 'relic.exitWhisper.desc' },
  { id: 'deepCache', nameKey: 'relic.deepCache.name', descKey: 'relic.deepCache.desc' },
];

export function getRelicChoiceCount(coresThisChapter: number): number {
  if (coresThisChapter <= 3) return 2;
  return 3;
}

export function canRefreshChoices(coresThisChapter: number): boolean {
  return coresThisChapter >= 8;
}

export function hasRelic(relics: RelicId[], id: RelicId): boolean {
  return relics.includes(id);
}

export function getRevealRadiusBonus(relics: RelicId[]): number {
  return hasRelic(relics, 'afterglow') ? 1 : 0;
}

export function shouldGainBackupShield(relics: RelicId[]): boolean {
  return hasRelic(relics, 'backupShield');
}

export function shouldResetCostStability(relics: RelicId[], resetsThisChapter: number): boolean {
  if (hasRelic(relics, 'stableAnchor') && resetsThisChapter === 0) return false;
  return true;
}

export function isTeleportSafe(relics: RelicId[]): boolean {
  return hasRelic(relics, 'teleportCalib');
}

export function deepCacheRestoresStability(relics: RelicId[], totalCores: number): number {
  if (!hasRelic(relics, 'deepCache')) return 0;
  return Math.floor(totalCores / 3);
}

export function getExitWhisperDirection(
  input: { playerX: number; playerY: number; exitX: number; exitY: number; cameraAngle: number },
  relics: RelicId[],
): 'up' | 'down' | 'left' | 'right' | null {
  if (!hasRelic(relics, 'exitWhisper')) return null;
  const dist = Math.abs(input.playerX - input.exitX) + Math.abs(input.playerY - input.exitY);
  if (dist > 2) return null;

  const dx = input.exitX - input.playerX;
  const dy = input.exitY - input.playerY;
  const worldAngle = Math.atan2(dx, dy); // 0 = +y (down in grid), pi/2 = +x (right)
  const screenAngle = worldAngle - input.cameraAngle;

  const norm = ((screenAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (norm <= Math.PI / 4 || norm >= Math.PI * 7 / 4) return 'down';
  if (norm <= Math.PI * 3 / 4) return 'right';
  if (norm <= Math.PI * 5 / 4) return 'up';
  return 'left';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:run -- src/__tests__/relics.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/game/relics.ts src/__tests__/relics.test.ts
git commit -m "feat(relics): define first 6 relics and effect helpers"
```

---

## Task 4: 核心放置与区域权重

**Files:**
- Modify: `src/game/generation.ts`
- Modify: `src/game/config.ts`
- Test: `src/__tests__/generation.test.ts`

- [ ] **Step 1: 写失败测试（追加到 `src/__tests__/generation.test.ts`）**

```ts
import { describe, it, expect } from 'vitest';
import { TileType } from '../types';
import { createRNG } from '../game/rng';
import { generateDungeon } from '../game/generation';

describe('data core placement', () => {
  it('core is reachable and not the exit tile', () => {
    const d = generateDungeon(12, 12, 2, createRNG(777));
    expect(d.coreX).toBeGreaterThanOrEqual(0);
    expect(d.coreX).toBeLessThan(12);
    expect(d.coreY).toBeGreaterThanOrEqual(0);
    expect(d.coreY).toBeLessThan(12);
    expect(d.coreX !== d.exitX || d.coreY !== d.exitY).toBe(true);
    const coreTile = d.tiles[d.coreY][d.coreX];
    expect(coreTile.type).toBe(TileType.Empty);
  });

  it('blocking the core tile still leaves a path from start to exit', () => {
    const d = generateDungeon(12, 12, 2, createRNG(888));
    const grid = d.tiles.map(row => row.map(t => t.type));
    grid[d.coreY][d.coreX] = TileType.Wall;
    expect(hasPath(grid, 12, 12, 0, 0, d.exitX, d.exitY)).toBe(true);
  });

  it('unstable zone has more random maps than survey', () => {
    let unstableMaps = 0;
    let surveyMaps = 0;
    for (let i = 0; i < 50; i++) {
      const u = generateDungeon(12, 12, 10, createRNG(i + 1));
      const s = generateDungeon(12, 12, 2, createRNG(i + 1));
      unstableMaps += countType(u, TileType.RandomMap);
      surveyMaps += countType(s, TileType.RandomMap);
    }
    expect(unstableMaps).toBeGreaterThan(surveyMaps);
  });
});

function countType(d: any, type: TileType) {
  return d.tiles.flat().filter((t: any) => t.type === type).length;
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/__tests__/generation.test.ts`
Expected: FAIL，`generateDungeon` 未返回 `coreX/coreY`。

- [ ] **Step 3: 修改 `src/game/config.ts` 导出区域权重加成参数**

保持 `scaledForFloor` 签名不变，在 `src/game/generation.ts` 中根据 `ChapterRules` 调整。

- [ ] **Step 4: 修改 `src/game/generation.ts` 核心放置与区域权重**

在 `generateDungeon` 中：
1. 根据 `floor` 取得 `ChapterRules`。
2. 调用 `scaledForFloor(floor)` 后，若 `randomMapWeightBonus > 0`，给 RandomMap 权重加对应值。
3. 地图生成成功后，调用 `placeCore(dungeon)`。
4. 若 `placeCore` 返回 null，重新生成（限制最大重试次数）。
5. 在返回的 `DungeonData` 上设置 `coreX/coreY`。

新增辅助函数：

```ts
function placeCore(dungeon: DungeonData, rng: RNG): { x: number; y: number } | null {
  const grid = dungeon.tiles.map(row => row.map(t => t.type));
  const candidates: { x: number; y: number }[] = [];

  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      if (x === 0 && y === 0) continue;
      if (x === dungeon.exitX && y === dungeon.exitY) continue;
      if (dungeon.tiles[y][x].type === TileType.Wall) continue;
      if (!hasPath(grid, dungeon.width, dungeon.height, 0, 0, x, y)) continue;

      const blocked = grid.map(row => [...row]);
      blocked[y][x] = TileType.Wall;
      if (hasPath(blocked, dungeon.width, dungeon.height, 0, 0, dungeon.exitX, dungeon.exitY)) {
        candidates.push({ x, y });
      }
    }
  }

  if (candidates.length === 0) return null;
  return candidates[rng.nextInt(candidates.length)];
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test:run -- src/__tests__/generation.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/game/generation.ts src/game/config.ts src/__tests__/generation.test.ts
git commit -m "feat(generation): place data core with lockout test and zone weights"
```

---

## Task 5: 引擎状态扩展与一次性地砖

**Files:**
- Modify: `src/game/engine.ts`
- Modify: `src/__tests__/engine.test.ts`

- [ ] **Step 1: 写失败测试（追加到 `src/__tests__/engine.test.ts`）**

```ts
import { describe, it, expect } from 'vitest';
import { TileType } from '../types';
import { createRNG } from '../game/rng';
import { processMove, createInitialState } from '../game/engine';

function makeTestDungeon(overrides?: any) { /* 保持测试文件内已有 helper 不变 */ }
function makeState(overrides?: any) { /* 保持已有 helper 不变 */ }

describe('consumed tiles', () => {
  it('compass becomes empty after use', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, { type: TileType.Compass }]], width: 2, height: 1, exitX: 0, exitY: 0 });
    const state = makeState({ dungeon, playerX: 0, playerY: 0 });
    const result = processMove(state, 1, 0, createRNG(1));
    const tile = result.state.dungeon.tiles[0][1];
    expect(tile.type).toBe(TileType.Empty);
    expect(tile.consumed).toBe(true);
    expect(result.events.some(e => e.kind === 'tile_consumed')).toBe(true);
  });

  it('shield tile refreshes shield and is consumed even if already shielded', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, { type: TileType.Shield }]], width: 2, height: 1 });
    const state = makeState({ dungeon, playerX: 0, playerY: 0, hasShield: true });
    const result = processMove(state, 1, 0, createRNG(1));
    expect(result.state.hasShield).toBe(true);
    expect(result.state.dungeon.tiles[0][1].type).toBe(TileType.Empty);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/__tests__/engine.test.ts`
Expected: FAIL，状态/事件不存在。

- [ ] **Step 3: 扩展 `EngineState` 与 `GameEvent`**

```ts
export interface EngineState {
  playerX: number;
  playerY: number;
  floor: number;
  hasShield: boolean;
  stability: number;
  coresThisChapter: number;
  totalCores: number;
  relics: RelicId[];
  resetsThisChapter: number;
  coreCollectedThisFloor: boolean;
  dungeon: DungeonData;
  gameWon: boolean;
  chapterFailed: boolean;
}

export type GameEvent =
  | ... // 现有事件
  | { kind: 'tile_consumed'; x: number; y: number }
  | { kind: 'core_collected'; x: number; y: number }
  | { kind: 'stability_lost'; amount: number; remaining: number }
  | { kind: 'chapter_failed' }
  | { kind: 'relic_choice'; options: RelicId[]; canRefresh: boolean }
  | { kind: 'relic_gained'; relic: RelicId }
  | { kind: 'hazard_warned'; x: number; y: number; tileType: TileType }
  ;
```

- [ ] **Step 4: 修改 `createInitialState` 初始化新字段**

```ts
return {
  playerX: 0,
  playerY: 0,
  floor: 1,
  hasShield: false,
  stability: 3,
  coresThisChapter: 0,
  totalCores: 0,
  relics: [],
  resetsThisChapter: 0,
  coreCollectedThisFloor: false,
  dungeon,
  gameWon: false,
  chapterFailed: false,
};
```

- [ ] **Step 5: 在 `processMove` 中处理一次性地砖**

在 Compass / Scan / Shield 分支末尾加入：

```ts
next.dungeon.tiles[ny][nx].consumed = true;
next.dungeon.tiles[ny][nx].type = TileType.Empty;
next.dungeon.tiles[ny][nx].label = '';
events.push({ kind: 'tile_consumed', x: nx, y: ny });
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run test:run -- src/__tests__/engine.test.ts`
Expected: PASS（一次性地砖相关）。

- [ ] **Step 7: Commit**

```bash
git add src/game/engine.ts src/__tests__/engine.test.ts
git commit -m "feat(engine): expand state and consume one-time reward tiles"
```

---

## Task 6: 稳定度、核心收集与章节失败

**Files:**
- Modify: `src/game/engine.ts`
- Modify: `src/__tests__/engine.test.ts`

- [ ] **Step 1: 写失败测试（追加到 `src/__tests__/engine.test.ts`）**

```ts
describe('stability', () => {
  it('reset without shield costs 1 stability', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, { type: TileType.Reset }]], width: 2, height: 1 });
    const state = makeState({ dungeon, stability: 3 });
    const result = processMove(state, 1, 0, createRNG(1));
    expect(result.state.stability).toBe(2);
    expect(result.events.some(e => e.kind === 'stability_lost')).toBe(true);
  });

  it('teleport without shield costs 1 stability', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, { type: TileType.Teleport }, {}]], width: 3, height: 1 });
    const state = makeState({ dungeon, stability: 2 });
    const result = processMove(state, 1, 0, createRNG(1));
    expect(result.state.stability).toBe(1);
  });

  it('random map does not cost stability', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, { type: TileType.RandomMap }]], width: 2, height: 1 });
    const state = makeState({ dungeon, stability: 2 });
    const result = processMove(state, 1, 0, createRNG(1));
    expect(result.state.stability).toBe(2);
  });

  it('shield absorbs hazard without losing stability', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, { type: TileType.Reset }]], width: 2, height: 1 });
    const state = makeState({ dungeon, stability: 1, hasShield: true });
    const result = processMove(state, 1, 0, createRNG(1));
    expect(result.state.stability).toBe(1);
    expect(result.state.hasShield).toBe(false);
  });

  it('stability reaching 0 triggers chapter_failed', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, { type: TileType.Reset }]], width: 2, height: 1 });
    const state = makeState({ dungeon, stability: 1 });
    const result = processMove(state, 1, 0, createRNG(1));
    expect(result.state.stability).toBe(0);
    expect(result.state.chapterFailed).toBe(true);
    expect(result.events.some(e => e.kind === 'chapter_failed')).toBe(true);
  });
});

describe('data core', () => {
  it('collecting core increments counters and emits event', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, {}]], width: 2, height: 1, exitX: 0, exitY: 0, coreX: 1, coreY: 0 });
    const state = makeState({ dungeon, playerX: 0, playerY: 0, coresThisChapter: 1, totalCores: 5 });
    const result = processMove(state, 1, 0, createRNG(1));
    expect(result.state.coresThisChapter).toBe(2);
    expect(result.state.totalCores).toBe(6);
    expect(result.state.coreCollectedThisFloor).toBe(true);
    expect(result.events.some(e => e.kind === 'core_collected')).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/__tests__/engine.test.ts`
Expected: FAIL。

- [ ] **Step 3: 在 `processMove` 中加入稳定度与核心逻辑**

- Reset / Teleport 分支：若未被护盾吸收，根据遗物 `stableAnchor` 和 `resetsThisChapter` 决定是否扣稳定度；扣减时 push `stability_lost`。
- 稳定度到 0 时设置 `chapterFailed = true` 并 push `chapter_failed`。
- RandomMap 分支：不扣稳定度。
- 移动事件后检查是否踩到核心：`if (nx === state.dungeon.coreX && ny === state.dungeon.coreY && !state.coreCollectedThisFloor)` 则增加计数并 push `core_collected`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:run -- src/__tests__/engine.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/game/engine.ts src/__tests__/engine.test.ts
git commit -m "feat(engine): stability, data core collection, chapter failure"
```

---

## Task 7: 遗物效果集成

**Files:**
- Modify: `src/game/engine.ts`
- Modify: `src/__tests__/engine.test.ts`
- Modify: `src/game/relics.ts`

- [ ] **Step 1: 写失败测试（追加到 `src/__tests__/engine.test.ts`）**

```ts
describe('relic effects in engine', () => {
  it('backup shield grants shield at chapter start', () => {
    const state = createInitialState(createRNG(1));
    state.relics = ['backupShield'];
    const result = processMove(state, 1, 0, createRNG(1));
    expect(result.state.hasShield).toBe(true);
  });

  it('stable anchor skips first reset stability cost', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, { type: TileType.Reset }]], width: 2, height: 1 });
    const state = makeState({ dungeon, stability: 1, relics: ['stableAnchor'] });
    const result = processMove(state, 1, 0, createRNG(1));
    expect(result.state.stability).toBe(1);
  });

  it('deep cache restores stability every 3 cores', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, {}]], width: 2, height: 1, coreX: 1, coreY: 0 });
    const state = makeState({ dungeon, stability: 1, totalCores: 2, relics: ['deepCache'] });
    const result = processMove(state, 1, 0, createRNG(1));
    expect(result.state.stability).toBe(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/__tests__/engine.test.ts`
Expected: FAIL。

- [ ] **Step 3: 在引擎中集成遗物效果**

- 在 `createInitialState` 中若 `shouldGainBackupShield(relics)` 则 `hasShield = true`。
- Reset 分支使用 `shouldResetCostStability(relics, state.resetsThisChapter)`。
- 核心收集后根据 `deepCacheRestoresStability(relics, totalCores)` 恢复稳定度。
- Teleport 分支若 `isTeleportSafe(relics)`，在 `findRandomEmptyTile` 中过滤掉 Reset/Teleport/RandomMap。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:run -- src/__tests__/engine.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/game/engine.ts src/game/relics.ts src/__tests__/engine.test.ts
git commit -m "feat(engine): integrate relic effects"
```

---

## Task 8: 一次性地砖视觉更新

**Files:**
- Modify: `src/dungeon.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: 在 `src/dungeon.ts` 中新增 `consumeTileVisuals`**

```ts
export function consumeTileVisuals(
  dungeon: DungeonData,
  meshes: DungeonMeshes,
  x: number,
  y: number,
): void {
  const tile = dungeon.tiles[y][x];
  tile.type = TileType.Empty;
  tile.label = '';

  const mesh = meshes.tiles[y][x];
  (mesh.material as THREE.MeshStandardMaterial).color.set(COLORS[TileType.Empty]);

  const sprite = meshes.labelSprites[y][x];
  if (sprite) {
    meshes.labels.remove(sprite);
    const mat = sprite.material as THREE.SpriteMaterial;
    if (mat.map) mat.map.dispose();
    mat.dispose();
    meshes.labelSprites[y][x] = null;
  }
}
```

- [ ] **Step 2: 在 `src/main.ts` 的 `dispatchEvent` 中处理 `tile_consumed`**

```ts
case 'tile_consumed':
  consumeTileVisuals(gameState.dungeon, dungeonMeshes, event.x, event.y);
  addLog('▌ ' + t('log.consumedTile'));
  break;
```

- [ ] **Step 3: 运行生产构建检查**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 4: Commit**

```bash
git add src/dungeon.ts src/main.ts
git commit -m "feat(render): update visuals when one-time tiles are consumed"
```

---

## Task 9: 暗区墙体轮廓渲染

**Files:**
- Modify: `src/dungeon.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: 在 `src/dungeon.ts` 中新增 `revealAround` 的暗区逻辑扩展**

修改 `revealAround` 接收 `showAdjacentWalls` 参数：

```ts
export function revealAround(
  fogMeshes: THREE.Mesh[][],
  dungeon: DungeonData,
  meshes: DungeonMeshes,
  cx: number,
  cy: number,
  radius: number,
  showAdjacentWalls: boolean,
): number {
  // ... existing logic

  if (showAdjacentWalls) {
    for (const [ax, ay] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (ax < 0 || ay < 0 || ax >= dungeon.width || ay >= dungeon.height) continue;
      const adjTile = dungeon.tiles[ay][ax];
      if (adjTile.type === TileType.Wall) {
        (meshes.tiles[ay][ax].material as THREE.MeshStandardMaterial).color.set(COLORS[TileType.Wall]);
      }
    }
  }
  return count;
}
```

- [ ] **Step 2: 更新 `src/main.ts` 中所有 `revealAround` 调用点，传入 `getChapterRules(gameState.floor).showAdjacentWalls`**

包括 `dispatchEvent('move')`、`regenerateDungeonMesh()`、`teleport` 动画完成处、以及初始调用。

- [ ] **Step 3: 运行生产构建检查**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 4: Commit**

```bash
git add src/dungeon.ts src/main.ts
git commit -m "feat(render): show adjacent wall silhouettes in dark zone"
```

---

## Task 10: HUD 更新

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`
- Modify: `src/i18n.ts`

- [ ] **Step 1: 在 `index.html` 的 `#hud` 内新增 DOM**

```html
<div id="stability-bar" style="margin-top:4px;">
  <span data-i18n="ui.stability">Stability</span>
  <span id="stability-dots"></span>
</div>
<div id="core-distance" style="margin-top:2px;">
  <span data-i18n="ui.coreDistance">Core distance</span>: <span id="core-distance-value">—</span>
</div>
<div id="core-count" style="margin-top:2px;">
  <span data-i18n="ui.cores">Cores</span>: <span id="core-count-value">0</span>
</div>
<div id="exit-whisper" style="margin-top:2px;opacity:0;">➤</div>
```

- [ ] **Step 2: 在 `src/i18n.ts` 的中英文 `ui` 区块新增键**

```ts
ui: {
  // ... existing
  stability: 'Stability',
  coreDistance: 'Core distance',
  cores: 'Cores',
}
```

```ts
ui: {
  // ... existing
  stability: '稳定度',
  coreDistance: '核心距离',
  cores: '核心',
}
```

- [ ] **Step 3: 在 `src/main.ts` 的 `updateHUD` 中更新这些元素**

```ts
function updateHUD() {
  hudPos.textContent = `${gameState.playerX},${gameState.playerY}`;

  if (gameState.gameWon) {
    hudFloor.textContent = t('ui.floorClear');
    hudFloor.style.color = '#06d6a0';
  } else {
    hudFloor.textContent = t('ui.floor', { floor: gameState.floor, max: CONFIG.dungeon.maxFloor });
    hudFloor.style.color = '';
  }

  hudShield.style.opacity = player.hasShield ? '1' : '0';

  const dotsEl = document.getElementById('stability-dots')!;
  dotsEl.textContent = Array(3).fill(0).map((_, i) => i < gameState.stability ? '●' : '○').join(' ');

  const dist = Math.abs(gameState.playerX - gameState.dungeon.coreX) + Math.abs(gameState.playerY - gameState.dungeon.coreY);
  document.getElementById('core-distance-value')!.textContent = gameState.coreCollectedThisFloor ? '—' : String(dist);
  document.getElementById('core-count-value')!.textContent = String(gameState.coresThisChapter);

  const whisperEl = document.getElementById('exit-whisper')!;
  const whisperDir = getExitWhisperDirection(
    { playerX: gameState.playerX, playerY: gameState.playerY, exitX: gameState.dungeon.exitX, exitY: gameState.dungeon.exitY, cameraAngle: controls.getAzimuthalAngle() },
    gameState.relics,
  );
  if (whisperDir) {
    const arrows: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };
    whisperEl.textContent = arrows[whisperDir];
    whisperEl.style.opacity = '1';
  } else {
    whisperEl.style.opacity = '0';
  }
}
```

- [ ] **Step 4: 运行生产构建检查**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 5: Commit**

```bash
git add index.html src/i18n.ts src/main.ts
git commit -m "feat(ui): add stability, core distance, core count, exit whisper HUD"
```

---

## Task 11: 遗物选择界面

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`
- Modify: `src/i18n.ts`
- Modify: `src/game/engine.ts`

- [ ] **Step 1: 在 `index.html` 中新增遗物选择覆盖层**

```html
<div id="relic-overlay" class="hidden" style="position:fixed;inset:0;background:rgba(10,10,20,0.9);display:flex;align-items:center;justify-content:center;z-index:200;">
  <div style="background:#1e1e2e;border:1px solid #3d405b;border-radius:12px;padding:28px 32px;max-width:540px;width:90%;color:#cdd6f4;">
    <h2 data-i18n="relic.chooseTitle">Choose a Relic</h2>
    <p data-i18n="relic.chooseSubtitle">Your cores this chapter affect the quality of choices.</p>
    <div id="relic-cards" style="display:flex;gap:12px;margin-top:16px;justify-content:center;"></div>
    <button id="relic-refresh" style="margin-top:16px;display:none;">↻ Refresh</button>
  </div>
</div>
```

- [ ] **Step 2: 在 `src/i18n.ts` 新增遗物文案**

```ts
relic: {
  chooseTitle: 'Choose a Relic',
  chooseSubtitle: 'Collected cores this chapter: {cores}',
  refresh: 'Refresh choices',
  afterglow: { name: 'Afterglow', desc: 'Initial reveal radius +1' },
  backupShield: { name: 'Backup Shield', desc: 'Start each chapter with a shield' },
  stableAnchor: { name: 'Stable Anchor', desc: 'First Reset each chapter costs no stability' },
  teleportCalib: { name: 'Teleport Calibration', desc: 'Teleport never lands on hazards' },
  exitWhisper: { name: 'Exit Whisper', desc: 'Arrow points toward exit within 2 tiles' },
  deepCache: { name: 'Deep Cache', desc: 'Every 3 cores restore 1 stability' },
}
```

中文对应翻译。

- [ ] **Step 3: 在 `src/game/engine.ts` 中处理第 5 层完成事件**

在 Exit 分支中，当 `next.floor === 5`（进入第 6 层之前）时：

```ts
if (next.floor === 5) {
  events.push({
    kind: 'relic_choice',
    options: pickRelicOptions(next.relics, next.coresThisChapter, rng),
    canRefresh: canRefreshChoices(next.coresThisChapter),
  });
}
```

新增 `pickRelicOptions(owned, cores, rng)`：

```ts
function pickRelicOptions(owned: RelicId[], cores: number, rng: RNG): RelicId[] {
  const pool = ALL_RELICS.map(r => r.id).filter(id => !owned.includes(id));
  const count = getRelicChoiceCount(cores);
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
```

- [ ] **Step 4: 在 `src/main.ts` 中渲染遗物选择覆盖层**

```ts
const relicOverlay = document.getElementById('relic-overlay')!;
const relicCards = document.getElementById('relic-cards')!;
const relicRefresh = document.getElementById('relic-refresh')!;

function showRelicChoice(event: Extract<GameEvent, { kind: 'relic_choice' }>) {
  relicCards.innerHTML = '';
  for (const relic of event.options) {
    const card = document.createElement('button');
    card.style.cssText = 'background:#2a2a3e;border:1px solid #45475a;border-radius:8px;padding:12px;color:#cdd6f4;cursor:pointer;flex:1;min-width:120px;';
    card.innerHTML = `<div style="font-weight:bold;margin-bottom:4px;">${t(`relic.${relic}.name`)}</div><div style="font-size:12px;color:#a6adc8;">${t(`relic.${relic}.desc`)}</div>`;
    card.addEventListener('click', () => {
      // send choice back to engine
      const result = chooseRelic(gameState, relic);
      gameState = result.state;
      for (const e of result.events) dispatchEvent(e);
      hideRelicChoice();
    });
    relicCards.appendChild(card);
  }
  relicRefresh.style.display = event.canRefresh ? 'block' : 'none';
  relicOverlay.classList.remove('hidden');
}

function hideRelicChoice() {
  relicOverlay.classList.add('hidden');
}
```

- [ ] **Step 5: 在 `src/game/engine.ts` 中实现 `chooseRelic`**

```ts
export function chooseRelic(state: EngineState, relic: RelicId): { state: EngineState; events: GameEvent[] } {
  const next = { ...state, relics: [...state.relics, relic] };
  if (relic === 'backupShield') next.hasShield = true;
  return { state: next, events: [{ kind: 'relic_gained', relic }] };
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run test:run`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add index.html src/i18n.ts src/main.ts src/game/engine.ts
git commit -m "feat(ui): relic choice overlay at floor 5"
```

---

## Task 12: 危险预警渲染

**Files:**
- Modify: `src/main.ts`
- Modify: `src/dungeon.ts`

- [ ] **Step 1: 在 `src/dungeon.ts` 中新增 `createHazardWarning`**

```ts
export function createHazardWarning(x: number, y: number): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.35, 0.45, 16);
  const mat = new THREE.MeshBasicMaterial({ color: 0xe63946, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  const pos = tileToWorld(x, y);
  mesh.position.set(pos.x, 0.25, pos.z);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
```

- [ ] **Step 2: 在 `src/main.ts` 中维护警告标记集合**

```ts
const hazardWarnings: Map<string, THREE.Mesh> = new Map();

function clearHazardWarnings() {
  for (const mesh of hazardWarnings.values()) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  hazardWarnings.clear();
}

function updateHazardWarnings() {
  clearHazardWarnings();
  const rules = getChapterRules(gameState.floor);
  if (!rules.warnRandomMap) return;

  for (let y = 0; y < gameState.dungeon.height; y++) {
    for (let x = 0; x < gameState.dungeon.width; x++) {
      if (gameState.dungeon.tiles[y][x].type !== TileType.RandomMap) continue;
      const dist = Math.abs(x - gameState.playerX) + Math.abs(y - gameState.playerY);
      if (dist === 1) {
        const mesh = createHazardWarning(x, y);
        scene.add(mesh);
        hazardWarnings.set(`${x},${y}`, mesh);
      }
    }
  }
}
```

- [ ] **Step 3: 在 `animate()` 每帧调用 `updateHazardWarnings()`**

- [ ] **Step 4: 在 `regenerateDungeonMesh()` 中调用 `clearHazardWarnings()`**

- [ ] **Step 5: 运行生产构建检查**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/dungeon.ts
git commit -m "feat(render): hazard warning rings for RandomMap in unstable zone"
```

---

## Task 13: 章节失败与重新开始

**Files:**
- Modify: `src/game/engine.ts`
- Modify: `src/main.ts`
- Modify: `src/i18n.ts`

- [ ] **Step 1: 在 `src/game/engine.ts` 中实现 `restartChapter`**

```ts
export function restartChapter(state: EngineState, rng: RNG): { state: EngineState; events: GameEvent[] } {
  const dungeon = generateDungeon(CONFIG.dungeon.width, CONFIG.dungeon.height, 1, rng);
  return {
    state: {
      ...state,
      playerX: 0,
      playerY: 0,
      floor: 1,
      hasShield: shouldGainBackupShield(state.relics),
      stability: 3,
      coresThisChapter: 0,
      totalCores: state.totalCores,
      resetsThisChapter: 0,
      coreCollectedThisFloor: false,
      dungeon,
      chapterFailed: false,
      gameWon: false,
    },
    events: [{ kind: 'chapter_failed' }],
  };
}
```

- [ ] **Step 2: 在 `src/main.ts` 的 `dispatchEvent` 中处理 `chapter_failed`**

```ts
case 'chapter_failed':
  addLog('▌ ' + t('log.chapterFailed'));
  // 显示短暂提示后自动重启
  setTimeout(() => {
    const result = restartChapter(gameState, rng);
    gameState = result.state;
    regenerateDungeonMesh();
    for (const e of result.events) dispatchEvent(e);
  }, 1500);
  break;
```

- [ ] **Step 3: 在 `src/i18n.ts` 增加 `log.chapterFailed` 文案**

```ts
chapterFailed: 'Stability depleted. Returning to chapter start...',
```

中文：`chapterFailed: '稳定度耗尽。返回章节起点……'`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:run`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/game/engine.ts src/main.ts src/i18n.ts
git commit -m "feat(engine): chapter failure restarts chapter keeping relics"
```

---

## Task 14: 第 11 层结算与重新开始

**Files:**
- Modify: `src/main.ts`
- Modify: `src/i18n.ts`

- [ ] **Step 1: 在 `src/main.ts` 中完成第 11 层后的提示**

当 `gameState.floor === 11` 且玩家踏上 Exit 时，现有 `exit_reached` 分支会进入。修改 `dispatchEvent` 的 `exit_reached`：

```ts
case 'exit_reached':
  flashTimer = 0.3;
  if (event.floorCleared) {
    // final floor
  } else {
    regenerateDungeonMesh();
    if (gameState.floor === 5) {
      // relic choice handled by engine event
    } else if (gameState.floor === 11) {
      addLog('▌ ' + t('log.chapterComplete'));
      showChapterCompleteOverlay();
    } else {
      addLog('▌ ' + t('log.descended', { floor: event.newFloor, max: CONFIG.dungeon.maxFloor }));
    }
  }
  break;
```

- [ ] **Step 2: 新增结算覆盖层**

在 `index.html` 中增加 `#chapter-complete-overlay`，显示“第一章完成”和重新开始按钮。

- [ ] **Step 3: 在 `src/i18n.ts` 增加文案**

```ts
chapterComplete: 'Chapter 1 complete!',
```

中文：`chapterComplete: '第一章完成！'`。

- [ ] **Step 4: 运行生产构建检查**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.ts src/i18n.ts
git commit -m "feat(ui): chapter 1 completion overlay and restart"
```

---

## Task 15: 全量测试与构建验收

**Files:**
- 全部修改过的文件

- [ ] **Step 1: 运行全量测试**

Run: `npm run test:run`
Expected: 全部测试通过（约 80+ 个）。

- [ ] **Step 2: 运行生产构建**

Run: `npm run build`
Expected: 成功，无 TypeScript 错误。

- [ ] **Step 3: 浏览器冒烟测试**

Run: `npm run dev`
手动验证：
-  HUD 显示稳定度、核心距离、核心计数。
-  Compass / Scan / Shield 踩过后变为 Empty。
-  暗区（第 5 层起）只能看到当前格和相邻墙轮廓。
-  不稳定区接近 RandomMap 出现红环警告。
-  第 5 层出口后出现遗物选择覆盖层。
-  选择遗产后第 6 层生效。
-  稳定度归零后回到第 1 层，遗物保留。
-  第 11 层完成后显示结算。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(chapter1): complete 11-floor chapter 1 slice"
```

---

## Self-Review

### Spec Coverage

| Spec 需求 | 覆盖任务 |
|-----------|----------|
| 一次性地砖（consumed，变 Empty） | Task 5, Task 8 |
| 隐藏核心 + HUD 距离 + 精确踩格 | Task 4, Task 6, Task 10 |
| 稳定度 Reset/Teleport 扣、RandomMap 不扣 | Task 6 |
| 章节失败回退满稳定度、保留遗物、清空核心 | Task 6, Task 13 |
| 三个区域规则 | Task 2, Task 4, Task 9 |
| 第 5 层遗物选择（2/3/3+refresh） | Task 3, Task 11 |
| 首批 6 个遗物 | Task 3, Task 7, Task 10 |
| 暗区相邻墙轮廓 | Task 9 |
| 不稳定区 RandomMap 预警 | Task 12 |
| 第 11 层结算 | Task 14 |
| 核心生命周期（封锁测试、Teleport 收集、RandomMap 后不再生成） | Task 4, Task 6 |
| 护盾叠加规则 | Task 5 |
| 章节失败后稳定度回满 | Task 6, Task 13 |

### Placeholder Scan

- 无 TBD/TODO。
- 所有函数签名在后续任务中保持一致（`revealRadiusBonus`、`getRelicChoiceCount`、`shouldResetCostStability` 等）。

### Type Consistency

- `RelicId` 类型在 `types.ts`、`relics.ts`、`engine.ts` 中统一使用。
- `ChapterRules` 包含 `showAdjacentWalls`，所有 `revealAround` 调用均会传入。
- `EngineState` 新增字段在 `createInitialState` 中初始化。
- `coreCollectedThisFloor` 用于标记当前楼层核心是否已收集，避免重复计数。

### 未覆盖但刻意的简化

- 跨章节存档：明确不包含在本次切片。
- 遗物选择后的“下一章”：第 11 层后只显示完成提示，因为 99 章未实现。
- 核心不独立 `TileType`：与 spec 一致，保持隐藏。
