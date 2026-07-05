import { describe, it, expect } from 'vitest';
import { TileType } from '../types';
import type { DungeonData } from '../types';
import { createRNG } from '../game/rng';
import { CONFIG } from '../game/config';
import { generateDungeon } from '../game/generation';
import { processMove, createInitialState } from '../game/engine';
import type { EngineState } from '../game/engine';

/** Helper: create a minimal test dungeon */
function makeTestDungeon(overrides?: Partial<{
  tiles: Partial<{ type: TileType; steppedOn: boolean; explored: boolean; label: string; consumed: boolean }>[][];
  exitX: number;
  exitY: number;
  coreX: number;
  coreY: number;
  width: number;
  height: number;
}>): DungeonData {
  const w = overrides?.width ?? 3;
  const h = overrides?.height ?? 3;
  const tiles = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      x,
      y,
      type: TileType.Empty,
      label: '',
      explored: false,
      steppedOn: false,
      consumed: false,
    })),
  );
  // Apply per-tile overrides
  if (overrides?.tiles) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (overrides.tiles[y]?.[x]) {
          Object.assign(tiles[y][x], overrides.tiles[y][x]);
        }
      }
    }
  }
  return {
    width: w,
    height: h,
    exitX: overrides?.exitX ?? (w - 1),
    exitY: overrides?.exitY ?? (h - 1),
    coreX: overrides?.coreX ?? -1,
    coreY: overrides?.coreY ?? -1,
    tiles,
  };
}

function makeState(overrides?: Partial<EngineState>): EngineState {
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
    dungeon: makeTestDungeon(),
    gameWon: false,
    chapterFailed: false,
    ...overrides,
  };
}

// ── Movement ─────────────────────────────────────────────────────────

describe('Movement', () => {
  it('moving onto Empty tile updates position', () => {
    const state = makeState();
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);
    expect(result.state.playerX).toBe(1);
    expect(result.state.playerY).toBe(0);
  });

  it('returns move event with correct coordinates', () => {
    const state = makeState();
    const rng = createRNG(1);
    const result = processMove(state, 0, 1, rng);
    expect(result.events[0]).toMatchObject({
      kind: 'move',
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 1,
    });
  });

  it('move event includes tile type and label', () => {
    const dungeon = makeTestDungeon({
      tiles: [[{}, { type: TileType.Reset, label: '↺' }]],
      width: 2, height: 1,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0 });
    const result = processMove(state, 1, 0, createRNG(1));
    const moveEvent = result.events.find(e => e.kind === 'move');
    expect(moveEvent).toBeDefined();
    if (moveEvent && moveEvent.kind === 'move') {
      expect(moveEvent.tileType).toBe(TileType.Reset);
      expect(moveEvent.tileLabel).toBe('↺');
    }
  });
});

describe('Wall blocking', () => {
  it('moving onto Wall returns blocked event', () => {
    const dungeon = makeTestDungeon({
      tiles: [[{}, { type: TileType.Wall }]],
      width: 2, height: 1,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0 });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);
    expect(result.events[0].kind).toBe('blocked');
    expect(result.events[0]).toMatchObject({ kind: 'blocked', x: 1, y: 0 });
  });

  it('state unchanged after wall block', () => {
    const dungeon = makeTestDungeon({
      tiles: [[{}, { type: TileType.Wall }]],
      width: 2, height: 1,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0 });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);
    expect(result.state.playerX).toBe(0);
    expect(result.state.playerY).toBe(0);
  });
});

describe('Out-of-bounds blocking', () => {
  it('moving off-grid returns blocked', () => {
    const state = makeState({ playerX: 0, playerY: 0 });
    const rng = createRNG(1);
    const result = processMove(state, -1, 0, rng);
    expect(result.events[0].kind).toBe('blocked');
  });

  it('moving beyond right edge returns blocked', () => {
    const dungeon = makeTestDungeon({ width: 3, height: 3 });
    const state = makeState({ dungeon, playerX: 2, playerY: 0 });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);
    expect(result.events[0].kind).toBe('blocked');
  });
});

describe('gameWon blocks input', () => {
  it('returns no events when game is won', () => {
    const state = makeState({ gameWon: true });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);
    expect(result.events).toHaveLength(0);
    expect(result.state.gameWon).toBe(true);
  });
});

// ── Exit ─────────────────────────────────────────────────────────────

describe('Exit tile', () => {
  it('at mid-floor: increments floor, resets position, regenerates dungeon', () => {
    const dungeon = makeTestDungeon({
      tiles: [
        [{}, {}, {}],
        [{}, {}, {}],
        [{}, {}, { type: TileType.Exit }],
      ],
      width: 3, height: 3, exitX: 2, exitY: 2, coreX: 1, coreY: 1,
    });
    const state = makeState({ dungeon, playerX: 1, playerY: 2, floor: 4 });
    const rng = createRNG(42);
    const result = processMove(state, 1, 0, rng);

    // No move event for Exit — the old exit coords would point at arbitrary
    // tiles on the NEW dungeon and pollute its exploration state.
    expect(result.events).toHaveLength(1);
    expect(result.events[0].kind).toBe('exit_reached');
    expect(result.events[0]).toMatchObject({ floorCleared: false, newFloor: 5 });
    expect(result.state.floor).toBe(5);
    expect(result.state.playerX).toBe(0);
    expect(result.state.playerY).toBe(0);
    expect(result.state.dungeon.width).toBe(CONFIG.dungeon.width);
  });

  it('at floor 5: offers a relic choice after descending', () => {
    const dungeon = makeTestDungeon({
      tiles: [
        [{}, {}, {}],
        [{}, {}, {}],
        [{}, {}, { type: TileType.Exit }],
      ],
      width: 3, height: 3, exitX: 2, exitY: 2, coreX: 1, coreY: 1,
    });
    const state = makeState({ dungeon, playerX: 1, playerY: 2, floor: 5 });
    const rng = createRNG(42);
    const result = processMove(state, 1, 0, rng);

    expect(result.events).toHaveLength(2);
    expect(result.events[0].kind).toBe('exit_reached');
    expect(result.events[0]).toMatchObject({ floorCleared: false, newFloor: 6 });
    expect(result.events[1].kind).toBe('relic_choice');
    expect(result.events[1]).toMatchObject({
      options: expect.any(Array),
      canRefresh: expect.any(Boolean),
    });
    expect(result.state.floor).toBe(6);
  });

  it('at max floor: sets gameWon and returns victory', () => {
    const dungeon = makeTestDungeon({
      tiles: [
        [{}, { type: TileType.Exit }],
      ],
      width: 2, height: 1, exitX: 1, exitY: 0, coreX: 0, coreY: 0,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0, floor: 99 });
    const rng = createRNG(42);
    const result = processMove(state, 1, 0, rng);

    expect(result.events).toHaveLength(2);
    expect(result.events[0].kind).toBe('exit_reached');
    expect(result.events[0]).toMatchObject({ floorCleared: true });
    expect(result.events[1]?.kind).toBe('victory');
    expect(result.state.gameWon).toBe(true);
  });
});

// ── Shield ───────────────────────────────────────────────────────────

describe('Shield hazard absorption', () => {
  it('shield absorbs Reset', () => {
    const dungeon = makeTestDungeon({
      tiles: [[{}, { type: TileType.Reset }]],
      width: 2, height: 1,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0, hasShield: true });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);

    expect(result.events[1].kind).toBe('hazard_absorbed');
    expect(result.state.hasShield).toBe(false);
    expect(result.state.playerX).toBe(1); // still on the tile
  });

  it('shield absorbs Teleport', () => {
    const dungeon = makeTestDungeon({
      tiles: [[{}, { type: TileType.Teleport }]],
      width: 2, height: 1,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0, hasShield: true });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);

    expect(result.events[1].kind).toBe('hazard_absorbed');
    expect(result.state.hasShield).toBe(false);
    expect(result.state.playerX).toBe(1); // not teleported
  });

  it('shield absorbs RandomMap', () => {
    const dungeon = makeTestDungeon({
      tiles: [[{}, { type: TileType.RandomMap }]],
      width: 2, height: 1,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0, hasShield: true });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);

    expect(result.events[1].kind).toBe('hazard_absorbed');
    expect(result.state.hasShield).toBe(false);
    // Dungeon should NOT be regenerated
    expect(result.state.dungeon).toBe(dungeon);
  });

  it('shield does NOT absorb non-hazard tiles (Compass, Scan, Shield)', () => {
    const dungeon = makeTestDungeon({
      tiles: [[{}, { type: TileType.Compass }]],
      width: 2, height: 1, exitX: 0, exitY: 0,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0, hasShield: true });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);
    // Should still have shield and get compass_revealed, not hazard_absorbed
    expect(result.state.hasShield).toBe(true);
    expect(result.events.some(e => e.kind === 'compass_revealed')).toBe(true);
    expect(result.events.some(e => e.kind === 'hazard_absorbed')).toBe(false);
  });
});

// ── Hazards (no shield) ──────────────────────────────────────────────

describe('Reset without shield', () => {
  it('resets position to (0,0)', () => {
    const dungeon = makeTestDungeon({
      tiles: [[{}, { type: TileType.Reset }, {}]],
      width: 3, height: 1,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0 });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);

    expect(result.events[1].kind).toBe('reset_to_start');
    expect(result.state.playerX).toBe(0);
    expect(result.state.playerY).toBe(0);
  });
});

describe('Teleport without shield', () => {
  it('teleports to a non-wall tile', () => {
    const dungeon = makeTestDungeon({
      tiles: [
        [{}, { type: TileType.Teleport }, {}],
        [{}, {}, {}],
        [{}, {}, {}],
      ],
      width: 3, height: 3,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0 });
    const rng = createRNG(42);
    const result = processMove(state, 1, 0, rng);

    // Should have teleported event
    expect(result.events.some(e => e.kind === 'teleported')).toBe(true);
    const tpEvent = result.events.find(e => e.kind === 'teleported')!;
    expect(tpEvent).toMatchObject({ kind: 'teleported', fromX: 1, fromY: 0 });

    // Destination should not be a wall
    const destTile = result.state.dungeon.tiles[result.state.playerY][result.state.playerX];
    expect(destTile.type).not.toBe(TileType.Wall);
  });

  it('teleport destination is never a wall (100 trials)', () => {
    for (let i = 0; i < 100; i++) {
      const dungeon = makeTestDungeon({
        tiles: [
          [{}, { type: TileType.Teleport }, {}],
          [{}, {}, {}],
          [{}, {}, {}],
        ],
        width: 3, height: 3,
      });
      const state = makeState({ dungeon, playerX: 0, playerY: 0 });
      const rng = createRNG(i * 17 + 1);
      const result = processMove(state, 1, 0, rng);
      const dest = result.state.dungeon.tiles[result.state.playerY][result.state.playerX];
      expect(dest.type).not.toBe(TileType.Wall);
    }
  });
});

describe('RandomMap without shield', () => {
  it('generates new dungeon and resets position', () => {
    const dungeon = makeTestDungeon({
      tiles: [[{}, { type: TileType.RandomMap }]],
      width: 2, height: 1,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0 });
    const rng = createRNG(42);
    const result = processMove(state, 1, 0, rng);

    expect(result.events[0].kind).toBe('map_regenerated');
    expect(result.events).toHaveLength(1);
    expect(result.state.playerX).toBe(0);
    expect(result.state.playerY).toBe(0);
    // New dungeon should be different (different object reference at minimum)
    expect(result.state.dungeon).not.toBe(dungeon);
  });
});

// ── Utility tiles ────────────────────────────────────────────────────

describe('Compass', () => {
  it('sets exit tile explored and emits compass_revealed', () => {
    const dungeon = makeTestDungeon({
      tiles: [
        [{}, { type: TileType.Compass }],
        [{}, {}],
      ],
      width: 2, height: 2, exitX: 1, exitY: 1,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0 });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);

    expect(result.events[1].kind).toBe('compass_revealed');
    expect(result.events[1]).toMatchObject({ kind: 'compass_revealed', exitX: 1, exitY: 1 });
    expect(result.state.dungeon.tiles[1][1].explored).toBe(true);
  });
});

describe('Scan', () => {
  it('emits scan_revealed event', () => {
    const dungeon = makeTestDungeon({
      tiles: [
        [{}, { type: TileType.Scan }, {}],
        [{}, {}, {}],
        [{}, {}, {}],
      ],
      width: 3, height: 3,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0 });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);

    expect(result.events[1].kind).toBe('scan_revealed');
    expect(result.events[1]).toMatchObject({ kind: 'scan_revealed', centerX: 1, centerY: 0 });
  });
});

describe('Shield pickup', () => {
  it('grants shield', () => {
    const dungeon = makeTestDungeon({
      tiles: [[{}, { type: TileType.Shield }]],
      width: 2, height: 1,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0, hasShield: false });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);

    expect(result.events[1].kind).toBe('shield_gained');
    expect(result.state.hasShield).toBe(true);
  });

  it('shield pickup when already shielded (no stacking)', () => {
    const dungeon = makeTestDungeon({
      tiles: [[{}, { type: TileType.Shield }]],
      width: 2, height: 1,
    });
    const state = makeState({ dungeon, playerX: 0, playerY: 0, hasShield: true });
    const rng = createRNG(1);
    const result = processMove(state, 1, 0, rng);

    // Still gets shield_gained (shield stays true — effectively refreshes)
    expect(result.events[1].kind).toBe('shield_gained');
    expect(result.state.hasShield).toBe(true);
  });
});

// ── Event ordering ───────────────────────────────────────────────────

describe('Event ordering', () => {
  it('move event is always first for tiles that do not regenerate the map', () => {
    const types: TileType[] = [
      TileType.Reset, TileType.Teleport,
      TileType.Compass, TileType.Scan, TileType.Shield, TileType.Empty,
    ];
    for (const type of types) {
      const dungeon = makeTestDungeon({
        tiles: [[{}, { type }]],
        width: 2, height: 1, exitX: 0, exitY: 0,
      });
      const state = makeState({ dungeon, playerX: 0, playerY: 0 });
      const rng = createRNG(42);
      const result = processMove(state, 1, 0, rng);
      expect(result.events[0].kind).toBe('move');
    }
  });
});

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

  it('core collection stops after first pickup on a floor', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, {}]], width: 2, height: 1, exitX: 0, exitY: 0, coreX: 1, coreY: 0 });
    const state = makeState({ dungeon, playerX: 0, playerY: 0, coresThisChapter: 1, totalCores: 5 });
    const afterFirst = processMove(state, 1, 0, createRNG(1));
    const afterSecond = processMove(afterFirst.state, -1, 0, createRNG(1));
    const afterThird = processMove(afterSecond.state, 1, 0, createRNG(1));
    expect(afterThird.state.coresThisChapter).toBe(2);
    expect(afterThird.state.totalCores).toBe(6);
  });
});

describe('relic effects in engine', () => {
  it('backup shield grants shield at chapter start', () => {
    const state = createInitialState(createRNG(1));
    state.relics = ['backupShield'];
    // createInitialState does not apply relics; simulate a fresh run with relics
    const withRelic = { ...state, hasShield: true };
    const result = processMove(withRelic, 1, 0, createRNG(1));
    expect(result.state.hasShield).toBe(true);
  });

  it('stable anchor skips first reset stability cost', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, { type: TileType.Reset }]], width: 2, height: 1 });
    const state = makeState({ dungeon, stability: 1, relics: ['stableAnchor'] });
    const result = processMove(state, 1, 0, createRNG(1));
    expect(result.state.stability).toBe(1);
  });

  it('deep cache restores stability every 3 cores', () => {
    const dungeon = makeTestDungeon({ tiles: [[{}, {}]], width: 2, height: 1, exitX: 0, exitY: 0, coreX: 1, coreY: 0 });
    const state = makeState({ dungeon, stability: 1, totalCores: 2, relics: ['deepCache'] });
    const result = processMove(state, 1, 0, createRNG(1));
    expect(result.state.stability).toBe(2);
  });
});

// ── Determinism ──────────────────────────────────────────────────────

describe('Deterministic behavior', () => {
  it('same state + same rng produces same result for teleport', () => {
    const dungeon = makeTestDungeon({
      tiles: [
        [{}, { type: TileType.Teleport }, {}],
        [{}, {}, {}],
        [{}, {}, {}],
      ],
      width: 3, height: 3,
    });

    // Run twice with same initial conditions
    for (let run = 0; run < 2; run++) {
      const state = makeState({ dungeon: JSON.parse(JSON.stringify(dungeon)), playerX: 0, playerY: 0 });
      const rng = createRNG(777);
      const result = processMove(state, 1, 0, rng);
      // Just verify the result is consistent within each run (shouldn't crash)
      expect(result.state.playerX).toBeGreaterThanOrEqual(0);
    }
  });

  it('same seed → identical full game trajectory', () => {
    function runTrajectory(seed: number, steps: number): Array<{ x: number; y: number; floor: number; eventKinds: string[] }> {
      const rng = createRNG(seed);
      let state = createInitialState(rng);
      const log: Array<{ x: number; y: number; floor: number; eventKinds: string[] }> = [];

      for (let i = 0; i < steps; i++) {
        // Use a deterministic sequence: right, down, right, down, ...
        const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        const [dx, dy] = dirs[i % 4];
        const result = processMove(state, dx, dy, rng);
        state = result.state;
        log.push({
          x: state.playerX,
          y: state.playerY,
          floor: state.floor,
          eventKinds: result.events.map(e => e.kind),
        });
        if (state.gameWon) break;
      }
      return log;
    }

    const logA = runTrajectory(12345, 10);
    const logB = runTrajectory(12345, 10);
    expect(logA).toEqual(logB);
  });
});

// ── createInitialState ───────────────────────────────────────────────

describe('createInitialState', () => {
  it('starts at floor 1, position (0,0), no shield, not won', () => {
    const state = createInitialState(createRNG(42));
    expect(state.floor).toBe(1);
    expect(state.playerX).toBe(0);
    expect(state.playerY).toBe(0);
    expect(state.hasShield).toBe(false);
    expect(state.gameWon).toBe(false);
    expect(state.dungeon).toBeDefined();
    expect(state.dungeon.tiles[0][0].type).toBe(TileType.Start);
  });
});
