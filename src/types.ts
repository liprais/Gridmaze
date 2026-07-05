export enum TileType {
  Empty = 0,
  Reset = 1,       // 重开 — back to start
  Teleport = 2,    // 传送 — random tile
  RandomMap = 3,   // 随机地图 — regenerate floor
  Compass = 4,     // 指南针 — reveal exit location
  Scan = 5,        // 扫描 — reveal entire floor
  Shield = 6,      // 护盾 — block next event
  Exit = 7,
  Wall = 8,
  Start = 9,
}

export interface Tile {
  x: number;
  y: number;
  type: TileType;
  label: string;
  explored: boolean;   // fog removed
  steppedOn: boolean;  // player has walked on it → show true color
  consumed: boolean;   // one-time reward tile has been used
  originalType: TileType | null; // pre-consume type, so the tile can still
                                 //   display its former identity (grey color +
                                 //   dimmed icon) after the effect is spent.
}

export interface DungeonData {
  width: number;
  height: number;
  exitX: number;
  exitY: number;
  coreX: number;
  coreY: number;
  tiles: Tile[][];
}

export interface PlayerState {
  x: number;
  y: number;
  floor: number;
}

export interface GameState {
  player: PlayerState;
  dungeon: DungeonData;
  log: string[];
}

export type RelicId =
  | 'afterglow'
  | 'backupShield'
  | 'stableAnchor'
  | 'teleportCalib'
  | 'exitWhisper'
  | 'deepCache';

export type ChapterZone = 'survey' | 'dark' | 'unstable';
