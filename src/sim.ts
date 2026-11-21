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
export const GLASS_Y = BALL_R * 2 + 0.003; // vitre juste au-dessus de la bille

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

export type Mat = 'wall' | 'metal' | 'rubber' | 'floor' | 'glass' | 'flipper' | 'bumper' | 'plunger';
const MATS: Record<Mat, { e: number; mu: number }> = {
  floor: { e: 0.2, mu: 0.25 },
  wall: { e: 0.45, mu: 0.2 },
  metal: { e: 0.35, mu: 0.1 },
  rubber: { e: 0.7, mu: 0.5 },
  glass: { e: 0.3, mu: 0.0 },
  flipper: { e: 0.55, mu: 0.5 },
  bumper: { e: 0.6, mu: 0.3 },
  plunger: { e: 0.0, mu: 0.3 },
};

export type StaticPart =
  | { kind: 'box'; c: [number, number, number]; h: [number, number, number]; rotY: number; mat: Mat }
  | { kind: 'cyl'; c: [number, number, number]; r: number; hh: number; mat: Mat; id?: string };

export interface Input {
  left: boolean;
  right: boolean;
  plunger: boolean;
}

export type SimEvent =
  | { type: 'flip'; side: 'left' | 'right' }
  | { type: 'bumper'; id: string }
  | { type: 'launch'; power: number }
  | { type: 'drain' };

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

  private box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY: number, mat: Mat, visible = true) {
    const R = this.R;
    const d = R.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(cx, cy, cz)
      .setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) });
    this.collider(d, mat);
    if (visible) this.staticParts.push({ kind: 'box', c: [cx, cy, cz], h: [hx, hy, hz], rotY, mat });
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

    // Guides des couloirs intérieurs (inlanes) vers les flippers
    const pl = CX - PIVOT_DX, pr = CX + PIVOT_DX;
    this.wall(minX, 0.29, pl - 0.016, PIVOT_Z - 0.014, 'metal');
    this.wall(PLAY_MAX_X, 0.29, pr + 0.016, PIVOT_Z - 0.014, 'metal');
    // Murs de fond sous les guides (fermeture)
    this.wall(pl - 0.016, PIVOT_Z - 0.014, pl - 0.016, maxZ, 'wall');
    this.wall(pr + 0.016, PIVOT_Z - 0.014, pr + 0.016, maxZ, 'wall');

    // Bumpers
    const bumperPos: [string, number, number][] = [
      ['b1', CX - 0.065, -0.22],
      ['b2', CX + 0.065, -0.22],
      ['b3', CX, -0.13],
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
    this.placeBall(LANE_X, PLUNGER_REST_Z - PLUNGER_HALF.z - BALL_R - 0.001);
  }

  placeBall(x: number, z: number, vx = 0, vz = 0) {
    this.ball.setTranslation({ x, y: BALL_R + 0.0002, z }, true);
    this.ball.setLinvel({ x: vx, y: 0, z: vz }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.drainTimer = -1;
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
      const held = f.side === 'left' ? input.left : input.right;
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
    this.queue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const other = h1 === this.ballCollider.handle ? h2 : h2 === this.ballCollider.handle ? h1 : -1;
      const b = this.bumpers.get(other);
      if (!b || b.cooldown > 0) return;
      b.cooldown = 0.06;
      this.kickFrom(b.x, b.z, BUMPER_KICK);
      this.events.push({ type: 'bumper', id: b.id });
    });

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
