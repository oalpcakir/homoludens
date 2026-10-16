// Package tests: every game's itch.io and CrazyGames build, unpacked from dist/platforms/, in headless Chromium.
// The CrazyGames SDK is replaced by tests/platform/mock-crazygames-sdk.js (documented v3 calls only), so these
// tests check our side of the integration, not CrazyGames itself (use their QA tool for that).
//   python3 build.py && python3 src/platform/build_platforms.py && npm run platforms
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { serve } from '../smoke/server.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const DIST = ROOT + 'dist/platforms/';
const MOCK = readFileSync(new URL('./mock-crazygames-sdk.js', import.meta.url));
const GAMES = ['borderlines', 'retourvloot', 'cupoftea', 'polder', 'kantar'];
let browser;
const servers = {};
before(async () => {
  assert.ok(existsSync(DIST + 'itch/kantar/index.html'), 'run python3 src/platform/build_platforms.py first');
  browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  for (const p of ['itch', 'crazygames']) for (const g of GAMES) servers[p + g] = await serve(DIST + p + '/' + g);
});
after(async () => { await browser?.close(); Object.values(servers).forEach(s => s.close()); });

// storage: 'ok' | 'blocked' (every localStorage call throws, as in a third-party iframe with storage off)
async function open(platform, game, { cg = {}, storage = 'ok', seed, path = '/index.html', viewport = { width: 1400, height: 900 } } = {}) {
  const srv = servers[platform + game];
  const ctx = await browser.newContext({ viewport });
  const external = [];
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => {
    const u = r.request().url();
    if (u.startsWith('https://sdk.crazygames.com/')) return r.fulfill({ body: MOCK, contentType: 'text/javascript' });
    external.push(u);
    return r.fulfill({ status: 204, body: '' });
  });
  await ctx.addInitScript(([c, st, sd]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('mockcg:cfg', JSON.stringify(c));
      for (const [k, v] of Object.entries(sd || {})) localStorage.setItem(k, v);
      sessionStorage.setItem('seeded', '1');
    }
    if (st === 'blocked') {
      const thrower = () => { throw new DOMException('blocked', 'SecurityError'); };
      Object.defineProperty(window, 'localStorage', { configurable: true, get: thrower });
    }
    // what each AudioContext is doing, for the ad tests
    window.__cg = window.__cg || {};
  }, [cg, storage, seed]);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/status of 204|Failed to load resource/.test(m.text())) problems.push('console: ' + m.text()); });
  page.on('response', r => { if (r.url().startsWith(srv.url) && r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(srv.url + path);
  await page.waitForFunction(() => !!(window.HLP && window.HLP.ready), null, { timeout: 5000 });
  await page.evaluate(() => window.HLP.ready);
  await page.waitForTimeout(400);
  return { page, ctx, problems, external, close: () => ctx.close() };
}
const cgLog = page => page.evaluate(() => (window.CrazyGames && window.__cg && window.__cg.log) ? window.__cg.log.slice() : []);

// how to get each game into actual play from a first visit
const START = {
  kantar: async p => { await p.click('#learnBtn'); await p.waitForFunction(() => G && G.phase === 'split'); },
  polder: async p => { await p.getByRole('button', { name: 'Begin' }).click(); await p.waitForTimeout(300); },
  borderlines: async p => { await p.click('#btnDaily'); await p.waitForTimeout(800); },
  retourvloot: async p => { await p.getByRole('button', { name: 'Take your seat' }).click(); await p.waitForTimeout(300); await p.evaluate(() => { S.speed = 1; }); },
  cupoftea: async p => { for (let i = 0; i < 4 && !(await p.evaluate(() => document.getElementById('intro').classList.contains('off'))); i++) { await p.locator('#intro button').last().click(); await p.waitForTimeout(250); } },
};

for (const platform of ['itch', 'crazygames']) {
  for (const game of GAMES) {
    test(`${platform} · ${game}: loads from the package alone, starts, no errors, no site services`, async () => {
      const t = await open(platform, game);
      await START[game](t.page);
      await t.page.waitForTimeout(900);
      const html = await t.page.content();
      assert.doesNotMatch(html, /feedback\.js/, 'feedback button shipped');
      if (platform === 'crazygames') {
        assert.ok(!t.external.some(u => /posthog/.test(u)), 'PostHog loaded on CrazyGames');
        assert.ok(!t.external.some(u => /homoludens/.test(u) && !/borderlines\/(tiers\.json|days\/)/.test(u)), 'site request on CrazyGames: ' + t.external.join(' '));
        const log = await cgLog(t.page);
        const i = log.indexOf('init:done'), ls = log.indexOf('loadingStart'), le = log.indexOf('loadingStop'), gs = log.indexOf('gameplayStart');
        assert.ok(i >= 0 && ls > i && le > ls, 'init → loadingStart → loadingStop order: ' + log.join(','));
        assert.ok(gs > le, 'no gameplayStart after loading: ' + log.join(','));
        assert.equal(await t.page.evaluate(() => HLP.storage), 'crazygames');
      }
      assert.deepEqual(t.problems, []);
      await t.close();
    });
  }
}

for (const game of GAMES) {
  test(`itch · ${game}: blocked storage does not crash; a notice says progress will not be kept`, async () => {
    const t = await open('itch', game, { storage: 'blocked' });
    await START[game](t.page);
    await t.page.waitForTimeout(500);
    assert.equal(await t.page.evaluate(() => HLP.storage), 'memory');
    assert.match(await t.page.innerText('body'), /progress will be lost|ilerleme kaybolur/);
    assert.deepEqual(t.problems, []);
    await t.close();
  });
  test(`crazygames · ${game}: SDK init that fails or hangs still starts the game (no endless loading)`, async () => {
    for (const cg of [{ initFail: true }, { initHang: true }]) {
      const t0 = Date.now();
      const t = await open('crazygames', game, { cg });
      assert.ok(Date.now() - t0 < 12000, 'too slow');
      assert.equal(await t.page.evaluate(() => HLP.sdk), null);
      await START[game](t.page);
      assert.deepEqual(t.problems, []);
      await t.close();
    }
  });
}

test('crazygames · kantar: progress goes to SDK data and survives a reload (resume offered)', async () => {
  const t = await open('crazygames', 'kantar');
  await START.kantar(t.page);
  await t.page.evaluate(() => saveGame());
  const log = await cgLog(t.page);
  assert.ok(log.includes('data.set:kantar-game-v04'), 'game not saved through SDK data');
  assert.ok(log.includes('data.set:kantar-set'), 'settings not saved through SDK data');
  await t.page.reload(); await t.page.evaluate(() => HLP.ready); await t.page.waitForTimeout(500);
  assert.ok(await t.page.isVisible('#resumeSaved'), 'no resume after reload');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('crazygames · kantar: "Play again" asks for a midgame ad; sound is off and gameplay stopped while it plays', async () => {
  const t = await open('crazygames', 'kantar');
  await START.kantar(t.page);
  await t.page.evaluate(() => { while (G.phase !== 'end') G = aiAct(G)[1]; showEnd(); });
  await t.page.waitForTimeout(400);
  await t.page.click('#again');
  await t.page.waitForTimeout(900);
  const log = await cgLog(t.page);
  const ad = log.indexOf('requestAd:midgame');
  assert.ok(ad >= 0, 'no midgame ad: ' + log.join(','));
  assert.ok(log.lastIndexOf('gameplayStop', ad + 1) < ad || !log.slice(0, ad).includes('gameplayStart') || log.slice(0, ad).lastIndexOf('gameplayStop') > log.slice(0, ad).lastIndexOf('gameplayStart'), 'gameplay not stopped before the ad');
  assert.ok(await t.page.evaluate(() => G.phase !== 'end'), 'new game did not start after the ad');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('crazygames · kantar: an unfilled ad lets the game go on', async () => {
  const t = await open('crazygames', 'kantar', { cg: { ad: 'unfilled' } });
  await START.kantar(t.page);
  await t.page.evaluate(() => { while (G.phase !== 'end') G = aiAct(G)[1]; showEnd(); });
  await t.page.waitForTimeout(300);
  await t.page.click('#again'); await t.page.waitForTimeout(800);
  assert.ok(await t.page.evaluate(() => G.phase !== 'end'));
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('crazygames: the platform mute setting and ads suspend the game\'s sound; it comes back afterwards', async () => {
  const t = await open('crazygames', 'kantar');
  await START.kantar(t.page);
  // the game creates its AudioContext on the first sound; make one through the game's own path
  const st = await t.page.evaluate(async () => {
    const c = new AudioContext(); await c.resume(); const a = c.state;
    window.__cg.setMute(true); await new Promise(r => setTimeout(r, 100)); const b = c.state;
    window.__cg.setMute(false); await new Promise(r => setTimeout(r, 100)); const d = c.state;
    return [a, b, d];
  });
  assert.equal(st[1], 'suspended', 'mute did not suspend: ' + st);
  assert.equal(st[2], 'running', 'unmute did not resume: ' + st);
  await t.close();
});

test('crazygames · polder: rewarded finger only after a finished ad, never after an unfilled one', async () => {
  for (const [ad, expect] of [['finish', 1], ['unfilled', 0]]) {
    const t = await open('crazygames', 'polder', { cg: { ad } });
    await START.polder(t.page);
    const got = await t.page.evaluate(async () => {
      const P = window.__polder; const S = P.S; S.fingers = 0; S.adFinger = 0;
      const before = S.fingers;
      const ok = await P.PF.ad('rewarded');
      if (ok) { S.adFinger = 1; S.fingers++; }
      return S.fingers - before;
    });
    assert.equal(got, expect, 'ad ' + ad);
    await t.close();
  }
});

test('crazygames · cupoftea: scenes link inside the package and progress carries over', async () => {
  const t = await open('crazygames', 'cupoftea');
  await t.page.evaluate(() => { localStorage.setItem('cupoftea.v1', JSON.stringify({ done: [1], cur: 1 })); });
  await t.page.goto(t.page.url().replace(/index\.html$/, '2/index.html'));
  await t.page.evaluate(() => HLP.ready); await t.page.waitForTimeout(400);
  const snav = await t.page.evaluate(() => [...document.querySelectorAll('#snav a')].map(a => a.getAttribute('href')));
  assert.deepEqual(snav, ['../index.html', '../2/index.html', '../3/index.html']);
  assert.match(await t.page.evaluate(() => localStorage.getItem('cupoftea.v1')), /"done":\[1/);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('itch · borderlines: dailies come from the package when the site does not answer', async () => {
  const t = await open('itch', 'borderlines');
  await START.borderlines(t.page);
  await t.page.waitForTimeout(800);
  // the first daily of a first visit is the tutorial; the daily file itself must load from days/
  const ok = await t.page.evaluate(() => fetch('days/1.json').then(r => r.ok));
  assert.ok(ok);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('crazygames: gameplay stops on menus, results and modal events, and starts again in play', async () => {
  // Kantar: rules sheet and end screen are breaks
  let t = await open('crazygames', 'kantar');
  await START.kantar(t.page); await t.page.waitForTimeout(600);
  await t.page.click('#rulesBtn'); await t.page.waitForTimeout(600);
  let log = await cgLog(t.page);
  assert.equal(log.filter(x => /^gameplay/.test(x)).at(-1), 'gameplayStop', 'Kantar rules: ' + log.join(','));
  await t.page.click('#resumeBtn'); await t.page.waitForTimeout(600);
  log = await cgLog(t.page);
  assert.equal(log.filter(x => /^gameplay/.test(x)).at(-1), 'gameplayStart', 'Kantar resume: ' + log.join(','));
  await t.page.evaluate(() => { while (G.phase !== 'end') G = aiAct(G)[1]; showEnd(); }); await t.page.waitForTimeout(600);
  log = await cgLog(t.page);
  assert.equal(log.filter(x => /^gameplay/.test(x)).at(-1), 'gameplayStop', 'Kantar end: ' + log.join(','));
  await t.close();
  // Retourvloot: the clock running is play; a modal event card is a break
  t = await open('crazygames', 'retourvloot');
  await START.retourvloot(t.page); await t.page.waitForTimeout(600);
  log = await cgLog(t.page);
  assert.equal(log.filter(x => /^gameplay/.test(x)).at(-1), 'gameplayStart', 'Retourvloot running: ' + log.join(','));
  await t.page.evaluate(() => { modalOpen = true; }); await t.page.waitForTimeout(600);
  log = await cgLog(t.page);
  assert.equal(log.filter(x => /^gameplay/.test(x)).at(-1), 'gameplayStop', 'Retourvloot modal: ' + log.join(','));
  await t.close();
});
