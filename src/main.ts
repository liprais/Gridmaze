import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TileType, RelicId } from './types';
import { createDungeonMesh, createFogOverlay, revealAround, revealTile, revealAll, tileToWorld, disposeDungeonMeshes, disposeFogOverlay, rebuildAllLabels, consumeTileVisuals, createHazardWarning, createCoreHint, createCoreIcon, createTeleportPuff } from './dungeon';
import type { DungeonMeshes } from './dungeon';
import { Player, PLAYER_Y } from './player';
import { init as initI18n, setLang, getLang, t, getTileLabel, getTileName, getProximityMessage, refreshTileLabels } from './i18n';
import { CONFIG } from './game/config';
import { getChapterRules } from './game/chapter';
import { getExitWhisperDirection } from './game/relics';
import { createRNG } from './game/rng';
import { createInitialState, processMove, chooseRelic } from './game/engine';
import { setLabelProvider } from './game/generation';
import type { EngineState, GameEvent } from './game/engine';

// ── i18n — must init before any dungeon generation (labels depend on language) ─
initI18n();

// Inject i18n's label provider so generateDungeon emits language-appropriate
// symbols on first paint (was hardcoded English until the user toggled lang).
setLabelProvider(getTileLabel);

// ── RNG — seedable for reproducibility ─────────────────────────────
const rng = createRNG(Date.now());

// ── Scene setup ──────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd5dbe3);
scene.fog = new THREE.FogExp2(0xd5dbe3, 0.008);

// Camera — angled top-down like Dungeon Encounters
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 80);
camera.position.set(6.6, 18, 20);
camera.lookAt(6.6, 0, 6.6);

// Orbit controls — scroll to zoom, right-drag to rotate, middle-drag to pan
const controls = new OrbitControls(camera, document.body);
controls.target.set(6.6, 0.5, 6.6);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 35;
controls.maxPolarAngle = Math.PI / 2.2;
controls.mouseButtons = {
  LEFT: null,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.ROTATE,
};
controls.touches = {
  ONE: null,              // single-finger swipe → movement
  TWO: THREE.TOUCH.DOLLY_PAN,
};
controls.update();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// ── Lighting ─────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 2.5);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 5);
dirLight.position.set(15, 25, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 80;
dirLight.shadow.camera.left = -20;
dirLight.shadow.camera.right = 20;
dirLight.shadow.camera.top = 20;
dirLight.shadow.camera.bottom = -20;
scene.add(dirLight);

// ── Ground plane ─────────────────────────────────────────────
const groundGeo = new THREE.PlaneGeometry(80, 80);
const groundMat = new THREE.MeshStandardMaterial({ color: 0xc8cfd8, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);

// ── Game state (engine owns logic; rendering reads from it) ──
let gameState: EngineState = createInitialState(rng);
let dungeonMeshes = createDungeonMesh(gameState.dungeon);
let fogData = createFogOverlay(gameState.dungeon);
scene.add(dungeonMeshes.group);
scene.add(dungeonMeshes.labels);
scene.add(fogData.group);

// ── Player ───────────────────────────────────────────────────
const player = new Player({ x: 0, y: 0, floor: 1 });
scene.add(player.mesh);

// ── Border walls ─────────────────────────────────────────────
function createBorderWalls(w: number, h: number) {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3d405b, roughness: 0.6 });
  const wallGeo = new THREE.BoxGeometry(1.2, 1.5, 1.2);

  for (let x = -1; x <= w; x++) {
    const top = new THREE.Mesh(wallGeo, wallMat);
    top.position.set(x * 1.2, 0.75, -1 * 1.2);
    top.castShadow = true; top.receiveShadow = true;
    group.add(top);
    const bot = new THREE.Mesh(wallGeo, wallMat);
    bot.position.set(x * 1.2, 0.75, h * 1.2);
    bot.castShadow = true; bot.receiveShadow = true;
    group.add(bot);
  }
  for (let y = 0; y < h; y++) {
    const left = new THREE.Mesh(wallGeo, wallMat);
    left.position.set(-1 * 1.2, 0.75, y * 1.2);
    left.castShadow = true; left.receiveShadow = true;
    group.add(left);
    const right = new THREE.Mesh(wallGeo, wallMat);
    right.position.set(w * 1.2, 0.75, y * 1.2);
    right.castShadow = true; right.receiveShadow = true;
    group.add(right);
  }
  return group;
}
const walls = createBorderWalls(CONFIG.dungeon.width, CONFIG.dungeon.height);
scene.add(walls);

// ── Particles ────────────────────────────────────────────────
const particlesGeo = new THREE.BufferGeometry();
const particlesCount = 200;
const posArray = new Float32Array(particlesCount * 3);
for (let i = 0; i < particlesCount; i++) {
  posArray[i * 3] = (Math.random() - 0.5) * 24;
  posArray[i * 3 + 1] = Math.random() * 10 + 2;
  posArray[i * 3 + 2] = (Math.random() - 0.5) * 24;
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particlesMat = new THREE.PointsMaterial({ size: 0.04, color: 0x999999, transparent: true, opacity: 0.4 });
const particles = new THREE.Points(particlesGeo, particlesMat);
scene.add(particles);

// ── HUD ──────────────────────────────────────────────────────
const hudPos = document.getElementById('player-pos')!;
const hudFloor = document.getElementById('floor-num')!;
const hudShield = document.getElementById('shield-indicator')!;
const logEl = document.getElementById('log')!;
const logLines: string[] = [];

function addLog(msg: string) {
  logLines.push(msg);
  if (logLines.length > 5) logLines.shift();
  logEl.innerHTML = logLines.map((l, i) => {
    const opacity = 1 - (logLines.length - 1 - i) * 0.15;
    return `<div style="opacity:${opacity}">${l}</div>`;
  }).join('');
}

function updateHUD() {
  hudPos.textContent = `${gameState.playerX},${gameState.playerY}`;

  if (gameState.gameWon) {
    hudFloor.textContent = t('ui.floorClear');
    hudFloor.style.color = '#06d6a0';
  } else {
    hudFloor.textContent = t('ui.floor', { floor: gameState.floor, max: CONFIG.dungeon.maxFloor });
    hudFloor.style.color = '';
  }

  hudShield.style.opacity = player.hasShield ? '1' : '0';

  const dotsEl = document.getElementById('stability-dots')!;
  dotsEl.textContent = Array(3).fill(0).map((_, i) => i < gameState.stability ? '●' : '○').join(' ');

  const dist = Math.abs(gameState.playerX - gameState.dungeon.coreX) + Math.abs(gameState.playerY - gameState.dungeon.coreY);
  document.getElementById('core-distance-value')!.textContent = gameState.coreCollectedThisFloor ? '—' : String(dist);
  document.getElementById('core-count-value')!.textContent = String(gameState.coresThisChapter);

  const whisperEl = document.getElementById('exit-whisper')!;
  const whisperDir = getExitWhisperDirection(
    { playerX: gameState.playerX, playerY: gameState.playerY, exitX: gameState.dungeon.exitX, exitY: gameState.dungeon.exitY, cameraAngle: controls.getAzimuthalAngle() },
    gameState.relics,
  );
  if (whisperDir) {
    const arrows: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };
    whisperEl.textContent = arrows[whisperDir];
    whisperEl.style.opacity = '1';
  } else {
    whisperEl.style.opacity = '0';
  }
}

// ── Input ────────────────────────────────────────────────────
const keys = new Set<string>();

window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
  if (e.key === ' ') {
    console.log('Game state:', {
      playerPos: { x: gameState.playerX, y: gameState.playerY },
      playerMoving: player.isMoving,
      hasShield: gameState.hasShield,
      floor: gameState.floor,
      gameWon: gameState.gameWon,
      dungeonExit: { x: gameState.dungeon.exitX, y: gameState.dungeon.exitY },
    });
    addLog('▌ ' + t('log.debug', { x: gameState.playerX, y: gameState.playerY, moving: player.isMoving ? 1 : 0, floor: gameState.floor }));
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
});

const _camDir = new THREE.Vector3();
const _camRight = new THREE.Vector3();

function clearMovementKeys() {
  for (const k of ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']) {
    keys.delete(k);
  }
}

const relicOverlay = document.getElementById('relic-overlay')!;
const relicCards = document.getElementById('relic-cards')!;
const relicRefresh = document.getElementById('relic-refresh')!;
const chapterCompleteOverlay = document.getElementById('chapter-complete-overlay')!;
const chapterRestartBtn = document.getElementById('chapter-restart')!;
const chapterFailedOverlay = document.getElementById('chapter-failed-overlay')!;

function isChapterFailedOverlayVisible(): boolean {
  return !chapterFailedOverlay.classList.contains('hidden');
}

function dismissChapterFailedOverlay(): void {
  hideChapterFailedOverlay();
  chapterRestartPending = false;
  chapterFailFadeTimer = 0;
  shakeTimer = 0;
  shieldBreakTimer = 0;
  scene.background = new THREE.Color(0xd5dbe3);
  restartChapter();
}

window.addEventListener('keydown', (e) => {
  // Ignore modifier-only and browser-reserved combos so the player can still
  // use Cmd-R / F5 / etc. without triggering a restart.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!isChapterFailedOverlayVisible()) return;
  e.preventDefault();
  dismissChapterFailedOverlay();
});

function showRelicChoice(event: Extract<GameEvent, { kind: 'relic_choice' }>) {
  relicCards.innerHTML = '';
  for (const relic of event.options) {
    const card = document.createElement('button');
    card.style.cssText = 'background:#2a2a3e;border:1px solid #45475a;border-radius:8px;padding:12px;color:#cdd6f4;cursor:pointer;flex:1;min-width:120px;';
    card.innerHTML = `<div style="font-weight:bold;margin-bottom:4px;">${t(`relic.${relic}.name`)}</div><div style="font-size:12px;color:#a6adc8;">${t(`relic.${relic}.desc`)}</div>`;
    card.addEventListener('click', () => {
      const result = chooseRelic(gameState, relic);
      gameState = result.state;
      for (const e of result.events) dispatchEvent(e);
      hideRelicChoice();
      updateHUD();
    });
    relicCards.appendChild(card);
  }

  relicRefresh.style.display = event.canRefresh ? 'inline-block' : 'none';
  if (event.canRefresh) {
    relicRefresh.onclick = () => {
      // Re-roll options using the same logic as the engine.
      const pool = ['afterglow', 'backupShield', 'stableAnchor', 'teleportCalib', 'exitWhisper', 'deepCache'].filter(
        id => !gameState.relics.includes(id as RelicId),
      );
      for (let i = pool.length - 1; i > 0; i--) {
        const j = rng.nextInt(i + 1);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      event.options = pool.slice(0, event.options.length) as RelicId[];
      showRelicChoice(event);
    };
  }
  relicOverlay.classList.remove('hidden');
}

function hideRelicChoice() {
  relicOverlay.classList.add('hidden');
}

function showChapterCompleteOverlay() {
  chapterCompleteOverlay.classList.remove('hidden');
}

function hideChapterCompleteOverlay() {
  chapterCompleteOverlay.classList.add('hidden');
}

function showChapterFailedOverlay() {
  chapterFailedOverlay.classList.remove('hidden');
}

function hideChapterFailedOverlay() {
  chapterFailedOverlay.classList.add('hidden');
}

chapterRestartBtn.addEventListener('click', () => {
  hideChapterCompleteOverlay();
  gameState = createInitialState(rng);
  regenerateDungeonMesh();
  updateHUD();
});

// ── Event dispatch: engine → rendering ───────────────────────

function dispatchEvent(event: GameEvent) {
  switch (event.kind) {
    case 'move':
      player.moveTo(event.toX, event.toY);
      revealAround(fogData.meshes, gameState.dungeon, dungeonMeshes, event.toX, event.toY, CONFIG.dungeon.revealRadius, getChapterRules(gameState.floor).showAdjacentWalls);
      revealTile(gameState.dungeon, dungeonMeshes, event.toX, event.toY);
      addLog('▌ ' + t('log.moveTo', { x: event.toX, y: event.toY, tile: getTileNameForEvent(event.tileType, event.tileLabel) }));
      break;

    case 'blocked':
      addLog('▌ ' + t('log.cannotMove'));
      break;

    case 'exit_reached':
      flashTimer = 0.3;
      if (event.floorCleared) {
        // Victory event will log the final escape message; don't duplicate it here.
        showChapterCompleteOverlay();
      } else {
        regenerateDungeonMesh();
        if (gameState.floor === 6) {
          // Floor 5 exit: relic choice will be shown by the relic_choice event.
        } else {
          addLog('▌ ' + t('log.descended', { floor: event.newFloor, max: CONFIG.dungeon.maxFloor }));
        }
      }
      break;

    case 'relic_choice':
      showRelicChoice(event);
      break;

    case 'relic_gained':
      addLog('▌ ' + t('log.relicGained', { name: t(`relic.${event.relic}.name`) }));
      break;

    case 'hazard_absorbed':
      player.setShield(false);
      shieldBreakTimer = 0.4;
      addLog('▌ ' + t('log.shieldAbsorbed'));
      break;

    case 'reset_to_start': {
      // The Reset tile pops up (a tile mesh bounce on the source cell) and
      // the player is launched in an arc back to (0,0). Replaces the old
      // shrink→teleport→grow chain with a visible flight.
      const fromWorld = tileToWorld(event.fromX, event.fromY);
      playerFlight = {
        fromX: fromWorld.x,
        fromZ: fromWorld.z,
        duration: 0.7,
        elapsed: 0,
      };
      resetTileBounceTimer = 0.35;
      resetTileBounceX = event.fromX;
      resetTileBounceY = event.fromY;
      addLog('▌ ' + t('log.sentBack'));
      break;
    }

    case 'teleported': {
      // Two-phase vanish + appear: shrink player at source while a purple
      // puff expands, snap to destination, then grow player back while a
      // second puff expands. Total ~0.55s, blocked from new input.
      const fromWorld = tileToWorld(event.fromX, event.fromY);
      const toWorld = tileToWorld(event.toX, event.toY);
      teleportState = {
        fromX: fromWorld.x, fromZ: fromWorld.z,
        toX: toWorld.x, toZ: toWorld.z,
        fromTileX: event.fromX, fromTileY: event.fromY,
        toTileX: event.toX, toTileY: event.toY,
        phase: 'vanish',
        elapsed: 0,
        vanishDur: 0.25,
        appearDur: 0.3,
      };
      teleportPuffSource = {
        mesh: createTeleportPuff(event.fromX, event.fromY),
        elapsed: 0,
        duration: 0.45,
      };
      scene.add(teleportPuffSource.mesh);
      addLog('▌ ' + t('log.teleported', { x: event.toX, y: event.toY }));
      break;
    }

    case 'map_regenerated':
      // Long dramatic sequence: darken the old map, swap the dungeon while
      // the scene is at peak darkness, then fade back to the new map. Mirror
      // the chapter-fail structure but without an overlay — the player is
      // teleported to (0,0) and just resumes.
      shakeTimer = 1.5;
      shieldBreakTimer = 1.5;
      mapRegenFadeTimer = 1.5;
      mapRegenTriggered = false;
      addLog('▌ ' + t('log.dungeonShifts'));
      break;

    case 'compass_revealed':
      fogData.meshes[event.exitY][event.exitX].visible = false;
      revealTile(gameState.dungeon, dungeonMeshes, event.exitX, event.exitY);
      spawnExitBeacon();
      addLog('▌ ' + t('log.exitLocated', { x: event.exitX, y: event.exitY }));
      break;

    case 'scan_revealed':
      // Strip fog AND reveal colors for every tile — previously only colors
      // changed, leaving the fog layer covering the floor.
      revealAll(fogData.meshes, gameState.dungeon, dungeonMeshes);
      spawnExitBeacon();
      addLog('▌ ' + t('log.scanned'));
      break;

    case 'shield_gained':
      player.setShield(true);
      playerScaleVel = 0.3;
      addLog('▌ ' + t('log.gainedShield'));
      break;

    case 'tile_consumed':
      consumeTileVisuals(gameState.dungeon, dungeonMeshes, event.x, event.y);
      addLog('▌ ' + t('log.consumedTile'));
      break;

    case 'core_collected':
      // Brief cyan flash + small player pulse so the player feels the
      // pick-up. Stops feeling like a silent counter increment.
      coreCollectedTimer = 0.5;
      addLog('▌ ' + t('log.coreCollected'));
      break;

    case 'chapter_failed':
      // Long dramatic sequence: 1.5s of shake + screen-darken, then the
      // chapter-failed overlay takes over and the player clicks Restart.
      shakeTimer = 1.5;
      shieldBreakTimer = 1.5;
      chapterFailFadeTimer = 1.5;
      addLog('▌ ' + t('log.chapterFailed'));
      chapterRestartPending = true;
      setTimeout(() => {
        showChapterFailedOverlay();
      }, 1500);
      break;

    case 'victory':
      addLog('▌ ' + t('log.escaped'));
      break;
  }
}

/** Map tile type to i18n tile name for log messages */
function getTileNameForEvent(type: TileType, label: string): string {
  switch (type) {
    case TileType.Empty:     return label ? `${getTileName('empty')} ${label}` : getTileName('empty');
    case TileType.Reset:     return getTileName('reset');
    case TileType.Teleport:  return getTileName('teleport');
    case TileType.RandomMap: return getTileName('randomMap');
    case TileType.Compass:   return getTileName('compass');
    case TileType.Scan:      return getTileName('scan');
    case TileType.Shield:    return getTileName('shield');
    case TileType.Exit:      return getTileName('exit');
    case TileType.Start:     return getTileName('start');
    default:                 return getTileName('unknown');
  }
}

// ── Input handling ───────────────────────────────────────────

function handleInput() {
  if (player.isMoving || gameState.gameWon || playerAnim !== 'none' || playerFlight !== null || teleportState !== null || chapterRestartPending) return;

  let inputX = 0, inputY = 0;
  if (keys.has('w') || keys.has('arrowup'))    inputY += 1;
  if (keys.has('s') || keys.has('arrowdown'))  inputY -= 1;
  if (keys.has('a') || keys.has('arrowleft'))  inputX -= 1;
  if (keys.has('d') || keys.has('arrowright')) inputX += 1;

  if (inputX === 0 && inputY === 0) return;

  // Camera-relative direction
  _camDir.subVectors(controls.target, camera.position).normalize();
  _camRight.crossVectors(_camDir, new THREE.Vector3(0, 1, 0)).normalize();

  const worldX = inputX * _camRight.x + inputY * _camDir.x;
  const worldZ = inputX * _camRight.z + inputY * _camDir.z;

  const angle = Math.atan2(worldX, worldZ);
  const sector = Math.round(angle / (Math.PI / 2));
  const snapped = ((sector % 4) + 4) % 4;

  let dx = 0, dy = 0;
  switch (snapped) {
    case 0: dy = 1;  break;
    case 1: dx = 1;  break;
    case 2: dy = -1; break;
    case 3: dx = -1; break;
  }

  // Let the engine process the move
  const result = processMove(gameState, dx, dy, rng);
  gameState = result.state;

  if (result.events.length === 0) return;

  // Clear keys for discrete input (one press = one action)
  clearMovementKeys();

  // Dispatch all events
  for (const event of result.events) {
    dispatchEvent(event);
  }

  // Proximity hint after move
  const lastEvent = result.events[result.events.length - 1];
  if (lastEvent.kind === 'move' && lastEvent.tileType !== TileType.Exit) {
    const distToExit = Math.abs(lastEvent.toX - gameState.dungeon.exitX) + Math.abs(lastEvent.toY - gameState.dungeon.exitY);
    if (distToExit <= 2) {
      addLog('▌ ' + getProximityMessage(rng.nextInt(3)));
    }
  }

  updateHUD();
}

let chapterRestartPending = false;

// ── Hazard warnings ───────────────────────────────────────────
const hazardWarnings = new Map<string, THREE.Mesh>();

function disposeHazardWarning(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    for (const m of mesh.material) m.dispose();
  } else if (mesh.material) {
    mesh.material.dispose();
  }
}

function clearHazardWarnings(): void {
  for (const [key, mesh] of hazardWarnings) {
    scene.remove(mesh);
    disposeHazardWarning(mesh);
    hazardWarnings.delete(key);
  }
}

// ── Core proximity hint ─────────────────────────────────────────
// Shows a soft gold halo + ◆ glyph above the hidden core when the player
// gets close (chebyshev ≤ 2). Once collected (or on chapter restart /
// dungeon regen) the hint is removed. One ring + one sprite, paired.

let coreHintMesh: THREE.Mesh | null = null;
let coreIconSprite: THREE.Sprite | null = null;

function disposeCoreHint(): void {
  if (coreHintMesh) {
    scene.remove(coreHintMesh);
    disposeHazardWarning(coreHintMesh); // same shape: dispose geom + mat
    coreHintMesh = null;
  }
  if (coreIconSprite) {
    scene.remove(coreIconSprite);
    const mat = coreIconSprite.material as THREE.SpriteMaterial;
    if (mat.map) mat.map.dispose();
    mat.dispose();
    coreIconSprite = null;
  }
}

function updateCoreHint(): void {
  if (gameState.coreCollectedThisFloor) {
    disposeCoreHint();
    return;
  }
  const cx = gameState.dungeon.coreX;
  const cy = gameState.dungeon.coreY;
  const dx = Math.abs(gameState.playerX - cx);
  const dy = Math.abs(gameState.playerY - cy);
  if (dx > 2 || dy > 2) {
    disposeCoreHint();
    return;
  }
  if (!coreHintMesh) {
    coreHintMesh = createCoreHint(cx, cy);
    scene.add(coreHintMesh);
  }
  if (!coreIconSprite) {
    coreIconSprite = createCoreIcon(cx, cy);
    scene.add(coreIconSprite);
  }
  // Animate the hint (cheap pulse so the player notices it without it
  // becoming a hazard-warning-level siren). Icon bobs gently above.
  const elapsed = clock.elapsedTime;
  coreHintMesh.scale.setScalar(1 + Math.sin(elapsed * 2.2) * 0.08);
  coreHintMesh.position.y = coreHintMesh.userData.baseY + Math.sin(elapsed * 1.8) * 0.02;
  const mat = coreHintMesh.material as THREE.MeshStandardMaterial;
  mat.emissiveIntensity = 0.4 + (1 - Math.max(dx, dy) / 3) * 0.6;

  const iconMat = coreIconSprite.material as THREE.SpriteMaterial;
  iconMat.opacity = 0.7 + (1 - Math.max(dx, dy) / 3) * 0.25;
  coreIconSprite.position.y = coreIconSprite.userData.baseY + Math.sin(elapsed * 2.5) * 0.04;
}

function restartChapter(): void {
  const savedRelics = [...gameState.relics];
  gameState = createInitialState(rng);
  gameState.relics = savedRelics;
  if (savedRelics.includes('backupShield')) {
    gameState.hasShield = true;
  }
  regenerateDungeonMesh();
  updateHUD();
}

function updateHazardWarnings(): void {
  const rules = getChapterRules(gameState.floor);
  if (!rules.warnRandomMap) {
    clearHazardWarnings();
    return;
  }

  const px = gameState.playerX;
  const py = gameState.playerY;
  const needed = new Set<string>();

  for (let y = 0; y < gameState.dungeon.height; y++) {
    for (let x = 0; x < gameState.dungeon.width; x++) {
      if (gameState.dungeon.tiles[y][x].type !== TileType.RandomMap) continue;
      if (Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1) {
        needed.add(`${x},${y}`);
      }
    }
  }

  // Add new warnings
  for (const key of needed) {
    if (hazardWarnings.has(key)) continue;
    const [x, y] = key.split(',').map(Number);
    const mesh = createHazardWarning(x, y);
    scene.add(mesh);
    hazardWarnings.set(key, mesh);
  }

  // Remove stale warnings
  for (const [key, mesh] of hazardWarnings) {
    if (needed.has(key)) continue;
    scene.remove(mesh);
    disposeHazardWarning(mesh);
    hazardWarnings.delete(key);
  }
}

// ── Rendering regeneration (driven by engine state) ──────────

/** Dispose a beacon group (torus + sphere dots) */
function disposeBeacon(beacon: THREE.Group): void {
  beacon.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        for (const m of obj.material) m.dispose();
      } else if (obj.material) {
        obj.material.dispose();
      }
    }
  });
}

function regenerateDungeonMesh() {
  // Mark the map-regen V-shape as "triggered" so a partial animation can't
  // double-regenerate if some other event calls this function mid-animation.
  mapRegenTriggered = true;
  // Cancel any in-flight reset animation — the new dungeon doesn't have the
  // source tile anymore, and the player has already been reset by the caller.
  playerFlight = null;
  resetTileBounceTimer = 0;
  teleportState = null;
  if (teleportPuffSource) {
    scene.remove(teleportPuffSource.mesh);
    disposeHazardWarning(teleportPuffSource.mesh);
    teleportPuffSource = null;
  }
  if (teleportPuffDest) {
    scene.remove(teleportPuffDest.mesh);
    disposeHazardWarning(teleportPuffDest.mesh);
    teleportPuffDest = null;
  }
  player.mesh.scale.set(1, 1, 1);

  disposeDungeonMeshes(dungeonMeshes);
  disposeFogOverlay(fogData);
  scene.remove(dungeonMeshes.group);
  scene.remove(dungeonMeshes.labels);
  scene.remove(fogData.group);

  // Remove old beacon (exit position changed with new dungeon)
  if (exitBeacon) {
    disposeBeacon(exitBeacon);
    scene.remove(exitBeacon);
    exitBeacon = null;
  }

  clearHazardWarnings();
  disposeCoreHint();

  dungeonMeshes = createDungeonMesh(gameState.dungeon);
  fogData = createFogOverlay(gameState.dungeon);
  scene.add(dungeonMeshes.group);
  scene.add(dungeonMeshes.labels);
  scene.add(fogData.group);

  player.resetPosition(gameState.playerX, gameState.playerY);
  revealAround(fogData.meshes, gameState.dungeon, dungeonMeshes, gameState.playerX, gameState.playerY, CONFIG.dungeon.revealRadius, getChapterRules(gameState.floor).showAdjacentWalls);
  revealTile(gameState.dungeon, dungeonMeshes, gameState.playerX, gameState.playerY);
  updateHUD();
}

// ── Mobile touch controls ────────────────────────────────────
let touchStartX = 0, touchStartY = 0;
window.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
});
window.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    keys.add(dx > 0 ? 'd' : 'a');
    setTimeout(() => keys.delete(dx > 0 ? 'd' : 'a'), 50);
  } else {
    keys.add(dy > 0 ? 's' : 'w');
    setTimeout(() => keys.delete(dy > 0 ? 's' : 'w'), 50);
  }
});

// ── Resize ───────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Game loop ─────────────────────────────────────────────────
const clock = new THREE.Clock();
let loopCrashed = false;

// Animation state
let shakeTimer = 0;
let shakeOffset = new THREE.Vector3();
let flashTimer = 0;
let shieldBreakTimer = 0;
let coreCollectedTimer = 0;
let chapterFailFadeTimer = 0;
let mapRegenFadeTimer = 0;
let mapRegenTriggered = false;
let resetTileBounceTimer = 0;
let resetTileBounceX = 0;
let resetTileBounceY = 0;
let playerFlight: { fromX: number; fromZ: number; duration: number; elapsed: number } | null = null;
let teleportState: {
  fromX: number; fromZ: number;
  toX: number; toZ: number;
  fromTileX: number; fromTileY: number;
  toTileX: number; toTileY: number;
  phase: 'vanish' | 'appear';
  elapsed: number;
  vanishDur: number;
  appearDur: number;
} | null = null;
type TeleportPuff = { mesh: THREE.Mesh; elapsed: number; duration: number };
let teleportPuffSource: TeleportPuff | null = null;
let teleportPuffDest: TeleportPuff | null = null;
let playerAnim: 'none' | 'shrink' | 'grow' = 'none';
let playerAnimTarget = new THREE.Vector3();
let playerScaleVel = 0;

function animate() {
  if (loopCrashed) return;

  try {
    const dt = Math.min(clock.getDelta(), 0.1);

    // Undo previous shake before controls update
    if (shakeOffset.lengthSq() > 0) {
      camera.position.sub(shakeOffset);
      shakeOffset.set(0, 0, 0);
    }

    handleInput();
    player.update(dt);
    controls.update();

    // Update hazard warnings (unstable zone only)
    updateHazardWarnings();
    updateCoreHint();
    const elapsed = clock.elapsedTime;
    for (const mesh of hazardWarnings.values()) {
      const pulse = 1 + Math.sin(elapsed * 4) * 0.12;
      mesh.scale.setScalar(pulse);
      mesh.position.y = mesh.userData.baseY + Math.sin(elapsed * 3) * 0.03;
    }

    // Animate exit beacon
    if (exitBeacon && !gameState.gameWon) {
      const t = clock.elapsedTime;
      exitBeacon.children.forEach((child, i) => {
        if (child.userData.angle !== undefined) {
          const a = child.userData.angle + t * child.userData.speed;
          child.position.x = Math.cos(a) * child.userData.radius;
          child.position.z = Math.sin(a) * child.userData.radius;
          child.position.y = Math.sin(t * 2 + i) * 0.12 + 0.15;
        }
      });
      exitBeacon.rotation.y += dt * 0.6;
    }

    // Pulse start ring
    const s = 1 + Math.sin(clock.elapsedTime * 1.8) * 0.15;
    startRing.scale.setScalar(s);
    (startRing.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + Math.sin(clock.elapsedTime * 1.8) * 0.3;

    particles.rotation.y += dt * 0.05;
    particles.position.y += Math.sin(clock.elapsedTime * 0.3) * dt * 0.3;

    // Fog density
    (scene.fog as THREE.FogExp2).density = CONFIG.fog.forFloor(gameState.floor);

    // Screen shake
    if (shakeTimer > 0) {
      shakeTimer -= dt;
      const intensity = (shakeTimer / 0.35) * 0.2;
      shakeOffset.set(
        (Math.random() - 0.5) * intensity,
        0,
        (Math.random() - 0.5) * intensity,
      );
      camera.position.add(shakeOffset);
    }

    // White flash (Exit)
    if (flashTimer > 0) {
      flashTimer -= dt;
      const a = (flashTimer / 0.3);
      scene.background = new THREE.Color().lerpColors(
        new THREE.Color(0xd5dbe3), new THREE.Color(0xffffff), a);
    }

    // Shield break flash
    if (shieldBreakTimer > 0) {
      shieldBreakTimer -= dt;
      const a = Math.min(shieldBreakTimer / 0.2, 1);
      scene.background = new THREE.Color().lerpColors(
        new THREE.Color(0xd5dbe3), new THREE.Color(0xffd166), a);
      const pulse = 1 + Math.sin((0.4 - shieldBreakTimer) * 20) * 0.2 * a;
      player.mesh.scale.setScalar(pulse);
    }

    if (coreCollectedTimer > 0) {
      coreCollectedTimer -= dt;
      const a = Math.min(coreCollectedTimer / 0.3, 1);
      // Cyan flash: lifts the dungeon off the page for half a second.
      scene.background = new THREE.Color().lerpColors(
        new THREE.Color(0xd5dbe3), new THREE.Color(0x9bd4ff), a);
    } else if (shieldBreakTimer <= 0) {
      scene.background = new THREE.Color(0xd5dbe3);
    }

    // Chapter-fail fade: darkens the scene over 1.5s as the long animation
    // plays. Takes priority over the other flash effects so the collapse is
    // visually unmissable.
    if (chapterFailFadeTimer > 0) {
      chapterFailFadeTimer -= dt;
      const t = 1 - Math.max(chapterFailFadeTimer / 1.5, 0);
      scene.background = new THREE.Color().lerpColors(
        new THREE.Color(0xd5dbe3), new THREE.Color(0x0a0a14), t);
    }

    // Map-regen fade: V-shape darken → regenerate at peak dark → fade back.
    // Placed before chapter-fail so chapter-fail still wins when both are
    // active (chapter-fail is the worse state and should never be overridden).
    if (mapRegenFadeTimer > 0) {
      mapRegenFadeTimer -= dt;
      const t = 1 - Math.max(mapRegenFadeTimer / 1.5, 0); // 0 → 1 across the 1.5s
      // Regenerate the dungeon the instant we hit peak darkness, hidden from
      // the viewer. After this the player mesh snaps to (0,0) and the new
      // dungeon is visible behind the fade-in.
      if (!mapRegenTriggered && t >= 0.5) {
        regenerateDungeonMesh();
        mapRegenTriggered = true;
      }
      // Triangle wave: 0 → 0.5 darkens, 0.5 → 1 lightens.
      const darkness = t <= 0.5 ? t * 2 : (1 - t) * 2;
      scene.background = new THREE.Color().lerpColors(
        new THREE.Color(0xd5dbe3), new THREE.Color(0x0a0a14), darkness);
    }

    // Teleport effect: two-phase vanish + appear with expanding purple puffs.
    if (teleportState) {
      teleportState.elapsed += dt;
      if (teleportState.phase === 'vanish') {
        const t = Math.min(teleportState.elapsed / teleportState.vanishDur, 1);
        player.mesh.position.set(teleportState.fromX, PLAYER_Y, teleportState.fromZ);
        // Shrink to zero so the "vanish" reads as a pop.
        const s = 1 - t;
        player.mesh.scale.set(s, s, s);
        if (t >= 1) {
          teleportState.phase = 'appear';
          teleportState.elapsed = 0;
          player.mesh.position.set(teleportState.toX, PLAYER_Y, teleportState.toZ);
          teleportPuffDest = {
            mesh: createTeleportPuff(teleportState.toTileX, teleportState.toTileY),
            elapsed: 0,
            duration: 0.45,
          };
          scene.add(teleportPuffDest.mesh);
        }
      } else {
        const t = Math.min(teleportState.elapsed / teleportState.appearDur, 1);
        player.mesh.position.set(teleportState.toX, PLAYER_Y, teleportState.toZ);
        // Grow from zero with a tiny overshoot so the "appear" pops.
        const s = t < 0.7 ? t / 0.7 : 1 + (1 - t) / 0.3 * 0.15;
        player.mesh.scale.set(s, s, s);
        if (t >= 1) {
          player.mesh.scale.set(1, 1, 1);
          teleportState = null;
          // Teleport already updated gameState.playerX/Y to the destination
          // tile, so reveal from there.
          revealAround(fogData.meshes, gameState.dungeon, dungeonMeshes, gameState.playerX, gameState.playerY, CONFIG.dungeon.revealRadius, getChapterRules(gameState.floor).showAdjacentWalls);
          revealTile(gameState.dungeon, dungeonMeshes, gameState.playerX, gameState.playerY);
          updateHUD();
        }
      }
    }

    // Teleport puffs: scale up + fade out over their duration.
    const updatePuff = (puff: TeleportPuff | null) => {
      if (!puff) return null;
      puff.elapsed += dt;
      const t = Math.min(puff.elapsed / puff.duration, 1);
      const scale = 1 + t * 3;
      puff.mesh.scale.set(scale, scale, 1);
      const mat = puff.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 1 - t;
      mat.emissiveIntensity = 1.4 * (1 - t);
      if (t >= 1) {
        scene.remove(puff.mesh);
        disposeHazardWarning(puff.mesh);
        return null;
      }
      return puff;
    };
    teleportPuffSource = updatePuff(teleportPuffSource);
    teleportPuffDest = updatePuff(teleportPuffDest);

    // Reset tile bounce: the source tile pops up briefly as the visual cue
    // that the player is being launched back to start.
    if (resetTileBounceTimer > 0) {
      resetTileBounceTimer -= dt;
      const t = 1 - Math.max(resetTileBounceTimer / 0.35, 0);
      // Fast up, slower settle — sin curve biased toward the back half.
      const bounce = Math.sin(t * Math.PI) * 0.45 * (1 - t * 0.3);
      const tileMesh = dungeonMeshes.tiles[resetTileBounceY]?.[resetTileBounceX];
      if (tileMesh) tileMesh.position.y = bounce;
      if (resetTileBounceTimer <= 0) {
        if (tileMesh) tileMesh.position.y = 0;
      }
    }

    // Player flight (reset_to_start): parabolic arc from the source tile to
    // (0,0) with a slight squash/stretch. Replaces the old shrink-teleport-
    // grow chain so the "sent back" event reads as motion, not a jump cut.
    if (playerFlight) {
      playerFlight.elapsed += dt;
      const t = Math.min(playerFlight.elapsed / playerFlight.duration, 1);
      const newX = playerFlight.fromX + (0 - playerFlight.fromX) * t;
      const newZ = playerFlight.fromZ + (0 - playerFlight.fromZ) * t;
      const arc = Math.sin(t * Math.PI) * 1.4;
      player.mesh.position.set(newX, PLAYER_Y + arc, newZ);
      const stretch = 1 + Math.sin(t * Math.PI) * 0.18;
      player.mesh.scale.set(stretch, 1 / Math.sqrt(stretch), stretch);
      if (t >= 1) {
        playerFlight = null;
        player.resetPosition(0, 0);
        player.mesh.scale.set(1, 1, 1);
        revealAround(fogData.meshes, gameState.dungeon, dungeonMeshes, 0, 0, CONFIG.dungeon.revealRadius, getChapterRules(gameState.floor).showAdjacentWalls);
        revealTile(gameState.dungeon, dungeonMeshes, 0, 0);
        updateHUD();
      }
    }

    // Player shrink/grow animation
    if (playerAnim === 'shrink') {
      const s = player.mesh.scale.x - dt * 6;
      if (s <= 0.05) {
        player.mesh.scale.setScalar(0);
        const tp = (player.mesh as any).__teleportTarget;
        if (tp) {
          player.resetPosition(tp.tx, tp.ty);
          revealAround(fogData.meshes, gameState.dungeon, dungeonMeshes, tp.tx, tp.ty, CONFIG.dungeon.revealRadius, getChapterRules(gameState.floor).showAdjacentWalls);
          revealTile(gameState.dungeon, dungeonMeshes, tp.tx, tp.ty);
          delete (player.mesh as any).__teleportTarget;
        } else {
          player.resetPosition(0, 0);
          revealAround(fogData.meshes, gameState.dungeon, dungeonMeshes, 0, 0, CONFIG.dungeon.revealRadius, getChapterRules(gameState.floor).showAdjacentWalls);
          revealTile(gameState.dungeon, dungeonMeshes, 0, 0);
        }
        playerAnim = 'grow';
        updateHUD();
      } else {
        player.mesh.scale.setScalar(s);
      }
    } else if (playerAnim === 'grow') {
      const s = player.mesh.scale.x + dt * 5;
      if (s >= 1) {
        player.mesh.scale.setScalar(1);
        playerAnim = 'none';
      } else {
        player.mesh.scale.setScalar(s);
      }
    }

    // Shield pulse
    if (playerScaleVel !== 0) {
      const s = player.mesh.scale.x + playerScaleVel;
      if (s >= 1.25) {
        playerScaleVel = -Math.abs(playerScaleVel) * 0.5;
      } else if (s <= 1) {
        player.mesh.scale.setScalar(1);
        playerScaleVel = 0;
      } else {
        player.mesh.scale.setScalar(s);
        playerScaleVel *= 0.92;
      }
    }

    renderer.render(scene, camera);
  } catch (err) {
    console.error('Game loop crashed:', err);
    addLog('▌ ERROR: ' + String(err));
    loopCrashed = true;
  }

  requestAnimationFrame(animate);
}

// ── Start overlay ────────────────────────────────────────────
const overlay = document.getElementById('overlay')!;
function dismissOverlay() {
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 500);
}
overlay.addEventListener('click', dismissOverlay);
window.addEventListener('keydown', dismissOverlay, { once: true });

// ── Language toggle ──────────────────────────────────────────
const langToggle = document.getElementById('lang-toggle')!;
langToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const next = getLang() === 'en' ? 'zh' : 'en';
  setLang(next);
  refreshTileLabels(gameState.dungeon.tiles);
  const rebuilt = rebuildAllLabels(gameState.dungeon, dungeonMeshes);
  scene.remove(dungeonMeshes.labels);
  dungeonMeshes.labels = rebuilt.labels;
  dungeonMeshes.labelSprites = rebuilt.labelSprites;
  scene.add(dungeonMeshes.labels);
  updateHUD();
});

// ── Exit beacon ───────────────────────────────────────────────
let exitBeacon: THREE.Group | null = null;

function createExitBeacon(x: number, y: number): THREE.Group {
  const group = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(0.25, 0.04, 16, 32);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x06d6a0, emissive: 0x06d6a0, emissiveIntensity: 0.8 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  group.add(ring);

  const dotGeo = new THREE.SphereGeometry(0.06, 8, 8);
  const dotMat = new THREE.MeshStandardMaterial({ color: 0x06d6a0, emissive: 0x06d6a0, emissiveIntensity: 1 });
  for (let i = 0; i < 6; i++) {
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.userData = { angle: (i / 6) * Math.PI * 2, speed: 0.8 + Math.random() * 0.5, radius: 0.3 + Math.random() * 0.2 };
    group.add(dot);
  }

  group.position.copy(tileToWorld(x, y));
  group.position.y = 0.15;
  return group;
}

function spawnExitBeacon() {
  if (exitBeacon) {
    disposeBeacon(exitBeacon);
    scene.remove(exitBeacon);
  }
  exitBeacon = createExitBeacon(gameState.dungeon.exitX, gameState.dungeon.exitY);
  scene.add(exitBeacon);
}

// ── Start marker ──────────────────────────────────────────────
const startRingGeo = new THREE.TorusGeometry(0.5, 0.05, 16, 32);
const startRingMat = new THREE.MeshStandardMaterial({ color: 0x118ab2, emissive: 0x118ab2, emissiveIntensity: 0.5 });
const startRing = new THREE.Mesh(startRingGeo, startRingMat);
startRing.rotation.x = -Math.PI / 2;
startRing.position.set(0, 0.18, 0);
scene.add(startRing);

// ── Start ────────────────────────────────────────────────────
revealAround(fogData.meshes, gameState.dungeon, dungeonMeshes, 0, 0, CONFIG.dungeon.revealRadius, getChapterRules(gameState.floor).showAdjacentWalls);
revealTile(gameState.dungeon, dungeonMeshes, 0, 0);
updateHUD();
animate();
