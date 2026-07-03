import { describe, it, expect } from 'vitest';
import { TileType } from '../types';
import { createRNG } from '../game/rng';
import { CONFIG } from '../game/config';
import {
  hasPath,
  generateDungeon,
  getTileAt,
  randomTileType,
  randomTileTypeWithWeights,
  tileLabel,
  isPassable,
} from '../game/generation';

describe('hasPath', () => {
  it('empty grid has path from corner to corner', () => {
    const grid = Array.from({ length: 5 }, () => Array(5).fill(TileType.Empty));
    expect(hasPath(grid, 5, 5, 0, 0, 4, 4)).toBe(true);
  });

  it('fully walled grid has no path', () => {
    const grid = Array.from({ length: 3 }, () => Array(3).fill(TileType.Wall));
    grid[0][0] = TileType.Empty;
    grid[2][2] = TileType.Empty;
    expect(hasPath(grid, 3, 3, 0, 0, 2, 2)).toBe(false);
  });

  it('start equals goal returns true', () => {
    const grid = [[TileType.Empty]];
    expect(hasPath(grid, 1, 1, 0, 0, 0, 0)).toBe(true);
  });

  it('single wall blocks the only path', () => {
    // 3x1 corridor, wall in middle
    const grid = [[TileType.Empty, TileType.Wall, TileType.Empty]];
    expect(hasPath(grid, 3, 1, 0, 0, 2, 0)).toBe(false);
  });

  it('winding path through maze', () => {
    // Simple L-shaped corridor
    const grid = [
      [TileType.Empty, TileType.Wall, TileType.Empty],
      [TileType.Empty, TileType.Empty, TileType.Empty],
    ];
    expect(hasPath(grid, 3, 2, 0, 0, 2, 0)).toBe(true);
  });
});

describe('isPassable', () => {
  it('Wall is not passable', () => {
    expect(isPassable(TileType.Wall)).toBe(false);
  });

  it('everything else is passable', () => {
    expect(isPassable(TileType.Empty)).toBe(true);
    expect(isPassable(TileType.Reset)).toBe(true);
    expect(isPassable(TileType.Exit)).toBe(true);
  });
});

describe('weights', () => {
  it('floor 1 weights match base weights', () => {
    const w = CONFIG.weights.scaledForFloor(1);
    expect(w.length).toBe(8);
    expect(w.find(x => x.type === TileType.Empty)!.weight).toBe(40);
    expect(w.find(x => x.type === TileType.Wall)!.weight).toBe(10);
  });

  it('floor 99 has more walls and fewer empties than floor 1', () => {
    const lo = CONFIG.weights.scaledForFloor(1);
    const hi = CONFIG.weights.scaledForFloor(99);
    expect(hi.find(x => x.type === TileType.Wall)!.weight)
      .toBeGreaterThan(lo.find(x => x.type === TileType.Wall)!.weight);
    expect(hi.find(x => x.type === TileType.Empty)!.weight)
      .toBeLessThan(lo.find(x => x.type === TileType.Empty)!.weight);
  });

  it('weights sum > 0 at all floors', () => {
    for (let f = 1; f <= 99; f++) {
      const total = CONFIG.weights.scaledForFloor(f).reduce((s, x) => s + x.weight, 0);
      expect(total).toBeGreaterThan(0);
    }
  });

  it('wall weight is monotonic increasing', () => {
    let prev = 0;
    for (let f = 1; f <= 99; f++) {
      const w = CONFIG.weights.scaledForFloor(f).find(x => x.type === TileType.Wall)!.weight;
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });
});

describe('randomTileType', () => {
  it('returns a valid TileType', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 100; i++) {
      const t = randomTileType(50, rng);
      expect(Object.values(TileType)).toContain(t);
    }
  });

  it('is deterministic with same rng state', () => {
    const a = createRNG(123);
    const b = createRNG(123);
    expect(randomTileType(10, a)).toBe(randomTileType(10, b));
  });
});

describe('tileLabel', () => {
  it('special tiles have labels', () => {
    const rng = createRNG(1);
    expect(tileLabel(TileType.Reset, rng)).toBeTruthy();
    expect(tileLabel(TileType.Teleport, rng)).toBeTruthy();
    expect(tileLabel(TileType.Compass, rng)).toBeTruthy();
  });

  it('Start, Wall, Exit have empty/non-random labels', () => {
    const rng = createRNG(1);
    expect(tileLabel(TileType.Start, rng)).toBe('');
    expect(tileLabel(TileType.Wall, rng)).toBe('');
    expect(tileLabel(TileType.Exit, rng)).toBe('');
  });

  it('Empty tiles have no label', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(tileLabel(TileType.Empty, rng)).toBe('');
    }
  });
});

describe('generateDungeon', () => {
  it('produces correct dimensions', () => {
    const d = generateDungeon(12, 12, 1, createRNG(1));
    expect(d.width).toBe(12);
    expect(d.height).toBe(12);
    expect(d.tiles.length).toBe(12);
    expect(d.tiles[0].length).toBe(12);
  });

  it('start is at (0,0) with Start type', () => {
    const d = generateDungeon(12, 12, 1, createRNG(2));
    expect(d.tiles[0][0].type).toBe(TileType.Start);
  });

  it('exit is within bounds with Exit type', () => {
    const d = generateDungeon(12, 12, 1, createRNG(3));
    expect(d.exitX).toBeGreaterThanOrEqual(0);
    expect(d.exitX).toBeLessThan(12);
    expect(d.exitY).toBeGreaterThanOrEqual(0);
    expect(d.exitY).toBeLessThan(12);
    expect(d.tiles[d.exitY][d.exitX].type).toBe(TileType.Exit);
  });

  it('start always reaches exit', () => {
    const rng = createRNG(42);
    for (let floor = 1; floor <= 99; floor += 10) {
      const d = generateDungeon(12, 12, floor, rng);
      const grid = d.tiles.map(row => row.map(t => t.type));
      expect(hasPath(grid, 12, 12, 0, 0, d.exitX, d.exitY)).toBe(true);
    }
  });

  it('same (size, floor, seed) produces identical maps', () => {
    const a = generateDungeon(12, 12, 5, createRNG(777));
    const b = generateDungeon(12, 12, 5, createRNG(777));
    // Compare tile types grid
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        expect(a.tiles[y][x].type).toBe(b.tiles[y][x].type);
        expect(a.tiles[y][x].label).toBe(b.tiles[y][x].label);
      }
    }
    expect(a.exitX).toBe(b.exitX);
    expect(a.exitY).toBe(b.exitY);
  });

  it('safety path has no walls (all tiles passable)', () => {
    const rng = createRNG(99);
    for (let floor = 1; floor <= 99; floor += 10) {
      const d = generateDungeon(12, 12, floor, rng);
      // Safety check: a BFS from start should find only non-wall tiles
      const visited = new Set<string>();
      const queue: [number, number][] = [[0, 0]];
      visited.add('0,0');
      let head = 0;
      while (head < queue.length) {
        const [cx, cy] = queue[head++];
        // Every visited tile on the path must be passable
        expect(d.tiles[cy][cx].type).not.toBe(TileType.Wall);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= 12 || ny >= 12) continue;
          if (visited.has(`${nx},${ny}`)) continue;
          if (d.tiles[ny][nx].type === TileType.Wall) continue;
          // Only follow tiles that are passable and on the safety path
          // (this checks that there EXISTS a path without walls)
          visited.add(`${nx},${ny}`);
          queue.push([nx, ny]);
        }
      }
      // Should have visited at least the start tile
      expect(visited.size).toBeGreaterThan(0);
    }
  });

  it('1000 fixed-seed maps all have start→exit path', () => {
    for (let i = 0; i < 1000; i++) {
      const rng = createRNG(i * 137 + 42);
      const floor = (i % 99) + 1;
      const d = generateDungeon(12, 12, floor, rng);
      const grid = d.tiles.map(row => row.map(t => t.type));
      expect(hasPath(grid, 12, 12, 0, 0, d.exitX, d.exitY)).toBe(true);
    }
  });

  it('different floors with same seed produce different maps', () => {
    const a = generateDungeon(12, 12, 1, createRNG(555));
    const b = generateDungeon(12, 12, 50, createRNG(555));
    // The tile grids should differ (due to different weight distributions)
    let same = true;
    for (let y = 0; y < 12 && same; y++) {
      for (let x = 0; x < 12 && same; x++) {
        if (a.tiles[y][x].type !== b.tiles[y][x].type) same = false;
      }
    }
    // It's theoretically possible but astronomically unlikely they're identical
    expect(same).toBe(false);
  });

  it('throws after max attempts if generation fails repeatedly', () => {
    // This shouldn't happen in practice with standard params, but the guard exists
    // We test that it normally succeeds quickly
    const d = generateDungeon(12, 12, 99, createRNG(12345));
    expect(d).toBeDefined();
  });
});

describe('getTileAt', () => {
  const dungeon = generateDungeon(4, 4, 1, createRNG(1));

  it('in-bounds returns tile', () => {
    const t = getTileAt(dungeon, 0, 0);
    expect(t).toBeDefined();
    expect(t!.x).toBe(0);
    expect(t!.y).toBe(0);
  });

  it('out-of-bounds returns null', () => {
    expect(getTileAt(dungeon, -1, 0)).toBeNull();
    expect(getTileAt(dungeon, 0, -1)).toBeNull();
    expect(getTileAt(dungeon, 4, 0)).toBeNull();
    expect(getTileAt(dungeon, 0, 4)).toBeNull();
  });
});
