// Vérifie les contrôles clavier dans le navigateur (profil ordinateur, souris)
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome'), headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(pathToFileURL(process.argv[2]).href);
await page.waitForFunction(() => window.__sim);
const out = {};
out.hint = await page.$eval('#hint', (el) => el.textContent.slice(0, 60));
await page.keyboard.down('ArrowLeft'); await new Promise(r => setTimeout(r, 300));
out.left = await page.evaluate(() => window.__input.left && window.__sim.flippers[0].angle < 0);
await page.keyboard.up('ArrowLeft');
await page.keyboard.down('ShiftRight'); await new Promise(r => setTimeout(r, 300));
out.right = await page.evaluate(() => window.__input.right);
await page.keyboard.up('ShiftRight');
await page.keyboard.down('Enter'); await new Promise(r => setTimeout(r, 600));
out.pull = await page.evaluate(() => window.__sim.plungerPull);
await page.keyboard.up('Enter');
await new Promise(r => setTimeout(r, 300));
out.nudges = await page.evaluate(async () => { let n = 0; const s = window.__sim; const o = s.nudge.bind(s); s.nudge = (a, b) => { n++; o(a, b); }; return 0; });
for (const k of ['Space', 'KeyQ', 'KeyD']) { await page.keyboard.press(k); await new Promise(r => setTimeout(r, 120)); }
out.tiltLevel = await page.evaluate(() => window.__sim.tiltLevel.toFixed(2));
await page.keyboard.press('KeyR'); await new Promise(r => setTimeout(r, 100));
out.reset = await page.evaluate(() => window.__sim.ballInLane());
await page.screenshot({ path: '/tmp/desk.png' });
console.log(JSON.stringify(out));
await browser.close();
