// Cherche les endroits où une bille reste bloquée : grille de départs, sans flipper, 8 s.
import { Sim, initRapier, TABLE, BALL_R, PLAY_MAX_X } from '../src/sim';
const R = await initRapier();
const stuck: string[] = [];
let n = 0;
for (let z = -0.45; z <= 0.2; z += 0.025) for (let x = TABLE.minX + 0.015; x <= PLAY_MAX_X - 0.015; x += 0.02) {
  const s = new Sim(R);
  // ignore les points de départ dans un mur
  let blocked = false;
  s.world.intersectionsWithShape({ x, y: BALL_R + 0.001, z }, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(BALL_R * 0.98), () => { blocked = true; return false; }, undefined, undefined, s.ballCollider);
  if (blocked) continue;
  s.placeBall(x, z);
  let drained = false;
  for (let i = 0; i < 480 * 12 && !drained; i++) { s.step({ left: false, right: false, plunger: false }); if (s.takeEvents().some((e) => e.type === 'drain')) drained = true; }
  n++;
  const p = s.ballPos();
  if (!drained && !s.ballInLane()) stuck.push(`départ(${x.toFixed(3)},${z.toFixed(3)}) → fin(${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}) v=${s.ballSpeed().toFixed(2)}`);
}
console.log(`${n} départs, ${stuck.length} bloqués`);
console.log(stuck.join('\n'));
