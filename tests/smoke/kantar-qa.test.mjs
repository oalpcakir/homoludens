// Kantar regressions from the QA pass of 2026-10-27: the rival of a match stays fixed when the settings change
// mid-match, long pass-and-play names fit the ledger and the round banner on a phone, keyboard focus lands on the
// stall at the start and inside the end sheet at the end, and the teacher's seal reason never says "worth it (+0.0)".
// Round 2 (Lighthouse/axe): no inlined images, the pans' glow animates only opacity, ARIA roles and names.
//   CHROME=/path/to/chromium node --test tests/smoke/kantar-qa.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './server.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
let srv, browser;
before(async () => { srv = await serve(ROOT + 'public'); browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] }); });
after(async () => { await browser?.close(); srv?.close(); });

async function open(storage, { viewport = { width: 1366, height: 768 }, touch = false, lang = 'en' } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(([s, lang]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('kantar-lang', lang); if (s) for (const k in s) localStorage.setItem(k, s[k]); sessionStorage.setItem('seeded', '1'); } }, [storage, lang]);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  await page.goto(srv.url + '/kantar/');
  await page.waitForTimeout(600);
  return { page, problems, close: () => ctx.close() };
}
const SET = s => ({ 'kantar-set': JSON.stringify(Object.assign({ snd: false, teach: false, tut: false, diff: 'cirak', mode: 'classic', pv: true }, s)) });
async function playToEnd(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const r = await page.evaluate(() => {
      if (G.phase === 'end') return 'end';
      if (passUp()) { hidePass(); return 'moved'; }
      if (ui.busy || !human(ownerOf(G))) return 'wait';
      const k = children(G), [o] = k[Math.random() * k.length | 0];
      if (G.phase === 'split') { ui.uc = o.piles.length === 3; ui.sel = []; const free = o.idxs.slice();
        o.piles.forEach((p, pan) => p.forEach(c => { const j = free.findIndex(i => G.market[i] === c); ui.sel.push({ mi: free[j], pan }); free.splice(j, 1); })); playerOffer(); }
      else { if (o.cut) playerCut(o.cut[0], o.cut[1]); playerPick(o.pick); }
      return 'moved';
    });
    if (r === 'end') return r;
    await page.waitForTimeout(r === 'moved' ? 200 : 100);
  }
  return 'timeout';
}

test('changing the rival in the settings mid-match keeps this match\'s rival (search, name, save, stats); the next game uses the new one', async () => {
  const t = await open(SET({}));
  const p = t.page;
  await p.click('#quickPlay'); await p.waitForTimeout(400);
  await p.click('#rulesBtn');
  await p.click('.seg[data-set="diff"] button[data-v="usta"]');
  await p.click('#rulesX'); await p.waitForTimeout(200);
  assert.match(await p.innerText('#oppStall h2'), /Apprentice/);
  await p.evaluate(() => { window.__diffs = []; const o = searchJob; window.searchJob = m => { if (m.type === 'ai') window.__diffs.push(m.diff); return o(m); }; });
  // the save keeps the match's rival: after a reload the resumed match is still against the Apprentice
  await p.waitForFunction(() => !ui.busy && human(ownerOf(G)));
  await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('kantar-game-v04')).diff), 'cirak');
  await p.reload(); await p.waitForTimeout(600);
  await p.click('#quickResume');
  assert.equal(await p.evaluate(() => DIFF), 'cirak');
  assert.match(await p.innerText('#oppStall h2'), /Apprentice/);
  await p.evaluate(() => { window.__diffs = []; const o = searchJob; window.searchJob = m => { if (m.type === 'ai') window.__diffs.push(m.diff); return o(m); }; });
  assert.equal(await playToEnd(p), 'end');
  await p.waitForFunction(() => !document.getElementById('endM').classList.contains('hide'), null, { timeout: 10000 });
  assert.deepEqual([...new Set(await p.evaluate(() => window.__diffs))], ['cirak']);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('kantar.stats.v1')).games.map(g => g.diff));
  assert.deepEqual(st, ['cirak']);
  // the next game is against the Master chosen in the settings
  await p.click('#again'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => DIFF), 'usta');
  assert.match(await p.innerText('#oppStall h2'), /Master/);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('pass-and-play with long names: the ledger stays inside its panel and the round banner inside the screen', async () => {
  for (const [viewport, touch] of [[{ width: 360, height: 740 }, true], [{ width: 1366, height: 768 }, false]]) {
    const t = await open(SET({ pnp: true, names: ['Ayşegül Karaca', 'Mustafa Kemal Ö'], mode: 'narh' }), { viewport, touch, lang: 'tr' });
    const p = t.page;
    await p.evaluate(() => { document.getElementById('rules').classList.add('hide'); start(1); hidePass(); });
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const panel = document.querySelector('.ledger-wrap').getBoundingClientRect(), tab = document.getElementById('ledger').getBoundingClientRect();
      const b = document.getElementById('banner'); b.style.animation = 'none'; b.style.opacity = '1';
      const br = b.getBoundingClientRect();
      return { over: tab.right - panel.right, title: document.querySelector('#ledger .lg-pn').title, bl: br.left, br: br.right, W: innerWidth };
    });
    assert.ok(r.over <= 1, `ledger overflows its panel by ${r.over}px at ${viewport.width}`);
    assert.equal(r.title, 'Ayşegül Karaca', 'full name in the tooltip');
    assert.ok(r.bl >= 0 && r.br <= r.W, `banner ${r.bl}..${r.br} leaves the ${r.W}px screen`);
    assert.deepEqual(t.problems, []);
    await t.close();
  }
});

test('keyboard: "Learn with the teacher" puts focus on a good in the stall; the end sheet takes focus', async () => {
  const t = await open(null);
  const p = t.page;
  await p.focus('#learnBtn'); await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.activeElement.matches('#market [data-drag]')), 'focus is not on the stall');
  // the teacher's answer redraws the stall: focus stays on the good (it used to fall back to the page)
  await p.waitForFunction(() => TCH.data, null, { timeout: 15000 });
  await p.waitForTimeout(100);
  assert.ok(await p.evaluate(() => document.activeElement.matches('#market [data-drag]')), 'the redraw dropped the focus');
  // Enter three times: each good goes to the scale and focus moves to the next good, then to "Offer the pans"
  for (let i = 0; i < 3; i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(150); }
  assert.equal(await p.evaluate(() => ui.sel.length + ' ' + document.activeElement.id), '3 offer');
  await p.evaluate(() => setTeach(false));
  assert.equal(await playToEnd(p), 'end');
  await p.waitForFunction(() => !document.getElementById('endM').classList.contains('hide'), null, { timeout: 10000 });
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.id), 'endReview');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('teacher: a seal that gains nothing is not called "worth it (+0.0)"', async () => {
  const t = await open(SET({}));
  const r = await t.page.evaluate(() => [reasonText(['rSealUse', 'kes', 0.01]), reasonText(['rSealUse', 'uc', 1.24])]);
  assert.doesNotMatch(r[0], /worth it|\+0\.0/);
  assert.match(r[0], /about the same/);
  assert.match(r[1], /worth it now \(≈ \+1\.2/);
  await t.close();
});

test('page weight: no inlined images; art comes from img/ (preloaded for the first screen), every image loads, <img> has a size', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(ROOT + 'public/kantar/index.html', 'utf8');
  assert.ok(!/data:image\/(webp|png|jpeg)/.test(html), 'an image is still inlined as a data: URI');
  assert.ok(html.length < 400e3, `page is ${Math.round(html.length / 1024)} KB`);
  for (const f of ['ka_css_bazaar.webp', 'ka_bg_tall.webp', 'ka_scale_beam.webp', 'ka_scale_pan.webp', 'ka_card_S.webp'])
    assert.match(html, new RegExp(`<link rel="preload" as="image" href="img/${f}"`), 'no preload for ' + f);
  const t = await open(SET({ teach: true }), { viewport: { width: 390, height: 844 }, touch: true });
  const p = t.page;
  await p.tap('#quickPlay');
  await p.waitForFunction(() => TCH.data, null, { timeout: 15000 });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => ({ broken: [...document.images].filter(i => i.complete && !i.naturalWidth).map(i => i.src), unsized: [...document.images].filter(i => !i.getAttribute('width') || !i.getAttribute('height')).length,
    card: [...document.images].some(i => /img\/ka_card_[SIKB]\.webp$/.test(i.src)), worker: !!SEARCH.w, local: SEARCH.local }));
  assert.deepEqual(r.broken, []); assert.equal(r.unsized, 0); assert.ok(r.card, 'card art is not from img/');
  assert.ok(r.worker && r.local === 0, 'the search left the worker');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('the pans\' invitation animates only opacity (no filter animation, no backdrop blur under it)', async () => {
  const t = await open(SET({}));
  await t.page.evaluate(() => { document.getElementById('rules').classList.add('hide'); start(0); });
  await t.page.waitForTimeout(400);
  const r = await t.page.evaluate(() => ({ props: [...new Set(document.getAnimations().filter(a => a.animationName === 'panInvite').flatMap(a => a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(x => !['offset', 'easing', 'composite', 'computedOffset'].includes(x)))))],
    n: document.getAnimations().filter(a => a.animationName === 'panInvite').length, panFilter: getComputedStyle(document.getElementById('pan0')).filter, backdrop: getComputedStyle(document.getElementById('counter')).backdropFilter }));
  assert.equal(r.n, 2); assert.deepEqual(r.props, ['opacity']);
  assert.equal(r.panFilter, 'none', 'a filter on the pan would be re-applied every frame');
  assert.equal(r.backdrop, 'none');
  await t.close();
});

test('accessibility: pans have a role, card names start with their visible text, both side panels are named, the log scrolls by keyboard', async () => {
  const t = await open(SET({}));
  const p = t.page;
  await p.evaluate(() => { document.getElementById('rules').classList.add('hide'); start(0); });
  await p.waitForTimeout(300);
  const a = await p.evaluate(() => ({ roles: ['pan0', 'pan1'].map(id => document.getElementById(id).getAttribute('role')),
    cards: [...document.querySelectorAll('#market .card')].map(c => [c.getAttribute('aria-label'), c.querySelector('.cp').textContent + ' ' + c.querySelector('.cn').textContent]),
    asides: [...document.querySelectorAll('aside')].map(x => x.getAttribute('aria-label')), log: document.getElementById('log').tabIndex }));
  assert.deepEqual(a.roles, ['group', 'group']);
  for (const [label, visible] of a.cards) assert.ok(label.startsWith(visible), `"${label}" does not start with "${visible}"`);
  assert.deepEqual(a.asides, ['Market', 'Ledger']);
  assert.equal(a.log, 0);
  // a pan you can take is a button
  await p.evaluate(() => { const k = children(G)[0][0]; ui.sel = []; const free = k.idxs.slice(); k.piles.forEach((pp, pan) => pp.forEach(c => { const j = free.findIndex(i => G.market[i] === c); ui.sel.push({ mi: free[j], pan }); free.splice(j, 1); })); playerOffer(); });
  await p.waitForFunction(() => !ui.busy && ownerOf(G) === 0 && G.phase === 'choose', null, { timeout: 15000 });
  assert.deepEqual(await p.evaluate(() => ['pan0', 'pan1'].map(id => document.getElementById(id).getAttribute('role'))), ['button', 'button']);
  assert.deepEqual(t.problems, []);
  await t.close();
});
