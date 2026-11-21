// Signaux synthétiques à ~60 Hz : une vraie poussée doit être vue une fois, le reste ignoré.
import { ShakeDetector } from '../src/shake';

let failures = 0;
const check = (name: string, ok: boolean, info: string) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} — ${info}`);
  if (!ok) failures++;
};
const HZ = 60;
const pulse = (t: number, t0: number, w: number) => Math.exp(-(((t - t0) / w) ** 2));
const noise = (a: number) => (Math.random() * 2 - 1) * a;

function run(sig: (t: number) => [number, number, number], seconds: number, linear = true, rot?: (t: number) => number) {
  const d = new ShakeDetector();
  const out: string[] = [];
  for (let i = 0; i < seconds * HZ; i++) {
    const t = i / HZ;
    const [x, y, z] = sig(t);
    const r = d.sample(t, x, y, z, linear, rot?.(t) ?? 0);
    if (r) out.push(r.dir);
  }
  return out;
}

// Poussée sèche vers la droite : pic +22 m/s² (≈ 40 ms), puis freinage -18 m/s²
{
  const r = run((t) => [22 * pulse(t, 0.5, 0.03) - 18 * pulse(t, 0.6, 0.035) + noise(0.8), noise(0.8), noise(0.8)], 1.5);
  check('poussée droite', r.length === 1 && r[0] === 'right', JSON.stringify(r));
}
// Poussée vers le haut de l'écran, sans accélération linéaire (gravité à retirer : téléphone tenu incliné)
{
  const r = run((t) => [noise(0.6), 6.9 + 20 * pulse(t, 0.8, 0.03) - 16 * pulse(t, 0.9, 0.035) + noise(0.6), 6.9 + noise(0.6)], 1.5, false);
  check('poussée haut (avec gravité)', r.length === 1 && r[0] === 'up', JSON.stringify(r));
}
// Poussée vers le bas
{
  const r = run((t) => [noise(0.8), -20 * pulse(t, 0.5, 0.03) + 15 * pulse(t, 0.6, 0.035) + noise(0.8), noise(0.8)], 1.5);
  check('poussée bas', r.length === 1 && r[0] === 'down', JSON.stringify(r));
}
// Deux poussées franches à 0,8 s d'écart : deux détections
{
  const r = run((t) => [-20 * pulse(t, 0.4, 0.03) + 15 * pulse(t, 0.5, 0.03) - 20 * pulse(t, 1.2, 0.03) + 15 * pulse(t, 1.3, 0.03) + noise(0.8), noise(0.8), noise(0.8)], 2);
  check('deux poussées gauche', r.length === 2 && r.every((x) => x === 'left'), JSON.stringify(r));
}
// Mouvement mou (même amplitude totale mais lent, 300 ms) : ignoré
{
  const r = run((t) => [16 * pulse(t, 0.6, 0.3) + noise(0.8), noise(0.8), noise(0.8)], 1.5);
  check('poussée lente ignorée', r.length === 0, JSON.stringify(r));
}
// Marche / mains qui tremblent : ignoré
{
  const r = run((t) => [4 * Math.sin(t * 12) + noise(1.5), 5 * Math.sin(t * 9) + noise(1.5), 3 * Math.sin(t * 7) + noise(1.5)], 5);
  check('marche ignorée', r.length === 0, JSON.stringify(r));
}
// Tape sur l'écran (pic sur l'axe perpendiculaire) : ignorée
{
  const r = run((t) => [6 * pulse(t, 0.5, 0.02) + noise(0.8), 4 * pulse(t, 0.5, 0.02) + noise(0.8), 30 * pulse(t, 0.5, 0.02) + noise(0.8)], 1);
  check('tape sur la vitre ignorée', r.length === 0, JSON.stringify(r));
}
// Téléphone qu'on tourne vite (rotation forte) : ignoré même si l'accélération est forte
{
  const r = run((t) => [18 * pulse(t, 0.5, 0.03) + noise(0.8), noise(0.8), noise(0.8)], 1, true, (t) => 500 * pulse(t, 0.5, 0.1));
  check('rotation rapide ignorée', r.length === 0, JSON.stringify(r));
}
// Téléphone qu'on incline lentement (gravité qui bascule sur 1 s) : ignoré
{
  const r = run((t) => {
    const a = Math.min(1, Math.max(0, t - 0.5)) * 1.2;
    return [9.81 * Math.sin(a) + noise(0.5), 9.81 * Math.cos(a) * 0.7 + noise(0.5), 9.81 * Math.cos(a) * 0.7 + noise(0.5)];
  }, 2.5, false);
  check('inclinaison lente ignorée', r.length === 0, JSON.stringify(r));
}

console.log(failures ? `\n${failures} échec(s)` : '\nToutes les secousses sont bien triées.');
process.exit(failures ? 1 : 0);
