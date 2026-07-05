import { TileType } from '../types';

export const CONFIG = {
  dungeon: {
    width: 12,
    height: 12,
    maxFloor: 11,
    /** Fog-of-war reveal radius around the player */
    revealRadius: 1,
  },

  fog: {
    /** FogExp2 density at floor 1 */
    min: 0.015,
    /** FogExp2 density at floor 99 */
    max: 0.045,
    /** Interpolated density for a given floor (1-based) */
    forFloor(floor: number): number {
      const t = (floor - 1) / (CONFIG.dungeon.maxFloor - 1);
      return CONFIG.fog.min + t * (CONFIG.fog.max - CONFIG.fog.min);
    },
  },

  weights: {
    /** Base tile-type weights for floor 1 */
    base: [
      { type: TileType.Empty,     weight: 40 },
      { type: TileType.Wall,      weight: 10 },
      { type: TileType.Reset,     weight: 18 },
      { type: TileType.Teleport,  weight: 18 },
      { type: TileType.RandomMap, weight: 8 },
      { type: TileType.Compass,   weight: 6 },
      { type: TileType.Scan,      weight: 6 },
      { type: TileType.Shield,    weight: 6 },
    ],

    /** Return floor-scaled weights. Higher floors = more walls & hazards, fewer rewards. */
    scaledForFloor(floor: number): Array<{ type: TileType; weight: number }> {
      const t = (floor - 1) / (CONFIG.dungeon.maxFloor - 1); // 0..1
      return [
        { type: TileType.Empty,     weight: Math.max(5, 40 - Math.floor(t * 25)) },
        { type: TileType.Wall,      weight: 10 + Math.floor(t * 30) },
        { type: TileType.Reset,     weight: 18 + Math.floor(t * 12) },
        { type: TileType.Teleport,  weight: 18 + Math.floor(t * 12) },
        { type: TileType.RandomMap, weight: 8 + Math.floor(t * 20) },
        { type: TileType.Compass,   weight: Math.max(2, 6 - Math.floor(t * 3)) },
        { type: TileType.Scan,      weight: Math.max(2, 6 - Math.floor(t * 3)) },
        { type: TileType.Shield,    weight: Math.max(2, 6 - Math.floor(t * 3)) },
      ];
    },
  },

  /** Tile types that are hazardous (blocked by shield) */
  hazardTypes: [TileType.Reset, TileType.Teleport, TileType.RandomMap] as readonly TileType[],

  generation: {
    /** Max recursive attempts before giving up */
    maxAttempts: 100,
    /** Safety path carve step limit */
    maxPathSteps: (w: number, h: number) => w * h * 3,
  },
};

export function isHazardType(type: TileType): boolean {
  return (CONFIG.hazardTypes as readonly TileType[]).includes(type);
}
