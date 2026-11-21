// Balayage : depuis le cradle de chaque flipper, on frappe à différents moments et on note ce qui est touché.
import { Sim, initRapier, CX, PIVOT_DX, PIVOT_Z, Input } from '../src/sim';
const R = await initRapier();
const NONE: Input = { left: false, right: false, plunger: false };
for (const side of ['left', 'right'] as const) {
  const res: string[] = [];
  for (let k = 0; k < 14; k++) {
    const s = new Sim(R);
    const px = side === 'left' ? CX - PIVOT_DX : CX + PIVOT_DX, sg = side === 'left' ? 1 : -1;
    const hold = { ...NONE, [side]: true };
    for (let i = 0; i < 48; i++) s.step(hold);
    s.placeBall(px + sg * 0.045, PIVOT_Z - 0.065);
    for (let i = 0; i < 480 * 2.5; i++) s.step(hold);
    s.takeEvents();
    let fired = false; const ev = new Set<string>(); let t0 = -1;
    const frac = 0.25 + k * 0.05;
    for (let i = 0; i < 480 * 3; i++) {
      const p = s.ballPos(); const d = Math.hypot(p.x - px, p.z - PIVOT_Z);
      if (!fired && i > 40 && d > 0.075 * frac) { fired = true; t0 = i; }
      const on = fired && i - t0 < 200;
      s.step({ ...NONE, [side]: on });
      for (const e of s.takeEvents()) if (!['flip'].includes(e.type)) ev.add(e.type === 'target' ? 'cible' : e.type);
    }
    res.push(`${frac.toFixed(2)}:${[...ev].join('+') || '-'}`);
  }
  console.log(side, res.join('  '));
}
