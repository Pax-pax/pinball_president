// Vérifie de bout en bout qu'une poussée simulée (événements devicemotion) secoue la table dans le navigateur.
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome'), headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(pathToFileURL(process.argv[2]).href);
await page.waitForFunction(() => window.__sim);
await page.keyboard.press('KeyQ'); // premier geste : démarre l'écoute des capteurs
const res = await page.evaluate(async () => {
  const sim = window.__sim; const before = sim.tiltLevel;
  let nudges = 0; const orig = sim.nudge.bind(sim); const dirs = [];
  sim.nudge = (dx, dz) => { nudges++; dirs.push([dx, dz]); orig(dx, dz); };
  const fire = (x, y, z) => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x, y, z }, accelerationIncludingGravity: { x, y: y + 9.8, z }, rotationRate: { alpha: 0, beta: 0, gamma: 0 }, interval: 16 }));
  // horloge simulée à 60 Hz (le navigateur headless est trop lent pour un vrai 60 Hz)
  const base = performance.now(); let fake = base; const realNow = performance.now.bind(performance);
  performance.now = () => fake;
  for (let i = 0; i < 90; i++) {
    const t = i / 60;
    fake = base + t * 1000;
    const p = 22 * Math.exp(-(((t - 0.5) / 0.03) ** 2)) - 18 * Math.exp(-(((t - 0.6) / 0.035) ** 2));
    fire(p, 0, 0);
  }
  performance.now = realNow;
  return { nudges, dirs, state: document.getElementById('motion').textContent };
});
console.log(JSON.stringify(res));
await browser.close();
