import { RelicId } from '../types';

export interface RelicInfo {
  id: RelicId;
  nameKey: string;
  descKey: string;
}

export const ALL_RELICS: RelicInfo[] = [
  { id: 'afterglow', nameKey: 'relic.afterglow.name', descKey: 'relic.afterglow.desc' },
  { id: 'backupShield', nameKey: 'relic.backupShield.name', descKey: 'relic.backupShield.desc' },
  { id: 'stableAnchor', nameKey: 'relic.stableAnchor.name', descKey: 'relic.stableAnchor.desc' },
  { id: 'teleportCalib', nameKey: 'relic.teleportCalib.name', descKey: 'relic.teleportCalib.desc' },
  { id: 'exitWhisper', nameKey: 'relic.exitWhisper.name', descKey: 'relic.exitWhisper.desc' },
  { id: 'deepCache', nameKey: 'relic.deepCache.name', descKey: 'relic.deepCache.desc' },
];

export function getRelicChoiceCount(coresThisChapter: number): number {
  if (coresThisChapter <= 3) return 2;
  return 3;
}

export function canRefreshChoices(coresThisChapter: number): boolean {
  return coresThisChapter >= 8;
}

export function hasRelic(relics: RelicId[], id: RelicId): boolean {
  return relics.includes(id);
}

export function getRevealRadiusBonus(relics: RelicId[]): number {
  return hasRelic(relics, 'afterglow') ? 1 : 0;
}

export function shouldGainBackupShield(relics: RelicId[]): boolean {
  return hasRelic(relics, 'backupShield');
}

export function shouldResetCostStability(relics: RelicId[], resetsThisChapter: number): boolean {
  if (hasRelic(relics, 'stableAnchor') && resetsThisChapter === 0) return false;
  return true;
}

export function isTeleportSafe(relics: RelicId[]): boolean {
  return hasRelic(relics, 'teleportCalib');
}

export function deepCacheRestoresStability(relics: RelicId[], totalCores: number): boolean {
  if (!hasRelic(relics, 'deepCache')) return false;
  return totalCores > 0 && totalCores % 3 === 0;
}

export function getExitWhisperDirection(
  input: { playerX: number; playerY: number; exitX: number; exitY: number; cameraAngle: number },
  relics: RelicId[],
): 'up' | 'down' | 'left' | 'right' | null {
  if (!hasRelic(relics, 'exitWhisper')) return null;
  const dist = Math.abs(input.playerX - input.exitX) + Math.abs(input.playerY - input.exitY);
  if (dist > 2) return null;

  const dx = input.exitX - input.playerX;
  const dy = input.exitY - input.playerY;
  const worldAngle = Math.atan2(dx, dy); // 0 = +y (down in grid), pi/2 = +x (right)
  const screenAngle = worldAngle - input.cameraAngle;

  const norm = ((screenAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (norm <= Math.PI / 4 || norm >= Math.PI * 7 / 4) return 'down';
  if (norm <= Math.PI * 3 / 4) return 'right';
  if (norm <= Math.PI * 5 / 4) return 'up';
  return 'left';
}
