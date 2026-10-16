// Browser smoke tests: every page loads without JavaScript errors or missing local files, each game starts,
// and save / resume / reset behave. Runs fully offline: external hosts (analytics, fonts, Turnstile, Wikimedia)
// are stubbed and D3 is served from node_modules.
//   npm ci && npx playwright install chromium   (once)
//   npm run smoke
// Set CHROME=/path/to/chrome to use an existing Chromium instead of Playwright's download.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './server.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const D3 = readFileSync(ROOT + 'node_modules/d3/dist/d3.min.js');
let srv, browser;

before(async () => {
  srv = await serve(ROOT + 'public');
  browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
});
after(async () => { await browser?.close(); srv?.close(); });

// A fresh page that records problems. Each test gets its own context, so localStorage starts empty.
async function open(path, { viewport = { width: 1400, height: 900 }, storage } = {}) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r =>
    r.request().url().includes('/d3.min.js') ? r.fulfill({ body: D3, contentType: 'text/javascript' }) : r.fulfill({ status: 204, body: '' }));
  if (storage) await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, storage);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 204/.test(m.text())) problems.push('console: ' + m.text()); });
  page.on('response', r => { if (r.url().startsWith(srv.url) && r.status() >= 400 && !r.url().includes('/api/')) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(srv.url + path);
  await page.waitForTimeout(800);
  return { page, ctx, problems, close: () => ctx.close() };
}
const store = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));

const PAGES = ['/', '/borderlines/', '/retourvloot/', '/cupoftea/', '/cupoftea/2/', '/cupoftea/3/', '/polder/', '/kantar/', '/privacy/'];
for (const p of PAGES) {
  test(`loads cleanly: ${p}`, async () => {
    const t = await open(p);
    await t.page.waitForTimeout(700);
    assert.deepEqual(t.problems, []);
    await t.close();
  });
}

test('portal links to every game and shows continue cards from saves', async () => {
  const games = JSON.parse(readFileSync(ROOT + 'public/games.json', 'utf8'));
  const t = await open('/', { storage: { 'cupoftea.v1': JSON.stringify({ done: [1], blots: {}, cur: 2 }) } });
  for (const g of games) assert.ok(await t.page.locator(`a[href="${g.url}"]`).count(), 'no link to ' + g.url);
  const text = await t.page.innerText('body');
  assert.match(text, /Scene 2|investigation/i, 'Cup of Tea continue card missing');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('feedback dialog opens and closes', async () => {
  const t = await open('/');
  await t.page.locator('.hlfb-btn').click();
  await t.page.waitForSelector('.hlfb-ov:not([hidden])');
  await t.page.locator('.hlfb-cancel').click();
  assert.equal(await t.page.locator('.hlfb-ov:not([hidden])').count(), 0);
  await t.close();
});

test('Borderlines: practice starts a round with the paint tools', async () => {
  const t = await open('/borderlines/');
  await t.page.getByRole('button', { name: /Practice/ }).click();
  await t.page.getByRole('button', { name: /^Submit/ }).waitFor({ state: 'visible' });
  assert.ok(await t.page.locator('svg path').count() > 0 && await t.page.locator('canvas').count() > 0, 'map did not draw');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Retourvloot: starting a company saves it and a reload resumes without errors', async () => {
  const t = await open('/retourvloot/');
  await t.page.getByRole('button', { name: 'Take your seat' }).click();
  await t.page.waitForFunction(() => !!localStorage.getItem('retourvloot.v1'), null, { timeout: 15000 });
  const saved = JSON.parse((await store(t.page))['retourvloot.v1']);
  assert.equal(saved.v, 1);
  await t.page.reload(); await t.page.waitForTimeout(1500);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Cup of Tea: intro leads to the desk, and the header fits a phone', async () => {
  const t = await open('/cupoftea/', { viewport: { width: 375, height: 812 } });
  for (let i = 0; i < 6; i++) {
    const b = t.page.getByRole('button', { name: /^(Continue|Sit down at the desk)$/ }).first();
    if (!(await b.count()) || !(await b.isVisible())) break;
    await b.click(); await t.page.waitForTimeout(250);
  }
  await t.page.locator('#desk').waitFor({ state: 'visible' });
  const w = await t.page.evaluate(() => ({ doc: document.documentElement.scrollWidth, hdr: document.querySelector('header').scrollWidth }));
  assert.ok(w.hdr <= 375 && w.doc <= 375, `page is wider than the phone: ${JSON.stringify(w)}`);
  assert.deepEqual(t.problems, []);
  await t.close();
});

// Polder helpers
async function polderStart(t) {
  // a first visit goes straight to Friesland's intro; later visits show the region menu
  if (await t.page.locator('.rg[data-k="0"]').count()) await t.page.locator('.rg[data-k="0"]').click();
  await t.page.getByRole('button', { name: 'Begin' }).click();
  await t.page.waitForFunction(() => { const s = window.__polderTest.snapshot(); return s && !s.busy; });
  await t.page.waitForTimeout(300);
}
async function polderPlace(t) {
  // try cells along the row above the mainland until a piece is accepted (the run is saved after each move)
  const box = await t.page.locator('canvas').first().boundingBox();
  for (let row = 11; row >= 4; row--) for (let col = 1; col < 25; col += 2) {
    await t.page.mouse.click(box.x + box.width * (col + .5) / 26, box.y + box.height * (row + .5) / 16);
    await t.page.waitForTimeout(120);
    if ((await store(t.page))['polder.run.v1']) return;
  }
  throw new Error('could not place a dike');
}

test('Polder: a run resumes with the same board and random sequence', async () => {
  const t = await open('/polder/');
  await polderStart(t); await polderPlace(t);
  const before = JSON.parse((await store(t.page))['polder.run.v1']);
  assert.ok(Number.isInteger(before.rp) && Number.isInteger(before.rs), 'RNG state not saved');
  await t.page.reload(); await t.page.waitForTimeout(800);
  await t.page.locator('#contBtn').click(); await t.page.waitForTimeout(500);
  const { lv, year, queue, G, rp, rs } = await t.page.evaluate(() => window.__polderTest.snapshot());
  assert.deepEqual({ lv, year, queue, G, rp, rs }, { lv: before.lv, year: before.S.year, queue: JSON.stringify(before.S.queue), G: before.G.join(''), rp: before.rp, rs: before.rs });
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Polder: a damaged or unknown save is not offered and does not break the menu', async () => {
  for (const bad of ['{"v":1,"lv":"atlantis"}', '{"v":7}', 'not json']) {
    const t = await open('/polder/', { storage: { 'polder.run.v1': bad } });
    assert.equal(await t.page.locator('#contBtn').count(), 0, 'continue offered for ' + bad);
    assert.equal((await store(t.page))['polder.run.v1'], bad, 'save was changed or deleted');
    assert.deepEqual(t.problems, []);
    await t.close();
  }
});

test('Polder: old saves without RNG state still resume', async () => {
  const t = await open('/polder/');
  await polderStart(t); await polderPlace(t);
  const run = JSON.parse((await store(t.page))['polder.run.v1']);
  delete run.rp; delete run.rs;
  await t.page.evaluate(r => localStorage.setItem('polder.run.v1', r), JSON.stringify(run));
  await t.page.reload(); await t.page.waitForTimeout(800);
  await t.page.locator('#contBtn').click(); await t.page.waitForTimeout(400);
  assert.equal((await t.page.evaluate(() => window.__polderTest.snapshot())).year, run.S.year);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Polder: reset wipes only Polder progress', async () => {
  const t = await open('/polder/', { storage: { 'polder.progress.v1': '{"friesland":{"stars":3}}', 'cupoftea.v1': '{"done":[1]}', 'retourvloot.v1': '{"v":1}' } });
  await t.page.getByRole('button', { name: 'Reset all progress' }).click();
  await t.page.getByRole('button', { name: 'Reset everything' }).click();
  await t.page.waitForTimeout(300);
  const s = await store(t.page);
  assert.ok(!s['polder.progress.v1'] || s['polder.progress.v1'] === '{}', 'Polder progress kept');
  assert.equal(s['cupoftea.v1'], '{"done":[1]}'); assert.equal(s['retourvloot.v1'], '{"v":1}');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Kantar: a round can be played, the game saves and offers to resume', async () => {
  const t = await open('/kantar/', { storage: { 'kantar-set': JSON.stringify({ teach: false, snd: false, tut: false }) } });
  await t.page.click('#playBtn');
  await t.page.waitForFunction(() => typeof G !== 'undefined' && G.phase === 'split' && G.splitter === 0 && !ui.busy);
  for (let i = 0; i < 3; i++) await t.page.evaluate(() => document.querySelector('#market [data-drag]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await t.page.click('#offer');
  await t.page.waitForFunction(() => G.turn === 1, null, { timeout: 15000 });
  await t.page.waitForTimeout(600);
  assert.ok((await store(t.page))['kantar-game-v04'], 'no save');
  await t.page.reload(); await t.page.waitForTimeout(600);
  assert.ok(await t.page.isVisible('#resumeSaved'), 'no resume button');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Kantar: Turkish switch translates the running game', async () => {
  const t = await open('/kantar/', { storage: { 'kantar-set': JSON.stringify({ teach: true, snd: false }) } });
  await t.page.click('#playBtn'); await t.page.waitForTimeout(1500);
  await t.page.selectOption('#languageSelect', 'tr'); await t.page.waitForTimeout(300);
  const text = await t.page.innerText('body');
  assert.match(text, /Tezgâh/); assert.doesNotMatch(text, /Market Stall|Round \d\/6/);
  assert.deepEqual(t.problems, []);
  await t.close();
});
