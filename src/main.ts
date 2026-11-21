import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import {
  Sim, initRapier, Input, DT, TILT, TABLE, BALL_R, CX, PLUNGER_HALF, PLUNGER_MAX_PULL,
  flipperHullPoints, StaticPart, Mat,
} from './sim';

const hud = {
  speed: document.getElementById('speed')!,
  power: document.getElementById('power')! as HTMLDivElement,
  powerFill: document.getElementById('powerFill')! as HTMLDivElement,
  hint: document.getElementById('hint')!,
  score: document.getElementById('score')!,
  balls: document.getElementById('balls')!,
  banner: document.getElementById('banner')!,
};

let R: Awaited<ReturnType<typeof initRapier>>;
try {
  R = await initRapier();
} catch (err) {
  hud.hint.innerHTML = `Le moteur physique (WebAssembly) n'a pas pu démarrer sur ce navigateur.<br/><small>${String(err)}</small>`;
  throw err;
}
const sim = new Sim(R);

// ---------- Rendu ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14121a);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// Le groupe "table" porte l'inclinaison : la physique reste dans le repère plat de la table.
const table = new THREE.Group();
table.rotation.x = TILT;
scene.add(table);

scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(0.25, 1.2, 0.5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera as THREE.OrthographicCamera;
sc.left = -0.4; sc.right = 0.4; sc.top = 0.7; sc.bottom = -0.7; sc.near = 0.1; sc.far = 3;
sun.shadow.bias = -0.0005;
scene.add(sun);

const colors: Record<Mat, number> = {
  wall: 0xd9d4c7, metal: 0xb8bcc4, rubber: 0x222222, floor: 0x2b3a55, glass: 0xffffff,
  flipper: 0xf2f2f2, bumper: 0xe8423c, plunger: 0x999999, ramp: 0x9fd8ff,
};
const mats: Partial<Record<Mat, THREE.MeshStandardMaterial>> = {};
const matFor = (m: Mat) =>
  (mats[m] ??= new THREE.MeshStandardMaterial({
    color: colors[m],
    metalness: m === 'metal' ? 0.9 : 0.05,
    roughness: m === 'metal' ? 0.25 : m === 'ramp' ? 0.1 : 0.6,
    transparent: m === 'ramp',
    opacity: m === 'ramp' ? 0.45 : 1,
    depthWrite: m !== 'ramp',
  }));

// Plateau : maquette grise avec une grille de 5 cm (pour juger les distances à l'œil)
function floorTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1074;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b3a55'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2;
  const px = c.width / (TABLE.maxX - TABLE.minX);
  for (let x = 0; x <= c.width; x += 0.05 * px) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 0; y <= c.height; y += 0.05 * px) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('BALLOTTAGE', (CX - TABLE.minX) * px, c.height * 0.55);
  g.font = '24px system-ui, sans-serif';
  g.fillText('maquette grise', (CX - TABLE.minX) * px, c.height * 0.55 + 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const bumperCaps = new Map<string, THREE.Mesh>();
const slingMats = new Map<string, THREE.MeshStandardMaterial>();
for (const p of sim.staticParts as StaticPart[]) {
  let mesh: THREE.Mesh;
  if (p.kind === 'box') {
    const isFloor = p.mat === 'floor';
    const m = isFloor
      ? new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0 })
      : matFor(p.mat);
    mesh = new THREE.Mesh(new THREE.BoxGeometry(p.h[0] * 2, p.h[1] * 2, p.h[2] * 2), m);
    if (isFloor) {
      // texture uniquement sur l'aire réelle de la table
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(TABLE.maxX - TABLE.minX, TABLE.maxZ - TABLE.minZ), m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0, 0);
      mesh.receiveShadow = true;
      table.add(mesh);
      const under = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 1.13), new THREE.MeshStandardMaterial({ color: 0x0c0b10 }));
      under.position.y = -0.0105;
      table.add(under);
      continue;
    }
    if (p.q) mesh.quaternion.set(...p.q);
    else mesh.rotation.y = p.rotY;
  } else if (p.kind === 'prism') {
    // slingshot : bloc blanc avec bandeau caoutchouc, éclairé au coup
    const v: THREE.Vector3[] = [];
    for (const [x, z] of p.pts) v.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, p.h, z));
    const m = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.5, emissive: 0xffd34d, emissiveIntensity: 0 });
    mesh = new THREE.Mesh(new ConvexGeometry(v), m);
    if (p.id) slingMats.set(p.id, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    table.add(mesh);
    continue;
  } else {
    const isBumper = p.mat === 'bumper';
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, p.hh * 2, 32), matFor(p.mat));
    if (isBumper && p.id) {
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(p.r * 0.85, p.r * 0.85, 0.004, 32),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd34d, emissiveIntensity: 0 })
      );
      cap.position.y = p.hh + 0.002;
      mesh.add(cap);
      bumperCaps.set(p.id, cap);
    }
  }
  mesh.position.set(...p.c);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  table.add(mesh);
}

// Cibles tombantes (elles s'enfoncent dans le plateau quand on les touche)
const targetMeshes = new Map<string, THREE.Mesh>();
for (const t of sim.targets.values()) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.006, 0.035, 0.025),
    new THREE.MeshStandardMaterial({ color: 0xffd34d, roughness: 0.4 })
  );
  m.position.set(t.x, 0.0175, t.z);
  m.castShadow = true;
  table.add(m);
  targetMeshes.set(t.id, m);
}

// Flippers
const flipperMeshes = sim.flippers.map((f) => {
  const pts = flipperHullPoints(f.side);
  const v: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length; i += 3) v.push(new THREE.Vector3(pts[i], pts[i + 1], pts[i + 2]));
  const mesh = new THREE.Mesh(new ConvexGeometry(v), matFor('flipper'));
  const rubber = new THREE.Mesh(new ConvexGeometry(v), new THREE.MeshStandardMaterial({ color: 0xe8423c, roughness: 0.8 }));
  rubber.scale.set(1.04, 0.45, 1.12);
  rubber.position.y = 0.006;
  mesh.add(rubber);
  mesh.castShadow = true;
  table.add(mesh);
  return mesh;
});

// Lanceur
const plungerMesh = new THREE.Mesh(
  new THREE.BoxGeometry(PLUNGER_HALF.x * 2, PLUNGER_HALF.y * 2, PLUNGER_HALF.z * 2),
  matFor('plunger')
);
const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 12), matFor('metal'));
rod.rotation.x = Math.PI / 2;
rod.position.z = 0.04;
plungerMesh.add(rod);
plungerMesh.castShadow = true;
table.add(plungerMesh);

// Bille d'acier
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.12 })
);
ball.castShadow = true;
table.add(ball);

// ---------- Caméra : vue joueur, cadrage automatique en portrait ----------
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10);
const lookAt = new THREE.Vector3();
const corners: THREE.Vector3[] = [];
for (const x of [TABLE.minX, TABLE.maxX]) for (const z of [TABLE.minZ, TABLE.maxZ]) for (const y of [0, 0.05])
  corners.push(new THREE.Vector3(x, y, z));

function frame() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  table.updateMatrixWorld(true);
  // Direction de vue : depuis le joueur, au-dessus et derrière le bas de la table
  const target = new THREE.Vector3(0, 0, -0.02).applyMatrix4(table.matrixWorld);
  lookAt.copy(target);
  const dir = new THREE.Vector3(0, 2.0, 0.72).normalize();
  const world = corners.map((c) => c.clone().applyMatrix4(table.matrixWorld));
  let lo = 0.3, hi = 6;
  for (let i = 0; i < 30; i++) {
    const d = (lo + hi) / 2;
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const fits = world.every((p) => {
      const q = p.clone().project(camera);
      return Math.abs(q.x) < 0.97 && q.y < 0.93 && q.y > -0.97;
    });
    if (fits) hi = d; else lo = d;
  }
  camera.position.copy(target).addScaledVector(dir, hi);
  camera.lookAt(target);
  camera.clearViewOffset();
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  // Recentrage vertical : on pose la table entre le score (haut) et le bas de l'écran
  const ys = world.map((p) => p.clone().project(camera).y);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const topReserve = 70 / h; // place du score, en fraction d'écran
  const wantedCenter = -topReserve; // en NDC (h/2 px = 1)
  const shift = ((yMin + yMax) / 2 - wantedCenter) * (h / 2);
  camera.setViewOffset(w, h, 0, -shift, w, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', frame);
frame();

// ---------- Commandes ----------
const input: Input = { left: false, right: false, plunger: false };
const pointers = new Map<number, 'left' | 'right'>();
const starts = new Map<number, { x: number; y: number; t: number; nudged: boolean }>();
const keys = new Set<string>();
let started = false;

function updateInput() {
  const vals = [...pointers.values()];
  input.left = vals.includes('left') || keys.has('KeyZ') || keys.has('ShiftLeft') || keys.has('ArrowLeft');
  input.right = vals.includes('right') || keys.has('KeyM') || keys.has('ShiftRight') || keys.has('ArrowRight');
  // Lanceur : maintenir à droite quand la bille est dans le couloir (ou Espace / flèche bas)
  input.plunger = vals.includes('right') || keys.has('Space') || keys.has('ArrowDown') || keys.has('Enter');
}

function firstTouch() {
  if (started) return;
  started = true;
  hud.hint.classList.add('gone');
  const el = document.documentElement as any;
  try { el.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}); } catch {}
  try { (screen.orientation as any)?.lock?.('portrait')?.catch?.(() => {}); } catch {}
}

const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  firstTouch();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, e.clientX < window.innerWidth / 2 ? 'left' : 'right');
  starts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), nudged: false });
  updateInput();
});
// Secousse : glisser vite un doigt vers le haut (ou en biais). La bille part dans le sens du geste.
canvas.addEventListener('pointermove', (e) => {
  const st = starts.get(e.pointerId);
  if (!st || st.nudged) return;
  const dx = e.clientX - st.x, dy = e.clientY - st.y;
  const dt = performance.now() - st.t;
  if (dt < 250 && Math.hypot(dx, dy) > 45 && dy < -20) {
    st.nudged = true;
    sim.nudge(dx / Math.hypot(dx, dy), dy / Math.hypot(dx, dy));
  }
});
const up = (e: PointerEvent) => { pointers.delete(e.pointerId); starts.delete(e.pointerId); updateInput(); };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyN' || e.code === 'ArrowUp') sim.nudge(0, -1);
  keys.add(e.code); firstTouch(); updateInput(); if (e.code === 'Space') e.preventDefault(); });
window.addEventListener('keyup', (e) => { keys.delete(e.code); updateInput(); });
window.addEventListener('blur', () => { pointers.clear(); keys.clear(); updateInput(); });

const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch {} };

// Bandeau d'annonce (rampe, banque, avertissements de tilt)
let bannerTimer: number | undefined;
function banner(text: string, alert = false) {
  hud.banner.textContent = text;
  hud.banner.className = alert ? 'show alert' : 'show';
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => (hud.banner.className = ''), alert ? 1600 : 1200);
}

// ---------- Boucle : physique à pas fixe 480 Hz, découplée de l'affichage ----------
let acc = 0;
let last = performance.now();
let score = 0;
let ballsLost = 0;
let maxSpeed = 0;
const flash = new Map<string, number>();

function tick(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  acc += dt;
  let n = 0;
  while (acc >= DT && n < 40) {
    sim.step(input);
    acc -= DT;
    n++;
    maxSpeed = Math.max(maxSpeed, sim.ballSpeed());
  }
  if (n >= 40) acc = 0;

  for (const e of sim.takeEvents()) {
    if (e.type === 'flip') buzz(12);
    else if (e.type === 'bumper') { buzz(18); score += 100; flash.set(e.id, 0.12); }
    else if (e.type === 'launch') buzz(Math.round(20 + 30 * e.power));
    else if (e.type === 'drain') { buzz(60); ballsLost++; }
    else if (e.type === 'sling') { buzz(14); score += 10; flash.set(`sling-${e.side}`, 0.1); }
    else if (e.type === 'target') { buzz(16); score += 250; }
    else if (e.type === 'bank') { score += 2000; banner('Cibles : banque complète +2 000'); }
    else if (e.type === 'ramp') { buzz(30); score += 1000; banner('Rampe ! +1 000'); }
    else if (e.type === 'nudge') buzz(25);
    else if (e.type === 'warning') { buzz(120); banner(`ATTENTION ${e.count}/2`, true); }
    else if (e.type === 'tilt') { buzz(400); banner('TILT', true); }
  }

  // Synchronisation des meshes
  const p = sim.ballPos();
  ball.position.set(p.x, p.y, p.z);
  const q = sim.ball.rotation();
  ball.quaternion.set(q.x, q.y, q.z, q.w);
  sim.flippers.forEach((f, i) => {
    const t = f.body.translation(), r = f.body.rotation();
    flipperMeshes[i].position.set(t.x, t.y, t.z);
    flipperMeshes[i].quaternion.set(r.x, r.y, r.z, r.w);
  });
  const pt = sim.plunger.translation();
  plungerMesh.position.set(pt.x, pt.y, pt.z);
  for (const t of sim.targets.values()) {
    const m = targetMeshes.get(t.id)!;
    m.position.y += ((t.down ? -0.02 : 0.0175) - m.position.y) * Math.min(1, dt * 25);
  }
  for (const [id, m] of slingMats) {
    const t = Math.max(0, (flash.get(id) ?? 0) - dt);
    flash.set(id, t);
    m.emissiveIntensity = t > 0 ? 1.2 : 0;
  }
  for (const [id, cap] of bumperCaps) {
    const t = Math.max(0, (flash.get(id) ?? 0) - dt);
    flash.set(id, t);
    (cap.material as THREE.MeshStandardMaterial).emissiveIntensity = t > 0 ? 2.5 : 0.15;
  }

  // HUD
  hud.speed.textContent = `${sim.ballSpeed().toFixed(2)} m/s · max ${maxSpeed.toFixed(2)}`;
  hud.score.textContent = score.toLocaleString('fr-FR');
  hud.balls.textContent = `billes perdues : ${ballsLost}`;
  const pull = sim.plungerPull / PLUNGER_MAX_PULL;
  hud.power.style.opacity = pull > 0.01 ? '1' : '0';
  hud.powerFill.style.height = `${Math.round(pull * 100)}%`;

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Exposé pour les tests en navigateur
(window as any).__sim = sim;
(window as any).__input = input;
