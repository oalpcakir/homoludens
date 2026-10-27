// Kantar after the match: the round-by-round review (opens, fills in through the worker, closes and cancels, survives
// a resume, hidden for an old save), pass-and-play (hand-over cover, names, separate tally, "pnp" analytics) and the
// shared share sheet / passport stamp (public/hl.js).   CHROME=/path/to/chromium node --test tests/smoke/kantar-review.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './server.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
let srv, browser;
before(async () => { srv = await serve(ROOT + 'public'); browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] }); });
after(async () => { await browser?.close(); srv?.close(); });

async function open(settings, { viewport = { width: 1366, height: 768 }, touch = false } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('kantar-lang', 'en'); localStorage.setItem('kantar-set', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, settings);
  // collect analytics events (track() reads window.posthog at call time)
  await ctx.addInitScript(() => { window.__ev = []; const ph = new Proxy({ __SV: 1 }, { get: (o, k) => k === 'capture' ? (n, p) => window.__ev.push([n, p]) : k in o ? o[k] : () => {} });
    Object.defineProperty(window, 'posthog', { configurable: true, get: () => ph, set: () => {} }); });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(srv.url + '/kantar/');
  await page.waitForTimeout(500);
  return { page, problems, close: () => ctx.close() };
}
// every human decision: a random legal move (both seats in pass-and-play, dismissing the hand-over cover first)
async function playToEnd(page, stopAtTurn = 99) {
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const r = await page.evaluate(stop => {
      if (G.phase === 'end') return 'end';
      if (G.turn >= stop) return 'stop';
      if (passUp()) { hidePass(); return 'moved'; }
      if (ui.busy || !human(ownerOf(G))) return 'wait';
      const k = children(G), [o] = k[Math.random() * k.length | 0];
      if (G.phase === 'split') { ui.uc = o.piles.length === 3; ui.sel = []; const free = o.idxs.slice();
        o.piles.forEach((p, pan) => p.forEach(c => { const j = free.findIndex(i => G.market[i] === c); ui.sel.push({ mi: free[j], pan }); free.splice(j, 1); })); playerOffer(); }
      else { if (o.cut) playerCut(o.cut[0], o.cut[1]); playerPick(o.pick); }
      return 'moved';
    }, stopAtTurn);
    if (r === 'end' || r === 'stop') return r;
    await page.waitForTimeout(r === 'moved' ? 250 : 100);
  }
  return 'timeout';
}
const SOLO = { snd: false, teach: false, tut: false, diff: 'cirak', mode: 'narh', pv: true };
const startGame = (page, f = 0) => page.evaluate(f => { document.getElementById('rules').classList.add('hide'); start(f); }, f);
const endShown = page => page.waitForFunction(() => !document.getElementById('endM').classList.contains('hide'), null, { timeout: 10000 });

test('review: opens from the end screen, grades every decision in the worker, shows a round, closes (×, Escape)', async () => {
  const t = await open(SOLO);
  await startGame(t.page, 1);
  assert.equal(await playToEnd(t.page), 'end');
  await endShown(t.page);
  assert.ok(await t.page.isVisible('#endReview'), 'no review button');
  const nMine = await t.page.evaluate(() => HIST.filter(h => h.w === 0).length);
  await t.page.click('#endReview');
  assert.ok(await t.page.isVisible('#reviewM'), 'review did not open');
  await t.page.waitForFunction(() => rvComplete(), null, { timeout: 30000 });
  const s = await t.page.evaluate(() => ({ local: SEARCH.local, sum: rvSummaryText(0), chips: document.querySelectorAll('.rv-sum .rv-chip').length,
    marks: document.querySelectorAll('.rv-line .rv-ms:not(.riv) .rv-ic').length, rounds: document.querySelectorAll('.rv-rd').length, det: !!document.getElementById('rvDet') }));
  assert.equal(s.local, 0, 'review searched on the main thread');
  assert.match(s.sum, /\d+ (best|good|inaccurac|mistake|blunder)/);
  assert.ok(s.chips >= 1); assert.equal(s.marks, nMine, 'one marker per decision'); assert.equal(s.rounds, 6); assert.ok(s.det);
  // tap round 3: its decisions, with "as played" (and "Rıza's best" when different) side by side
  await t.page.click('.rv-rd[data-rd="2"]');
  assert.match(await t.page.innerText('#rvDet h3'), /Round 3/);
  assert.ok(await t.page.locator('#rvDet .rv-dec .rv-col.played .card').count() >= 1, 'no goods shown');
  const ev = await t.page.evaluate(() => window.__ev.filter(e => e[0] === 'kantar_review').length);
  assert.equal(ev, 1);
  await t.page.click('#rvClose');
  assert.equal(await t.page.isVisible('#reviewM'), false);
  // reopening uses the finished review (no new jobs); Escape closes the review, not the end sheet
  const jobs = await t.page.evaluate(() => SEARCH.jobs);
  await t.page.click('#endReview');
  assert.equal(await t.page.evaluate(() => rvComplete() && SEARCH.jobs), jobs);
  await t.page.keyboard.press('Escape');
  assert.equal(await t.page.isVisible('#reviewM'), false);
  assert.ok(await t.page.isVisible('#endM'));
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('review: closing while it works cancels it; it starts again on reopening', async () => {
  const t = await open(SOLO);
  await startGame(t.page);
  assert.equal(await playToEnd(t.page), 'end');
  await endShown(t.page);
  // slow every job down so the review is still running when closed
  await t.page.evaluate(() => { const orig = searchJob; window.searchJob = m => m.type === 'judge' ? orig(m).then(r => new Promise(ok => setTimeout(() => ok(r), 150))) : orig(m); });
  await t.page.click('#endReview');
  await t.page.waitForSelector('.rv-prog');
  await t.page.click('#rvClose');
  const a = await t.page.evaluate(() => ({ key: REV.key, done: REV.done, n: REV.res.length, pend: SEARCH.pend.size }));
  assert.equal(a.key, null); assert.ok(a.done < a.n); assert.equal(a.pend, 0);
  await t.page.waitForTimeout(500);
  assert.equal(await t.page.evaluate(() => REV.done), a.done, 'cancelled review kept going');
  await t.page.click('#endReview');
  await t.page.waitForFunction(() => rvComplete(), null, { timeout: 30000 });
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('review: the move history survives a resume; a save from before the review has no review button', async () => {
  const t = await open(SOLO);
  await startGame(t.page);
  assert.equal(await playToEnd(t.page, 2), 'stop');
  await t.page.waitForFunction(() => !ui.busy && human(ownerOf(G)));
  await t.page.waitForTimeout(400);
  await t.page.reload(); await t.page.waitForTimeout(600);
  await t.page.click('#quickResume');
  assert.ok(await t.page.evaluate(() => Array.isArray(HIST) && HIST.length >= 4), 'history not restored');
  assert.equal(await playToEnd(t.page), 'end');
  await endShown(t.page);
  assert.ok(await t.page.isVisible('#endReview'), 'no review after a resume');
  await t.page.click('#endReview');
  await t.page.waitForFunction(() => rvComplete(), null, { timeout: 30000 });
  await t.page.click('#rvClose');
  // an old save (no "hist"): play on, no review
  await t.page.evaluate(() => { document.getElementById('endM').classList.add('hide'); start(0); });
  assert.equal(await playToEnd(t.page, 1), 'stop');
  await t.page.waitForFunction(() => !ui.busy && human(ownerOf(G)));
  await t.page.waitForTimeout(400);
  await t.page.evaluate(() => { const v = JSON.parse(localStorage.getItem('kantar-game-v04')); delete v.hist; localStorage.setItem('kantar-game-v04', JSON.stringify(v)); });
  await t.page.reload(); await t.page.waitForTimeout(600);
  await t.page.click('#quickResume');
  assert.equal(await t.page.evaluate(() => HIST), null);
  assert.equal(await playToEnd(t.page), 'end');
  await endShown(t.page);
  assert.equal(await t.page.locator('#endReview').count(), 0, 'review offered without history');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('pass-and-play: names, a hand-over cover before each other player\'s decision, separate tally, "pnp" analytics', async () => {
  const t = await open({ ...SOLO, teach: true, pnp: true, names: ['Ada', ''] }, { viewport: { width: 390, height: 844 }, touch: true });
  await t.page.click('#quickPlay');
  await t.page.waitForTimeout(400);
  assert.ok(await t.page.isVisible('#passM'), 'no cover at the start');
  assert.equal(await t.page.innerText('#passName'), 'Ada');
  const st = await t.page.evaluate(() => window.__ev.find(e => e[0] === 'kantar_game_start'));
  assert.equal(st[1].mode, 'pnp'); assert.equal(st[1].rules, 'narh');
  await t.page.click('#passGo');
  assert.equal(await t.page.isVisible('#passM'), false);
  assert.match(await t.page.innerText('#prompt'), /Ada/);
  assert.match(await t.page.innerText('#oppStall'), /Player 2/);
  // the teacher helps the player to move (seat 0 now)
  await t.page.waitForFunction(() => !!TCH.data && TCH.key === stateKey(G), null, { timeout: 15000 });
  // Ada divides -> cover for Player 2, who then chooses (no AI in between)
  await t.page.evaluate(() => { const [o] = children(G).find(k => k[0].piles.length === 2); ui.sel = []; const free = o.idxs.slice();
    o.piles.forEach((p, pan) => p.forEach(c => { const j = free.findIndex(i => G.market[i] === c); ui.sel.push({ mi: free[j], pan }); free.splice(j, 1); })); playerOffer(); });
  await t.page.waitForTimeout(300);
  assert.ok(await t.page.isVisible('#passM'), 'no cover for player 2');
  assert.equal(await t.page.innerText('#passName'), 'Player 2');
  assert.deepEqual(await t.page.evaluate(() => [G.phase, ownerOf(G), ui.busy, SEARCH.jobs > 0]), ['choose', 1, false, true]);
  await t.page.tap('#passM');
  assert.equal(await t.page.isVisible('#passM'), false);
  await t.page.waitForFunction(() => !!TCH.data && TCH.key === stateKey(G), null, { timeout: 15000 });
  assert.ok(await t.page.isVisible('#teacher .t-rec'), 'no teacher for player 2');
  assert.equal(await playToEnd(t.page), 'end');
  await endShown(t.page);
  const end = await t.page.evaluate(() => ({ stats: localStorage.getItem('kantar.stats.v1'), rec: localStorage.getItem('kantar.record.v1'), pnp: JSON.parse(localStorage.getItem('kantar.pnp.v1')),
    passport: localStorage.getItem('hl.passport.v1'), share: !!document.getElementById('endShare'), ev: window.__ev.filter(e => e[0] === 'kantar_game_end').map(e => e[1].mode) }));
  assert.equal(end.stats, null, 'counted in the solo stats'); assert.equal(end.rec, null);
  assert.equal(end.pnp.played, 1); assert.equal(end.passport, null, 'stamped a two-player game');
  assert.equal(end.share, false); assert.deepEqual(end.ev, ['pnp']);
  assert.match(await t.page.innerText('#endSheet'), /Two-player games on this device: 1/);
  // both players are reviewed
  await t.page.click('#endReview');
  await t.page.waitForFunction(() => rvComplete(), null, { timeout: 30000 });
  assert.equal(await t.page.locator('.rv-sum .rv-who').count(), 2);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('end screen: Share opens the shared result card with the review summary; the solo game is stamped in the passport', async () => {
  const t = await open(SOLO);
  await startGame(t.page);
  assert.equal(await playToEnd(t.page), 'end');
  await endShown(t.page);
  const pass = await t.page.evaluate(() => JSON.parse(localStorage.getItem('hl.passport.v1')));
  assert.equal(pass.games.kantar.plays, 1);
  assert.match(pass.games.kantar.label, /(Beat|Lost to|Level with) Apprentice Yusuf \d+–\d+/);
  await t.page.click('#endReview');
  await t.page.waitForFunction(() => rvComplete(), null, { timeout: 30000 });
  await t.page.click('#rvClose');
  const opts = await t.page.evaluate(() => shareOpts());
  assert.equal(opts.game, 'kantar'); assert.equal(opts.kicker, 'Kantar · Narh'); assert.match(opts.url, /\/kantar\/s\/\d+-\d+\?r=[wld]&lv=a&m=n&l=en$/);
  assert.match(opts.lines[0], /^Review: \d+/); assert.match(opts.art, /^img\/ka_end_(win|lose|draw)_cirak\.webp$/);
  assert.equal(await t.page.innerText('#endShare'), 'Share result');
  await t.page.click('#endShare');
  await t.page.waitForSelector('.hlx-ov img[src^="data:image/png"]', { timeout: 8000 });
  assert.ok(await t.page.isVisible('.hlx-ov'));
  assert.ok(await t.page.evaluate(() => window.__ev.some(e => e[0] === 'kantar_share')));
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('market panel: icon | cards rows; the explanations open from the icon (focus, tap) and close with Escape', async () => {
  const t = await open(SOLO, { viewport: { width: 390, height: 844 }, touch: true });
  await startGame(t.page);
  await t.page.waitForTimeout(400);
  const rows = await t.page.evaluate(() => [...document.querySelectorAll('.side .mk-row')].map(r => { const b = r.querySelector('.mk-ic').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height), Math.round(b.left)]; }));
  assert.equal(rows.length, 4); assert.ok(rows.every(r => r[0] === rows[0][0] && r[1] === rows[0][1] && r[2] === rows[0][2]), 'icons not one size and column: ' + JSON.stringify(rows));
  assert.equal(await t.page.isVisible('#tip-caravan'), false, 'explanation shown by default');
  assert.equal(await t.page.getAttribute('.mk-ic.caravan', 'aria-describedby'), 'tip-caravan');
  await t.page.tap('.mk-ic.caravan');
  assert.ok(await t.page.isVisible('#tip-caravan'));
  assert.match(await t.page.innerText('#tip-caravan'), /reach the stall/);
  await t.page.keyboard.press('Escape');
  assert.equal(await t.page.isVisible('#tip-caravan'), false);
  await t.page.tap('.mk-ic.burned'); assert.ok(await t.page.isVisible('#tip-burned'));
  await t.page.tap('#market'); assert.equal(await t.page.isVisible('#tip-burned'), false, 'tap elsewhere does not close');
  // goods key keeps every number
  assert.deepEqual(await t.page.$$eval('.mk-goods tbody tr', trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => +td.textContent))), [[4, 5, 7, 8], [5, 4, 3, 2]]);
  assert.deepEqual(t.problems, []);
  await t.close();
});
