import * as THREE from 'three';
import { PlayerState, TileType, DungeonData } from './types';
import { tileToWorld, getTileAt } from './dungeon';

const MOVE_SPEED = 0.08; // units per frame
export const PLAYER_Y = 0.35;

export class Player {
  public mesh: THREE.Mesh;
  private state: PlayerState;
  private targetPos: THREE.Vector3;
  private moving: boolean = false;
  public shield: boolean = false;

  constructor(state: PlayerState) {
    this.state = { ...state };

    const geo = new THREE.BoxGeometry(0.35, 0.5, 0.35);
    const mat = new THREE.MeshStandardMaterial({ color: 0x118ab2, emissive: 0x0a3d5c, roughness: 0.3 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;

    this.targetPos = tileToWorld(state.x, state.y);
    this.targetPos.y = PLAYER_Y;
    this.mesh.position.copy(this.targetPos);
  }

  get x() { return this.state.x; }
  get y() { return this.state.y; }
  get floor() { return this.state.floor; }
  get isMoving() { return this.moving; }
  get hasShield() { return this.shield; }

  setShield(on: boolean) {
    this.shield = on;
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    if (on) {
      mat.emissive.set(0xffd166);
      mat.emissiveIntensity = 0.6;
    } else {
      mat.emissive.set(0x0a3d5c);
      mat.emissiveIntensity = 1;
    }
  }

  resetPosition(x: number, y: number) {
    this.state.x = x;
    this.state.y = y;
    this.targetPos = tileToWorld(x, y);
    this.targetPos.y = PLAYER_Y;
    this.mesh.position.copy(this.targetPos);
    this.moving = false;
  }

  /** Try to move one tile in the given direction. Returns an event description, or null if blocked. */
  attemptMove(dx: number, dy: number, dungeon: DungeonData): PlayerAction | null {
    if (this.moving) return null;

    const nx = this.state.x + dx;
    const ny = this.state.y + dy;
    const tile = getTileAt(dungeon, nx, ny);

    if (!tile) return null;
    if (tile.type === TileType.Wall) return null;

    this.state.x = nx;
    this.state.y = ny;
    this.targetPos = tileToWorld(nx, ny);
    this.targetPos.y = PLAYER_Y;
    this.moving = true;

    return {
      tileType: tile.type,
      label: tile.label,
      x: nx,
      y: ny,
    };
  }

  update() {
    if (!this.moving) return;

    const dist = this.mesh.position.distanceTo(this.targetPos);
    if (dist < 0.02) {
      this.mesh.position.copy(this.targetPos);
      this.moving = false;
      return;
    }

    const dir = this.targetPos.clone().sub(this.mesh.position).normalize();
    this.mesh.position.add(dir.multiplyScalar(MOVE_SPEED));
  }
}

export interface PlayerAction {
  tileType: TileType;
  label: string;
  x: number;
  y: number;
}
