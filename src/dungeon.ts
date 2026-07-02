import * as THREE from 'three';
import { TileType, DungeonData, Tile } from './types';

const COLORS: Record<TileType, number> = {
  [TileType.Empty]:     0xeeeeee,
  [TileType.Reset]:     0x457b9d,
  [TileType.Teleport]:  0x9b5de5,
  [TileType.RandomMap]: 0xe63946,
  [TileType.Compass]:   0xf4a261,
  [TileType.Scan]:      0x00bbf9,
  [TileType.Shield]:    0xffd166,
  [TileType.Exit]:      0x06d6a0,
  [TileType.Wall]:      0x1a1a2e,
  [TileType.Start]:     0x118ab2,
};

const BASE_WEIGHTS: { type: TileType; weight: number }[] = [
  { type: TileType.Empty,     weight: 40 },
  { type: TileType.Wall,      weight: 10 },
  { type: TileType.Reset,     weight: 18 },
  { type: TileType.Teleport,  weight: 18 },
  { type: TileType.RandomMap, weight: 8 },
  { type: TileType.Compass,   weight: 6 },
  { type: TileType.Scan,      weight: 6 },
  { type: TileType.Shield,    weight: 6 },
];

/**
 * Return scaled weights for a given floor (1-99).
 * Higher floors = more walls, more events, more rewards, fewer empty tiles.
 */
function scaledWeights(floor: number): { type: TileType; weight: number }[] {
  const t = (floor - 1) / 98; // 0..1
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
}

function randomTileType(floor: number): TileType {
  const w = scaledWeights(floor);
  const total = w.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const { type, weight } of w) {
    r -= weight;
    if (r <= 0) return type;
  }
  return TileType.Empty;
}

function tileLabel(type: TileType): string {
  switch (type) {
    case TileType.Reset:     return '↺';
    case TileType.Teleport:  return '↗';
    case TileType.RandomMap: return '?';
    case TileType.Compass:   return '⌖';
    case TileType.Scan:      return '◎';
    case TileType.Shield:    return '◈';
    case TileType.Empty:     return Math.random() < 0.1 ? String(Math.floor(Math.random() * 9)) : '';
    default:                 return '';
  }
}

/**
 * Check whether stepping on this tile type is allowed
 * (only Wall blocks movement)
 */
function isPassable(type: TileType): boolean {
  return type !== TileType.Wall;
}

/** BFS to verify a path exists from start to goal (only walls block) */
function hasPath(
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

export function generateDungeon(
  width: number,
  height: number,
  floor: number
): DungeonData {
  const sx = 0, sy = 0;
  const ex = width - 2 + Math.floor(Math.random() * 2);
  const ey = height - 2 + Math.floor(Math.random() * 2);

  // Step 1: carve a guaranteed passable path from start to exit
  const safe = new Uint8Array(width * height);
  safe[sy * width + sx] = 1;

  let cx = sx, cy = sy;
  const maxSteps = width * height * 3;
  let steps = 0;

  // Higher floors → more winding (pick from more candidates)
  const t = (floor - 1) / 98;
  const pickFromN = 2 + Math.floor(t * 3); // 2 → 5

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

    // Higher floors: more winding paths
    const pickFrom = Math.min(pickFromN, cands.length);
    const [nx, ny] = cands[Math.floor(Math.random() * pickFrom)];

    cx = nx; cy = ny;
    safe[cy * width + cx] = 1;
  }

  safe[sy * width + sx] = 1;
  safe[ey * width + ex] = 1;

  // Step 2: fill tiles (use floor-scaled weights)
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < width; x++) {
      let type: TileType;
      if (safe[y * width + x]) {
        type = TileType.Empty;
      } else {
        type = randomTileType(floor);
      }
      row.push({ x, y, type, label: tileLabel(type), explored: false, steppedOn: false });
    }
    tiles.push(row);
  }

  tiles[sy][sx].type = TileType.Start;
  tiles[sy][sx].label = '';
  tiles[ey][ex].type = TileType.Exit;
  tiles[ey][ex].label = 'EX';

  // Safety check
  if (!hasPath(tiles.map(r => r.map(t => t.type)), width, height, sx, sy, ex, ey)) {
    return generateDungeon(width, height, floor);
  }

  return { width, height, exitX: ex, exitY: ey, tiles };
}

// ── Rendering ──────────────────────────────────────────────────

const TILE_SIZE = 1.2;
const PAD = 0.08;
const UNKNOWN_COLOR = 0x7a7a8a; // neutral grey for unrevealed tiles

export interface DungeonMeshes {
  group: THREE.Group;
  tiles: THREE.Mesh[][];   // [y][x] — direct access to each tile mesh
  labels: THREE.Group;     // label sprites
  labelSprites: (THREE.Sprite | null)[][]; // null if no label
}

export function createDungeonMesh(dungeon: DungeonData): DungeonMeshes {
  const group = new THREE.Group();
  const meshes: THREE.Mesh[][] = [];

  for (let y = 0; y < dungeon.height; y++) {
    const row: THREE.Mesh[] = [];
    for (let x = 0; x < dungeon.width; x++) {
      const tile = dungeon.tiles[y][x];

      // Show true color only if stepped on; otherwise show unknown color
      const color = (tile.steppedOn || tile.type === TileType.Start)
        ? COLORS[tile.type]
        : UNKNOWN_COLOR;

      const geo = new THREE.BoxGeometry(TILE_SIZE - PAD, 0.12, TILE_SIZE - PAD);
      const mat = new THREE.MeshStandardMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x * TILE_SIZE, 0, y * TILE_SIZE);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { tileX: x, tileY: y };
      group.add(mesh);
      row.push(mesh);
    }
    meshes.push(row);
  }

  // Create labels (only for revealed tiles)
  const { group: labelGroup, sprites } = buildLabels(dungeon);

  return { group, tiles: meshes, labels: labelGroup, labelSprites: sprites };
}

/** Shared helper: create a label sprite with dark background circle for contrast */
function createLabelSprite(label: string, x: number, y: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // Dark background circle for visibility on grey tiles
  ctx.beginPath();
  ctx.arc(64, 64, 42, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 10, 20, 0.6)';
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x * TILE_SIZE, 0.4, y * TILE_SIZE);
  sprite.scale.set(0.85, 0.85, 1);
  return sprite;
}

function buildLabels(dungeon: DungeonData): { group: THREE.Group; sprites: (THREE.Sprite | null)[][] } {
  const group = new THREE.Group();
  const sprites: (THREE.Sprite | null)[][] = [];

  for (let y = 0; y < dungeon.height; y++) {
    const row: (THREE.Sprite | null)[] = [];
    for (let x = 0; x < dungeon.width; x++) {
      const tile = dungeon.tiles[y][x];
      if (!tile.label || !(tile.steppedOn || tile.type === TileType.Start)) {
        row.push(null);
        continue;
      }

      const sprite = createLabelSprite(tile.label, x, y);
      group.add(sprite);
      row.push(sprite);
    }
    sprites.push(row);
  }

  return { group, sprites };
}

/** Reveal a tile's true color and label after player steps on it */
export function revealTile(
  dungeon: DungeonData,
  meshes: DungeonMeshes,
  x: number,
  y: number,
): void {
  const tile = dungeon.tiles[y][x];
  if (tile.steppedOn) return;
  tile.steppedOn = true;

  // Update mesh color
  const mesh = meshes.tiles[y][x];
  (mesh.material as THREE.MeshStandardMaterial).color.set(COLORS[tile.type]);

  // Add label sprite if there is one
  if (tile.label && !meshes.labelSprites[y][x]) {
    const sprite = createLabelSprite(tile.label, x, y);
    meshes.labels.add(sprite);
    meshes.labelSprites[y][x] = sprite;
  }
}

/** Rebuild labels from scratch (used when regenerating dungeon) */
export function createTileLabels(dungeon: DungeonData): THREE.Group {
  const { group } = buildLabels(dungeon);
  return group;
}

// ── Fog of war ──────────────────────────────────────────────────

export function createFogOverlay(dungeon: DungeonData): {
  group: THREE.Group;
  meshes: THREE.Mesh[][];
} {
  const group = new THREE.Group();
  const meshes: THREE.Mesh[][] = [];
  const fogGeo = new THREE.BoxGeometry(TILE_SIZE - PAD, 0.06, TILE_SIZE - PAD);
  const fogMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 });

  for (let y = 0; y < dungeon.height; y++) {
    const row: THREE.Mesh[] = [];
    for (let x = 0; x < dungeon.width; x++) {
      const mesh = new THREE.Mesh(fogGeo, fogMat);
      mesh.position.set(x * TILE_SIZE, 0.22, y * TILE_SIZE);
      mesh.receiveShadow = true;
      group.add(mesh);
      row.push(mesh);
    }
    meshes.push(row);
  }

  return { group, meshes };
}

/** Show only the label sprite (no color change, no steppedOn flag) */
export function showLabel(
  dungeon: DungeonData,
  meshes: DungeonMeshes,
  x: number,
  y: number,
): void {
  const tile = dungeon.tiles[y][x];
  if (!tile.label) return;
  if (meshes.labelSprites[y][x]) return;

  const sprite = createLabelSprite(tile.label, x, y);
  meshes.labels.add(sprite);
  meshes.labelSprites[y][x] = sprite;
}

export function revealAround(
  fogMeshes: THREE.Mesh[][],
  dungeon: DungeonData,
  meshes: DungeonMeshes,
  cx: number,
  cy: number,
  radius: number,
): number {
  let count = 0;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) continue;
      if (dungeon.tiles[y][x].explored) continue;
      dungeon.tiles[y][x].explored = true;
      fogMeshes[y][x].visible = false;

      const tile = dungeon.tiles[y][x];
      // Walls: show immediately since you can't step on them
      if (tile.type === TileType.Wall) {
        (meshes.tiles[y][x].material as THREE.MeshStandardMaterial).color.set(COLORS[TileType.Wall]);
      }
      // Show label symbol so player knows what to expect
      if (tile.label) {
        showLabel(dungeon, meshes, x, y);
      }

      count++;
    }
  }
  return count;
}

export function getTileAt(dungeon: DungeonData, x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) return null;
  return dungeon.tiles[y][x];
}

export function worldToTile(worldX: number, worldZ: number): { x: number; y: number } {
  return {
    x: Math.round(worldX / TILE_SIZE),
    y: Math.round(worldZ / TILE_SIZE),
  };
}

export function tileToWorld(tileX: number, tileY: number): THREE.Vector3 {
  return new THREE.Vector3(tileX * TILE_SIZE, 0, tileY * TILE_SIZE);
}
