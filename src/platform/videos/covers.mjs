// The opening frame of each video: a still cover in the store's sizes (title only, no other text, no logos or borders).
// node covers.mjs <outdir>   → <game>-cover-1920x1080.png, <game>-cover-1080x1620.png
// Art: Tulip 7's own cover painting and wordmark; for Kantar, Amadeo Preziosi's The Grand Bazaar (public domain).
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2] || 'out/covers';
const R = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = await import(R + '/node_modules/playwright/index.mjs');
const FONTS = (process.env.FONTS || '/tmp/hl-video-fonts') + '/files';
mkdirSync(OUT, { recursive: true });
// the wordmark is embedded in the game page as a data URI
import { readFileSync } from 'node:fs';
const logo = readFileSync(R + '/public/tulip7/index.html', 'utf8').match(/"ui_logo": "(data:image\/\w+;base64,[A-Za-z0-9+/=]+)"/)[1];
const font = `@font-face{font-family:G;font-weight:500;src:url(file://${FONTS}/eb-garamond-latin-500-normal.woff2)}`;
const css = (w, h) => `${font}*{margin:0}html,body{width:${w}px;height:${h}px;overflow:hidden;background:#1a120c}.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}`;
const pages = {
  'tulip7-cover-1920x1080': [1920, 1080, `<img class="art" src="file://${R}/public/tulip7/img/bg_cover.webp" style="object-position:60% 50%">
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 22% 50%,rgba(30,12,4,.55),rgba(30,12,4,0) 55%)"></div>
    <img src="${logo}" style="position:absolute;left:70px;top:270px;width:900px">`],
  'tulip7-cover-1080x1620': [1080, 1620, `<img class="art" src="file://${R}/public/tulip7/img/bg_cover.webp" style="object-position:66% 50%">
    <div style="position:absolute;inset:0;background:linear-gradient(rgba(30,12,4,.6),rgba(30,12,4,0) 38%)"></div>
    <img src="${logo}" style="position:absolute;left:90px;top:80px;width:900px">`],
  'kantar-cover-1920x1080': [1920, 1080, `<img class="art" src="file://${R}/src/kantar/preziosi-grand-bazaar.jpg" style="object-position:50% 40%">
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(18,10,5,.88),rgba(18,10,5,.55) 34%,rgba(18,10,5,0) 58%)"></div>
    <div style="position:absolute;left:110px;top:330px;font:500 250px/1 G,serif;color:#f1d79c;letter-spacing:.02em;text-shadow:0 6px 30px rgba(0,0,0,.6)">Kantar</div>`],
  'kantar-cover-1080x1620': [1080, 1620, `<img class="art" src="file://${R}/src/kantar/preziosi-grand-bazaar.jpg" style="object-position:47% 50%">
    <div style="position:absolute;inset:0;background:linear-gradient(rgba(18,10,5,.9),rgba(18,10,5,.5) 26%,rgba(18,10,5,0) 45%)"></div>
    <div style="position:absolute;left:0;right:0;top:110px;text-align:center;font:500 230px/1 G,serif;color:#f1d79c;letter-spacing:.02em;text-shadow:0 6px 30px rgba(0,0,0,.6)">Kantar</div>`],
};
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/tmp/chromium', args: ['--no-sandbox', '--allow-file-access-from-files', '--force-color-profile=srgb'] });
for (const [name, [w, h, body]] of Object.entries(pages)) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const f = `${OUT}/${name}.html`;
  writeFileSync(f, `<!doctype html><meta charset="utf-8"><style>${css(w, h)}</style>${body}`);
  await page.goto('file://' + (f.startsWith('/') ? f : process.cwd() + '/' + f));
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.close();
}
await browser.close();
