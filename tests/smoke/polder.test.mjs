// Polder regression tests (browser). Run with the other smoke tests: npm run smoke
// (CHROME=/path/to/chrome to use an existing Chromium).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './server.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
let srv, browser;
before(async () => {
  srv = await serve(ROOT + 'public');
  browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); srv?.close(); });

// Holland and Zeeland unlocked, a returning player (the region menu shows), sound off.
const RETURNING = {
  'polder.progress.v1': JSON.stringify({ friesland: { stars: 4 }, zeeland: { stars: 3 }, _seen: { c1215: 1 } }),
  'polder.settings.v1': JSON.stringify({ sfx: false, music: false, diff: 'normal' }),
};
async function open(storage = RETURNING) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, storage);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/status of 204/.test(m.text())) problems.push('console: ' + m.text()); });
  await page.goto(srv.url + '/polder/');
  await page.waitForTimeout(600);
  return { page, problems, close: () => ctx.close() };
}
const modalOpen = page => page.evaluate(() => !document.getElementById('modal').classList.contains('hidden'));
async function startRegion(page, id) {
  await page.evaluate(id => window.__polder.startLevel(id), id);
  await page.locator('#mOk').click();
  await page.waitForFunction(() => !window.__polder.S.busy);
}
// Click through cards (first upgrade on an upgrade picker) until the board is free again.
// Returns the upgrade keys that were offered on the way.
async function settle(page, offered = []) {
  for (let k = 0; k < 200; k++) {
    if (await modalOpen(page)) {
      if (await page.locator('#mbox .up').count()) { offered.push(...await page.locator('#mbox .up').evaluateAll(b => b.map(x => x.dataset.k))); await page.locator('#mbox .up').first().click(); }
      else await page.locator('#mOk').click();
    } else if (!(await page.evaluate(() => window.__polder.S.busy))) return offered;
    await page.waitForTimeout(100);
  }
  throw new Error('board stayed busy');
}

test('Polder: a card closed by mouse within 250 ms leaves no key listener that later closes the upgrade picker', async () => {
  const t = await open();
  await startRegion(t.page, 'friesland');
  // a card clicked away before its keyboard listener would have been attached
  await t.page.evaluate(() => { window.__polder.card({ title: 'Quick', text: 'x' }); setTimeout(() => document.getElementById('mOk').click(), 100); });
  await t.page.waitForTimeout(400);
  assert.equal(await modalOpen(t.page), false);
  // next turn levels up: the upgrade picker opens
  await t.page.evaluate(() => { window.__polder.S.xp = 100; window.__polder.waitDecade(); });
  await t.page.waitForSelector('#mbox .up');
  const owned = await t.page.evaluate(() => Object.keys(window.__polder.S.up).length);
  await t.page.evaluate(() => document.activeElement && document.activeElement.blur());
  await t.page.keyboard.press('Enter');
  await t.page.waitForTimeout(300);
  assert.equal(await t.page.locator('#mbox .up').count(), 3, 'Enter closed the upgrade picker without a choice');
  await t.page.locator('#mbox .up').first().click();
  await t.page.waitForFunction(() => !window.__polder.S.busy, null, { timeout: 5000 });
  assert.equal(Object.keys(await t.page.evaluate(() => window.__polder.S.up)).length, owned + 1);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Polder: draining the Haarlemmermeer by steam (1849) does not complete the "before steam" goal (by 1840)', async () => {
  const t = await open();
  await startRegion(t.page, 'holland');
  // jump to 1835, the turn before steam, without having drained the Haarlemmermeer
  await t.page.evaluate(() => { const S = window.__polder.S; S.piece = 19; S.year = 1835; });
  await t.page.evaluate(() => { window.__polder.waitDecade(); });
  await settle(t.page);
  const { year, stars, fields } = await t.page.evaluate(() => ({ year: window.__polder.S.year, stars: window.__polder.S.stars, fields: +document.getElementById('sFields').textContent }));
  assert.equal(year, 1850);
  assert.ok(fields > 40, 'steam should have drained the lakes (fields: ' + fields + ')');
  assert.equal(stars[4], -1, 'waterwolf goal: ' + JSON.stringify(stars));
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Polder: reloading the page does not re-roll the upgrade offer', async () => {
  const t = await open();
  await startRegion(t.page, 'friesland');
  await t.page.evaluate(() => { window.__polder.waitDecade(); }); await settle(t.page); // a saved run exists now
  const offers = [];
  for (let k = 0; k < 3; k++) {
    if (k) { await t.page.reload(); await t.page.waitForTimeout(600); await t.page.locator('#contBtn').click(); await t.page.waitForTimeout(300); }
    await t.page.evaluate(() => { window.__polder.S.xp = 100; window.__polder.waitDecade(); });
    await t.page.waitForSelector('#mbox .up');
    offers.push(await t.page.locator('#mbox .up').evaluateAll(b => b.map(x => x.dataset.k).join(',')));
  }
  assert.equal(new Set(offers).size, 1, 'offers differ: ' + offers.join(' | '));
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Polder: Wider sluices are not offered when there is no drainage limit left', async () => {
  const t = await open();
  await startRegion(t.page, 'free');
  await t.page.evaluate(() => { const S = window.__polder.S; S.piece = 44; S.year = 1860; }); // steam era, free play has no pump cap
  const seen = [];
  for (let k = 0; k < 5; k++) {
    await t.page.evaluate(() => { window.__polder.S.xp = 10000; window.__polder.waitDecade(); });
    await t.page.waitForTimeout(100);
    await settle(t.page, seen);
  }
  assert.ok(seen.length >= 12 && !seen.includes('sluice'), seen.join(','));
  assert.deepEqual(t.problems, []);
  await t.close();
});
