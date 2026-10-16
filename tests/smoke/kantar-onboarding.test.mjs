// Kantar first-visit flow in a real browser: the short welcome, "Learn as you play", and that saved
// settings, broken settings and a game in progress still get the detailed set-up screen.
//   npm run smoke
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './server.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
let srv, browser;
before(async () => { srv = await serve(ROOT + 'public'); browser = await chromium.launch({ executablePath: process.env.CHROME || undefined }); });
after(async () => { await browser?.close(); srv?.close(); });

async function open({ storage, viewport = { width: 1400, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  if (storage) await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, storage);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  await page.goto(srv.url + '/kantar/');
  await page.waitForTimeout(700);
  return { page, problems, close: () => ctx.close() };
}
const settings = page => page.evaluate(() => JSON.parse(localStorage.getItem('kantar-set') || 'null'));

test('first visit: short welcome with "Learn with the teacher" in view, details closed, gentle defaults', async () => {
  for (const viewport of [{ width: 1400, height: 900 }, { width: 375, height: 700 }]) {
    const t = await open({ viewport });
    assert.ok(await t.page.isVisible('#welcome'), 'welcome hidden');
    assert.ok(await t.page.isVisible('#learnBtn'), 'learn button hidden');
    const r = await t.page.evaluate(() => { const b = document.getElementById('learnBtn').getBoundingClientRect(); return { bottom: b.bottom, vh: innerHeight }; });
    assert.ok(r.bottom <= r.vh, `learn button below the fold at ${viewport.width}px`);
    assert.equal(await t.page.evaluate(() => document.getElementById('setupDetails').open), false);
    assert.deepEqual(await t.page.evaluate(() => [set.diff, set.mode, set.teach]), ['cirak', 'classic', true]);
    assert.deepEqual(t.problems, []);
    await t.close();
  }
});

test('"Learn with the teacher" starts Apprentice, Classic, teacher, teaching round, preview; player divides first; sound kept', async () => {
  const t = await open({ storage: { 'kantar-lang': 'en' } });
  await t.page.evaluate(() => { set.snd = false; });
  await t.page.click('#learnBtn');
  await t.page.waitForFunction(() => typeof G !== 'undefined' && G && G.phase === 'split');
  const s = await settings(t.page);
  assert.equal(s.diff, 'cirak'); assert.equal(s.mode, 'classic'); assert.equal(s.teach, true); assert.equal(s.tut, true); assert.equal(s.pv, true);
  assert.equal(s.snd, false, 'sound preference overwritten');
  assert.deepEqual(await t.page.evaluate(() => [G.splitter, G.mode, G.tut]), [0, 'classic', true]);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('saved settings: the start sheet offers "Play" with them (and names them); the options are one click away', async () => {
  const t = await open({ storage: { 'kantar-set': JSON.stringify({ diff: 'usta', mode: 'narh', teach: false, snd: false, tut: false, pv: false }) } });
  assert.ok(await t.page.isVisible('#quickPlay'), 'no Play button');
  assert.equal(await t.page.isVisible('#welcomeSteps'), false, 'first-visit steps shown again');
  assert.match(await t.page.innerText('#startNote'), /Master · Narh · teacher off/);
  assert.equal(await t.page.evaluate(() => document.getElementById('setupDetails').open), false);
  await t.page.click('#setupDetails summary');
  assert.ok(await t.page.isVisible('#playBtn'), 'options did not open');
  await t.page.click('#quickPlay');
  await t.page.waitForFunction(() => typeof G !== 'undefined' && G && G.phase && started);
  assert.deepEqual(await t.page.evaluate(() => [G.mode, set.diff, set.teach]), ['narh', 'usta', false]);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('first visit: "Play without the teacher" starts the same gentle game with the teacher off', async () => {
  const t = await open();
  await t.page.click('#noTeachBtn');
  await t.page.waitForFunction(() => typeof G !== 'undefined' && G && G.phase === 'split' && started);
  assert.deepEqual(await t.page.evaluate(() => [set.teach, teachMode, set.diff, G.mode, !!document.querySelector('#teacher.on')]), [false, false, 'cirak', 'classic', false]);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('teacher box: the move and one reason; the rest fold out and stay open across moves', async () => {
  const t = await open();
  await t.page.click('#learnBtn');
  await t.page.waitForFunction(() => !!document.querySelector('#teacher .t-rec:not(.muted)'), null, { timeout: 15000 });
  assert.equal(await t.page.locator('#teacher .t-main').count(), 1, 'no main reason line');
  const more = t.page.locator('#teacher details.t-more');
  if (await more.count()) {
    assert.equal(await more.evaluate(d => d.open), false, 'extra reasons open by default');
    await more.locator('summary').click(); await t.page.waitForTimeout(200);
    assert.ok(await t.page.evaluate(() => TCH.open), 'open state not kept');
  }
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('broken settings fall back to the first-visit welcome without errors', async () => {
  for (const bad of ['{not json', '[1,2]', '"text"']) {
    const t = await open({ storage: { 'kantar-set': bad } });
    assert.ok(await t.page.isVisible('#learnBtn'), 'no welcome for ' + bad);
    assert.deepEqual(await t.page.evaluate(() => [set.diff, set.mode]), ['cirak', 'classic']);
    assert.deepEqual(t.problems, []);
    await t.close();
  }
});

test('a game in progress: "Continue your match" first; Rules reopens the full set-up; language switch translates it', async () => {
  const t = await open();
  await t.page.click('#learnBtn');
  await t.page.waitForFunction(() => typeof G !== 'undefined' && G && G.phase === 'split' && !ui.busy);
  await t.page.evaluate(() => saveGame());
  await t.page.reload(); await t.page.waitForTimeout(700);
  assert.ok(await t.page.isVisible('#quickResume'), 'no continue button');
  assert.equal(await t.page.isVisible('#learnBtn'), false);
  assert.match(await t.page.innerText('#startNote'), /round 1 of 6/);
  await t.page.click('#quickResume'); await t.page.waitForTimeout(500);
  assert.ok(await t.page.evaluate(() => started && document.getElementById('rules').classList.contains('hide')), 'match not resumed');
  await t.page.click('#rulesBtn'); await t.page.waitForTimeout(300);
  assert.equal(await t.page.isVisible('#welcome'), false);
  assert.equal(await t.page.evaluate(() => document.getElementById('setupDetails').open), true);
  await t.page.selectOption('#languageSelect', 'tr'); await t.page.waitForTimeout(300);
  assert.match(await t.page.innerText('#setupDetails summary'), /Ayarlar ve tüm kurallar/);
  assert.deepEqual(t.problems, []);
  await t.close();
});
