import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TileType, RelicId } from './types';
import { createDungeonMesh, createFogOverlay, revealAround, revealTile, revealAll, tileToWorld, disposeDungeonMeshes, disposeFogOverlay, rebuildAllLabels, consumeTileVisuals } from './dungeon';
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
        addLog('▌ ' + t('log.escaped'));
      } else {
        regenerateDungeonMesh();
        if (gameState.floor === 6) {
          // Floor 5 exit: relic choice will be shown by the relic_choice event.
        } else if (gameState.floor === 12) {
          // Chapter complete after exiting floor 11.
          showChapterCompleteOverlay();
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

    case 'reset_to_start':
      playerAnim = 'shrink';
      playerAnimTarget.set(0, PLAYER_Y, 0);
      addLog('▌ ' + t('log.sentBack'));
      break;

    case 'teleported': {
      const tp = tileToWorld(event.toX, event.toY);
      playerAnim = 'shrink';
      playerAnimTarget.set(tp.x, PLAYER_Y, tp.z);
      (player.mesh as any).__teleportTarget = { tx: event.toX, ty: event.toY };
      addLog('▌ ' + t('log.teleported', { x: event.toX, y: event.toY }));
      break;
    }

    case 'map_regenerated':
      shakeTimer = 0.35;
      regenerateDungeonMesh();
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
  if (player.isMoving || gameState.gameWon || playerAnim !== 'none') return;

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
    player.update();
    controls.update();

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
