import { describe, it, expect } from 'vitest';
import {
  ALL_RELICS,
  getRelicChoiceCount,
  getRevealRadiusBonus,
  isTeleportSafe,
  getExitWhisperDirection,
  shouldGainBackupShield,
  shouldResetCostStability,
  deepCacheRestoresStability,
} from '../game/relics';
import type { RelicId } from '../types';

describe('relics', () => {
  it('has 6 relics', () => {
    expect(ALL_RELICS.length).toBe(6);
  });

  it('choice count scales with cores', () => {
    expect(getRelicChoiceCount(0)).toBe(2);
    expect(getRelicChoiceCount(3)).toBe(2);
    expect(getRelicChoiceCount(4)).toBe(3);
    expect(getRelicChoiceCount(7)).toBe(3);
    expect(getRelicChoiceCount(8)).toBe(3);
  });

  it('afterglow adds reveal radius', () => {
    expect(getRevealRadiusBonus(['afterglow'])).toBe(1);
    expect(getRevealRadiusBonus([])).toBe(0);
  });

  it('teleport calibration avoids hazards', () => {
    expect(isTeleportSafe(['teleportCalib'])).toBe(true);
    expect(isTeleportSafe([])).toBe(false);
  });

  it('exit whisper returns screen-relative direction', () => {
    const dir = getExitWhisperDirection(
      { playerX: 0, playerY: 0, exitX: 2, exitY: 0, cameraAngle: 0 },
      ['exitWhisper'],
    );
    expect(dir).toBe('right');
  });

  it('backup shield granted at chapter start', () => {
    expect(shouldGainBackupShield(['backupShield'])).toBe(true);
    expect(shouldGainBackupShield([])).toBe(false);
  });

  it('stable anchor skips first reset stability cost', () => {
    expect(shouldResetCostStability(['stableAnchor'], 0)).toBe(false);
    expect(shouldResetCostStability(['stableAnchor'], 1)).toBe(true);
    expect(shouldResetCostStability([], 0)).toBe(true);
  });

  it('deep cache restores stability every 3 cores', () => {
    expect(deepCacheRestoresStability(['deepCache'], 2)).toBe(false);
    expect(deepCacheRestoresStability(['deepCache'], 3)).toBe(true);
    expect(deepCacheRestoresStability(['deepCache'], 6)).toBe(true);
    expect(deepCacheRestoresStability([], 3)).toBe(false);
  });
});
