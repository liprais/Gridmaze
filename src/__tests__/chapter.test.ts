import { describe, it, expect } from 'vitest';
import { getZoneForFloor, getChapterRules } from '../game/chapter';

describe('chapter rules', () => {
  it('maps floors to zones', () => {
    expect(getZoneForFloor(1)).toBe('survey');
    expect(getZoneForFloor(4)).toBe('survey');
    expect(getZoneForFloor(5)).toBe('dark');
    expect(getZoneForFloor(8)).toBe('dark');
    expect(getZoneForFloor(9)).toBe('unstable');
    expect(getZoneForFloor(11)).toBe('unstable');
  });

  it('survey has reveal radius 1 and no warning', () => {
    const rules = getChapterRules(2);
    expect(rules.revealRadius).toBe(1);
    expect(rules.warnRandomMap).toBe(false);
    expect(rules.randomMapWeightBonus).toBe(0);
    expect(rules.showAdjacentWalls).toBe(false);
  });

  it('dark has reveal radius 0 and shows adjacent walls', () => {
    const rules = getChapterRules(6);
    expect(rules.revealRadius).toBe(0);
    expect(rules.showAdjacentWalls).toBe(true);
  });

  it('unstable boosts RandomMap and enables warning', () => {
    const rules = getChapterRules(10);
    expect(rules.randomMapWeightBonus).toBeGreaterThan(0);
    expect(rules.warnRandomMap).toBe(true);
  });
});
