import * as THREE from 'three';
import { PlayerState } from './types';
import { tileToWorld } from './dungeon';

const MOVE_SPEED = 4.8; // units per second
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

  /** Move to the given tile coordinates. No validation — the engine handles that. */
  moveTo(x: number, y: number) {
    this.state.x = x;
    this.state.y = y;
    this.targetPos = tileToWorld(x, y);
    this.targetPos.y = PLAYER_Y;
    this.moving = true;
  }

  update(dt: number) {
    if (!this.moving) return;

    const dist = this.mesh.position.distanceTo(this.targetPos);
    const step = MOVE_SPEED * dt;
    if (dist <= step) {
      this.mesh.position.copy(this.targetPos);
      this.moving = false;
      return;
    }

    const dir = this.targetPos.clone().sub(this.mesh.position).normalize();
    this.mesh.position.add(dir.multiplyScalar(step));
  }
}
