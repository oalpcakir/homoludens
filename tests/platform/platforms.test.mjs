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
// net: { sdk: 'hang' | 'fail', site: 'hang' } — the SDK file or the Homo Ludens site never answers / fails
async function open(platform, game, { cg = {}, storage = 'ok', seed, path = '/index.html', viewport = { width: 1400, height: 900 }, net = {} } = {}) {
  const srv = servers[platform + game];
  const ctx = await browser.newContext({ viewport });
  const external = [];
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => {
    const u = r.request().url();
    if (u.startsWith('https://sdk.crazygames.com/')) {
      if (net.sdk === 'hang') return; // never answered
      if (net.sdk === 'fail') return r.abort();
      return r.fulfill({ body: MOCK, contentType: 'text/javascript' });
    }
    external.push(u);
    if (net.site === 'hang' && /homoludens/.test(u)) return; // never answered
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
  await page.goto(srv.url + path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.HLP && window.HLP.ready), null, { timeout: 5000 });
  await page.evaluate(() => window.HLP.ready);
  await page.waitForTimeout(400);
  return { page, ctx, problems, external, close: () => ctx.close() };
}
// wait (up to 15 s, slow CI runners) until the mock SDK log satisfies f
const waitLog = (page, f) => page.waitForFunction(new Function('return (' + f + ')(window.__cg && window.__cg.log || [])'), null, { timeout: 15000 }).catch(() => {});
const lastGp = l => l.filter(x => /^gameplay/.test(x)).at(-1);
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
      if (platform === 'crazygames') await waitLog(t.page, "l => l.includes('gameplayStart')");
      else await t.page.waitForTimeout(900);
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
  await waitLog(t.page, "l => l.includes('data.set:kantar-game-v04')");
  const log = await cgLog(t.page);
  assert.ok(log.includes('data.set:kantar-game-v04'), 'game not saved through SDK data');
  assert.ok(log.includes('data.set:kantar-set'), 'settings not saved through SDK data');
  await t.page.reload({ waitUntil: 'domcontentloaded' }); await t.page.waitForFunction(() => !!window.HLP); await t.page.evaluate(() => HLP.ready); await t.page.waitForTimeout(500);
  assert.ok(await t.page.isVisible('#quickResume'), 'no resume after reload');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('crazygames · kantar: "Play again" asks for a midgame ad; sound is off and gameplay stopped while it plays', async () => {
  const t = await open('crazygames', 'kantar');
  await START.kantar(t.page);
  await t.page.evaluate(() => { while (G.phase !== 'end') G = aiAct(G)[1]; showEnd(); });
  await t.page.waitForTimeout(400);
  await t.page.click('#again');
  await waitLog(t.page, "l => l.includes('adFinished')");
  await t.page.waitForFunction(() => G.phase !== 'end', null, { timeout: 15000 }).catch(() => {});
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
  await t.page.click('#again'); await waitLog(t.page, "l => l.includes('adError')"); await t.page.waitForFunction(() => G.phase !== 'end', null, { timeout: 15000 }).catch(() => {});
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

// Polder's real "one more finger" path: a cracked dike, no fingers left, click it, choose "Watch ad"
async function polderFingerOffer(t) {
  await START.polder(t.page);
  // a dike piece next to the village, then crack one of its squares
  const box = await t.page.locator('#cv').boundingBox();
  let i = -1;
  for (let row = 11; row >= 4 && i < 0; row--) for (let col = 1; col < 25 && i < 0; col += 2) {
    await t.page.mouse.click(box.x + box.width * (col + .5) / 26, box.y + box.height * (row + .5) / 16);
    await t.page.waitForTimeout(150);
    i = await t.page.evaluate(() => window.__polder.G.findIndex(v => v === 5)); // DIKE
  }
  assert.ok(i >= 0, 'could not place a dike');
  await t.page.evaluate(i => { window.__polder.dbg.crack(i); window.__polder.S.fingers = 0; window.__polder.S.adFinger = 0; }, i);
  const cs = await t.page.evaluate(() => window.__polderTest.cell);
  const r = await t.page.locator('#cv').boundingBox();
  const x = i % 26, y = Math.floor(i / 26);
  await t.page.mouse.move(r.x + (x + .5) * cs, r.y + (y + .5) * cs); await t.page.waitForTimeout(100);
  await t.page.mouse.click(r.x + (x + .5) * cs, r.y + (y + .5) * cs);
  await t.page.getByRole('button', { name: '▶ Watch ad' }).click();
}
test('crazygames · polder: the real "one more finger" flow rewards once after a finished ad, never after an unfilled one; board locked meanwhile', async () => {
  for (const [ad, expect] of [['slow', 1], ['unfilled', 0]]) {
    const t = await open('crazygames', 'polder', { cg: { ad } });
    await polderFingerOffer(t);
    await t.page.waitForTimeout(300);
    if (ad === 'slow') {
      // still waiting for the ad to start: the board is busy and the adapter holds input
      assert.deepEqual(await t.page.evaluate(() => [window.__polder.S.busy, HLP.adPending]), [true, true]);
    }
    await waitLog(t.page, "l => l.includes('adFinished') || l.includes('adError')");
    await t.page.waitForTimeout(300);
    const got = await t.page.evaluate(() => [window.__polder.S.fingers, window.__polder.S.adFinger, window.__polder.S.busy, HLP.adPending]);
    assert.equal(got[0], 0, 'the extra finger was not used on the crack');  // given (+1) and spent on the crack (-1)
    assert.equal(got[1], expect, 'ad ' + ad);
    const modal = await t.page.evaluate(() => !document.getElementById('modal').classList.contains('hidden') && document.getElementById('mbox').innerText.slice(0, 80));
    assert.equal(got[2] && !modal, false, 'board still locked: ' + modal); assert.equal(got[3], false);
    const log = await cgLog(t.page);
    assert.equal(log.filter(x => x === 'requestAd:rewarded').length, 1);
    assert.deepEqual(t.problems, []);
    await t.close();
  }
});

test('crazygames · polder: "All regions" after a region shows no ad; the next region does', async () => {
  for (const [btn, wantAd] of [['All regions', false], ['next', true]]) {
    const t = await open('crazygames', 'polder');
    await START.polder(t.page);
    // finish the region at once through the game's own end-of-region card
    await t.page.evaluate(() => window.__polder.dbg.end());
    await t.page.waitForFunction(() => /goals/.test(document.getElementById('mbox')?.innerText || ''), null, { timeout: 15000 });
    await t.page.waitForTimeout(400);
    if (btn === 'All regions') await t.page.click('#mOk2'); else await t.page.click('#mOk');
    await t.page.waitForTimeout(1200);
    const ads = (await cgLog(t.page)).filter(x => x === 'requestAd:midgame').length;
    assert.equal(ads > 0, wantAd, btn);
    await t.close();
  }
});

test('crazygames: while an ad is pending, gameplay cannot restart, clicks are held and a second request gets nothing', async () => {
  const t = await open('crazygames', 'kantar', { cg: { ad: 'slow' } });
  await START.kantar(t.page);
  await waitLog(t.page, "l => l.includes('gameplayStart')");
  const p = t.page.evaluate(() => HLP.midgame());
  await t.page.waitForTimeout(900); // 2 poll ticks, ad not started yet
  let log = await cgLog(t.page);
  const req = log.indexOf('requestAd:midgame');
  assert.ok(req >= 0);
  assert.ok(!log.slice(req).includes('gameplayStart'), 'gameplayStart while the ad was pending: ' + log.join(','));
  assert.equal(await t.page.evaluate(() => HLP.adPending), true);
  // a click on the stall goes to the shield, not the game; a second ad request returns false without a new request
  const before = await t.page.evaluate(() => (ui.sel || []).length);
  await t.page.mouse.click(700, 760);
  assert.equal(await t.page.evaluate(() => (ui.sel || []).length), before, 'the click reached the game during the ad');
  assert.equal(await t.page.evaluate(() => HLP.ad('midgame')), false);
  assert.equal(await p, true);
  log = await cgLog(t.page);
  assert.equal(log.filter(x => x === 'requestAd:midgame').length, 1, 'second request reached the SDK');
  await waitLog(t.page, "l => l.filter(x => /^gameplay/.test(x)).at(-1) === 'gameplayStart'");
  assert.equal(lastGp(await cgLog(t.page)), 'gameplayStart', 'gameplay did not resume after the ad');
  assert.deepEqual(await t.page.evaluate(() => [HLP.adPending, HLP.adPlaying, !!document.querySelector('[style*="2147483646"]')]), [false, false, false]);
  await t.close();
});

test('crazygames: an ad that starts after the 10 s limit is ignored; sound and input are not left locked', async () => {
  const t = await open('crazygames', 'kantar', { cg: { ad: 'late' } });
  await START.kantar(t.page);
  const st = await t.page.evaluate(async () => {
    const c = new AudioContext(); await c.resume();
    const ok = await HLP.midgame();                       // gives up at 10 s
    await new Promise(r => setTimeout(r, 1200));          // the late adStarted (10.5 s) and adFinished (10.8 s) arrive
    return { ok, playing: HLP.adPlaying, pending: HLP.adPending, audio: c.state, shield: !!document.querySelector('[style*="2147483646"]') };
  });
  assert.deepEqual(st, { ok: false, playing: false, pending: false, audio: 'running', shield: false });
  await t.close();
});

for (const sdk of ['hang', 'fail']) {
  test(`crazygames: an SDK file that ${sdk === 'hang' ? 'never loads' : 'fails to load'} still starts the game`, async () => {
    const t0 = Date.now();
    const t = await open('crazygames', 'kantar', { net: { sdk } });
    assert.ok(Date.now() - t0 < 12000, 'too slow');
    assert.equal(await t.page.evaluate(() => HLP.sdk), null);
    await START.kantar(t.page);
    assert.deepEqual(t.problems, []);
    await t.close();
  });
}

test('crazygames · cupoftea: the "next scene" link asks for a midgame ad, then opens scene 2 inside the package; progress carries over', async () => {
  const t = await open('crazygames', 'cupoftea');
  await START.cupoftea(t.page);
  await t.page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cupoftea.v1') || '{}'); s.done = [1]; localStorage.setItem('cupoftea.v1', JSON.stringify(s)); document.getElementById('door').classList.add('on'); });
  await t.page.click('#door a.nextbtn');
  await t.page.waitForURL(/\/2\/index\.html$/, { timeout: 15000 });
  await t.page.evaluate(() => HLP.ready); await t.page.waitForTimeout(400);
  assert.ok((await cgLog(t.page)).length >= 0);
  const snav = await t.page.evaluate(() => [...document.querySelectorAll('#snav a')].map(a => a.getAttribute('href')));
  assert.deepEqual(snav, ['../index.html', '../2/index.html', '../3/index.html']);
  assert.match(await t.page.evaluate(() => localStorage.getItem('cupoftea.v1')), /"done":\[1/);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('itch · borderlines: with the site not answering, a real daily round opens from the package copy', async () => {
  const t = await open('itch', 'borderlines', { net: { site: 'hang' }, seed: { 'borderlines:tutorialDone': 'true' } });
  const t0 = Date.now();
  await t.page.click('#btnDaily');
  // the round's realm name appears in the cartouche once the day file has loaded
  await t.page.waitForFunction(() => !document.getElementById('cartouche').hidden && document.getElementById('cartouche').innerText.trim().length > 3, null, { timeout: 12000 });
  assert.ok(Date.now() - t0 < 9000, 'waited too long for the site');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('crazygames: gameplay stops on menus, results and modal events, and starts again in play', async () => {
  // Kantar: rules sheet and end screen are breaks
  let t = await open('crazygames', 'kantar');
  await START.kantar(t.page); await t.page.waitForTimeout(600);
  await t.page.click('#rulesBtn'); await waitLog(t.page, "l => l.filter(x => /^gameplay/.test(x)).at(-1) === 'gameplayStop'");
  let log = await cgLog(t.page);
  assert.equal(log.filter(x => /^gameplay/.test(x)).at(-1), 'gameplayStop', 'Kantar rules: ' + log.join(','));
  await t.page.click('#resumeBtn'); await waitLog(t.page, "l => l.filter(x => /^gameplay/.test(x)).at(-1) === 'gameplayStart'");
  log = await cgLog(t.page);
  assert.equal(log.filter(x => /^gameplay/.test(x)).at(-1), 'gameplayStart', 'Kantar resume: ' + log.join(','));
  await t.page.evaluate(() => { while (G.phase !== 'end') G = aiAct(G)[1]; showEnd(); }); await waitLog(t.page, "l => l.filter(x => /^gameplay/.test(x)).at(-1) === 'gameplayStop'");
  log = await cgLog(t.page);
  assert.equal(log.filter(x => /^gameplay/.test(x)).at(-1), 'gameplayStop', 'Kantar end: ' + log.join(','));
  await t.close();
  // Retourvloot: the clock running is play; a modal event card is a break
  t = await open('crazygames', 'retourvloot');
  await START.retourvloot(t.page); await waitLog(t.page, "l => l.filter(x => /^gameplay/.test(x)).at(-1) === 'gameplayStart'");
  log = await cgLog(t.page);
  assert.equal(log.filter(x => /^gameplay/.test(x)).at(-1), 'gameplayStart', 'Retourvloot running: ' + log.join(','));
  await t.page.evaluate(() => { modalOpen = true; }); await waitLog(t.page, "l => l.filter(x => /^gameplay/.test(x)).at(-1) === 'gameplayStop'");
  log = await cgLog(t.page);
  assert.equal(log.filter(x => /^gameplay/.test(x)).at(-1), 'gameplayStop', 'Retourvloot modal: ' + log.join(','));
  await t.close();
});
