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
  // upgrade levels in all (a pick may raise one already owned, e.g. Willow mattresses II)
  const levels = () => t.page.evaluate(() => Object.values(window.__polder.S.up).reduce((a, b) => a + b, 0));
  const owned = await levels();
  await t.page.evaluate(() => document.activeElement && document.activeElement.blur());
  await t.page.keyboard.press('Enter');
  await t.page.waitForTimeout(300);
  assert.equal(await t.page.locator('#mbox .up').count(), 3, 'Enter closed the upgrade picker without a choice');
  await t.page.locator('#mbox .up').first().click();
  await t.page.waitForFunction(() => !window.__polder.S.busy, null, { timeout: 5000 });
  assert.equal(await levels(), owned + 1);
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

// ---------- "Your dikes vs. history", passport stamp, image share ----------
const FACTS = {
  friesland: ['955', '3,181', 'Middelzee', 'Oudebildtdijk'],
  zeeland: ['1,365 km²', '67', '1,836', 'Oosterschelde'],
  holland: ['1612', '1622', '1635', '7,208 ha', '16,850 ha'],
  zuiderzee: ['1932', '28 May 1932', '19 people', '1,600 km²', 'Eastern Flevoland fell dry in 1957, Southern Flevoland in 1968'],
};
test('Polder: every region ends with "Your dikes vs. history": the real map with a hatched layer, sourced numbers, a passport stamp and an image share', async () => {
  const t = await open();
  for (const id of Object.keys(FACTS)) {
    await startRegion(t.page, id);
    await t.page.evaluate(() => { window.__polder.S.stars = window.__polder.S.stars.map((v, k) => k < 4 ? 1 : -1); window.__polder.dbg.end(); });
    await t.page.waitForSelector('#vsPanel');
    const v = await t.page.evaluate(() => {
      const p = document.getElementById('vsPanel');
      return { text: p.innerText, hatch: p.querySelectorAll('svg path[fill^="url(#vs"]').length, links: [...p.querySelectorAll('.vsl a')].map(a => a.href), mini: p.querySelector('#vsMe').width, goals: /goals/.test(document.getElementById('mbox').innerText) };
    });
    assert.ok(v.hatch >= 1, id + ': no hatched layer');
    assert.ok(v.mini > 0, id + ': mini map not drawn');
    assert.ok(v.goals, id + ': the result is still on the same card');
    assert.match(v.text, /Your dikes vs\. history/i);
    assert.match(v.text, /approximate/);
    for (const f of FACTS[id]) assert.ok(v.text.includes(f), `${id}: missing "${f}"`);
    assert.ok(v.links.length >= 2 && v.links.every(h => h.startsWith('https://')), id + ': sources');
    // stamped in the shared passport: 4 of 5 stars clears every region's bar
    const pass = await t.page.evaluate(() => JSON.parse(localStorage.getItem('hl.passport.v1')).games.polder);
    assert.equal(pass.label, `${await t.page.evaluate(() => window.__polder.S && document.querySelector('#mbox .yr').textContent.split('· ')[1])} · 4★`);
    assert.ok(pass.wins >= 1 && pass.best >= 4);
    assert.equal(await t.page.locator('#shareImg').isVisible(), true, id + ': image share button');
    await t.page.locator('#mOk2').click(); // All regions
    await t.page.waitForTimeout(200);
  }
  // the image share opens the shell's share sheet with a rendered card
  await startRegion(t.page, 'zeeland');
  await t.page.evaluate(() => window.__polder.dbg.end());
  await t.page.locator('#shareImg').click();
  await t.page.waitForSelector('.hlx-ov img[src^="blob:"], .hlx-ov img[src^="data:"]', { timeout: 10000 });
  // every source is also listed in the Chronicle
  const links = await t.page.evaluate(() => [...document.querySelectorAll('#vsPanel .vsl a')].map(a => a.href));
  await t.page.evaluate(() => document.querySelector('.hlx-ov')?.remove());
  await t.page.locator('#mOk2').click(); await t.page.waitForTimeout(200);
  await t.page.locator('#bookBtn').click(); await t.page.locator('.tabs button[data-t="src"]').click();
  const src = await t.page.evaluate(() => [...document.querySelectorAll('.src a')].map(a => a.href));
  for (const l of links) assert.ok(src.includes(l), 'not in the Chronicle: ' + l);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Polder: a loss is stamped as a loss; free play has no history panel', async () => {
  const t = await open();
  await startRegion(t.page, 'friesland');
  await t.page.evaluate(() => { window.__polder.S.stars = window.__polder.S.stars.map((v, k) => k < 2 ? 1 : -1); window.__polder.dbg.end(); });
  await t.page.waitForSelector('#vsPanel');
  const p = await t.page.evaluate(() => JSON.parse(localStorage.getItem('hl.passport.v1')).games.polder);
  assert.equal(p.label, 'Friesland · 2★'); assert.equal(p.wins | 0, 0);
  await t.page.locator('#mOk2').click(); await t.page.waitForTimeout(200);
  await startRegion(t.page, 'free');
  await t.page.evaluate(() => window.__polder.dbg.end());
  await t.page.waitForFunction(() => /goals/.test(document.getElementById('mbox').innerText));
  assert.equal(await t.page.locator('#vsPanel').count(), 0);
  assert.deepEqual(t.problems, []);
  await t.close();
});

// ---------- touch ----------
async function openPhone(size = { width: 390, height: 844 }, storage = { 'polder.settings.v1': JSON.stringify({ sfx: false, music: false }) }) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
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
const snap = page => page.evaluate(() => window.__polderTest.snapshot());
async function cellXY(page, x, y) {
  const r = await page.locator('#cv').boundingBox(), cs = await page.evaluate(() => window.__polderTest.cell);
  return [r.x + (x + .5) * cs, r.y + (y + .5) * cs];
}
async function tapCell(page, x, y) { const [px, py] = await cellXY(page, x, y); await page.touchscreen.tap(px, py); await page.waitForTimeout(90); }
// a valid aim for the current piece, preferring squares next to the player's own dikes
const findAim = page => page.evaluate(() => {
  const P = window.__polder, ok = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 26; x++) if (P.placement(x, y).ok) ok.push([x, y, P.placement(x, y).cells.some(([a, b]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => P.G[(b + dy) * 26 + a + dx] === 5)) ? 1 : 0]);
  ok.sort((a, b) => b[2] - a[2]); return ok.length ? ok[(P.S.piece * 7) % Math.min(ok.length, 6)] : null;
});
const cdp = new WeakMap(); // one session per page: the browser keeps the touch state per session
async function cdpTouch(page, type, pts) {
  if (!cdp.has(page)) cdp.set(page, await page.context().newCDPSession(page));
  await cdp.get(page).send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
}

test('Polder (touch): the phone note offers Play, and a whole Friesland region can be played by touch', async () => {
  const t = await openPhone();
  // the softer note, then the first-visit intro
  await t.page.waitForSelector('#mbox h2');
  assert.match(await t.page.locator('#mbox h2').innerText(), /Best with a mouse, but it works by touch/);
  await t.page.getByRole('button', { name: 'Play', exact: true }).tap();
  await t.page.getByRole('button', { name: 'Begin' }).tap();
  await t.page.waitForFunction(() => { const s = window.__polderTest.snapshot(); return s && !s.busy; });
  assert.equal(await t.page.evaluate(() => window.__polderTest.touch()), true);
  assert.equal(await t.page.locator('#tbar').isVisible(), true);
  // the touch bar is in thumb reach: at the bottom of a 390x844 screen, with a big Rotate button
  const rb = await t.page.locator('#tRot').boundingBox();
  assert.ok(rb.y > 844 - 120 && rb.height >= 48 && rb.width >= 64, 'Rotate: ' + JSON.stringify(rb));
  let checks = { rotate: false, two: false, info: false, drag: false, plug: false, invalid: false };
  let moves = 0;
  for (let guard = 0; guard < 400; guard++) {
    if (await t.page.locator('#vsPanel').count()) break;
    if (await modalOpen(t.page)) {
      if (await t.page.locator('#mbox .up').count()) await t.page.locator('#mbox .up').first().tap();
      else await t.page.locator('#mOk').tap();
      await t.page.waitForTimeout(150); continue;
    }
    const s = await snap(t.page);
    if (!s || s.busy) { await t.page.waitForTimeout(150); continue; }
    if (!checks.plug && await t.page.evaluate(() => window.__polder.S.fingers > 0 && window.__polder.G.includes(5))) {
      // a cracked dike: a tap shows "Plug", a second tap plugs it with a finger
      const i = await t.page.evaluate(() => { const i = window.__polder.G.indexOf(5); window.__polder.dbg.crack(i); return i; });
      const f0 = await t.page.evaluate(() => window.__polder.S.fingers);
      await tapCell(t.page, i % 26, Math.floor(i / 26));
      assert.equal((await t.page.evaluate(() => window.__polderTest.aim())).finger, true);
      assert.equal(await t.page.locator('#tBuildL').innerText(), 'Plug');
      await tapCell(t.page, i % 26, Math.floor(i / 26)); await t.page.waitForTimeout(150);
      assert.equal(await t.page.evaluate(() => window.__polder.S.fingers), f0 - 1);
      checks.plug = true;
      if (await modalOpen(t.page)) continue; // the "boy at the dike" aside
    }
    if (!checks.rotate) { // the Rotate button and a two-finger tap both turn the piece
      const r0 = await t.page.evaluate(() => window.__polder.S.rot);
      await t.page.locator('#tRot').tap(); await t.page.waitForTimeout(80);
      assert.equal(await t.page.evaluate(() => window.__polder.S.rot), (r0 + 1) % 4);
      const [ax, ay] = await cellXY(t.page, 5, 6), [bx, by] = await cellXY(t.page, 15, 6);
      await cdpTouch(t.page, 'touchStart', [[ax, ay], [bx, by]]); await cdpTouch(t.page, 'touchEnd', []); await t.page.waitForTimeout(80);
      assert.equal(await t.page.evaluate(() => window.__polder.S.rot), (r0 + 2) % 4, 'two-finger tap did not rotate');
      assert.equal(await t.page.evaluate(() => window.__polder.S.piece), s.piece, 'two-finger tap built something');
      checks.rotate = checks.two = true;
    }
    if (!checks.info) { // long press: what is this square? (no hover needed)
      const [px, py] = await cellXY(t.page, 12, 14);
      await cdpTouch(t.page, 'touchStart', [[px, py]]); await t.page.waitForTimeout(650); await cdpTouch(t.page, 'touchEnd', []);
      await t.page.waitForSelector('#tip.show');
      assert.match(await t.page.locator('#tip').innerText(), /Dry land/);
      assert.equal(await t.page.evaluate(() => window.__polderTest.aim()), null, 'a long press aimed a piece');
      checks.info = true;
    }
    const aim = await findAim(t.page);
    if (!aim) { await t.page.locator('#tWait').tap(); moves++; await t.page.waitForTimeout(200); continue; }
    const [x, y] = aim;
    if (!checks.invalid) { // a tap on land aims a red ghost; tapping it again says why it cannot be built
      await tapCell(t.page, 12, 14); assert.equal((await t.page.evaluate(() => window.__polderTest.aim())).ok, false);
      await tapCell(t.page, 12, 14); assert.equal((await snap(t.page)).piece, s.piece);
      assert.match(await t.page.locator('#toast').innerText(), /water|touch|land/);
      checks.invalid = true;
    }
    if (!checks.drag) { // drag nudges the aimed piece like a trackpad, by whole squares
      await tapCell(t.page, x, y);
      const cs = await t.page.evaluate(() => window.__polderTest.cell), [px, py] = await cellXY(t.page, x, y);
      await cdpTouch(t.page, 'touchStart', [[px, py]]);
      for (let k = 1; k <= 4; k++) await cdpTouch(t.page, 'touchMove', [[px + k * cs * .5, py]]);
      await cdpTouch(t.page, 'touchEnd', []); await t.page.waitForTimeout(80);
      const a = await t.page.evaluate(() => window.__polderTest.aim());
      assert.equal(a.x, Math.min(25, x + 2), 'drag nudge: ' + JSON.stringify(a)); assert.equal(a.y, y);
      assert.equal((await snap(t.page)).piece, s.piece, 'a drag built something');
      checks.drag = true;
      if (a.ok) { // the Build button builds the nudged piece
        await t.page.locator('#tBuild').tap();
        await t.page.waitForFunction(p => window.__polderTest.snapshot().piece > p || window.__polder.S.busy, s.piece);
        moves++; continue;
      }
      await t.page.locator('#tWait').tap(); moves++; await t.page.waitForTimeout(200); continue;
    }
    // tap to aim, tap again to build
    await tapCell(t.page, x, y);
    const a = await t.page.evaluate(() => window.__polderTest.aim());
    assert.deepEqual([a.x, a.y, a.ok], [x, y, true]);
    assert.equal((await snap(t.page)).piece, s.piece, 'one tap built');
    assert.equal(await t.page.locator('#tBuild').isEnabled(), true);
    await tapCell(t.page, x, y);
    await t.page.waitForFunction(p => { const s = window.__polderTest.snapshot(); return !s || s.piece > p || window.__polder.S.busy || window.__polder.S.over; }, s.piece);
    moves++;
  }
  assert.ok(await t.page.locator('#vsPanel').count(), 'the region did not end');
  assert.ok(moves >= 20, 'moves: ' + moves);
  assert.ok(Object.values(checks).every(Boolean), JSON.stringify(checks));
  const st = await t.page.evaluate(() => window.__polder.S.stars.filter(v => v === 1).length);
  const pass = await t.page.evaluate(() => JSON.parse(localStorage.getItem('hl.passport.v1')).games.polder);
  assert.equal(pass.label, `Friesland · ${st}★`); assert.equal(pass.wins | 0, st >= 4 ? 1 : 0);
  // the end card fits the phone: no sideways scroll, buttons reachable
  assert.ok(await t.page.evaluate(() => document.getElementById('mbox').scrollWidth <= document.getElementById('mbox').clientWidth + 1));
  assert.equal(await t.page.locator('#mOk').isVisible(), true);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Polder (touch): in landscape the touch bar sits in the sidebar, fully on screen', async () => {
  const t = await openPhone({ width: 844, height: 390 });
  await t.page.getByRole('button', { name: 'Play', exact: true }).tap();
  await t.page.getByRole('button', { name: 'Begin' }).tap();
  await t.page.waitForTimeout(300);
  for (const id of ['#tRot', '#tBuild', '#tWait', '#tPc']) {
    const b = await t.page.locator(id).boundingBox();
    assert.ok(b && b.x >= 0 && b.x + b.width <= 844 && b.y + b.height <= 390 && b.height >= 44, id + ' ' + JSON.stringify(b));
  }
  assert.ok(await t.page.evaluate(() => document.documentElement.scrollWidth <= 844));
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Polder: on a desktop the touch bar stays hidden and mouse play is unchanged', async () => {
  const t = await open();
  await startRegion(t.page, 'friesland');
  assert.equal(await t.page.locator('#tbar').isVisible(), false);
  assert.equal(await t.page.locator('#rotBtn').isVisible(), true);
  assert.equal(await t.page.evaluate(() => window.__polderTest.touch()), false);
  await t.close();
});

// ---------- QA, late October 2026 ----------
test('Polder (keyboard): arrow keys aim the piece and Enter builds it', async () => {
  const t = await open();
  await startRegion(t.page, 'friesland');
  await t.page.evaluate(() => document.activeElement && document.activeElement.blur());
  await t.page.keyboard.press('ArrowLeft'); // the first arrow puts the aim in the middle of the board
  const a0 = await t.page.evaluate(() => window.__polderTest.aim());
  assert.ok(a0, 'no aim after an arrow key');
  await t.page.keyboard.press('ArrowLeft');
  assert.deepEqual(await t.page.evaluate(() => { const a = window.__polderTest.aim(); return [a.x, a.y]; }), [a0.x - 1, a0.y]);
  // walk to a square where the piece fits, then build it with Enter
  let ok = false;
  for (let k = 0; k < 40 && !ok; k++) { await t.page.keyboard.press(k < 20 ? 'ArrowUp' : 'ArrowRight'); ok = (await t.page.evaluate(() => window.__polderTest.aim())).ok; }
  assert.ok(ok, 'no buildable square found by keyboard');
  const p0 = (await t.page.evaluate(() => window.__polderTest.snapshot())).piece;
  await t.page.keyboard.press('Enter');
  await t.page.waitForFunction(p => window.__polderTest.snapshot().piece > p, p0);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Polder: the region intro keeps place names capitalised', async () => {
  const t = await open();
  await t.page.evaluate(() => window.__polder.startLevel('holland'));
  const text = await t.page.locator('#mbox').innerText();
  assert.match(text, /Goals:.*drain the Purmer.*Christmas Flood.*Haarlemmermeer/s);
  await t.close();
});

for (const size of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  test(`Polder: the labels on the real maps stay inside their frame (${size.width}px)`, async () => {
    const ctx = await browser.newContext({ viewport: size, reducedMotion: 'reduce' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
    await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, RETURNING);
    const page = await ctx.newPage();
    await page.goto(srv.url + '/polder/'); await page.waitForTimeout(600);
    for (const id of Object.keys(FACTS)) {
      await startRegion(page, id);
      await page.evaluate(() => window.__polder.dbg.end());
      await page.waitForSelector('#vsPanel');
      const out = await page.evaluate(() => {
        const svg = document.querySelector('#vsPanel svg'), f = svg.getBoundingClientRect();
        return [...svg.querySelectorAll('text')].filter(t => { const b = t.getBoundingClientRect(); return b.left < f.left || b.right > f.right || b.top < f.top || b.bottom > f.bottom; }).map(t => t.textContent);
      });
      assert.deepEqual(out, [], id + ': labels cut off');
      await page.locator('#mOk2').click(); await page.waitForTimeout(200);
    }
    await ctx.close();
  });
}

test('Polder: labels on the board are not cut off at its edge (small landscape screen)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    const fill = CanvasRenderingContext2D.prototype.fillText; window.__labels = [];
    CanvasRenderingContext2D.prototype.fillText = function (txt, x, y) { if (this.canvas.id === 'cv' && this.textAlign === 'center') window.__labels.push([String(txt), x, this.measureText(txt).width]); return fill.apply(this, arguments); };
  }, RETURNING);
  const page = await ctx.newPage();
  await page.goto(srv.url + '/polder/'); await page.waitForTimeout(600);
  await startRegion(page, 'holland');
  await page.evaluate(() => { window.__labels = []; }); await page.waitForTimeout(300);
  const r = await page.evaluate(() => { const W = document.getElementById('cv').getBoundingClientRect().width, seen = {};
    for (const [t, x, w] of window.__labels) if (/ · /.test(t)) seen[t] = [Math.round(x - w / 2), Math.round(W - x - w / 2)];
    return seen; });
  assert.ok(Object.keys(r).some(t => /deep water/.test(t)), JSON.stringify(r));
  for (const [t, [l, rr]] of Object.entries(r)) assert.ok(l >= 0 && rr >= 0, `"${t}" is cut off: ${l}, ${rr}`);
  await ctx.close();
});

// ---------- accessibility and performance audit, October 2026 ----------
test('Polder: cards are modal dialogs (named, focus in, game inert, focus back) and the board is not redrawn behind them', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(s => {
    if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); }
    const fr = CanvasRenderingContext2D.prototype.fillRect; window.__boardDraws = 0;
    CanvasRenderingContext2D.prototype.fillRect = function () { if (this.canvas.id === 'cv') window.__boardDraws++; return fr.apply(this, arguments); };
  }, RETURNING);
  const page = await ctx.newPage();
  const problems = []; page.on('pageerror', e => problems.push(e.message));
  await page.goto(srv.url + '/polder/'); await page.waitForTimeout(600);
  // static structure: a main landmark, no blur behind the dialog, no h3 in the game before an h2
  const st = await page.evaluate(() => ({
    main: !!document.querySelector('main #cv'), blur: getComputedStyle(document.getElementById('modal')).backdropFilter,
    heads: [...document.querySelectorAll('#app h1,#app h2,#app h3')].map(h => h.tagName).join(','),
  }));
  assert.ok(st.main, 'no <main> around the board'); assert.ok(!st.blur || st.blur === 'none', 'backdrop blur: ' + st.blur);
  assert.doesNotMatch(st.heads, /^H3|H1,H3/, 'heading order: ' + st.heads);
  await page.evaluate(() => window.__polder.startLevel('friesland')); // the region intro card
  await page.waitForTimeout(100);
  const d = await page.evaluate(() => { const b = document.getElementById('mbox'); return { role: b.getAttribute('role'), modal: b.getAttribute('aria-modal'), name: document.getElementById(b.getAttribute('aria-labelledby'))?.textContent, focus: document.activeElement.id, inert: document.getElementById('app').inert }; });
  assert.deepEqual(d, { role: 'dialog', modal: 'true', name: 'Friesland · The terp lands', focus: 'mOk', inert: true });
  const n0 = await page.evaluate(() => window.__boardDraws); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__boardDraws), n0, 'the board is redrawn behind a dialog');
  await page.keyboard.press('Enter'); // the focused OK button
  await page.waitForFunction(() => !window.__polder.S.busy);
  assert.equal(await page.evaluate(() => document.getElementById('app').inert), false);
  const n1 = await page.evaluate(() => window.__boardDraws); await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => window.__boardDraws) > n1, 'the board stopped drawing after the dialog');
  // the Regions button opens a dialog; Keep playing gives focus back to the button
  await page.locator('#restartBtn').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement.id === 'mOk');
  await page.waitForTimeout(300); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('modal').classList.contains('hidden'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'restartBtn');
  // the upgrade picker gets focus on the box, not on a choice; a held Enter picks nothing
  await page.evaluate(() => { window.__polder.S.xp = 100; window.__polder.waitDecade(); });
  await page.waitForSelector('#mbox .up');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mbox');
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  assert.equal(await page.locator('#mbox .up').count(), 3);
  assert.deepEqual(problems, []);
  await ctx.close();
});
