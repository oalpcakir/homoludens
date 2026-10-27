import { readFileSync } from 'node:fs';
// Portal (home page) browser tests: the "For you" band, the Homo Ludens passport, the map timeline and phone layout.
//   npm run smoke      (CHROME=/path/to/chrome to use an existing Chromium)
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

async function open({ viewport = { width: 1366, height: 900 }, storage = {}, mobile = false, reducedMotion } = {}) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, storage);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  await page.goto(srv.url + '/');
  await page.waitForTimeout(500);
  return { page, problems, close: () => ctx.close() };
}
const PASS = JSON.stringify({ v: 1, games: { tulip: { first: '2026-10-02', last: '2026-10-20', plays: 7, wins: 3, best: 2340, label: 'Cashed in f2,340', bestLabel: 'Cashed in f2,340' } } });

test('passport: players from before the passport get stamps from their old save keys', async () => {
  const t = await open({ storage: { 'retourvloot.runs': '[]', 'polder.progress.v1': '{}', 'borderlines:practice': '1', 'kantar-set': '{}' } });
  assert.equal(await t.page.textContent('#passCount'), '3/6');
  const on = await t.page.$$eval('#passGrid .slot.on', els => els.map(e => e.dataset.game));
  assert.deepEqual(on, ['borderlines', 'retourvloot', 'polder']); // kantar-set is a setting, not a played game
  for (const id of on) assert.match(await t.page.textContent(`#passGrid .slot[data-game="${id}"]`), /Played before the passport/);
  assert.equal(await t.page.locator('#passGrid .slot.empty').count(), 3);
  assert.match(await t.page.textContent('#passGrid .slot[data-game="tulip"]'), /not yet stamped/);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('passport: stamps come from hl.passport.v1 and land once', async () => {
  const t = await open({ storage: { 'hl.passport.v1': PASS } });
  const slot = t.page.locator('#passGrid .slot[data-game="tulip"]');
  assert.match(await slot.getAttribute('class'), /\bon\b.*\bfresh\b/);
  const text = await slot.textContent();
  assert.match(text, /First stamped 2 Oct 2026/); assert.match(text, /7 plays · 3 wins/); assert.match(text, /Best: Cashed in f2,340/);
  assert.match(await slot.locator('svg').textContent(), /2 OCT 2026/);
  assert.match(await slot.locator('svg').textContent(), /TULIP 7/);
  assert.equal(await t.page.textContent('#passCount'), '1/6');
  // the stamp lands when the passport scrolls into view, and is remembered
  await t.page.locator('#passport').scrollIntoViewIfNeeded();
  await t.page.waitForSelector('#passGrid .slot[data-game="tulip"].stamp-in');
  assert.deepEqual(JSON.parse(await t.page.evaluate(() => localStorage.getItem('hl.portal.stamps.v1'))), ['tulip']);
  await t.page.reload(); await t.page.waitForTimeout(400);
  assert.doesNotMatch(await slot.getAttribute('class'), /fresh/);
  // a broken passport never breaks the page
  await t.page.evaluate(() => localStorage.setItem('hl.passport.v1', '{"v":1,"games":"x"}'));
  await t.page.reload(); await t.page.waitForTimeout(300);
  assert.equal(await t.page.textContent('#passCount'), '0/6');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('for you: games in progress first, then today\'s daily (no realms), then one new game to try', async () => {
  const t = await open({ storage: {
    'tulip7.save.v1': JSON.stringify({ v: 1, mode: 'winter', evening: 3, players: [{ purse: 120, units: 40 }] }),
    'cupoftea.v1': JSON.stringify({ done: [1], blots: {}, cur: 2 }),
    'hl.passport.v1': JSON.stringify({ v: 1, games: { kantar: { first: '2026-10-01', plays: 1 } } }),
  } });
  const cards = await t.page.$$eval('#fyRow .fy', els => els.map(e => [e.dataset.kind, e.dataset.game]));
  assert.deepEqual(cards.map(c => c[0]), ['continue', 'continue', 'daily', 'next']);
  assert.deepEqual(cards.slice(0, 2).map(c => c[1]).sort(), ['cupoftea', 'tulip']);
  assert.equal(cards[3][1], 'polder', 'try next: the first unplayed game in the hand-picked order');
  assert.equal(await t.page.getAttribute('#fyRow .fy[data-game="cupoftea"]', 'href'), '/cupoftea/2/');
  const daily = t.page.locator('#fyRow .fy-daily');
  assert.match(await daily.innerText(), /Daily #\d+/);
  assert.equal(await daily.locator('svg, path, img').count(), 0, 'the daily card must not show a realm shape');
  // the band sits right under the masthead, above the games
  const y = await t.page.evaluate(() => [document.getElementById('forYou').getBoundingClientRect().top, document.getElementById('games').getBoundingClientRect().top]);
  assert.ok(y[0] < y[1] && y[0] < 400, 'For you is not at the top: ' + y);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('for you: on a phone, "try next" prefers a game that plays on any screen', async () => {
  const t = await open({ viewport: { width: 390, height: 844 }, mobile: true, storage: { 'hl.passport.v1': JSON.stringify({ v: 1, games: { tulip: { first: '2026-10-01', plays: 1 } } }) } });
  assert.equal(await t.page.getAttribute('#fyRow .fy[data-kind="next"]', 'data-game'), 'kantar');
  const top = await t.page.evaluate(() => document.getElementById('fyRow').getBoundingClientRect().top);
  assert.ok(top < 360, 'For you starts too far down on a phone: ' + top);
  await t.close();
});

test('timeline: one moment per game from games.json, to scale, picked from the line or the map; leaders never cut a label', async () => {
  const t = await open();
  await t.page.click('#tabMap');
  const games = JSON.parse(readFileSync(new URL('../../public/games.json', import.meta.url), 'utf8'));
  const want = games.filter(g => g.moment).sort((a, b) => a.moment.year - b.moment.year).map(g => g.id);
  assert.deepEqual(await t.page.$$eval('.tl-lab', els => els.map(e => e.dataset.game)), want, 'one label per game with a moment, in date order');
  assert.equal(await t.page.locator('.tl-lab[data-game="borderlines"]').count(), 0, 'Borderlines has "moment": false');
  // to scale: dot positions are linear in the year
  const pos = await t.page.$$eval('.tl-dot', els => els.map(e => parseFloat(e.style.left)));
  const yrs = games.filter(g => g.moment).map(g => g.moment.year).sort((a, b) => a - b);
  const k = (pos.at(-1) - pos[0]) / (yrs.at(-1) - yrs[0]);
  yrs.forEach((y, i) => assert.ok(Math.abs(pos[0] + (y - yrs[0]) * k - pos[i]) < 0.5, 'not to scale at ' + y));
  // no leader passes through another label
  for (const w of [1366, 390]) {
    await t.page.setViewportSize({ width: w, height: 800 }); await t.page.waitForTimeout(300);
    const cut = await t.page.evaluate(() => {
      const labs = [...document.querySelectorAll('.tl-lab')].map(e => ({ g: e.dataset.game, r: e.getBoundingClientRect() }));
      const out = [];
      document.querySelectorAll('.tl-lead').forEach((l, i) => { const r = l.getBoundingClientRect(), own = labs[i];
        labs.forEach(o => { if (o !== own && r.left > o.r.left + 1 && r.left < o.r.right - 1 && r.bottom > o.r.top + 1 && r.top < o.r.bottom - 1) out.push(own.g + ' cuts ' + o.g); }); });
      return out; });
    assert.deepEqual(cut, [], 'at ' + w + 'px');
  }
  await t.page.setViewportSize({ width: 1366, height: 800 });
  await t.page.click('.tl-lab[data-game="polder"]');
  assert.equal(await t.page.getAttribute('.atlas-pick[data-game="polder"]', 'aria-pressed'), 'true');
  assert.match(await t.page.textContent('#tlMoment h4'), /Beemster/);
  assert.match(await t.page.textContent('#atlasBrief h3'), /Polder/);
  await t.page.hover('.atlas-pick[data-game="kantar"]');
  assert.match(await t.page.getAttribute('.tl-lab[data-game="kantar"]', 'class'), /\bhot\b/);
  await t.page.hover('.tl-lab[data-game="retourvloot"]');
  assert.match(await t.page.getAttribute('.atlas-pick[data-game="retourvloot"]', 'class'), /\bhot\b/);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('no horizontal scroll at 360px (cards, passport and map), and the timeline scrolls on its own', async () => {
  const t = await open({ viewport: { width: 360, height: 740 }, mobile: true, storage: {
    'hl.passport.v1': PASS, 'cupoftea.v1': JSON.stringify({ done: [1] }), 'polder.progress.v1': '{}',
    'tulip7.save.v1': JSON.stringify({ v: 1, mode: 'winter', evening: 3, players: [{ purse: 120, units: 40 }] }) } });
  await t.page.locator('#passport').scrollIntoViewIfNeeded(); await t.page.waitForTimeout(1500); // let the stamps land
  const wide = () => t.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  let [sw, iw] = await wide(); assert.ok(sw <= 360 && iw === 360, `cards view is ${sw}px wide (viewport ${iw})`);
  await t.page.evaluate(() => scrollTo(0, 0)); await t.page.click('#tabMap'); await t.page.waitForTimeout(300);
  [sw, iw] = await wide(); assert.ok(sw <= 360 && iw === 360, `map view is ${sw}px wide (viewport ${iw})`);
  const tl = await t.page.evaluate(() => { const s = document.getElementById('tlScroll'); return s.scrollWidth > s.clientWidth; });
  assert.ok(tl, 'the timeline should scroll sideways on a phone');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('theme switch: automatic, light, dark, and it is remembered', async () => {
  const t = await open();
  const theme = () => t.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(await theme(), null);
  await t.page.click('#themeBtn'); assert.equal(await theme(), 'light');
  await t.page.click('#themeBtn'); assert.equal(await theme(), 'dark');
  const bg = await t.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(18, 21, 28)');
  await t.page.reload(); assert.equal(await theme(), 'dark');
  await t.page.click('#themeBtn'); assert.equal(await theme(), null);
  await t.close();
});
