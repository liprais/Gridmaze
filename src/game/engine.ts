import { TileType, DungeonData, RelicId } from '../types';
import { CONFIG, isHazardType } from './config';
import { generateDungeon, getTileAt, hasPath } from './generation';
import type { RNG } from './rng';
import { shouldGainBackupShield, shouldResetCostStability, isTeleportSafe, deepCacheRestoresStability } from './relics';

// ── State ───────────────────────────────────────────────────────────

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

/** Create a fresh engine state at floor 1 */
export function createInitialState(rng: RNG): EngineState {
  const dungeon = generateDungeon(
    CONFIG.dungeon.width,
    CONFIG.dungeon.height,
    1,
    rng,
  );
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
}

// ── Events ──────────────────────────────────────────────────────────

export type GameEvent =
  | { kind: 'move'; fromX: number; fromY: number; toX: number; toY: number; tileType: TileType; tileLabel: string }
  | { kind: 'blocked'; x: number; y: number }
  | { kind: 'exit_reached'; floorCleared: boolean; newFloor: number }
  | { kind: 'hazard_absorbed'; tileType: TileType }
  | { kind: 'reset_to_start' }
  | { kind: 'teleported'; fromX: number; fromY: number; toX: number; toY: number }
  | { kind: 'map_regenerated' }
  | { kind: 'compass_revealed'; exitX: number; exitY: number }
  | { kind: 'scan_revealed'; centerX: number; centerY: number }
  | { kind: 'shield_gained' }
  | { kind: 'victory' }
  | { kind: 'tile_consumed'; x: number; y: number }
  | { kind: 'core_collected'; x: number; y: number }
  | { kind: 'stability_lost'; amount: number; remaining: number }
  | { kind: 'chapter_failed' }
  | { kind: 'relic_choice'; options: RelicId[]; canRefresh: boolean }
  | { kind: 'relic_gained'; relic: RelicId }
  | { kind: 'hazard_warned'; x: number; y: number; tileType: TileType };

// ── Core state machine ──────────────────────────────────────────────

export function processMove(
  state: EngineState,
  dx: number,
  dy: number,
  rng: RNG,
): { state: EngineState; events: GameEvent[] } {
  if (state.gameWon) return { state, events: [] };

  const nx = state.playerX + dx;
  const ny = state.playerY + dy;
  const tile = getTileAt(state.dungeon, nx, ny);

  // Blocked: out-of-bounds or wall
  if (!tile || tile.type === TileType.Wall) {
    return {
      state,
      events: [{ kind: 'blocked', x: nx, y: ny }],
    };
  }

  const events: GameEvent[] = [];
  // Push move event first (always)
  events.push({
    kind: 'move',
    fromX: state.playerX,
    fromY: state.playerY,
    toX: nx,
    toY: ny,
    tileType: tile.type,
    tileLabel: tile.label,
  });

  const next: EngineState = {
    ...state,
    playerX: nx,
    playerY: ny,
  };

  const tileType = tile.type;

  // ── Data core (hidden optional objective) ──
  if (!next.coreCollectedThisFloor && nx === next.dungeon.coreX && ny === next.dungeon.coreY) {
    next.coreCollectedThisFloor = true;
    next.coresThisChapter++;
    next.totalCores++;
    events.push({ kind: 'core_collected', x: nx, y: ny });
    if (deepCacheRestoresStability(next.relics, next.totalCores)) {
      next.stability = Math.min(3, next.stability + 1);
      events.push({ kind: 'stability_lost', amount: -1, remaining: next.stability });
    }
  }

  // ── Exit ──
  // The move event pushed above carries the OLD floor's exit coords. Once we
  // regenerate the dungeon below, those coords would point at arbitrary (and
  // potentially wrong) tiles on the NEW floor — main.ts would "reveal" them,
  // polluting the fresh map. Drop the move event; exit_reached/victory own the
  // transition, and regenerateDungeonMesh places the player at (0,0).
  if (tileType === TileType.Exit) {
    events.length = 0;
    if (next.floor >= CONFIG.dungeon.maxFloor) {
      next.gameWon = true;
      events.push({ kind: 'exit_reached', floorCleared: true, newFloor: CONFIG.dungeon.maxFloor });
      events.push({ kind: 'victory' });
    } else {
      next.floor++;
      next.dungeon = generateDungeon(CONFIG.dungeon.width, CONFIG.dungeon.height, next.floor, rng);
      next.playerX = 0;
      next.playerY = 0;
      events.push({ kind: 'exit_reached', floorCleared: false, newFloor: next.floor });
    }
    return { state: next, events };
  }

  // ── Hazard (shield absorbs first) ──
  if (next.hasShield && isHazardType(tileType)) {
    next.hasShield = false;
    events.push({ kind: 'hazard_absorbed', tileType });
    return { state: next, events };
  }

  // ── Hazard effects (no shield) ──
  switch (tileType) {
    case TileType.Reset: {
      next.playerX = 0;
      next.playerY = 0;
      next.resetsThisChapter++;
      events.push({ kind: 'reset_to_start' });
      if (shouldResetCostStability(next.relics, next.resetsThisChapter - 1)) {
        next.stability = Math.max(0, next.stability - 1);
        events.push({ kind: 'stability_lost', amount: 1, remaining: next.stability });
      }
      if (next.stability === 0) {
        next.chapterFailed = true;
        events.push({ kind: 'chapter_failed' });
      }
      break;
    }

    case TileType.Teleport: {
      const target = findRandomEmptyTile(next.dungeon, rng, next.relics);
      events.push({
        kind: 'teleported',
        fromX: nx,
        fromY: ny,
        toX: target.x,
        toY: target.y,
      });
      next.playerX = target.x;
      next.playerY = target.y;
      next.stability = Math.max(0, next.stability - 1);
      events.push({ kind: 'stability_lost', amount: 1, remaining: next.stability });
      if (next.stability === 0) {
        next.chapterFailed = true;
        events.push({ kind: 'chapter_failed' });
      }
      break;
    }

    case TileType.RandomMap:
      next.dungeon = generateDungeon(CONFIG.dungeon.width, CONFIG.dungeon.height, next.floor, rng);
      next.playerX = 0;
      next.playerY = 0;
      next.coreCollectedThisFloor = false;
      events.push({ kind: 'map_regenerated' });
      break;

    case TileType.Compass: {
      const ex = next.dungeon.exitX;
      const ey = next.dungeon.exitY;
      next.dungeon.tiles[ey][ex].explored = true;
      events.push({ kind: 'compass_revealed', exitX: ex, exitY: ey });
      consumeTile(next.dungeon, nx, ny, events);
      break;
    }

    case TileType.Scan:
      events.push({ kind: 'scan_revealed', centerX: nx, centerY: ny });
      consumeTile(next.dungeon, nx, ny, events);
      break;

    case TileType.Shield:
      next.hasShield = true;
      events.push({ kind: 'shield_gained' });
      consumeTile(next.dungeon, nx, ny, events);
      break;
  }

  return { state: next, events };
}

// ── Helpers ─────────────────────────────────────────────────────────

function consumeTile(dungeon: DungeonData, x: number, y: number, events: GameEvent[]): void {
  dungeon.tiles[y][x].consumed = true;
  dungeon.tiles[y][x].type = TileType.Empty;
  dungeon.tiles[y][x].label = '';
  events.push({ kind: 'tile_consumed', x, y });
}

function findRandomEmptyTile(dungeon: DungeonData, rng: RNG, relics: RelicId[] = []): { x: number; y: number } {
  const grid = dungeon.tiles.map(row => row.map(t => t.type));
  const { exitX, exitY, width, height } = dungeon;
  const candidates: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const type = dungeon.tiles[y][x].type;
      if (type === TileType.Wall) continue;
      if (isTeleportSafe(relics) && (type === TileType.Reset || type === TileType.Teleport || type === TileType.RandomMap)) continue;
      if (!hasPath(grid, width, height, x, y, exitX, exitY)) continue;
      candidates.push({ x, y });
    }
  }
  // Fallback: safety path guarantees at least the start tile is reachable
  if (candidates.length === 0) return { x: 0, y: 0 };
  return candidates[rng.nextInt(candidates.length)];
}

/** i18n-friendly tile description for log messages */
export function describeTile(type: TileType, label: string): string {
  const base = TILE_NAMES[type] ?? 'Unknown';
  // Empty tiles with numeric labels: "Empty 5", otherwise just the name
  if (type === TileType.Empty && label) return `${base} ${label}`;
  return base;
}

const TILE_NAMES: Record<number, string> = {
  [TileType.Empty]:     'Empty',
  [TileType.Reset]:     'Reset',
  [TileType.Teleport]:  'Teleport',
  [TileType.RandomMap]: 'Random Map',
  [TileType.Compass]:   'Compass',
  [TileType.Scan]:      'Scan',
  [TileType.Shield]:    'Shield',
  [TileType.Exit]:      'Exit!',
  [TileType.Start]:     'Start',
};
