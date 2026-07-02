import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TileType } from './types';
import { generateDungeon, createDungeonMesh, createFogOverlay, revealAround, revealTile, getTileAt, tileToWorld } from './dungeon';
import type { DungeonMeshes } from './dungeon';
import { Player } from './player';

// ── Scene setup ──────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd5dbe3);
// Fog — use FogExp2 for density control
scene.fog = new THREE.FogExp2(0xd5dbe3, 0.008);

// Camera — angled top-down like Dungeon Encounters
// Positioned south of the map center, looking north into the screen
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 80);
camera.position.set(6.6, 18, 20);
camera.lookAt(6.6, 0, 6.6);

// Orbit controls — scroll to zoom, right-drag to rotate, middle-drag to pan
const controls = new OrbitControls(camera, document.body);
controls.target.set(6.6, 0.5, 6.6); // center of 12×12 grid
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 35;
controls.maxPolarAngle = Math.PI / 2.2; // don't go below ground
controls.mouseButtons = {
  LEFT: null,            // left-click does nothing (we may use it later)
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.ROTATE,
};
controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
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

// ── Dungeon ──────────────────────────────────────────────────
const DUNGEON_SIZE = 12;
const REVEAL_RADIUS = 1;
const MAX_FLOOR = 99;
let floorNum = 1;
let gameWon = false;
let dungeon = generateDungeon(DUNGEON_SIZE, DUNGEON_SIZE, floorNum);
let dungeonMeshes = createDungeonMesh(dungeon);
let fogData = createFogOverlay(dungeon);
scene.add(dungeonMeshes.group);
scene.add(dungeonMeshes.labels);
scene.add(fogData.group);

// ── Player ───────────────────────────────────────────────────
const player = new Player({ x: 0, y: 0, floor: floorNum });
scene.add(player.mesh);

// ── Border walls ─────────────────────────────────────────────
function createBorderWalls(w: number, h: number) {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3d405b, roughness: 0.6 });
  const wallGeo = new THREE.BoxGeometry(1.2, 1.5, 1.2);

  for (let x = -1; x <= w; x++) {
    const top = new THREE.Mesh(wallGeo, wallMat);
    top.position.set(x * 1.2, 0.75, -1 * 1.2);
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    const bot = new THREE.Mesh(wallGeo, wallMat);
    bot.position.set(x * 1.2, 0.75, h * 1.2);
    bot.castShadow = true;
    bot.receiveShadow = true;
    group.add(bot);
  }
  for (let y = 0; y < h; y++) {
    const left = new THREE.Mesh(wallGeo, wallMat);
    left.position.set(-1 * 1.2, 0.75, y * 1.2);
    left.castShadow = true;
    left.receiveShadow = true;
    group.add(left);

    const right = new THREE.Mesh(wallGeo, wallMat);
    right.position.set(w * 1.2, 0.75, y * 1.2);
    right.castShadow = true;
    right.receiveShadow = true;
    group.add(right);
  }
  return group;
}
const walls = createBorderWalls(DUNGEON_SIZE, DUNGEON_SIZE);
scene.add(walls);

// ── Particles (ambient floating specs) ───────────────────────
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
  hudPos.textContent = `${player.x},${player.y}`;

  if (gameWon) {
    hudFloor.textContent = 'CLEAR!';
    hudFloor.style.color = '#06d6a0';
  } else {
    hudFloor.textContent = `${floorNum} / ${MAX_FLOOR}`;
  }

  hudShield.style.opacity = player.hasShield ? '1' : '0';
}

// ── Input ────────────────────────────────────────────────────
const keys = new Set<string>();

window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());

  // Prevent scrolling for arrow keys and wasd
  if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }

  // Debug: press Space to dump game state
  if (e.key === ' ') {
    const state = {
      playerPos: { x: player.x, y: player.y },
      playerMoving: player.isMoving,
      hasShield: player.hasShield,
      floorNum,
      gameWon,
      dungeonExit: { x: dungeon.exitX, y: dungeon.exitY },
    };
    console.log('Game state:', state);
    addLog(`▌ Debug: at (${player.x},${player.y}) moving=${player.isMoving} floor=${floorNum}`);
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
});

const _camDir = new THREE.Vector3();
const _camRight = new THREE.Vector3();

function handleInput() {
  if (player.isMoving || gameWon) return;

  let inputX = 0, inputY = 0;
  if (keys.has('w') || keys.has('arrowup'))    inputY += 1;
  if (keys.has('s') || keys.has('arrowdown'))  inputY -= 1;
  if (keys.has('a') || keys.has('arrowleft'))  inputX -= 1;
  if (keys.has('d') || keys.has('arrowright')) inputX += 1;

  if (inputX === 0 && inputY === 0) return;

  // Camera-relative direction using 3D cross product (handles any camera angle)
  _camDir.subVectors(controls.target, camera.position).normalize();
  _camRight.crossVectors(_camDir, new THREE.Vector3(0, 1, 0)).normalize();

  const worldX = inputX * _camRight.x + inputY * _camDir.x;
  const worldZ = inputX * _camRight.z + inputY * _camDir.z;

  // Snap to nearest cardinal grid direction
  const angle = Math.atan2(worldX, worldZ);
  const sector = Math.round(angle / (Math.PI / 2));
  const snapped = ((sector % 4) + 4) % 4;

  // 0: +Z (south), 1: +X (east), 2: -Z (north), 3: -X (west)
  let dx = 0, dy = 0;
  switch (snapped) {
    case 0: dy = 1;  break;
    case 1: dx = 1;  break;
    case 2: dy = -1; break;
    case 3: dx = -1; break;
  }

  const action = player.attemptMove(dx, dy, dungeon);
  if (!action) {
    addLog('▌ Cannot move there.');
    return;
  }

  // Clear movement keys so one press = one tile
  for (const k of ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']) {
    keys.delete(k);
  }

  addLog(`▌ Move to (${action.x}, ${action.y}) — ${describeTile(action.tileType, action.label)}`);

  // Reveal fog around new position + true tile color
  revealAround(fogData.meshes, dungeon, action.x, action.y, REVEAL_RADIUS);
  revealTile(dungeon, dungeonMeshes, action.x, action.y);

  // Handle tile effects
  if (action.tileType === TileType.Exit) {
    if (floorNum >= MAX_FLOOR) {
      gameWon = true;
      addLog('▌ You escaped the dungeon!');
      updateHUD();
      return;
    }
    floorNum++;
    regenerateDungeon();
    addLog(`▌ Descended to Floor ${floorNum} / ${MAX_FLOOR}!`);
  } else if (player.hasShield && isHazardType(action.tileType)) {
    // Shield absorbs one hazard
    player.setShield(false);
    addLog('▌ Shield absorbed the effect!');
  } else if (action.tileType === TileType.Reset) {
    player.resetPosition(0, 0);
    revealAround(fogData.meshes, dungeon, 0, 0, REVEAL_RADIUS);
    revealTile(dungeon, dungeonMeshes, 0, 0);
    addLog('▌ Sent back to start!');
  } else if (action.tileType === TileType.Teleport) {
    let tx: number, ty: number;
    do {
      tx = Math.floor(Math.random() * DUNGEON_SIZE);
      ty = Math.floor(Math.random() * DUNGEON_SIZE);
    } while (getTileAt(dungeon, tx, ty)?.type === TileType.Wall);
    player.resetPosition(tx, ty);
    revealAround(fogData.meshes, dungeon, tx, ty, REVEAL_RADIUS);
    revealTile(dungeon, dungeonMeshes, tx, ty);
    addLog(`▌ Teleported to (${tx}, ${ty})!`);
  } else if (action.tileType === TileType.RandomMap) {
    floorNum++;
    regenerateDungeon();
    addLog('▌ The dungeon shifts around you...');
  } else if (action.tileType === TileType.Compass) {
    // Reveal the exit tile
    const ex = dungeon.exitX, ey = dungeon.exitY;
    dungeon.tiles[ey][ex].explored = true;
    fogData.meshes[ey][ex].visible = false;
    revealTile(dungeon, dungeonMeshes, ex, ey);
    addLog(`▌ Exit located at (${ex}, ${ey})!`);
  } else if (action.tileType === TileType.Scan) {
    // Reveal true colors for the entire floor (fog stays)
    for (let sy = 0; sy < DUNGEON_SIZE; sy++) {
      for (let sx = 0; sx < DUNGEON_SIZE; sx++) {
        revealTile(dungeon, dungeonMeshes, sx, sy);
      }
    }
    addLog('▌ All tile types revealed!');
  } else if (action.tileType === TileType.Shield) {
    player.setShield(true);
    addLog('▌ Gained a shield! Next hazard will be blocked.');
  }

  updateHUD();
}

function isHazardType(type: TileType): boolean {
  return type === TileType.Reset
      || type === TileType.Teleport
      || type === TileType.RandomMap;
}

function describeTile(type: TileType, label: string): string {
  switch (type) {
    case TileType.Empty:     return label ? `Event ${label}` : 'Empty';
    case TileType.Reset:     return 'Reset';
    case TileType.Teleport:  return 'Teleport';
    case TileType.RandomMap: return 'Random Map';
    case TileType.Compass:   return 'Compass';
    case TileType.Scan:      return 'Scan';
    case TileType.Shield:    return 'Shield';
    case TileType.Exit:      return 'Exit!';
    case TileType.Start:     return 'Start';
    default:                 return '?';
  }
}

function regenerateDungeon() {
  dungeon = generateDungeon(DUNGEON_SIZE, DUNGEON_SIZE, floorNum);

  // Remove old meshes
  scene.remove(dungeonMeshes.group);
  scene.remove(dungeonMeshes.labels);
  scene.remove(fogData.group);

  // Create new ones
  dungeonMeshes = createDungeonMesh(dungeon);
  fogData = createFogOverlay(dungeon);
  scene.add(dungeonMeshes.group);
  scene.add(dungeonMeshes.labels);
  scene.add(fogData.group);

  // Reset player position
  player.resetPosition(0, 0);

  // Reveal starting area (fog + tile color)
  revealAround(fogData.meshes, dungeon, 0, 0, REVEAL_RADIUS);
  revealTile(dungeon, dungeonMeshes, 0, 0);

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

  // Simulate key press based on swipe direction
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

function animate() {
  if (loopCrashed) return;

  try {
    const dt = Math.min(clock.getDelta(), 0.1);

    handleInput();
    player.update();

    controls.update();

    // Subtle particle drift
    particles.rotation.y += dt * 0.05;
    particles.position.y += Math.sin(clock.elapsedTime * 0.3) * dt * 0.3;

    // Fade in fog from edges — intensify as you go deeper
    (scene.fog as THREE.FogExp2).density = 0.012 + floorNum * 0.003;

    renderer.render(scene, camera);
  } catch (err) {
    console.error('Game loop crashed:', err);
    addLog('▌ ERROR: ' + String(err));
    loopCrashed = true;
  }

  requestAnimationFrame(animate);
}

// ── Start ────────────────────────────────────────────────────
revealAround(fogData.meshes, dungeon, 0, 0, REVEAL_RADIUS);
revealTile(dungeon, dungeonMeshes, 0, 0);
updateHUD();
addLog('▌ WASD / Arrows to move. Scroll to zoom, right-drag to orbit.');
addLog(`▌ Reach floor ${MAX_FLOOR} to escape. Good luck.`);
animate();
