import { TileType, DungeonData } from '../types';
import { CONFIG, isHazardType } from './config';
import { generateDungeon, getTileAt, hasPath } from './generation';
import type { RNG } from './rng';

// ── State ───────────────────────────────────────────────────────────

export interface EngineState {
  playerX: number;
  playerY: number;
  floor: number;
  hasShield: boolean;
  dungeon: DungeonData;
  gameWon: boolean;
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
    dungeon,
    gameWon: false,
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
  | { kind: 'victory' };

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

  // Build new state
  const next: EngineState = {
    ...state,
    playerX: nx,
    playerY: ny,
  };

  const tileType = tile.type;

  // ── Exit ──
  if (tileType === TileType.Exit) {
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
    case TileType.Reset:
      next.playerX = 0;
      next.playerY = 0;
      events.push({ kind: 'reset_to_start' });
      break;

    case TileType.Teleport: {
      const target = findRandomEmptyTile(next.dungeon, rng);
      events.push({
        kind: 'teleported',
        fromX: nx,
        fromY: ny,
        toX: target.x,
        toY: target.y,
      });
      next.playerX = target.x;
      next.playerY = target.y;
      break;
    }

    case TileType.RandomMap:
      next.dungeon = generateDungeon(CONFIG.dungeon.width, CONFIG.dungeon.height, next.floor, rng);
      next.playerX = 0;
      next.playerY = 0;
      events.push({ kind: 'map_regenerated' });
      break;

    case TileType.Compass: {
      const ex = next.dungeon.exitX;
      const ey = next.dungeon.exitY;
      next.dungeon.tiles[ey][ex].explored = true;
      events.push({ kind: 'compass_revealed', exitX: ex, exitY: ey });
      break;
    }

    case TileType.Scan:
      events.push({ kind: 'scan_revealed', centerX: nx, centerY: ny });
      break;

    case TileType.Shield:
      next.hasShield = true;
      events.push({ kind: 'shield_gained' });
      break;
  }

  return { state: next, events };
}

// ── Helpers ─────────────────────────────────────────────────────────

function findRandomEmptyTile(dungeon: DungeonData, rng: RNG): { x: number; y: number } {
  const grid = dungeon.tiles.map(row => row.map(t => t.type));
  const { exitX, exitY, width, height } = dungeon;
  const candidates: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (dungeon.tiles[y][x].type !== TileType.Wall
          && hasPath(grid, width, height, x, y, exitX, exitY)) {
        candidates.push({ x, y });
      }
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
