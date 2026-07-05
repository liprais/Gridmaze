import { describe, it, expect } from 'vitest';
import { Player } from '../player';

describe('Player movement', () => {
  it('moves the same distance regardless of frame rate', () => {
    const playerA = new Player({ x: 0, y: 0, floor: 1 });
    playerA.moveTo(100, 0);
    for (let i = 0; i < 60; i++) playerA.update(1 / 60);

    const playerB = new Player({ x: 0, y: 0, floor: 1 });
    playerB.moveTo(100, 0);
    for (let i = 0; i < 120; i++) playerB.update(1 / 120);

    expect(playerA.mesh.position.x).toBeCloseTo(playerB.mesh.position.x, 5);
  });

  it('still reaches the target tile', () => {
    const player = new Player({ x: 0, y: 0, floor: 1 });
    player.moveTo(2, 0);
    for (let i = 0; i < 120; i++) player.update(1 / 120);

    expect(player.isMoving).toBe(false);
    expect(player.mesh.position.x).toBeCloseTo(2.4, 5); // TILE_SIZE = 1.2
  });
});
