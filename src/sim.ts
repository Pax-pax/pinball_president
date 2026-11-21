// Simulation physique du flipper, sans DOM ni rendu : utilisable dans le navigateur et dans les tests Node.
// Repère "table" : x vers la droite, y vers le haut (perpendiculaire au plateau), z vers le joueur.
// Le plateau est plat dans ce repère ; l'inclinaison est portée par la gravité.
import RAPIER from '@dimforge/rapier3d-compat';

export type R = typeof RAPIER;

// --- Constantes réelles (mètres, kilos, secondes) ---
export const TILT_DEG = 6.5;
export const TILT = (TILT_DEG * Math.PI) / 180;
export const G = 9.81;
export const BALL_R = 0.0135; // bille de 27 mm
export const BALL_MASS = 0.08; // ~80 g
export const DT = 1 / 480; // pas fixe

export const TABLE = { minX: -0.255, maxX: 0.255, minZ: -0.535, maxZ: 0.535 };
export const WT = 0.008; // épaisseur des murs
export const WALL_H = 0.05;
export const GLASS_Y = 0.105; // vitre : assez haute pour laisser passer la bille sur la rampe

// Couloir de lancement à droite
export const LANE_INNER_X = TABLE.maxX - 0.03 - WT / 2; // axe du mur intérieur
export const LANE_X = (LANE_INNER_X + WT / 2 + TABLE.maxX) / 2; // axe du couloir
export const PLAY_MAX_X = LANE_INNER_X - WT / 2;
export const CX = (TABLE.minX + PLAY_MAX_X) / 2; // centre de l'aire de jeu

// Flippers
export const FLIP_LEN = 0.075;
export const FLIP_BASE_R = 0.0125;
export const FLIP_TIP_R = 0.0065;
export const FLIP_H = 0.022;
export const FLIP_REST = (30 * Math.PI) / 180; // pointe vers le bas
export const FLIP_UP = (-25 * Math.PI) / 180; // 55° de course
export const FLIP_W_UP = 40; // rad/s en pointe (course complète ≈ 30 ms)
export const FLIP_W_DOWN = 16;
export const FLIP_ACCEL = 3300; // rad/s², pleine vitesse en ~12 ms comme une bobine
export const PIVOT_Z = 0.42;
export const PIVOT_DX = 0.095;

// Lanceur
export const PLUNGER_REST_Z = 0.48;
export const PLUNGER_HALF = { x: 0.013, y: 0.012, z: 0.01 };
export const PLUNGER_MAX_PULL = 0.035;
export const PLUNGER_OMEGA = 100; // vitesse max ≈ 3,5 m/s à pleine course
export const PLUNGER_PULL_SPEED = PLUNGER_MAX_PULL / 0.8;

// Bumpers
export const BUMPER_R = 0.022;
export const BUMPER_KICK = 2.0; // m/s
export const DRAIN_Z = 0.495;

// Slingshots, cibles, rampe, tilt
export const SLING_KICK = 1.5; // m/s
export const TARGET_RESET_DELAY = 1.0;
export const NUDGE_DV = 0.25; // m/s donnés à la bille par une secousse
export const RAMP_W = 0.036; // largeur utile de la rampe
/** Symétrique par rapport à l'axe de l'aire de jeu. */
export const mx = (x: number) => 2 * CX - x;
// Géométrie du bas de table (côté gauche, le droit est le miroir)
export const SEP_X = -0.22; // séparation couloir extérieur / intérieur
export const ORBIT_W = 0.038; // largeur utile des orbites
export const ORBIT_MOUTH_Z = 0.02; // bas des murs intérieurs d'orbite
export const LANE_HW = 0.016; // demi-largeur utile des couloirs de tir
export const RAMP_TOP = 0.064; // hauteur du sol des rampes en haut
/** Abscisses des tirs au fond de l'éventail, de gauche à droite. */
export const SHOTS = { rampL: -0.15, scoop: -0.093, gate: -0.04, spinner: 0.012, rampR: 0.068 } as const;
export const SAUCER = { x: -0.185, z: 0.08 } as const;
export const GATE_HITS = 7; // éléments de langage pour ouvrir le couloir du Recomposé
export const SLING = { a: [-0.18, 0.205], b: [-0.18, 0.355], c: [-0.137, 0.384] } as const;

export type Mat = 'wall' | 'metal' | 'rubber' | 'floor' | 'glass' | 'flipper' | 'bumper' | 'plunger' | 'ramp';
const MATS: Record<Mat, { e: number; mu: number }> = {
  floor: { e: 0.2, mu: 0.25 },
  wall: { e: 0.45, mu: 0.2 },
  metal: { e: 0.35, mu: 0.1 },
  rubber: { e: 0.7, mu: 0.5 },
  glass: { e: 0.3, mu: 0.0 },
  flipper: { e: 0.55, mu: 0.5 },
  bumper: { e: 0.6, mu: 0.3 },
  plunger: { e: 0.0, mu: 0.3 },
  ramp: { e: 0.3, mu: 0.12 }, // plastique transparent
};

export type StaticPart =
  | { kind: 'box'; c: [number, number, number]; h: [number, number, number]; rotY: number; q?: Q; mat: Mat }
  | { kind: 'prism'; pts: [number, number][]; h: number; mat: Mat; id?: string }
  | { kind: 'cyl'; c: [number, number, number]; r: number; hh: number; mat: Mat; id?: string };

export type Q = [number, number, number, number];

/** Quaternion d'un repère dont l'axe x local suit `d` (3D) et l'axe z local reste horizontal. */
export function quatAlong(dx: number, dy: number, dz: number): Q {
  const l = Math.hypot(dx, dy, dz);
  const X = [dx / l, dy / l, dz / l];
  // Z = X × up (horizontal), Y = Z × X
  let Z = [-X[2], 0, X[0]];
  const lz = Math.hypot(Z[0], Z[2]) || 1;
  Z = [Z[0] / lz, 0, Z[2] / lz];
  const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
  // matrice colonnes [X Y Z] → quaternion
  const m00 = X[0], m01 = Y[0], m02 = Z[0], m10 = X[1], m11 = Y[1], m12 = Z[1], m20 = X[2], m21 = Y[2], m22 = Z[2];
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const S = Math.sqrt(tr + 1) * 2;
    return [(m21 - m12) / S, (m02 - m20) / S, (m10 - m01) / S, 0.25 * S];
  } else if (m00 > m11 && m00 > m22) {
    const S = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return [0.25 * S, (m01 + m10) / S, (m02 + m20) / S, (m21 - m12) / S];
  } else if (m11 > m22) {
    const S = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return [(m01 + m10) / S, 0.25 * S, (m12 + m21) / S, (m02 - m20) / S];
  }
  const S = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return [(m02 + m20) / S, (m12 + m21) / S, 0.25 * S, (m10 - m01) / S];
}

export interface Target {
  id: string;
  group: 'sondage' | 'retour';
  collider: import('@dimforge/rapier3d-compat').Collider;
  x: number;
  z: number;
  nx: number; // sens de la face (+1 = vers la droite)
  drops: boolean;
  down: boolean;
}

export interface Hole {
  id: 'scoop' | 'recompose' | 'saucer';
  x: number;
  z: number;
  r: number; // rayon de capture
  maxSpeed: number; // au-delà, la bille passe par-dessus
  kick: [number, number];
  speed: number;
  hold: number;
}

export interface Input {
  left: boolean;
  right: boolean;
  plunger: boolean;
}

export type SimEvent =
  | { type: 'flip'; side: 'left' | 'right' }
  | { type: 'bumper'; id: string }
  | { type: 'launch'; power: number }
  | { type: 'drain' }
  | { type: 'sling'; side: 'left' | 'right' }
  | { type: 'target'; id: string; group: 'sondage' | 'retour' }
  | { type: 'bank' }
  | { type: 'ramp'; side: 'left' | 'right' }
  | { type: 'hole'; id: Hole['id'] }
  | { type: 'kickout'; id: Hole['id'] }
  | { type: 'gate'; hits: number }
  | { type: 'gateOpen' }
  | { type: 'spinner'; spins: number }
  | { type: 'orbit'; dir: 'left' | 'right' }
  | { type: 'nudge' }
  | { type: 'warning'; count: number }
  | { type: 'tilt' };

export interface FlipperState {
  body: import('@dimforge/rapier3d-compat').RigidBody;
  side: 'left' | 'right';
  pivot: [number, number];
  angle: number;
  omega: number;
  held: boolean;
}

/** Points de l'enveloppe convexe d'un flipper, construit le long de +x (gauche) ou -x (droite). */
export function flipperHullPoints(side: 'left' | 'right'): Float32Array {
  const s = side === 'left' ? 1 : -1;
  const pts: number[] = [];
  const N = 12;
  for (const y of [0.001, 0.001 + FLIP_H]) {
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      pts.push(Math.cos(t) * FLIP_BASE_R, y, Math.sin(t) * FLIP_BASE_R);
      pts.push(s * FLIP_LEN + Math.cos(t) * FLIP_TIP_R, y, Math.sin(t) * FLIP_TIP_R);
    }
  }
  return new Float32Array(pts);
}

export async function initRapier(): Promise<R> {
  await RAPIER.init();
  return RAPIER;
}

export class Sim {
  R: R;
  world: import('@dimforge/rapier3d-compat').World;
  ball!: import('@dimforge/rapier3d-compat').RigidBody;
  ballCollider!: import('@dimforge/rapier3d-compat').Collider;
  flippers: FlipperState[] = [];
  plunger!: import('@dimforge/rapier3d-compat').RigidBody;
  plungerPull = 0;
  plungerVel = 0;
  plungerReleasing = false;
  staticParts: StaticPart[] = [];
  bumpers = new Map<number, { id: string; x: number; z: number; cooldown: number }>();
  events: SimEvent[] = [];
  slings = new Map<number, { side: 'left' | 'right'; a: [number, number]; c: [number, number]; cooldown: number }>();
  targets = new Map<number, Target>();
  bankResetTimer = -1;
  holes: Hole[] = [];
  orbitFlag = false;
  captured: { hole: Hole; t: number } | null = null;
  holeCooldown = 0;
  gate!: import('@dimforge/rapier3d-compat').Collider;
  gateHits = 0;
  gateOpen = false;
  spinnerSensor!: import('@dimforge/rapier3d-compat').Collider;
  spinnerAngle = 0;
  spinnerVel = 0;
  ramp_ = { elevated: false, top: false, lastX: 0, lastZ: 0 };
  tiltLevel = 0;
  warnings = 0;
  tilted = false;
  queue: import('@dimforge/rapier3d-compat').EventQueue;
  time = 0;
  drainTimer = -1;
  private prevInput: Input = { left: false, right: false, plunger: false };

  constructor(R: R) {
    this.R = R;
    const g = { x: 0, y: -G * Math.cos(TILT), z: G * Math.sin(TILT) };
    this.world = new R.World(g);
    this.world.timestep = DT;
    // Objets à l'échelle du centimètre : on resserre les tolérances internes (prédiction de contact, erreur admise)
    this.world.lengthUnit = 0.05;
    this.queue = new R.EventQueue(true);
    this.buildTable();
    this.buildBall();
    this.resetBall();
  }

  // ---------- Construction ----------
  private collider(desc: import('@dimforge/rapier3d-compat').ColliderDesc, mat: Mat, body?: import('@dimforge/rapier3d-compat').RigidBody) {
    const m = MATS[mat];
    desc
      .setRestitution(m.e)
      .setFriction(m.mu)
      .setRestitutionCombineRule(this.R.CoefficientCombineRule.Max)
      .setFrictionCombineRule(this.R.CoefficientCombineRule.Max);
    return this.world.createCollider(desc, body);
  }

  private box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY: number, mat: Mat, visible = true, q?: Q) {
    const R = this.R;
    const rot = q ? { x: q[0], y: q[1], z: q[2], w: q[3] } : { x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) };
    const d = R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setRotation(rot);
    const c = this.collider(d, mat);
    if (visible) this.staticParts.push({ kind: 'box', c: [cx, cy, cz], h: [hx, hy, hz], rotY, q, mat });
    return c;
  }

  /** Bloc convexe extrudé depuis un polygone du plateau (slingshots). */
  private prism(pts: [number, number][], mat: Mat, h = WALL_H, id?: string) {
    const R = this.R;
    const v: number[] = [];
    for (const [x, z] of pts) v.push(x, 0, z, x, h, z);
    const d = R.ColliderDesc.convexHull(new Float32Array(v))!;
    if (id) d.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    const c = this.collider(d, mat);
    this.staticParts.push({ kind: 'prism', pts, h, mat, id });
    return c;
  }

  /**
   * Rampe : un chemin 3D (x, z, hauteur du sol de rampe). Sol incliné + rails latéraux.
   * `solidUntil` : nombre de segments du début dont les rails descendent jusqu'au plateau (on ne passe pas dessous).
   */
  private ramp(path: [number, number, number][], solidUntil: number) {
    const hw = RAMP_W / 2, th = 0.002, rail = 0.0015, railH = 0.028;
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, z1, y1] = path[i], [x2, z2, y2] = path[i + 1];
      const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
      const len = Math.hypot(dx, dy, dz);
      const q = quatAlong(dx, dy, dz);
      // normale "haut" du segment pour poser le sol sous le chemin
      const lh = Math.hypot(dx, dz);
      const up = [(-dx / lh) * (dy / len), lh / len, (-dz / lh) * (dy / len)];
      const mxp = (x1 + x2) / 2, myp = (y1 + y2) / 2, mzp = (z1 + z2) / 2;
      this.box(mxp - up[0] * th, myp - up[1] * th, mzp - up[2] * th, len / 2 + 0.003, th, hw + rail * 2, 0, 'ramp', true, q);
      // rails
      const lat = [-dz / lh, 0, dx / lh];
      for (const s of [-1, 1]) {
        const ox = lat[0] * (hw + rail) * s, oz = lat[2] * (hw + rail) * s;
        if (i < solidUntil) {
          const top = Math.max(y1, y2) + railH;
          const rotY = Math.atan2(-dz, dx);
          this.box(mxp + ox, top / 2, mzp + oz, lh / 2 + 0.002, top / 2, rail, rotY, 'ramp');
        } else {
          this.box(mxp + ox + up[0] * railH / 2, myp + up[1] * railH / 2, mzp + oz + up[2] * railH / 2, len / 2 + 0.002, railH / 2, rail, 0, 'ramp', true, q);
        }
      }
    }
  }

  /** Mur entre deux points du plateau (axe du mur). */
  wall(x1: number, z1: number, x2: number, z2: number, mat: Mat = 'wall', h = WALL_H) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const rotY = Math.atan2(-dz, dx);
    this.box((x1 + x2) / 2, h / 2, (z1 + z2) / 2, len / 2 + WT / 2, h / 2, WT / 2, rotY, mat);
  }

  private cylinder(x: number, z: number, r: number, mat: Mat, id?: string) {
    const R = this.R;
    const hh = WALL_H / 2;
    const d = R.ColliderDesc.cylinder(hh, r).setTranslation(x, hh, z);
    if (id) d.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    const c = this.collider(d, mat);
    this.staticParts.push({ kind: 'cyl', c: [x, hh, z], r, hh, mat, id });
    return c;
  }

  private addHole(id: Hole['id'], x: number, z: number, r: number, maxSpeed: number, kick: [number, number], speed: number, hold: number) {
    const l = Math.hypot(kick[0], kick[1]);
    this.holes.push({ id, x, z, r, maxSpeed, kick: [kick[0] / l, kick[1] / l], speed, hold });
  }

  private addTarget(id: string, group: Target['group'], x: number, z: number, nx: number, drops: boolean) {
    const d = this.R.ColliderDesc.cuboid(0.003, 0.0175, 0.0125)
      .setTranslation(x, 0.0175, z)
      .setActiveEvents(this.R.ActiveEvents.COLLISION_EVENTS);
    const col = this.collider(d, drops ? 'wall' : 'rubber');
    this.targets.set(col.handle, { id, group, collider: col, x, z, nx, drops, down: false });
  }

  setGateOpen(open: boolean) {
    this.gateOpen = open;
    this.gate.setEnabled(!open);
  }

  private buildTable() {
    const R = this.R;
    const { minX, maxX, minZ, maxZ } = TABLE;
    // Plateau et vitre (la vitre n'est pas dessinée)
    this.box(0, -0.01, 0, (maxX - minX) / 2 + 0.03, 0.01, (maxZ - minZ) / 2 + 0.03, 0, 'floor');
    this.box(0, GLASS_Y + 0.01, 0, (maxX - minX) / 2 + 0.03, 0.01, (maxZ - minZ) / 2 + 0.03, 0, 'glass', false);

    // Côtés et arche du haut
    const arcCz = minZ + (maxX - minX) / 2;
    const lx = minX - WT / 2, rx = maxX + WT / 2;
    this.wall(lx, maxZ, lx, arcCz);
    this.wall(rx, maxZ, rx, arcCz, 'metal');
    const Ra = (maxX - minX) / 2 + WT / 2;
    const N = 18;
    for (let i = 0; i < N; i++) {
      const t1 = Math.PI - (i / N) * Math.PI;
      const t2 = Math.PI - ((i + 1) / N) * Math.PI;
      this.wall(Ra * Math.cos(t1), arcCz - Ra * Math.sin(t1), Ra * Math.cos(t2), arcCz - Ra * Math.sin(t2), 'metal');
    }
    // Fond
    this.wall(minX, maxZ + WT / 2, maxX, maxZ + WT / 2);

    // Couloir de lancement
    this.wall(LANE_INNER_X, maxZ, LANE_INNER_X, -0.2);

    // Bas de table : couloirs extérieurs (perte), couloirs intérieurs (vers les flippers), slingshots
    const pl = CX - PIVOT_DX, pr = CX + PIVOT_DX;
    for (const side of ['left', 'right'] as const) {
      const X = side === 'left' ? (x: number) => x : mx;
      // séparation outlane / inlane : poteau caoutchouc + mur jusqu'en bas
      this.cylinder(X(SEP_X), 0.232, 0.006, 'rubber');
      this.wall(X(SEP_X), 0.238, X(SEP_X), maxZ);
      // guide de l'inlane vers la base du flipper, et fermeture dessous
      this.wall(X(SEP_X), 0.34, X(pl - 0.016), PIVOT_Z - 0.014, 'metal');
      this.wall(X(pl - 0.016), PIVOT_Z - 0.014, X(pl - 0.016), maxZ, 'wall');
      // slingshot (le grand côté a → c donne l'impulsion)
      const pts: [number, number][] = [SLING.a, SLING.b, SLING.c].map(([x, z]) => [X(x), z] as [number, number]);
      const c = this.prism(pts, 'rubber', WALL_H, `sling-${side}`);
      this.slings.set(c.handle, { side, a: pts[0], c: pts[2], cooldown: 0 });
    }

    // ---- Disposition en éventail (inspirée des tables Williams fin 90) ----
    // Orbites : couloirs le long des murs, reliés par l'arche. Un déflecteur en bas renvoie la bille vers le jeu.
    for (const side of ['left', 'right'] as const) {
      const wallX = side === 'left' ? minX : PLAY_MAX_X;
      const s = side === 'left' ? 1 : -1;
      const inner = wallX + s * (ORBIT_W + WT / 2);
      this.wall(inner, ORBIT_MOUTH_Z, inner, -0.25, 'metal');
      this.wall(wallX, ORBIT_MOUTH_Z + 0.02, wallX + s * (ORBIT_W + 0.002), ORBIT_MOUTH_Z + 0.08, 'metal');
    }

    // Couloirs de tir au fond de l'éventail (scoop, porte du Recomposé, boucle du spinner)
    const lane = (x: number, z1: number, z2: number, closed: boolean) => {
      this.wall(x - LANE_HW - WT / 2, z1, x - LANE_HW - WT / 2, z2);
      this.wall(x + LANE_HW + WT / 2, z1, x + LANE_HW + WT / 2, z2);
      if (closed) this.wall(x - LANE_HW - WT / 2, z2, x + LANE_HW + WT / 2, z2);
    };
    lane(SHOTS.scoop, -0.06, -0.135, true);
    lane(SHOTS.gate, -0.075, -0.155, true);
    lane(SHOTS.spinner, -0.075, -0.2, false);

    // Trous : scoop (au fond du couloir), porte du Recomposé, soucoupe (à gauche)
    this.addHole('scoop', SHOTS.scoop, -0.118, 0.014, 99, [0.05, 1], 1.6, 0.9);
    this.addHole('recompose', SHOTS.gate, -0.138, 0.014, 99, [0.0, 1], 1.4, 0.9);
    this.addHole('saucer', SAUCER.x, SAUCER.z, 0.012, 0.9, [0.55, 0.83], 1.3, 0.9);

    // Cible qui ferme le couloir du Recomposé (s'efface quand la porte est ouverte)
    {
      const d = this.R.ColliderDesc.cuboid(LANE_HW + 0.002, 0.0175, 0.003)
        .setTranslation(SHOTS.gate, 0.0175, -0.078)
        .setActiveEvents(this.R.ActiveEvents.COLLISION_EVENTS);
      this.gate = this.collider(d, 'wall');
    }

    // Spinner : capteur traversé par la bille dans la boucle centrale
    {
      const d = this.R.ColliderDesc.cuboid(LANE_HW, 0.02, 0.002)
        .setTranslation(SHOTS.spinner, 0.02, -0.1)
        .setSensor(true)
        .setActiveEvents(this.R.ActiveEvents.COLLISION_EVENTS);
      this.spinnerSensor = this.collider(d, 'wall');
    }

    // Rampes gauche et droite : montée, épingle en haut, retour au-dessus de l'orbite vers l'inlane du même côté
    for (const side of ['left', 'right'] as const) {
      const xUp = side === 'left' ? SHOTS.rampL : SHOTS.rampR;
      const xRet = side === 'left' ? minX + ORBIT_W / 2 + 0.002 : PLAY_MAX_X - ORBIT_W / 2 - 0.002;
      const xIn = side === 'left' ? SEP_X + 0.02 : mx(SEP_X + 0.02);
      const rcz = -0.3, rr = (xRet - xUp) / 2, ccx = (xUp + xRet) / 2;
      const path: [number, number, number][] = [
        [xUp, 0.0, -0.0015],
        [xUp, -0.08, 0.016],
        [xUp, -0.2, 0.046],
        [xUp, rcz, RAMP_TOP],
      ];
      for (let i = 1; i <= 7; i++) {
        const t = (i / 7) * Math.PI;
        path.push([ccx - rr * Math.cos(t), rcz - Math.abs(rr) * Math.sin(t), RAMP_TOP]);
      }
      path.push([xRet, 0.1, RAMP_TOP - 0.004], [xIn, 0.165, RAMP_TOP - 0.012]);
      this.ramp(path, 3);
    }

    // Cibles : 3 sondages tombants contre le mur gauche, 3 cibles fixes R-E-T-O-U-R contre le mur droit
    for (let i = 0; i < 3; i++) {
      this.addTarget(`sondage${i + 1}`, 'sondage', minX + 0.012, 0.125 + i * 0.03, 1, true);
      this.addTarget(`retour${i + 1}`, 'retour', PLAY_MAX_X - 0.006, 0.115 + i * 0.03, -1, false);
    }

    // Bumpers en haut, alimentés par la boucle centrale et les orbites trop molles
    const bumperPos: [string, number, number][] = [
      ['b1', -0.085, -0.29],
      ['b2', -0.005, -0.315],
      ['b3', -0.045, -0.235],
    ];
    for (const [id, x, z] of bumperPos) {
      const c = this.cylinder(x, z, BUMPER_R, 'bumper', id);
      this.bumpers.set(c.handle, { id, x, z, cooldown: 0 });
    }

    // Flippers (corps cinématiques)
    for (const side of ['left', 'right'] as const) {
      const px = side === 'left' ? pl : pr;
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(px, 0, PIVOT_Z)
      );
      const hull = R.ColliderDesc.convexHull(flipperHullPoints(side))!;
      this.collider(hull, 'flipper', body);
      const f: FlipperState = { body, side, pivot: [px, PIVOT_Z], angle: FLIP_REST, omega: 0, held: false };
      this.setFlipperRotation(f, false);
      this.flippers.push(f);
    }

    // Lanceur
    this.plunger = this.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(LANE_X, PLUNGER_HALF.y, PLUNGER_REST_Z)
    );
    this.collider(R.ColliderDesc.cuboid(PLUNGER_HALF.x, PLUNGER_HALF.y, PLUNGER_HALF.z), 'plunger', this.plunger);
  }

  private buildBall() {
    const R = this.R;
    this.ball = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic().setCcdEnabled(true).setAngularDamping(0.05).setCanSleep(false)
    );
    const vol = (4 / 3) * Math.PI * BALL_R ** 3;
    const d = R.ColliderDesc.ball(BALL_R)
      .setDensity(BALL_MASS / vol)
      .setRestitution(0)
      .setFriction(0)
      .setRestitutionCombineRule(R.CoefficientCombineRule.Max)
      .setFrictionCombineRule(R.CoefficientCombineRule.Max)
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    this.ballCollider = this.world.createCollider(d, this.ball);
  }

  // ---------- État ----------
  resetBall() {
    this.tilted = false;
    this.warnings = 0;
    this.tiltLevel = 0;
    this.placeBall(LANE_X, PLUNGER_REST_Z - PLUNGER_HALF.z - BALL_R - 0.001);
  }

  placeBall(x: number, z: number, vx = 0, vz = 0) {
    this.ball.setTranslation({ x, y: BALL_R + 0.0002, z }, true);
    this.ball.setLinvel({ x: vx, y: 0, z: vz }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.drainTimer = -1;
    this.captured = null;
  }

  ballPos() {
    return this.ball.translation();
  }
  ballVel() {
    return this.ball.linvel();
  }
  ballSpeed() {
    const v = this.ball.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }
  ballInLane() {
    const p = this.ball.translation();
    return p.x > LANE_INNER_X && p.z > 0.25;
  }

  private setFlipperRotation(f: FlipperState, next = true) {
    const beta = f.side === 'left' ? -f.angle : f.angle;
    const q = { x: 0, y: Math.sin(beta / 2), z: 0, w: Math.cos(beta / 2) };
    if (next) f.body.setNextKinematicRotation(q);
    else f.body.setRotation(q, true);
  }

  // ---------- Pas de simulation ----------
  step(input: Input) {
    // Flippers : vitesse angulaire bornée, forte accélération, comme une bobine
    for (const f of this.flippers) {
      const held = !this.tilted && (f.side === 'left' ? input.left : input.right);
      if (held && !f.held) this.events.push({ type: 'flip', side: f.side });
      f.held = held;
      const target = held ? FLIP_UP : FLIP_REST;
      const wMax = held ? FLIP_W_UP : FLIP_W_DOWN;
      const dir = Math.sign(target - f.angle);
      if (dir === 0 || Math.abs(target - f.angle) < 1e-6) {
        f.omega = 0;
      } else {
        // la vitesse repart de zéro si on change de sens
        if (Math.sign(f.omega) !== dir) f.omega = 0;
        f.omega = dir * Math.min(Math.abs(f.omega) + FLIP_ACCEL * DT, wMax);
        let a = f.angle + f.omega * DT;
        if ((dir > 0 && a > target) || (dir < 0 && a < target)) {
          a = target;
          f.omega = 0;
        }
        f.angle = a;
      }
      this.setFlipperRotation(f);
    }

    // Lanceur : on tire tant qu'on maintient (si la bille est dans le couloir), ressort au relâcher
    const pullWanted = input.plunger && (this.ballInLane() || this.plungerPull > 0) && !this.plungerReleasing;
    if (pullWanted) {
      this.plungerPull = Math.min(this.plungerPull + PLUNGER_PULL_SPEED * DT, PLUNGER_MAX_PULL);
      this.plungerVel = 0;
    } else if (this.plungerPull > 0) {
      if (!this.plungerReleasing) {
        this.plungerReleasing = true;
        this.events.push({ type: 'launch', power: this.plungerPull / PLUNGER_MAX_PULL });
      }
      this.plungerVel += -PLUNGER_OMEGA * PLUNGER_OMEGA * this.plungerPull * DT;
      this.plungerPull += this.plungerVel * DT;
      if (this.plungerPull <= 0) {
        this.plungerPull = 0;
        this.plungerVel = 0;
        this.plungerReleasing = false;
      }
    }
    this.plunger.setNextKinematicTranslation({ x: LANE_X, y: PLUNGER_HALF.y, z: PLUNGER_REST_Z + this.plungerPull });

    this.world.step(this.queue);
    this.time += DT;

    // Bumpers actifs : impulsion propre au contact
    for (const b of this.bumpers.values()) b.cooldown = Math.max(0, b.cooldown - DT);
    for (const s of this.slings.values()) s.cooldown = Math.max(0, s.cooldown - DT);
    this.queue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const other = h1 === this.ballCollider.handle ? h2 : h2 === this.ballCollider.handle ? h1 : -1;
      const b = this.bumpers.get(other);
      if (b) {
        if (b.cooldown > 0 || this.tilted) return;
        b.cooldown = 0.06;
        this.kickFrom(b.x, b.z, BUMPER_KICK);
        this.events.push({ type: 'bumper', id: b.id });
        return;
      }
      const s = this.slings.get(other);
      if (s) {
        if (s.cooldown > 0 || this.tilted) return;
        this.slingKick(s);
        return;
      }
      if (other === this.gate.handle && !this.gateOpen) {
        this.gateHits++;
        this.events.push({ type: 'gate', hits: this.gateHits });
        if (this.gateHits >= GATE_HITS) { this.setGateOpen(true); this.events.push({ type: 'gateOpen' }); }
        return;
      }
      if (other === this.spinnerSensor.handle) {
        const v = this.ball.linvel();
        const speed = Math.hypot(v.x, v.z);
        const spins = Math.max(1, Math.round(speed * 5));
        this.spinnerVel = Math.sign(-v.z || 1) * speed * 60;
        this.events.push({ type: 'spinner', spins });
        return;
      }
      const t = this.targets.get(other);
      if (t && !t.down) {
        this.events.push({ type: 'target', id: t.id, group: t.group });
        if (t.drops) {
          t.down = true;
          t.collider.setEnabled(false);
          const bank = [...this.targets.values()].filter((x) => x.group === t.group);
          if (bank.every((x) => x.down)) {
            this.events.push({ type: 'bank' });
            this.bankResetTimer = TARGET_RESET_DELAY;
          }
        }
      }
    });
    this.updateHoles();
    this.spinnerAngle += this.spinnerVel * DT;
    this.spinnerVel *= Math.exp(-1.5 * DT);
    if (this.bankResetTimer >= 0) {
      this.bankResetTimer -= DT;
      if (this.bankResetTimer < 0) this.resetTargets();
    }
    this.trackRamp();
    // Orbite : la bille passe sous l'arche, tout en haut de la table
    {
      const p = this.ball.translation();
      if (!this.orbitFlag && p.z < -0.47 && p.y < BALL_R + 0.01) {
        this.orbitFlag = true;
        this.events.push({ type: 'orbit', dir: this.ball.linvel().x < 0 ? 'left' : 'right' });
      } else if (this.orbitFlag && p.z > -0.3) this.orbitFlag = false;
    }
    this.tiltLevel = Math.max(0, this.tiltLevel - 0.6 * DT);

    // Perte de bille / sécurité
    const p = this.ball.translation();
    const lost = p.y < -0.05 || p.y > 0.2 || Math.abs(p.x) > 0.4 || Math.abs(p.z) > 0.7;
    if (this.drainTimer < 0 && (p.z > DRAIN_Z || lost) && !this.ballInLane()) {
      this.drainTimer = 0.7;
      this.events.push({ type: 'drain' });
    }
    if (this.drainTimer >= 0) {
      this.drainTimer -= DT;
      if (this.drainTimer < 0) this.resetBall();
    }

    this.prevInput = { ...input };
  }

  /** Slingshot : seulement si la bille touche le grand côté (a → c), impulsion perpendiculaire vers le jeu. */
  private slingKick(s: { side: 'left' | 'right'; a: [number, number]; c: [number, number]; cooldown: number }) {
    const p = this.ball.translation();
    const [ax, az] = s.a, [cx, cz] = s.c;
    const ex = cx - ax, ez = cz - az;
    const L = Math.hypot(ex, ez);
    const t = ((p.x - ax) * ex + (p.z - az) * ez) / (L * L);
    // normale sortante (vers le centre de la table)
    let nx = -ez / L, nz = ex / L;
    if (nx * (CX - ax) + nz * (0.2 - az) < 0) { nx = -nx; nz = -nz; }
    const dist = (p.x - ax) * nx + (p.z - az) * nz;
    if (t < 0.12 || t > 0.88 || dist < 0 || dist > BALL_R + 0.006) return;
    s.cooldown = 0.08;
    const v = this.ball.linvel();
    const vn = v.x * nx + v.z * nz;
    const out = Math.max(SLING_KICK, Math.abs(vn));
    this.ball.setLinvel({ x: v.x - vn * nx + out * nx, y: v.y, z: v.z - vn * nz + out * nz }, true);
    this.events.push({ type: 'sling', side: s.side });
  }

  /** Trous : capture si la bille passe au centre assez lentement, maintien, puis éjection. */
  private updateHoles() {
    this.holeCooldown = Math.max(0, this.holeCooldown - DT);
    if (this.captured) {
      const c = this.captured;
      c.t -= DT;
      if (c.t <= 0) {
        const { hole } = c;
        this.ball.setTranslation({ x: hole.x + hole.kick[0] * 0.004, y: BALL_R + 0.0005, z: hole.z + hole.kick[1] * 0.004 }, true);
        this.ball.setLinvel({ x: hole.kick[0] * hole.speed, y: 0, z: hole.kick[1] * hole.speed }, true);
        this.events.push({ type: 'kickout', id: hole.id });
        this.captured = null;
        this.holeCooldown = 0.35;
      } else {
        this.ball.setTranslation({ x: c.hole.x, y: BALL_R, z: c.hole.z }, true);
        this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }
    if (this.holeCooldown > 0) return;
    const p = this.ball.translation();
    if (p.y > BALL_R + 0.01) return;
    const v = this.ball.linvel();
    const sp = Math.hypot(v.x, v.z);
    for (const h of this.holes) {
      if (Math.hypot(p.x - h.x, p.z - h.z) < h.r && sp < h.maxSpeed) {
        this.captured = { hole: h, t: h.hold };
        this.events.push({ type: 'hole', id: h.id });
        return;
      }
    }
  }

  resetTargets() {
    const p = this.ball.translation();
    for (const t of this.targets.values()) {
      if (!t.drops) continue;
      // on ne relève pas une cible sur la bille
      if (Math.hypot(p.x - t.x, p.z - t.z) < BALL_R + 0.02) { this.bankResetTimer = 0.2; return; }
    }
    for (const t of this.targets.values()) if (t.drops) { t.down = false; t.collider.setEnabled(true); }
    this.bankResetTimer = -1;
  }

  /** Rampe réussie : la bille est montée, a passé l'épingle, et redescend par le retour. */
  private trackRamp() {
    const p = this.ball.translation();
    const r = this.ramp_;
    if (p.y > BALL_R + 0.03) {
      r.elevated = true;
      if (p.z < -0.29) r.top = true;
      r.lastX = p.x; r.lastZ = p.z;
    } else if (r.elevated && p.y < BALL_R + 0.012) {
      if (r.top && r.lastZ > 0.08) this.events.push({ type: 'ramp', side: r.lastX < CX ? 'left' : 'right' });
      r.elevated = false; r.top = false;
    }
  }

  /** Secousse de la table : petite impulsion sur la bille, compteur de tilt avec 2 avertissements. */
  nudge(dx: number, dz: number) {
    if (this.tilted) return;
    const l = Math.hypot(dx, dz) || 1;
    const v = this.ball.linvel();
    this.ball.setLinvel({ x: v.x + (dx / l) * NUDGE_DV, y: v.y, z: v.z + (dz / l) * NUDGE_DV }, true);
    this.events.push({ type: 'nudge' });
    this.tiltLevel += 1;
    if (this.tiltLevel > 2.2) {
      this.warnings++;
      this.tiltLevel = 0.8;
      if (this.warnings > 2) {
        this.tilted = true;
        this.events.push({ type: 'tilt' });
      } else this.events.push({ type: 'warning', count: this.warnings });
    }
  }

  kickFrom(x: number, z: number, speed: number) {
    const p = this.ball.translation();
    const v = this.ball.linvel();
    let nx = p.x - x, nz = p.z - z;
    const n = Math.hypot(nx, nz) || 1;
    nx /= n; nz /= n;
    const vn = v.x * nx + v.z * nz;
    const out = Math.max(speed, Math.abs(vn));
    this.ball.setLinvel({ x: v.x - vn * nx + out * nx, y: v.y, z: v.z - vn * nz + out * nz }, true);
  }

  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
