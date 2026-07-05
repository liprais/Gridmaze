import * as THREE from 'three';
import { TileType, DungeonData } from './types';
import { getTileLabel } from './i18n';

// Re-export pure game logic from game/ for backward compatibility
export { generateDungeon, getTileAt, hasPath, isPassable, randomTileType, tileLabel } from './game/generation';

export const COLORS: Record<TileType, number> = {
  [TileType.Empty]:     0xd0d0d0,
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

// ── Rendering ──────────────────────────────────────────────────

export const TILE_SIZE = 1.2;
const PAD = 0.08;
const UNKNOWN_COLOR = 0x7a7a8a; // neutral grey for unrevealed tiles

// Shared geometries — created once, reused across all dungeon rebuilds
let sharedTileGeo: THREE.BoxGeometry | null = null;
let sharedFogGeo: THREE.BoxGeometry | null = null;

function getTileGeo(): THREE.BoxGeometry {
  if (!sharedTileGeo) sharedTileGeo = new THREE.BoxGeometry(TILE_SIZE - PAD, 0.12, TILE_SIZE - PAD);
  return sharedTileGeo;
}

function getFogGeo(): THREE.BoxGeometry {
  if (!sharedFogGeo) sharedFogGeo = new THREE.BoxGeometry(TILE_SIZE - PAD, 0.06, TILE_SIZE - PAD);
  return sharedFogGeo;
}

export interface DungeonMeshes {
  group: THREE.Group;
  tiles: THREE.Mesh[][];   // [y][x] — direct access to each tile mesh
  labels: THREE.Group;     // label sprites
  labelSprites: (THREE.Sprite | null)[][]; // null if no label
}

export function createDungeonMesh(dungeon: DungeonData): DungeonMeshes {
  const group = new THREE.Group();
  const meshes: THREE.Mesh[][] = [];
  const tileGeo = getTileGeo();

  for (let y = 0; y < dungeon.height; y++) {
    const row: THREE.Mesh[] = [];
    for (let x = 0; x < dungeon.width; x++) {
      const tile = dungeon.tiles[y][x];

      // Show true color only if stepped on; otherwise show unknown color
      const color = (tile.steppedOn || tile.type === TileType.Start)
        ? COLORS[tile.type]
        : UNKNOWN_COLOR;

      const mat = new THREE.MeshStandardMaterial({ color });
      const mesh = new THREE.Mesh(tileGeo, mat);
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

/** Dispose all GPU resources held by dungeon meshes (materials and label textures).
 *  Shared geometries are NOT disposed — they persist across rebuilds. */
export function disposeDungeonMeshes(meshes: DungeonMeshes): void {
  for (const row of meshes.tiles) {
    for (const mesh of row) {
      if (Array.isArray(mesh.material)) {
        for (const m of mesh.material) m.dispose();
      } else if (mesh.material) {
        mesh.material.dispose();
      }
    }
  }
  disposeLabelGroup(meshes.labels);
}

/** Dispose all label sprites and their canvas textures */
export function disposeLabelGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Sprite) {
      const mat = obj.material as THREE.SpriteMaterial;
      if (mat.map) {
        mat.map.dispose();
        mat.map = null;
      }
      mat.dispose();
    }
  });
}

/** Shared helper: create a label sprite directly printed on the tile.
 *  No background circle — the tile's own color provides contrast.
 *  `prominent` keeps hazard + exit labels at full size + opacity so they
 *  survive the shrink and stay legible when surrounded by quieter reward tiles. */
function createLabelSprite(
  label: string,
  x: number,
  y: number,
  prominent: boolean = false,
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: prominent ? 1.0 : 0.7,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x * TILE_SIZE, 0.4, y * TILE_SIZE);
  sprite.scale.set(prominent ? 0.7 : 0.55, prominent ? 0.7 : 0.55, 1);
  return sprite;
}

/** Hazard + Exit tiles use the prominent variant. Reward tiles (Compass /
 *  Scan / Shield) print quietly so a Scan-revealed floor doesn't read as a
 *  wall of labels. */
function isProminentLabelType(type: TileType): boolean {
  return (
    type === TileType.Reset ||
    type === TileType.Teleport ||
    type === TileType.RandomMap ||
    type === TileType.Exit
  );
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

      const sprite = createLabelSprite(tile.label, x, y, isProminentLabelType(tile.type));
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
    const sprite = createLabelSprite(tile.label, x, y, isProminentLabelType(tile.type));
    meshes.labels.add(sprite);
    meshes.labelSprites[y][x] = sprite;
  }
}

/** Update a consumed reward tile to look "spent" — its color desaturates toward
 *  mid-grey, and its label icon dims to 40% opacity, so the player still
 *  recognises what it used to be. Gameplay-wise the tile is now Empty (set by
 *  the engine), but visually it carries its former identity as a memory cue. */
export function consumeTileVisuals(
  dungeon: DungeonData,
  meshes: DungeonMeshes,
  x: number,
  y: number,
): void {
  const tile = dungeon.tiles[y][x];
  const originalType = tile.originalType ?? tile.type;

  const mesh = meshes.tiles[y][x];
  const original = new THREE.Color(COLORS[originalType]);
  const grey = new THREE.Color(0x888888);
  (mesh.material as THREE.MeshStandardMaterial).color.copy(original.lerp(grey, 0.65));

  // Dim the existing label sprite (it was created when the player stepped on
  // the tile, so the canvas texture already carries the original glyph).
  const sprite = meshes.labelSprites[y][x];
  if (sprite) {
    const mat = sprite.material as THREE.SpriteMaterial;
    mat.opacity = 0.4;
  }
}

/** Rebuild labels from scratch (used when regenerating dungeon) */
export function createTileLabels(dungeon: DungeonData): THREE.Group {
  const { group } = buildLabels(dungeon);
  return group;
}

/**
 * Rebuild all label sprites in-place — disposes old sprites and creates new ones.
 * Used when language changes at runtime (label text depends on current language).
 * Returns the new label group and sprites array to swap into DungeonMeshes.
 */
export function rebuildAllLabels(
  dungeon: DungeonData,
  oldMeshes: DungeonMeshes,
): { labels: THREE.Group; labelSprites: (THREE.Sprite | null)[][] } {
  // Dispose old label sprites
  disposeLabelGroup(oldMeshes.labels);

  // Rebuild labels for all stepped-on tiles (and start/exit tiles)
  const { group, sprites } = buildLabels(dungeon);
  return { labels: group, labelSprites: sprites };
}

// ── Fog of war ──────────────────────────────────────────────────

export function createFogOverlay(dungeon: DungeonData): {
  group: THREE.Group;
  meshes: THREE.Mesh[][];
} {
  const group = new THREE.Group();
  const meshes: THREE.Mesh[][] = [];
  const fogGeo = getFogGeo();
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

/** Dispose fog material (shared geometry is NOT disposed) */
export function disposeFogOverlay(fogData: { group: THREE.Group; meshes: THREE.Mesh[][] }): void {
  if (fogData.meshes.length > 0 && fogData.meshes[0].length > 0) {
    const mesh = fogData.meshes[0][0];
    if (Array.isArray(mesh.material)) {
      for (const m of mesh.material) m.dispose();
    } else if (mesh.material) {
      mesh.material.dispose();
    }
  }
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

  const sprite = createLabelSprite(tile.label, x, y, isProminentLabelType(tile.type));
  meshes.labels.add(sprite);
  meshes.labelSprites[y][x] = sprite;
}

/**
 * Reveal the entire floor: strip fog, mark every tile explored, and set true
 * color + label sprite. Used by the Scan tile — without this the player still
 * sees fog covering tiles whose color/label were "revealed" by revealTile.
 */
export function revealAll(
  fogMeshes: THREE.Mesh[][],
  dungeon: DungeonData,
  meshes: DungeonMeshes,
): void {
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      const tile = dungeon.tiles[y][x];
      tile.explored = true;
      fogMeshes[y][x].visible = false;
      // revealTile is a no-op if already steppedOn; safe to call unconditionally.
      revealTile(dungeon, meshes, x, y);
    }
  }
}

export function revealAround(
  fogMeshes: THREE.Mesh[][],
  dungeon: DungeonData,
  meshes: DungeonMeshes,
  cx: number,
  cy: number,
  radius: number,
  showAdjacentWalls: boolean = false,
): number {
  let count = 0;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) continue;
      if (dungeon.tiles[y][x].explored) continue;
      dungeon.tiles[y][x].explored = true;
      fogMeshes[y][x].visible = false;

      const tile = dungeon.tiles[y][x];
      // Walls: show immediately so player knows terrain
      if (tile.type === TileType.Wall) {
        (meshes.tiles[y][x].material as THREE.MeshStandardMaterial).color.set(COLORS[tile.type]);
      }

      count++;
    }
  }

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

export function worldToTile(worldX: number, worldZ: number): { x: number; y: number } {
  return {
    x: Math.round(worldX / TILE_SIZE),
    y: Math.round(worldZ / TILE_SIZE),
  };
}

export function tileToWorld(tileX: number, tileY: number): THREE.Vector3 {
  return new THREE.Vector3(tileX * TILE_SIZE, 0, tileY * TILE_SIZE);
}

// ── Hazard warning ─────────────────────────────────────────────

/** Create a red pulsing ring that warns of a nearby hazard tile. */
export function createHazardWarning(x: number, y: number): THREE.Mesh {
  const geo = new THREE.TorusGeometry(0.35, 0.05, 12, 24);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff0000,
    emissiveIntensity: 1.2,
    transparent: true,
    opacity: 0.85,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x * TILE_SIZE, 0.28, y * TILE_SIZE);
  mesh.userData = { baseY: 0.28 };
  return mesh;
}

/** Create a soft gold halo that hints at a hidden core tile when the player
 *  gets within proximity. Calmer than createHazardWarning: thinner ring,
 *  lower emissive, lower opacity, gold instead of red. The animation in
 *  main.ts pulses the emissive intensity for the "you're close" feel. */
export function createCoreHint(x: number, y: number): THREE.Mesh {
  const geo = new THREE.TorusGeometry(0.45, 0.025, 10, 24);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0xffd166,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.55,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x * TILE_SIZE, 0.18, y * TILE_SIZE);
  mesh.userData = { baseY: 0.18, kind: 'coreHint' };
  return mesh;
}

/** Small gold diamond glyph floating above the core tile. Pairs with
 *  createCoreHint so the player can read "there's a core here" — not just
 *  "there's something here". Same lifecycle as the ring: shown together,
 *  disposed together. */
export function createCoreIcon(x: number, y: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 64px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('◆', 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x * TILE_SIZE, 0.45, y * TILE_SIZE);
  sprite.scale.set(0.4, 0.4, 1);
  sprite.userData = { baseY: 0.45, kind: 'coreIcon' };
  return sprite;
}

/** Purple ring that expands and fades. Spawned at the teleport source and
 *  destination to mark vanish + appear points. The animation in main.ts
 *  drives scale (0.4 → 1.4) and opacity (1.0 → 0) over the puff lifetime. */
export function createTeleportPuff(x: number, y: number): THREE.Mesh {
  const geo = new THREE.TorusGeometry(0.3, 0.04, 12, 24);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x9b5de5,
    emissive: 0x9b5de5,
    emissiveIntensity: 1.4,
    transparent: true,
    opacity: 1.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x * TILE_SIZE, 0.25, y * TILE_SIZE);
  mesh.userData = { baseY: 0.25, kind: 'teleportPuff' };
  return mesh;
}
