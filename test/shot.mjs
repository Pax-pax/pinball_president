// Capture headless façon Galaxy S (412×915) et scénario tactile simulé
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const file = process.argv[2], out = process.argv[3] || '/tmp/shot';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome'), headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.emulate({ viewport: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36' });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));
await page.goto(pathToFileURL(file).href);
await page.waitForFunction(() => window.__sim, { timeout: 20000 });
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: `${out}-1.png` });
// Lancer : maintenir à droite 1 s
await page.evaluate(() => { window.__input.plunger = true; window.__input.right = true; });
await new Promise(r => setTimeout(r, 1000));
await page.screenshot({ path: `${out}-2.png` });
await page.evaluate(() => { window.__input.plunger = false; window.__input.right = false; });
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: `${out}-3.png` });
const st = await page.evaluate(() => ({ p: window.__sim.ballPos(), v: window.__sim.ballSpeed() }));
console.log('state', JSON.stringify(st));
await page.evaluate(() => { window.__input.left = true; });
await new Promise(r => setTimeout(r, 150));
await page.screenshot({ path: `${out}-4.png` });
console.log('errors', JSON.stringify(errs));
await browser.close();
