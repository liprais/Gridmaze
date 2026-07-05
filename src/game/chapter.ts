import { ChapterZone } from '../types';

export interface ChapterRules {
  zone: ChapterZone;
  revealRadius: number;
  /** Dark zone: always show wall silhouettes in the four adjacent tiles. */
  showAdjacentWalls: boolean;
  randomMapWeightBonus: number;
  warnRandomMap: boolean;
}

export function getZoneForFloor(floor: number): ChapterZone {
  if (floor >= 1 && floor <= 4) return 'survey';
  if (floor >= 5 && floor <= 8) return 'dark';
  return 'unstable';
}

export function getChapterRules(floor: number): ChapterRules {
  const zone = getZoneForFloor(floor);
  switch (zone) {
    case 'survey':
      return { zone, revealRadius: 1, showAdjacentWalls: false, randomMapWeightBonus: 0, warnRandomMap: false };
    case 'dark':
      return { zone, revealRadius: 0, showAdjacentWalls: true, randomMapWeightBonus: 0, warnRandomMap: false };
    case 'unstable':
      return { zone, revealRadius: 1, showAdjacentWalls: false, randomMapWeightBonus: 12, warnRandomMap: true };
  }
}
