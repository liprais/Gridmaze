import { TileType, DungeonData, Tile } from '../types';
import { CONFIG } from './config';
import type { RNG } from './rng';

// ── Built-in English label map (game/ must not depend on i18n) ────

const EN_LABELS: Record<number, string> = {
  [TileType.Reset]:     '↺',
  [TileType.Teleport]:  '↗',
  [TileType.RandomMap]: '?',
  [TileType.Compass]:   '⌖',
  [TileType.Scan]:      '◎',
  [TileType.Shield]:    '◈',
};

// i18n hook: main.ts injects a label provider (e.g. i18n.getTileLabel) so
// freshly-generated dungeons carry the active language's symbols. Falls back to
// EN_LABELS when no provider is installed (tests, server-side rendering).
let labelProvider: ((type: TileType) => string) | null = null;

export function setLabelProvider(fn: ((type: TileType) => string) | null): void {
  labelProvider = fn;
}

// ── Path / passability ─────────────────────────────────────────────

export function isPassable(type: TileType): boolean {
  return type !== TileType.Wall;
}

/** BFS to verify a path exists from start to goal (only walls block) */
export function hasPath(
  grid: TileType[][],
  w: number,
  h: number,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): boolean {
  if (sx === gx && sy === gy) return true;
  const visited = new Uint8Array(w * h);
  const queue: [number, number][] = [[sx, sy]];
  visited[sy * w + sx] = 1;
  let head = 0;

  while (head < queue.length) {
    const [cx, cy] = queue[head++];
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (visited[ny * w + nx]) continue;
      if (!isPassable(grid[ny][nx])) continue;
      if (nx === gx && ny === gy) return true;
      visited[ny * w + nx] = 1;
      queue.push([nx, ny]);
    }
  }
  return false;
}

// ── Weighted random ─────────────────────────────────────────────────

/** Pick a random tile type based on weighted distribution */
export function randomTileTypeWithWeights(
  weights: Array<{ type: TileType; weight: number }>,
  rng: RNG,
): TileType {
  const total = weights.reduce((s, x) => s + x.weight, 0);
  let r = rng.next() * total;
  for (const { type, weight } of weights) {
    r -= weight;
    if (r <= 0) return type;
  }
  return TileType.Empty;
}

export function randomTileType(floor: number, rng: RNG): TileType {
  return randomTileTypeWithWeights(CONFIG.weights.scaledForFloor(floor), rng);
}

// ── Labels ──────────────────────────────────────────────────────────

/** Generate a label for a tile, using English characters (no i18n dependency). */
export function tileLabel(type: TileType, rng: RNG): string {
  if (type === TileType.Empty) return '';
  if (labelProvider) return labelProvider(type);
  return EN_LABELS[type] ?? '';
}

// ── Generation ──────────────────────────────────────────────────────

export function generateDungeon(
  width: number,
  height: number,
  floor: number,
  rng: RNG,
): DungeonData {
  for (let attempt = 0; attempt < CONFIG.generation.maxAttempts; attempt++) {
    const result = tryGenerate(width, height, floor, rng);
    if (result) return result;
  }
  throw new Error(
    `Failed to generate a valid dungeon after ${CONFIG.generation.maxAttempts} attempts (floor=${floor})`,
  );
}

function tryGenerate(
  width: number,
  height: number,
  floor: number,
  rng: RNG,
): DungeonData | null {
  const sx = 0, sy = 0;
  const ex = width - 2 + rng.nextInt(2);
  const ey = height - 2 + rng.nextInt(2);

  // Step 1: carve a guaranteed passable path from start to exit
  const safe = new Uint8Array(width * height);
  safe[sy * width + sx] = 1;

  let cx = sx, cy = sy;
  const t = (floor - 1) / (CONFIG.dungeon.maxFloor - 1);
  const pickFromN = 2 + Math.floor(t * 3); // 2 → 5
  const maxSteps = CONFIG.generation.maxPathSteps(width, height);
  let steps = 0;

  while ((cx !== ex || cy !== ey) && steps < maxSteps) {
    steps++;
    const cands: [number, number][] = [];
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (nx === sx && ny === sy && !(ex === sx && ey === sy)) continue;
      cands.push([nx, ny]);
    }
    if (cands.length === 0) break;

    // Prefer tiles closer to the goal
    cands.sort((a, b) => {
      const da = Math.abs(a[0] - ex) + Math.abs(a[1] - ey);
      const db = Math.abs(b[0] - ex) + Math.abs(b[1] - ey);
      return da - db;
    });

    const pickFrom = Math.min(pickFromN, cands.length);
    const [nx, ny] = cands[rng.nextInt(pickFrom)];

    cx = nx; cy = ny;
    safe[cy * width + cx] = 1;
  }

  safe[sy * width + sx] = 1;
  safe[ey * width + ex] = 1;

  // Step 2: fill tiles using floor-scaled weights
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < width; x++) {
      let type: TileType;
      if (safe[y * width + x]) {
        type = TileType.Empty;
      } else {
        type = randomTileType(floor, rng);
      }
      row.push({ x, y, type, label: tileLabel(type, rng), explored: false, steppedOn: false });
    }
    tiles.push(row);
  }

  tiles[sy][sx].type = TileType.Start;
  tiles[sy][sx].label = '';
  tiles[ey][ex].type = TileType.Exit;
  // Exit label is also language-aware: 'EX' for English, '出' for Chinese.
  tiles[ey][ex].label = labelProvider ? labelProvider(TileType.Exit) : 'EX';

  // Safety check: start must reach exit
  if (!hasPath(tiles.map(r => r.map(t => t.type)), width, height, sx, sy, ex, ey)) {
    return null; // retry
  }

  return { width, height, exitX: ex, exitY: ey, tiles };
}

// ── Queries ─────────────────────────────────────────────────────────

export function getTileAt(dungeon: DungeonData, x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) return null;
  return dungeon.tiles[y][x];
}
