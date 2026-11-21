// Détection des secousses du téléphone (accéléromètre), sans DOM : testable dans Node.
// On ne garde que les poussées nettes et sèches dans le plan de l'écran :
//  - pic d'accélération au-dessus d'un seuil,
//  - montée rapide (le signal était calme juste avant),
//  - mouvement surtout dans le plan de l'écran (pas une tape sur la vitre ni un téléphone qu'on pose),
//  - pas pendant une rotation rapide du téléphone,
//  - période réfractaire pour ignorer le freinage qui suit la poussée.

export interface ShakeOptions {
  threshold: number; // m/s², intensité minimale du pic
  calmRatio: number; // le signal doit être sous threshold × calmRatio juste avant le pic
  riseWindow: number; // s, durée max de la montée
  planeRatio: number; // le plan de l'écran doit dominer l'axe perpendiculaire d'au moins ce facteur
  maxRotation: number; // °/s, au-delà on considère que le téléphone tourne
  refractory: number; // s, temps mort après une détection
}

export const DEFAULT_SHAKE: ShakeOptions = {
  threshold: 14,
  calmRatio: 0.45,
  riseWindow: 0.12,
  planeRatio: 1.8,
  maxRotation: 300,
  refractory: 0.45,
};

/** Direction de la poussée, dans le repère de l'écran en portrait : x vers la droite, y vers le haut de l'écran. */
export type Push = { dir: 'right' | 'left' | 'up' | 'down'; x: number; y: number; strength: number };

export class ShakeDetector {
  opts: ShakeOptions;
  private gravity: [number, number, number] | null = null;
  private lastT = -1;
  private history: { t: number; p: number }[] = [];
  private deadUntil = -1;

  constructor(opts: Partial<ShakeOptions> = {}) {
    this.opts = { ...DEFAULT_SHAKE, ...opts };
  }

  /**
   * Un échantillon. `linear` = accélération sans gravité si le navigateur la fournit (event.acceleration),
   * sinon on passe accelerationIncludingGravity et on retire la gravité par filtre passe-bas.
   */
  sample(t: number, ax: number, ay: number, az: number, linear: boolean, rotationDegPerSec = 0): Push | null {
    let lx = ax, ly = ay, lz = az;
    if (!linear) {
      const dt = this.lastT < 0 ? 0.016 : Math.min(0.1, Math.max(0.001, t - this.lastT));
      const k = 1 - Math.exp(-dt / 0.25); // constante de temps 250 ms
      if (!this.gravity) this.gravity = [ax, ay, az];
      else {
        this.gravity[0] += (ax - this.gravity[0]) * k;
        this.gravity[1] += (ay - this.gravity[1]) * k;
        this.gravity[2] += (az - this.gravity[2]) * k;
      }
      lx = ax - this.gravity[0]; ly = ay - this.gravity[1]; lz = az - this.gravity[2];
    }
    this.lastT = t;

    const o = this.opts;
    const p = Math.hypot(lx, ly);
    this.history.push({ t, p });
    while (this.history.length > 2 && t - this.history[0].t > 0.3) this.history.shift();

    if (t < this.deadUntil) return null;
    if (p < o.threshold) return null;
    if (p < Math.abs(lz) * o.planeRatio) return null;
    if (rotationDegPerSec > o.maxRotation) return null;
    // montée sèche : le signal était calme il y a moins de riseWindow
    // (si les échantillons sont espacés, on accepte l'échantillon précédent jusqu'à 250 ms)
    const prev = this.history.length > 1 ? this.history[this.history.length - 2] : null;
    const calm =
      this.history.some((h) => t - h.t <= o.riseWindow && t - h.t > 0 && h.p < o.threshold * o.calmRatio) ||
      (!!prev && t - prev.t <= 0.25 && prev.p < o.threshold * o.calmRatio);
    if (!calm) return null;

    this.deadUntil = t + o.refractory;
    const horizontal = Math.abs(lx) >= Math.abs(ly);
    const dir = horizontal ? (lx > 0 ? 'right' : 'left') : ly > 0 ? 'up' : 'down';
    return { dir, x: horizontal ? Math.sign(lx) : 0, y: horizontal ? 0 : Math.sign(ly), strength: p };
  }
}

/** Ramène un vecteur du repère de l'appareil au repère de l'écran selon l'orientation (0, 90, 180, 270). */
export function toScreen(x: number, y: number, angle: number): [number, number] {
  switch (((angle % 360) + 360) % 360) {
    case 90: return [-y, x];
    case 180: return [-x, -y];
    case 270: return [y, -x];
    default: return [x, y];
  }
}
