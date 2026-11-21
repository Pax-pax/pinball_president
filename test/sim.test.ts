// Tirs de référence : chaque réglage physique doit garder ces comportements.
// Lancer : npm test
import {
  Sim, initRapier, Input, SimEvent, CX, PIVOT_DX, PIVOT_Z, FLIP_LEN, FLIP_REST, FLIP_UP, BALL_R, LANE_INNER_X, TABLE, GLASS_Y,
  SHOTS, SAUCER, PLAY_MAX_X, ORBIT_W,
} from '../src/sim';

const NONE: Input = { left: false, right: false, plunger: false };
let failures = 0;
function check(name: string, ok: boolean, info: string) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} — ${info}`);
  if (!ok) failures++;
}
function run(sim: Sim, seconds: number, input: Input | ((t: number) => Input), onStep?: (t: number) => void) {
  const n = Math.round(seconds * 480);
  for (let i = 0; i < n; i++) {
    const t = i / 480;
    sim.step(typeof input === 'function' ? input(t) : input);
    onStep?.(t);
  }
}
function inBounds(sim: Sim) {
  const p = sim.ballPos();
  return p.x > TABLE.minX - 0.001 && p.x < TABLE.maxX + 0.001 && p.z > TABLE.minZ - 0.001 && p.z < TABLE.maxZ + 0.02 &&
    p.y > BALL_R * 0.8 && p.y < GLASS_Y - BALL_R + 0.002;
}

const R = await initRapier();
const fresh = () => new Sim(R);
const plx = CX - PIVOT_DX;

// 1. Bille posée au repos sur le lanceur : immobile
{
  const s = fresh();
  run(s, 1, NONE);
  check('repos sur le lanceur', s.ballSpeed() < 0.01 && s.ballInLane(), `v=${s.ballSpeed().toFixed(4)} m/s`);
}

// 2. Lancer à pleine puissance : la bille sort du couloir et entre en jeu
{
  const s = fresh();
  let maxV = 0, entered = false, out = false;
  run(s, 3, (t) => ({ ...NONE, plunger: t < 1 }), () => {
    maxV = Math.max(maxV, s.ballSpeed());
    if (s.ballPos().x < LANE_INNER_X - 0.02) entered = true;
    if (!inBounds(s)) out = true;
  });
  check('lancer plein', entered && !out, `vmax=${maxV.toFixed(2)} m/s, entrée=${entered}, hors-limites=${out}`);
}

// 3. Lancer faible : la bille retombe dans le couloir
{
  const s = fresh();
  run(s, 3, (t) => ({ ...NONE, plunger: t < 0.08 }));
  check('lancer faible retombe', s.ballInLane(), `z=${s.ballPos().z.toFixed(3)}`);
}

// 4. Bille rapide (6 m/s) contre un mur et un flipper : aucun passage à travers
{
  const s = fresh();
  let out = false;
  s.placeBall(CX, 0.0, 0, 6);
  run(s, 0.4, NONE, () => { if (!inBounds(s)) out = true; });
  s.placeBall(CX, -0.2, -6, 1);
  run(s, 0.4, NONE, () => { if (!inBounds(s)) out = true; });
  check('pas d\'effet tunnel à 6 m/s', !out, `pos=${JSON.stringify(s.ballPos())}`);
}

// 5. Cradle : flipper levé, bille lâchée au-dessus du milieu du flipper → elle roule et se cale au creux du flipper
const cradle = (s: Sim) => {
  run(s, 0.1, { ...NONE, left: true });
  s.placeBall(plx + 0.045, PIVOT_Z - 0.065);
  run(s, 3, { ...NONE, left: true });
};
{
  const s = fresh();
  cradle(s);
  const p = s.ballPos();
  const onFlipper = Math.hypot(p.x - plx, p.z - PIVOT_Z) < FLIP_LEN + 0.02;
  check('cradle sur flipper gauche', s.ballSpeed() < 0.02 && onFlipper, `v=${s.ballSpeed().toFixed(3)}, p=(${p.x.toFixed(3)}, ${p.z.toFixed(3)})`);
}

// 6. Tir depuis le cradle : on relâche, on refrappe quand la bille passe au milieu du flipper
{
  const s = fresh();
  cradle(s);
  // relâche puis frappe quand la bille est à ~60 % de la longueur
  let fired = false, peakV = 0, minZ = 1;
  run(s, 1.2, (t) => {
    const p = s.ballPos();
    const d = Math.hypot(p.x - plx, p.z - PIVOT_Z);
    if (!fired && t > 0.08 && d > FLIP_LEN * 0.55) fired = true;
    return { ...NONE, left: fired };
  }, () => { peakV = Math.max(peakV, s.ballSpeed()); minZ = Math.min(minZ, s.ballPos().z); });
  check('tir flipper', peakV > 2.5 && minZ < 0, `vmax=${peakV.toFixed(2)} m/s, monte jusqu'à z=${minZ.toFixed(3)}`);
}

// 7. Sans action, la bille entre les flippers est perdue puis remise au lanceur
{
  const s = fresh();
  s.placeBall(CX, 0.3);
  let drained = false;
  run(s, 2.5, NONE, () => { if (s.events.some((e) => e.type === 'drain')) drained = true; s.takeEvents(); });
  check('perte puis remise', drained && s.ballInLane(), `drain=${drained}`);
}

// 8. Bumper : renvoie la bille avec au moins la vitesse de kick
{
  const s = fresh();
  s.placeBall(-0.045, -0.235, 0, -1.0);
  let hit = false, v = 0;
  run(s, 0.5, NONE, () => {
    for (const e of s.takeEvents()) if (e.type === 'bumper') { hit = true; v = s.ballSpeed(); }
  });
  check('bumper actif', hit && v >= 1.9, `touché=${hit}, v après=${v.toFixed(2)}`);
}

const collect = (s: Sim, seconds: number, input: Input = NONE) => {
  const ev: string[] = [];
  run(s, seconds, input, () => { for (const e of s.takeEvents()) ev.push(e.type); });
  return ev;
};

// 9. Rampes : tir franc dans chaque entrée → la bille monte, passe l'épingle et revient par l'inlane du même côté
for (const [side, x] of [['left', SHOTS.rampL], ['right', SHOTS.rampR]] as const) {
  const s = fresh();
  s.placeBall(x, 0.12, 0, -2.6);
  let ev: SimEvent[] = [];
  run(s, 3, NONE, () => { ev.push(...s.takeEvents()); });
  const ok = ev.some((e) => e.type === 'ramp' && e.side === side);
  check(`rampe ${side === 'left' ? 'gauche' : 'droite'} à 2,6 m/s`, ok, `événements: ${[...new Set(ev.map((e) => e.type))].join(', ')}`);
}

// 10. Rampe : tir trop mou → la bille redescend, pas de rampe comptée, pas coincée
{
  const s = fresh();
  s.placeBall(SHOTS.rampL, 0.12, 0, -1.2);
  const ev = collect(s, 2.5);
  check('rampe ratée à 1,2 m/s', !ev.includes('ramp') && s.ballPos().y < BALL_R + 0.005, `y=${s.ballPos().y.toFixed(3)}`);
}

// 11. Slingshot : bille qui roule sur le grand côté → impulsion
{
  const s = fresh();
  s.placeBall(-0.12, 0.25, -0.5, 0.2);
  const ev = collect(s, 0.8);
  check('slingshot gauche', ev.includes('sling'), `événements: ${[...new Set(ev)].join(', ')}`);
}

// 12. Sondages : 3 cibles tombantes → banque complète, puis remontée. RETOUR : cibles fixes.
{
  const s = fresh();
  const ev: SimEvent[] = [];
  for (const t of s.targets.values()) {
    s.placeBall(t.x + t.nx * 0.06, t.z, -t.nx * 1.2, 0);
    run(s, 0.3, NONE, () => ev.push(...s.takeEvents()));
  }
  const sond = ev.filter((e) => e.type === 'target' && e.group === 'sondage').length;
  const ret = ev.filter((e) => e.type === 'target' && e.group === 'retour').length;
  s.placeBall(CX, -0.3);
  run(s, 1.5, NONE);
  const up = [...s.targets.values()].every((t) => !t.down);
  check('cibles', sond === 3 && ret === 3 && ev.some((e) => e.type === 'bank') && up, `sondages=${sond}, retour=${ret}, relevées=${up}`);
}

// 13. Couloir extérieur gauche : la bille y tombe et est perdue
{
  const s = fresh();
  s.placeBall(TABLE.minX + 0.018, 0.21);
  const ev = collect(s, 2);
  check('perte par outlane', ev.includes('drain'), `événements: ${[...new Set(ev)].join(', ')}`);
}

// 14. Tilt : secousses répétées → 2 avertissements puis tilt, flippers coupés
{
  const s = fresh();
  s.placeBall(CX, 0.0);
  const ev: string[] = [];
  for (let i = 0; i < 9; i++) { s.nudge(1, 0); ev.push(...collect(s, 0.15)); }
  const warn = ev.filter((e) => e === 'warning').length;
  const angle = s.flippers[0].angle;
  run(s, 0.2, { ...NONE, left: true });
  check('tilt', warn === 2 && ev.includes('tilt') && s.flippers[0].angle === angle, `avertissements=${warn}, tilt=${ev.includes('tilt')}`);
}

// 15. Orbite : tir dans l'orbite droite → tour par l'arche, ressort à gauche dans le jeu
{
  const s = fresh();
  s.placeBall(PLAY_MAX_X - ORBIT_W / 2, 0.06, 0, -2.6);
  let topSeen = false, leftSeen = false;
  run(s, 2.5, NONE, () => {
    const p = s.ballPos();
    if (p.z < -0.45) topSeen = true;
    if (topSeen && p.x < TABLE.minX + ORBIT_W && p.z > -0.1) leftSeen = true;
  });
  check('orbite droite → gauche', topSeen && leftSeen, `haut=${topSeen}, sortie gauche=${leftSeen}`);
}

// 16. Scoop : la bille entre dans le couloir, est capturée puis éjectée vers le bas
{
  const s = fresh();
  s.placeBall(SHOTS.scoop, 0.05, 0, -1.8);
  const ev = collect(s, 2.5);
  check('scoop', ev.includes('hole') && ev.includes('kickout'), `événements: ${[...new Set(ev)].join(', ')}`);
}

// 17. Soucoupe : bille lente capturée, bille rapide passe par-dessus
{
  const s = fresh();
  s.placeBall(SAUCER.x, SAUCER.z - 0.05, 0, 0.3);
  const slow = collect(s, 1.0);
  const s2 = fresh();
  s2.placeBall(SAUCER.x, SAUCER.z - 0.08, 0, 1.5);
  const fast = collect(s2, 0.3);
  check('soucoupe', slow.includes('hole') && !fast.includes('hole'), `lente=${slow.includes('hole')}, rapide=${fast.includes('hole')}`);
}

// 18. Porte du Recomposé : 7 coups ouvrent le couloir, puis la bille y est capturée
{
  const s = fresh();
  const ev: string[] = [];
  for (let i = 0; i < 7; i++) { s.placeBall(SHOTS.gate, 0.0, 0, -1.6); ev.push(...collect(s, 0.4)); }
  s.placeBall(SHOTS.gate, 0.0, 0, -1.6);
  ev.push(...collect(s, 1.5));
  check('porte du Recomposé', s.gateOpen && ev.filter((e) => e === 'gate').length === 7 && ev.includes('hole'), `coups=${ev.filter((e) => e === 'gate').length}, ouverte=${s.gateOpen}, capture=${ev.includes('hole')}`);
}

// 19. Spinner : la boucle centrale fait tourner le spinner et mène aux bumpers
{
  const s = fresh();
  s.placeBall(SHOTS.spinner, 0.05, 0, -2.2);
  const ev = collect(s, 2);
  check('spinner + bumpers', ev.includes('spinner') && ev.includes('bumper'), `événements: ${[...new Set(ev)].join(', ')}`);
}

// ---------- Effets physiques réalistes ----------

// 20. Bobine : le flipper ne part pas sec (montée en puissance) et atteint la fin de course en 22 à 35 ms
{
  const s = fresh();
  let t5 = 0, tEOS = -1;
  for (let i = 0; i < 480 * 0.1; i++) {
    s.step({ ...NONE, left: true });
    const t = (i + 1) / 480;
    const f = s.flippers[0];
    if (Math.abs(t - 0.005) < 1e-4 || (t > 0.005 && t5 === 0)) t5 = (FLIP_REST - f.angle) / (FLIP_REST - FLIP_UP);
    if (tEOS < 0 && f.angle <= FLIP_UP) tEOS = t;
  }
  check('montée de la bobine', t5 < 0.15 && tEOS > 0.022 && tEOS < 0.035, `course à 5 ms=${(t5 * 100).toFixed(0)} %, fin de course à ${(tEOS * 1000).toFixed(1)} ms`);
}

// 21. Caoutchouc : rebond plus vif sur un choc lent que sur un choc violent (cible fixe RETOUR)
{
  const t = [...fresh().targets.values()].filter((x) => x.group === 'retour').pop()!;
  const cor = (v: number) => {
    const s = fresh();
    s.placeBall(t.x - 0.03, t.z, v, 0);
    let out = 0, hit = false;
    run(s, 0.2, NONE, () => { const vx = s.ballVel().x; if (vx < 0 && !hit) { hit = true; out = -vx; } });
    return out / v;
  };
  const slow = cor(0.4), fast = cor(3);
  check('élasticité selon la vitesse', slow > fast + 0.04, `lent ${slow.toFixed(2)}, rapide ${fast.toFixed(2)}`);
}

// 22. Fin de course : un flipper levé cède un peu sous le choc puis revient
{
  const s = fresh();
  run(s, 0.2, { ...NONE, left: true });
  s.placeBall(plx + 0.04, PIVOT_Z - 0.09, 0, 1.6);
  let maxDip = 0;
  run(s, 0.4, { ...NONE, left: true }, () => { maxDip = Math.max(maxDip, s.flippers[0].angle - FLIP_UP); });
  const back = s.flippers[0].angle - FLIP_UP < 0.001;
  check('flipper qui cède', maxDip > (1 * Math.PI) / 180 && maxDip < (12 * Math.PI) / 180 && back, `creux ${(maxDip * 180 / Math.PI).toFixed(1)}°, revenu=${back}`);
}

// 23. Live catch : flipper levé juste au moment du choc → la bille est amortie, bien plus qu'avec un flipper déjà levé
{
  const bounce = (pressAt: number) => {
    const s = fresh();
    s.placeBall(plx + 0.04, PIVOT_Z - 0.12, 0, 1.6);
    let tHit = -1, out = 0;
    run(s, 0.4, (t) => ({ ...NONE, left: t >= pressAt }), () => {
      const vz = s.ballVel().z;
      if (tHit < 0 && vz < -0.02) { tHit = s.time; out = -vz; }
    });
    return { tHit, out };
  };
  const early = bounce(0); // flipper levé bien avant
  // instant du choc, puis flip calé pour arriver en fin de course ~6 ms avant
  const ref = bounce(0);
  const live = bounce(Math.max(0, ref.tHit - 0.028 - 0.004));
  check('live catch', live.out < early.out * 0.5, `rebond flipper déjà levé ${early.out.toFixed(2)} m/s, live catch ${live.out.toFixed(2)} m/s`);
}

console.log(failures ? `\n${failures} échec(s)` : '\nTous les tirs passent.');
process.exit(failures ? 1 : 0);
