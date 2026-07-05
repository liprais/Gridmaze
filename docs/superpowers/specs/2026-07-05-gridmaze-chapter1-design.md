# Gridmaze 第一章：信息、风险与奖励纵向切片设计

## 1. 目标与范围

在已有 P0/P1 基础上，制作一个可完整游玩的 **11 层第一章纵向切片**。核心目标是验证：玩家会在“直接找出口”与“绕路拿核心”之间产生真实取舍，并通过遗物三选一获得长期成长感。

**包含：**
- 一次性奖励地砖（Compass / Scan / Shield）。
- 每层一个隐藏“数据核心”，HUD 显示曼哈顿距离，精确踩格收集。
- 3 点“稳定度”资源；Reset / Teleport 扣 1 点，RandomMap 只重置地图不扣稳定度。
- 稳定度归零后回到本章第 1 层，保留遗物，清空本章核心。
- 第 5 层后的遗物选择覆盖层（0–3 核心二选一、4–7 核心三选一、8–11 核心三选一可刷新一次），首批 6 个规则型遗物，不可重复获得。
- 三个区域规则变化：测绘区 / 暗区 / 不稳定区。

**不包含：**
- 跨章节存档（暂用本章内失败回退）。
- 实时战斗、装备、多人等扩展系统。
- 99 层完整内容。

---

## 2. 核心机制

### 2.1 一次性奖励地砖

- **消耗型奖励**：Compass、Scan、Shield 触发后，该地砖变为普通 Empty（视觉上和标签都重置）。
- **持续型危险/机制**：Reset、Teleport 触发后保持原效果，可反复踩。
- 引入新的 Tile 字段 `consumed: boolean`，不重用 `steppedOn`。

### 2.2 数据核心

- 每层生成一个隐藏核心，位置在地图生成时确定。
- HUD 持续显示“核心距离：N”，N 为玩家与核心的曼哈顿距离。
- 玩家必须精确踩到核心所在格才能收集，获得 1 个“数据碎片”。
- 核心必须位于可达位置，但不能在从起点到出口的安全必经路径上（避免强制收集）。
- 收集后该层核心消失，碎片计入本章累计。
- **核心影响遗物选择质量**：
  - 0–3 核心：2 个遗物选项。
  - 4–7 核心：3 个遗物选项。
  - 8–11 核心：3 个遗物选项 + 1 次刷新机会。

### 2.3 稳定度

- 玩家拥有 3 点稳定度，上限 3。
- **扣减**：踩到 Reset 或 Teleport 且未被护盾抵消时失去 1 点。
- **不扣减**：RandomMap 只重置当前楼层地图，不扣稳定度。
- **恢复**：
  - 遗物“深层缓存”：收集到第三个核心时立即恢复 1 点。
- **归零**：本章失败，回到本章第 1 层；稳定度恢复满 3 点；保留已获得的遗物；清空本章收集的数据碎片。

### 2.4 区域结构

第一章共 11 层，分为三个区域：

| 区间 | 主题 | 规则变化 |
|------|------|----------|
| 1–4 | 测绘区 | 标准规则，revealRadius = 1，用于学习基础地砖与核心取舍。 |
| 5–8 | 暗区 | revealRadius = 0（玩家当前格可见），但上下左右四格的墙体轮廓可见，帮助判断可走方向；地砖类型隐藏。Scan / Compass 价值提高。 |
| 9–11 | 不稳定区 | RandomMap 权重提高；进入 RandomMap 周围 1 格时该格显示红色警告标记。 |

第 5 层完成后进入遗物选择；选择后回到第 6 层继续，确保后半章能实际体验遗物效果。

三个区域差异必须来自规则变化，而非单纯加墙或加雾。

### 2.5 遗物选择

- 完成第 5 层后弹出全屏/半透明覆盖层，展示遗物卡片。
- 可选数量由本章收集的数据核心数决定：
  - 0–3 核心：2 个选项。
  - 4–7 核心：3 个选项。
  - 8–11 核心：3 个选项 + 1 次刷新机会（刷新后重新随机三个选项）。
- 玩家点击选择一个遗物后继续第 6 层，确保后半章能实际体验遗物效果。
- 完成第 11 层后再次显示结算与“第一章完成”提示，允许重新开始本章。
- 遗物不可重复获得；已拥有的遗物不会出现在选项中。

### 2.6 首批 6 个遗物

| 遗物 ID | 名称 | 效果 |
|---------|------|------|
| afterglow | 余光 | 每层初始 revealRadius +1（与章节规则叠加，暗区中变为半径 1）。 |
| backupShield | 备用护盾 | 每章进入第 1 层时自动获得一次护盾。 |
| stableAnchor | 稳定锚 | 每章第一次 Reset 不扣稳定度。 |
| teleportCalib | 传送校准 | Teleport 不会把玩家传送到 Reset / Teleport / RandomMap 地砖上。 |
| exitWhisper | 出口低语 | 玩家与出口曼哈顿距离 ≤ 2 时，HUD 显示一个屏幕相对的箭头，指向出口在玩家当前视角下的方向。 |
| deepCache | 深层缓存 | 每收集 3 个数据核心，立即恢复 1 点稳定度。 |

遗物优先改变规则，不做数值百分比加成。

---

## 3. 数据模型变化

### 3.1 Tile 扩展

```ts
export interface Tile {
  x: number;
  y: number;
  type: TileType;
  label: string;
  explored: boolean;
  steppedOn: boolean;
  consumed: boolean; // 新增：一次性奖励地砖是否已触发
}
```

### 3.2 数据核心位置

数据核心不表现为独立地砖类型。核心所在格保持 `TileType.Empty`，其真实位置由 `DungeonData.coreX / coreY` 记录。这样渲染层无需特殊处理即可保持隐藏，HUD 只显示距离。

### 3.3 EngineState 扩展

```ts
export interface EngineState {
  playerX: number;
  playerY: number;
  floor: number;
  chapter: number;        // 当前章节（1 开始）
  hasShield: boolean;
  stability: number;      // 稳定度 0..3
  coresThisChapter: number; // 本章收集的核心数
  totalCores: number;     // 生涯累计（用于深层缓存）
  relics: RelicId[];      // 已获得的遗物
  dungeon: DungeonData;
  gameWon: boolean;
  chapterFailed: boolean; // 本章失败，等待重置
}
```

### 3.4 DungeonData 扩展

```ts
export interface DungeonData {
  width: number;
  height: number;
  exitX: number;
  exitY: number;
  coreX: number;          // 新增
  coreY: number;          // 新增
  tiles: Tile[][];
}
```

### 3.5 章节配置

```ts
export interface ChapterRules {
  revealRadius: number;
  randomMapWeightBonus: number; // 不稳定区额外权重
  warnRandomMap: boolean;       // 是否对 RandomMap 进行接近警告
}
```

---

## 4. 事件扩展

引擎事件新增：

```ts
type GameEvent =
  | ... // 现有事件
  | { kind: 'tile_consumed'; x: number; y: number }
  | { kind: 'core_collected'; x: number; y: number }
  | { kind: 'stability_lost'; amount: number; remaining: number }
  | { kind: 'chapter_failed' }
  | { kind: 'relic_choice'; options: RelicId[] }
  | { kind: 'relic_gained'; relic: RelicId }
  | { kind: 'hazard_warned'; x: number; y: number; tileType: TileType }
  ;
```

---

## 5. UI/UX 变化

### 5.1 HUD 新增

- 稳定度显示：3 个圆点/方块，满为亮色，空为暗色。
- 核心距离：文本“核心距离：N”。
- 本章核心计数：文本“核心：N”。
- 护盾状态：保持现有显示。
- 出口低语：当遗物生效且距离出口 ≤ 2 时，HUD 显示一个屏幕相对的箭头，指向出口在玩家当前视角下的方向。

### 5.2 遗物选择界面

- 全屏半透明覆盖层，居中显示三个遗物卡片。
- 每张卡片显示遗物名称和一行效果说明。
- 选择后覆盖层消失，显示第一章完成提示。

### 5.3 危险预警

- 不稳定区中，当玩家进入 RandomMap 周围 1 格时，该 RandomMap 格显示红色警告标记（可复用或扩展出口信标的小圆环/闪烁效果）。
- 玩家离开后警告消失。

### 5.4 章节失败

- 稳定度归零时弹出简短提示：“稳定度耗尽，返回本章起点。”
- 自动重置到本章第 1 层，保留遗物，清空本章核心。

---

## 6. 生成规则

### 6.1 数据核心放置

1. 正常生成地图、出口、安全路径。
2. 在所有可达且非起点、非出口的格子里，排除安全路径必经格，作为候选池。
3. 对候选池中每个格子进行“封锁测试”：临时假设该格不可通行，重新执行起点到出口的连通性检查。若仍可达，则该格为有效核心位置；否则排除。
4. 从有效位置中随机选择一个作为核心位置。
5. 若不存在有效位置，则重新生成整张地图，重复上述流程。
6. **核心生命周期**：
   - 玩家精确踩到核心所在格时立即收集，派发 `core_collected`。
   - Teleport 将玩家落到核心所在格时，立即触发收集。
   - RandomMap 重置地图前已收集核心：新地图不再生成核心。
   - RandomMap 重置地图前未收集核心：新地图按规则重新生成核心。

### 6.2 一次性地砖消耗

- `processMove` 中，当触发 Compass / Scan / Shield 时：
  1. 正常产生效果事件。
  2. 将当前 Tile 标记为 `consumed = true`。
  3. 将 Tile 类型改为 `TileType.Empty`，标签清空。
  4. 派发 `tile_consumed` 事件，渲染层更新视觉。
- **护盾叠加规则**：玩家已有护盾时踩到 Shield 地砖，仍然触发并消耗该 Shield 地砖，但护盾状态保持 true（不叠加层数，效果等价于刷新）。

### 6.3 章节规则应用

- 地图生成时根据当前楼层决定 `ChapterRules`。
- 暗区 `revealRadius = 0`，但玩家当前站立格可见；同时上下左右四格的 Wall 地砖显示轮廓，帮助判断可走方向，其他类型地砖隐藏。
- 不稳定区提高 RandomMap 权重，并开启 `warnRandomMap`。

---

## 7. 测试策略

### 7.1 单元测试

- 一次性地砖触发后类型变为 Empty 且 `consumed = true`。
- 数据核心位置可达且不在出口必经路径上。
- Reset / Teleport 扣稳定度，护盾抵消时不扣。
- RandomMap 不扣稳定度。
- 稳定度归零触发 `chapter_failed`。
- 遗物效果：afterglow 增加 revealRadius；backupShield 每章开始时给护盾；stableAnchor 第一次 Reset 不扣；teleportCalib 传送目标非危险；exitWhisper 在距离 ≤ 2 时给出方向；deepCache 每满 3 核心恢复稳定度。
- 遗物三选一不重复已拥有遗物。

### 7.2 属性测试

- 批量生成第一章 11 层地图，确保每层起点到出口可达、核心可达。
- 批量验证 Teleport 目标永远不会是 Wall。

### 7.3 浏览器验收

- 遗物选择：第 5 层完成时弹出，选项数量由核心数决定（0–3 核心二选一、4–7 核心三选一、8–11 核心三选一可刷新）。
- 暗区中玩家当前格可见，相邻四格的 Wall 地砖可见轮廓，其他类型隐藏。
- 不稳定区 RandomMap 接近时显示警告。
- HUD 核心距离随移动正确更新。

---

## 8. 验收标准

- 新玩家无需阅读文档可完成第一章。
- 直接找出口和绕路拿核心都是可行策略。
- 三个区域规则在前 2 层内即可感知差异。
- 玩家至少会在一次遗物选择中面对有意义的取舍。
- 自动化测试覆盖核心规则和遗物效果。
- `npm run test:run` 全绿，`npm run build` 成功。
