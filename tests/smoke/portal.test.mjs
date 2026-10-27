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

async function open({ viewport = { width: 1366, height: 900 }, storage = {}, mobile = false, reducedMotion, now } = {}) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, storage);
  const page = await ctx.newPage();
  if (now) await page.clock.setFixedTime(now);
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  await page.goto(srv.url + '/');
  await page.waitForTimeout(500);
  return { page, problems, close: () => ctx.close() };
}
const PASS = JSON.stringify({ v: 1, games: { tulip: { first: '2026-10-02', last: '2026-10-20', plays: 7, wins: 3, best: 2340, label: 'Cashed in f2,340', bestLabel: 'Cashed in f2,340' } } });

test('passport: players from before the passport get stamps from their old save keys', async () => {
  const t = await open({ storage: { 'retourvloot.runs': JSON.stringify([{ endYear: 1799, reason: 'charter', avgDiv: 12 }]), 'polder.progress.v1': JSON.stringify({ friesland: { stars: 2, fields: 30 } }),
    'borderlines:practice': JSON.stringify({ games: 1, total: 300 }), 'kantar-set': '{}',
    // games only started, never finished, are not "played before the passport"
    'tulip7.save.v1': JSON.stringify({ v: 1, mode: 'winter', evening: 1, players: [{ purse: 100 }] }), 'kantar-game-v04': JSON.stringify({ G: { turn: 1, phase: 'pick' } }) } });
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
  assert.match(await t.page.textContent('#tlMoment h3'), /Beemster/);
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

// ---------------------------------------------------------------- QA regressions
test('passport: a game only started after the passport existed is not stamped "played before the passport"', async () => {
  const t = await open({ storage: {
    'borderlines:tutorialDone': 'true', 'borderlines:practiceSeen': '["p1"]', 'borderlines:run:30': JSON.stringify({ scores: [40], hints: [] }),
    'retourvloot.v1': JSON.stringify({ v: 1, t: 400, cash: 1, debt: 0 }), 'retourvloot.runs': '[]',
    'polder.run.v1': JSON.stringify({ lv: 'friesland', S: { year: 1200, piece: 3 }, G: [] }), 'polder.progress.v1': JSON.stringify({ _seen: { terp: 1 } }),
    'kantar-game-v04': JSON.stringify({ G: { turn: 2, phase: 'pick', mode: 'classic' } }),
    'tulip7.save.v1': JSON.stringify({ v: 1, mode: 'winter', evening: 2, players: [{ purse: 100, units: 4 }] }),
  } });
  assert.equal(await t.page.textContent('#passCount'), '0/6');
  assert.equal(await t.page.locator('#passGrid .slot.on').count(), 0);
  assert.equal(await t.page.locator('.stampmark').count(), 0);
  // ... and once a record says a game was finished, its stamp is there
  await t.page.evaluate(() => { localStorage.setItem('kantar.stats.v1', JSON.stringify({ v: 1, games: [{ w: 0 }] })); localStorage.setItem('cupoftea.v1', JSON.stringify({ done: [1] })); });
  await t.page.reload(); await t.page.waitForTimeout(300);
  assert.deepEqual(await t.page.$$eval('#passGrid .slot.on', els => els.map(e => e.dataset.game)), ['cupoftea', 'kantar']);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('for you: a daily with all five rounds played but no final score yet is a "continue" to the results', async () => {
  // 26 October 2026 is Daily #30 (index 29)
  const t = await open({ now: new Date('2026-10-26T12:00:00'), storage: { 'borderlines:run:29': JSON.stringify({ scores: [80, 70, 60, 50, 40], hints: [] }) } });
  const card = t.page.locator('#fyRow .fy[data-game="borderlines"]');
  assert.equal(await card.getAttribute('data-kind'), 'continue');
  assert.match(await card.innerText(), /All 5 rounds played · 300 points · see your score/);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('feedback dialog: follows the theme picked on the portal and keeps keyboard focus inside', async () => {
  const t = await open({ storage: { 'hl.theme': 'dark' } }); // a light system, dark picked on the portal
  await t.page.click('.hlfb-btn');
  await t.page.waitForFunction(() => document.activeElement && document.activeElement.id === 'hlfb-msg');
  assert.equal(await t.page.evaluate(() => getComputedStyle(document.querySelector('.hlfb-box')).backgroundColor), 'rgb(23, 30, 43)');
  for (let i = 0; i < 15; i++) {
    await t.page.keyboard.press(i % 4 === 3 ? 'Shift+Tab' : 'Tab');
    assert.ok(await t.page.evaluate(() => !!document.activeElement.closest('.hlfb-box')), 'focus left the dialog after ' + (i + 1) + ' presses');
  }
  await t.page.keyboard.press('Escape');
  assert.equal(await t.page.locator('.hlfb-ov:not([hidden])').count(), 0);
  assert.equal(await t.page.evaluate(() => document.activeElement.className), 'hlfb-btn');
  // light picked on a dark system: the dialog is light
  const u = await browser.newContext({ colorScheme: 'dark' });
  await u.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  await u.addInitScript(() => localStorage.setItem('hl.theme', 'light'));
  const pg = await u.newPage(); await pg.goto(srv.url + '/'); await pg.waitForTimeout(300);
  await pg.click('.hlfb-btn');
  assert.equal(await pg.evaluate(() => getComputedStyle(document.querySelector('.hlfb-box')).backgroundColor), 'rgb(247, 246, 242)');
  await u.close();
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('privacy page: says that the Borderlines daily total is the one score that leaves the browser', async () => {
  const html = readFileSync(new URL('../../public/privacy/index.html', import.meta.url), 'utf8');
  assert.match(html, /Borderlines daily, its total/);
  assert.doesNotMatch(html, /They are not sent anywhere/);
});

// ---------------------------------------------------------------- Lighthouse and shared-script regressions
test('portal a11y/perf: first card image is eager and high priority, <main>, heading order, labels start with the visible text', async () => {
  const t = await open({ storage: { 'hl.passport.v1': PASS } });
  const p = t.page;
  const first = p.locator('#viewCards .game').first().locator('.plate > img:not(.shot)');
  assert.equal(await first.getAttribute('loading'), null);
  assert.equal(await first.getAttribute('fetchpriority'), 'high');
  assert.equal(await p.locator('main').count(), 1);
  assert.ok(await p.evaluate(() => !!document.querySelector('main #forYou') && !!document.querySelector('main #passport') && !document.querySelector('main header, main footer')));
  const levels = await p.$$eval('h1, h2, h3, h4, h5, h6', hs => hs.filter(h => h.getClientRects().length).map(h => +h.tagName[1]));
  assert.equal(levels[0], 1);
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] <= levels[i - 1] + 1, 'heading level skips at ' + i + ': ' + levels.join(','));
  // accessible names start with the text you can see
  const vis = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const chip = await p.evaluate(() => [document.getElementById('passChip').getAttribute('aria-label'), document.querySelector('#passChip > span:not(.seal)').textContent]);
  assert.ok(vis(chip[0]).startsWith(vis(chip[1])), chip.join(' | '));
  assert.equal(await p.locator('a.plate[aria-label]').count(), 0);
  for (const b of await p.$$eval('#viewCards .row .btn', bs => bs.map(b => [b.getAttribute('aria-label'), b.innerText]))) assert.ok(vis(b[0]).startsWith(vis(b[1])), b.join(' | '));
  await p.click('#tabMap');
  for (const sel of ['.atlas-pick', '.tl-lab']) {
    for (const b of await p.$$eval(sel, bs => bs.map(b => [b.getAttribute('aria-label'), b.firstElementChild.textContent]))) assert.ok(vis(b[0]).startsWith(vis(b[1])), sel + ': ' + b.join(' | '));
  }
  assert.equal(await p.locator('#tlMoment h3').count(), 1);
  // contrast: the small faint labels (No. 6 …) reach 4.5:1 in both themes
  const ratio = await p.evaluate(() => {
    const lum = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const out = [];
    for (const th of ['light', 'dark']) {
      document.documentElement.setAttribute('data-theme', th);
      const n = document.querySelector('.numeral'), a = lum(getComputedStyle(n).color), b = lum(getComputedStyle(n.closest('.game')).backgroundColor);
      out.push((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
    }
    return out;
  });
  for (const r of ratio) assert.ok(r >= 4.5, 'numeral contrast ' + r.toFixed(2));
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('feedback.js: the dialog role sits on a wrapper, not the form; on a phone the pills step aside for any visible dialog (portrait and landscape)', async () => {
  const t = await open({ viewport: { width: 844, height: 390 }, mobile: true });
  const p = t.page;
  assert.equal(await p.locator('form.hlfb-box[role]').count(), 0);
  assert.equal(await p.locator('.hlfb-ov > [role="dialog"][aria-modal="true"] > form.hlfb-box').count(), 1);
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.hlfb-btn')).display), 'block');
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'endcard'; d.setAttribute('role', 'dialog'); d.style.cssText = 'position:fixed;inset:20px;background:#fff'; document.body.appendChild(d); });
  await p.waitForFunction(() => getComputedStyle(document.querySelector('.hlfb-btn')).display === 'none', null, { timeout: 2000 });
  await p.evaluate(() => document.getElementById('endcard').remove());
  await p.waitForFunction(() => getComputedStyle(document.querySelector('.hlfb-btn')).display !== 'none', null, { timeout: 2000 });
  await p.evaluate(() => document.documentElement.setAttribute('data-hl-pills', 'hide'));
  await p.waitForFunction(() => getComputedStyle(document.querySelector('.hlfb-btn')).display === 'none', null, { timeout: 2000 });
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('hl.js: a loss never becomes the best result; on a phone the stamp toast sits at the top', async () => {
  const t = await open({ viewport: { width: 390, height: 844 }, mobile: true });
  const p = t.page;
  await p.addScriptTag({ url: '/hl.js' });
  const pass = await p.evaluate(() => {
    HL.stamp('tulip', { result: 'loss', label: 'Lost with f9,000', score: 9000 });
    HL.stamp('tulip', { result: 'win', label: 'Cashed in f2,000', score: 2000 });
    return HL.passport().games.tulip;
  });
  assert.equal(pass.best, 2000); assert.equal(pass.bestLabel, 'Cashed in f2,000'); assert.equal(pass.plays, 2); assert.equal(pass.wins, 1);
  await p.evaluate(() => { localStorage.removeItem('hl.passport.v1'); HL.stamp('kantar', { result: 'loss', label: 'Lost 3–4', score: -1 }); });
  assert.equal(await p.evaluate(() => HL.passport().games.kantar.best), undefined);
  const toast = await p.locator('.hlx-toast').first().boundingBox();
  assert.ok(toast && toast.y < 100, 'toast is not at the top on a phone: ' + JSON.stringify(toast));
  await t.close();
});

test('next.js: on a Turkish page the next-game card has Turkish length and description', async () => {
  const t = await open();
  const p = t.page;
  await p.evaluate(() => { localStorage.setItem('tulip7.record.v1', '{}'); document.body.insertAdjacentHTML('beforeend', '<div id="nx" data-hl-next data-hl-lang="tr"></div>'); });
  await p.evaluate(() => new Promise(r => { const s = document.createElement('script'); s.src = '/next.js'; s.setAttribute('data-game', 'kantar'); s.onload = r; document.body.appendChild(s); }));
  await p.waitForSelector('#nx .hln-card');
  const txt = await p.evaluate(() => document.getElementById('nx').textContent);
  assert.match(txt, /dakika|sahne/);
  assert.doesNotMatch(txt, /minutes|scenes|A grocer|Amsterdam, winter/);
  assert.match(txt, /Homo Ludens’ta sırada/);
});

test('test server: serves webp images with their type', async () => {
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../../public/tulip7/img/', import.meta.url);
  const f = readdirSync(dir).find(n => n.endsWith('.webp'));
  if (!f) return;
  const r = await fetch(srv.url + '/tulip7/img/' + f);
  assert.equal(r.headers.get('content-type'), 'image/webp');
});
