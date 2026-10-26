// Kantar's search in a Web Worker: a full game is played through the worker (AI and teacher), the worker answers
// like the page's own copy of the engine, stale answers are dropped on a restart, and without Worker the game still
// plays on the main thread.   CHROME=/path/to/chromium node --test tests/smoke/kantar-worker.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './server.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
let srv, browser;
before(async () => { srv = await serve(ROOT + 'public'); browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] }); });
after(async () => { await browser?.close(); srv?.close(); });

async function open({ noWorker = false, csp = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  if (csp) await ctx.route(/\/kantar\/$/, async r => { const res = await r.fetch(); r.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } }); });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('kantar-set', JSON.stringify({ snd: false, teach: true, tut: false, diff: 'usta', mode: 'narh' })); sessionStorage.setItem('seeded', '1'); } });
  if (noWorker) await ctx.addInitScript(() => { window.Worker = undefined; });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(srv.url + '/kantar/');
  await page.waitForTimeout(500);
  return { page, problems, close: () => ctx.close() };
}

// the player's side: play the teacher's suggestion (so every teacher answer is used), or a random legal move
async function playToEnd(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const r = await page.evaluate(() => {
      if (G.phase === 'end') return 'end';
      if (ui.busy || ownerOf(G) !== 0) return 'wait';
      if (teachMode) { if (!TCH.data || TCH.key !== stateKey(G)) return 'wait'; const ph = G.phase; applySuggestion(); if (ph === 'split') playerOffer(); return 'moved'; }
      const k = children(G), [o] = k[Math.random() * k.length | 0];
      if (G.phase === 'split') { ui.uc = o.piles.length === 3; ui.sel = []; const free = o.idxs.slice();
        o.piles.forEach((p, pan) => p.forEach(c => { const j = free.findIndex(i => G.market[i] === c); ui.sel.push({ mi: free[j], pan }); free.splice(j, 1); })); playerOffer(); }
      else { if (o.cut) playerCut(o.cut[0], o.cut[1]); playerPick(o.pick); }
      return 'moved';
    });
    if (r === 'end') return true;
    await page.waitForTimeout(r === 'moved' ? 700 : 100);
  }
  return false;
}
const start = page => page.evaluate(() => { document.getElementById('rules').classList.add('hide'); start(0); });

test('a full Master game with the teacher runs through the worker, without errors', async () => {
  const t = await open();
  await start(t.page);
  assert.ok(await playToEnd(t.page), 'game did not finish');
  await t.page.waitForFunction(() => !document.getElementById('endM').classList.contains('hide'), null, { timeout: 8000 });
  const s = await t.page.evaluate(() => ({ w: !!SEARCH.w, off: SEARCH.off, jobs: SEARCH.jobs, local: SEARCH.local, turn: G.turn }));
  assert.equal(s.w, true, 'no worker'); assert.equal(s.off, false); assert.equal(s.local, 0, 'searched on the main thread');
  assert.ok(s.jobs >= 10, `only ${s.jobs} jobs`); assert.equal(s.turn, 6);
  // the worker and the page's own engine agree on fresh positions
  const same = await t.page.evaluate(async () => {
    let bad = 0;
    for (let g = 0; g < 6; g++) { let s = newGame(g % 2, g % 3 ? 'narh' : 'classic', false);
      while (s.phase !== 'end') {
        const m = { type: 'ai', s, diff: g % 2 ? 'cirak' : 'usta', seed: g * 1000 + s.turn };
        if (JSON.stringify(await searchJob(m)) !== JSON.stringify(runJob(m))) bad++;
        if ((s.phase === 'choose' ? 1 - s.splitter : s.splitter) === 0 && JSON.stringify(await searchJob({ type: 'teach', s })) !== JSON.stringify(runJob({ type: 'teach', s }))) bad++;
        const k = children(s); s = k[Math.random() * k.length | 0][1]; } }
    return bad;
  });
  assert.equal(same, 0);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('the rival "weighs" while the worker searches; a restart meanwhile drops the old answer', async () => {
  const t = await open();
  await t.page.evaluate(() => { set.teach = false; document.getElementById('rules').classList.add('hide'); start(1); });
  assert.match(await t.page.innerText('#prompt'), /rival/i, 'no thinking note');
  await t.page.evaluate(() => start(0)); // the rival's first split is still pending
  await t.page.waitForTimeout(2500);
  const s = await t.page.evaluate(() => ({ phase: G.phase, turn: G.turn, splitter: G.splitter, busy: ui.busy, logs: logs.length }));
  assert.deepEqual(s, { phase: 'split', turn: 0, splitter: 0, busy: false, logs: 0 }, 'a stale rival move was applied');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('without Worker the same game plays on the main thread', async () => {
  const t = await open({ noWorker: true });
  await t.page.evaluate(() => { set.teach = false; set.diff = 'cirak'; });
  await start(t.page);
  assert.ok(await playToEnd(t.page), 'game did not finish');
  const s = await t.page.evaluate(() => ({ w: SEARCH.w, off: SEARCH.off, local: SEARCH.local }));
  assert.equal(s.w, null); assert.equal(s.off, true); assert.ok(s.local > 0);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('a CSP that blocks blob: workers falls back to the main thread', async () => {
  const t = await open({ csp: "worker-src 'none'" });
  await t.page.evaluate(() => { set.teach = false; set.diff = 'cirak'; });
  await start(t.page);
  await t.page.waitForFunction(() => G.splitter === 0 && G.phase === 'split' && !ui.busy && logs.length === 0);
  await t.page.evaluate(() => { const k = children(G)[0][0]; ui.sel = []; const free = k.idxs.slice();
    k.piles.forEach((p, pan) => p.forEach(c => { const j = free.findIndex(i => G.market[i] === c); ui.sel.push({ mi: free[j], pan }); free.splice(j, 1); })); playerOffer(); });
  await t.page.waitForFunction(() => G.turn === 1 && logs.some(e => e.k === 'take' && e.who === 1), null, { timeout: 20000 });
  assert.deepEqual(await t.page.evaluate(() => [SEARCH.w, SEARCH.off, SEARCH.local > 0]), [null, true, true]);
  await t.close();
});
