// Borderlines regression tests: a daily survives a reload / the Menu button without letting finished rounds be
// replayed, and keys pressed in the site's feedback dialog never reach the game behind it.
//   CHROME=/path/to/chrome node --test tests/smoke/borderlines.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './server.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const D3 = readFileSync(ROOT + 'node_modules/d3/dist/d3.min.js');
const NOW = new Date('2026-10-26T12:00:00+01:00'); // inside the daily schedule (Daily #30)
let srv, browser;

before(async () => {
  srv = await serve(ROOT + 'public');
  browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); srv?.close(); });

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'Europe/Amsterdam' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r =>
    r.request().url().includes('/d3.min.js') ? r.fulfill({ body: D3, contentType: 'text/javascript' }) : r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('borderlines:tutorialDone', 'true'); sessionStorage.setItem('seeded', '1'); } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  await page.goto(srv.url + '/borderlines/');
  await page.waitForFunction(() => !!window.__borderlines);
  return { page, ctx, problems };
}
const S = page => page.evaluate(() => { const s = window.__borderlines.state; return { phase: s.phase, mode: s.mode, round: s.round, scores: s.scores.slice() }; });

// paint a short stroke through the middle of the current realm
async function paint(page) {
  const p = await page.evaluate(() => { const B = window.__borderlines; return B.z().apply(B.path().centroid(B.q().geometry)); });
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x + p[0] - 20, box.y + p[1]); await page.mouse.down();
  for (let i = 0; i < 10; i++) await page.mouse.move(box.x + p[0] - 20 + i * 4, box.y + p[1] + (i % 2 ? 6 : -6));
  await page.mouse.up();
}
async function playRound(page) {
  await paint(page);
  await page.locator('#btnSubmit').click();
  await page.waitForFunction(() => window.__borderlines.state.phase === 'result');
}
async function next(page) { await page.locator('#btnNext').click(); await page.waitForTimeout(150); }

test('Borderlines: a daily resumes after a reload and the Menu button, keeping finished rounds', async () => {
  const { page, ctx, problems } = await open();
  await page.locator('#btnDaily').click();
  await page.locator('#btnSubmit').waitFor({ state: 'visible' });
  await playRound(page); await next(page);
  await playRound(page);
  const done = (await S(page)).scores;
  assert.equal(done.length, 2);

  // reload on the result screen of round 2: the menu offers to continue, and play resumes at round 3
  await page.reload(); await page.waitForFunction(() => !!window.__borderlines);
  assert.match(await page.textContent('#btnDaily'), /Continue Daily #30.*Round 3 of 5/);
  await page.locator('#btnDaily').click();
  await page.locator('#btnSubmit').waitFor({ state: 'visible' });
  let s = await S(page);
  assert.equal(s.round, 2, 'did not resume at round 3');
  assert.deepEqual(s.scores, done, 'finished rounds were not kept');
  assert.match(await page.textContent('#roundLabel'), /3\/5/);

  // round 3, then leave from the middle of round 4 with the Menu button
  await playRound(page); await next(page);
  await paint(page);
  await page.locator('#btnQuit').click();
  assert.equal((await S(page)).phase, 'intro');
  await page.locator('#btnDaily').click();
  await page.locator('#btnSubmit').waitFor({ state: 'visible' });
  s = await S(page);
  assert.equal(s.round, 3, 'Menu lost the run');
  assert.deepEqual(s.scores.slice(0, 2), done);
  const three = s.scores.slice();

  await playRound(page); await next(page);
  await playRound(page); await next(page);
  assert.equal((await S(page)).phase, 'end');
  const ls = await page.evaluate(() => ({ day: JSON.parse(localStorage.getItem('borderlines:day:29')), run: localStorage.getItem('borderlines:run:29') }));
  assert.deepEqual(ls.day.scores.slice(0, 3), three, 'the saved daily does not keep the earlier rounds');
  assert.equal(ls.day.late, false);
  assert.equal(ls.run, null, 'the in-progress save was not cleared');
  assert.match(await page.textContent('#eNext'), /Streak: 1 day · Next challenge in/);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Borderlines: Enter in the feedback dialog does not submit or advance the round', async () => {
  const { page, ctx, problems } = await open();
  await page.locator('#btnPractice').click();
  await page.locator('#btnSubmit').waitFor({ state: 'visible' });
  await paint(page);
  await page.locator('.hlfb-btn').click();
  await page.waitForSelector('.hlfb-ov:not([hidden])');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'hlfb-msg'); // the dialog focuses its text box itself, 30 ms after opening
  await page.locator('.hlfb-cancel').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.hlfb-ov:not([hidden])'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200); // give a wrongly forwarded key time to show
  assert.equal((await S(page)).phase, 'play', 'Enter in the dialog submitted the round');
  assert.equal(await page.locator('.hlfb-ov:not([hidden])').count(), 0, 'Enter on Cancel did not close the dialog');

  await page.locator('#btnSubmit').click();
  await page.waitForFunction(() => window.__borderlines.state.phase === 'result');
  await page.locator('#btnReport').click();
  await page.waitForSelector('.hlfb-ov:not([hidden])');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'hlfb-msg');
  await page.keyboard.press('Backspace'); // typed into the message box, not Undo
  await page.locator('.hlfb-cancel').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.hlfb-ov:not([hidden])'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
  const s = await S(page);
  assert.equal(s.phase, 'result', 'Enter in the dialog moved to the next round');
  assert.equal(s.round, 0);

  // Space activates a focused menu button; Escape leaves the statistics panel
  await page.locator('#btnResMenu').click();
  await page.locator('#btnStats').focus();
  await page.keyboard.press('Space');
  assert.ok(await page.locator('#stats').isVisible(), 'Space did not activate the focused button');
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#intro').isVisible(), 'Escape did not close the statistics');
  assert.deepEqual(problems, []);
  await ctx.close();
});

// ---------------------------------------------------------------- title screen, time-lapse, today's players
const DAY30 = JSON.parse(readFileSync(ROOT + 'public/borderlines/days/30.json', 'utf8'));
async function openWith(seed, routes = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'Europe/Amsterdam' });
  const fetched = [];
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r =>
    r.request().url().includes('/d3.min.js') ? r.fulfill({ body: D3, contentType: 'text/javascript' }) : r.fulfill({ status: 204, body: '' }));
  for (const [re, fn] of Object.entries(routes)) await ctx.route(new RegExp(re), fn);
  await ctx.addInitScript((seed) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('borderlines:tutorialDone', 'true');
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
  }, seed);
  const page = await ctx.newPage();
  page.on('request', r => fetched.push(new URL(r.url()).pathname));
  await page.clock.setFixedTime(NOW);
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  await page.goto(srv.url + '/borderlines/');
  await page.waitForFunction(() => !!window.__borderlines);
  return { page, ctx, problems, fetched };
}
const done = (scores, late = false) => ({ scores, late });

test('Borderlines title screen: today, streak, calendar and best score, with no spoilers', async () => {
  const seed = { 'borderlines:day:27': done([90, 85, 88, 92, 81]), 'borderlines:day:28': done([50, 60, 40, 70, 30]), 'borderlines:day:25': done([10, 20, 30, 40, 50], true),
    'borderlines:run:29': { scores: [70, 60], raw: [70, 60], hints: [], late: false } };
  const { page, ctx, problems, fetched } = await openWith(seed);
  assert.ok(await page.evaluate(() => document.body.classList.contains('home')), 'no title-screen backdrop');
  assert.match(await page.textContent('#btnDaily'), /Daily #30[\s\S]*Continue Daily #30[\s\S]*Round 3 of 5/);
  assert.equal(await page.locator('#dailyPips .pip').count(), 5);
  assert.equal(await page.locator('#dailyPips .pip.done').count(), 2);
  assert.equal(await page.textContent('#hStreak'), '2'); // days 28 and 29 (#29, #28) on time; #26 was late
  assert.equal(await page.textContent('#hBest'), '436');
  assert.equal(await page.textContent('#hPlayed'), '3');
  assert.equal(await page.locator('#hCal i').count(), 35);
  assert.equal(await page.locator('#hCal i.perfect').count(), 1);
  assert.equal(await page.locator('#hCal i.played').count(), 1);
  assert.equal(await page.locator('#hCal i.late').count(), 1);
  assert.equal(await page.locator('#hCal i.miss').count(), 1); // #27, between the first daily played (#26) and today
  assert.equal(await page.locator('#hCal i.open.now').count(), 1);
  // nothing about today's realms on the page before they are played
  const html = await page.content();
  for (const q of DAY30) assert.ok(!html.includes(q.label), 'title screen mentions ' + q.label);
  assert.ok(!fetched.some(p => p.includes('/lapse/')), 'a time-lapse was loaded before any round was played');
  // keyboard: Tab reaches the daily button and Enter starts it
  await page.locator('#btnDaily').focus();
  await page.keyboard.press('Enter');
  await page.locator('#btnSubmit').waitFor({ state: 'visible' });
  assert.equal((await S(page)).round, 2);
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('home'))));
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Borderlines time-lapse: hidden without data, loaded only when opened, scrubbable', async () => {
  const { page, ctx, problems, fetched } = await openWith({});
  const lapseIds = await page.evaluate(() => window.GAME_DATA.lapse);
  assert.ok(!lapseIds.includes('d30-1') && lapseIds.includes('d30-2'), 'test assumes d30-1 has no lapse and d30-2 has one');
  await page.locator('#btnDaily').click();
  await page.locator('#btnSubmit').waitFor({ state: 'visible' });
  await playRound(page);
  assert.ok(await page.locator('#btnLapse').isHidden(), 'control shown for a realm without a time-lapse');
  await next(page);
  await playRound(page);
  assert.ok(!fetched.some(p => p.includes('/lapse/')), 'loaded before it was opened');
  await page.locator('#btnLapse').click();
  await page.locator('#lapseBox').waitFor({ state: 'visible' });
  assert.deepEqual(fetched.filter(p => p.includes('/lapse/')), ['/borderlines/lapse/d30-2.json']);
  const L = JSON.parse(readFileSync(ROOT + 'public/borderlines/lapse/d30-2.json', 'utf8'));
  assert.equal(await page.locator('#topG .lapse-ref').count(), 1);
  await page.locator('#lapsePlay').click(); // pause the autoplay
  await page.locator('#lapseRange').focus();
  await page.keyboard.press('End');
  assert.equal(await page.textContent('#lapseYear'), L.snaps.at(-1).label);
  await page.keyboard.press('Home');
  assert.equal(await page.textContent('#lapseYear'), L.snaps[0].label);
  assert.equal(await page.locator('#lapseScrub .tick.round').count(), 1, "the round's year is not marked");
  assert.equal(await page.evaluate(() => window.__borderlines.state.phase), 'result');
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#lapseBox').isHidden());
  assert.equal(await page.locator('#topG .lapse-g').count(), 0);
  assert.ok(await page.locator('#topG .truth').isVisible());
  await next(page);
  assert.ok(await page.locator('#lapseBox').isHidden());
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Borderlines lapse files: valid, small, and listed in the page', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const dir = ROOT + 'public/borderlines/lapse/';
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const html = readFileSync(ROOT + 'public/borderlines/index.html', 'utf8');
  const listed = JSON.parse(html.match(/"lapse":(\[[^\]]*\])/)[1]);
  assert.deepEqual(listed, files.map(f => f.slice(0, -5)).sort());
  let total = 0;
  for (const f of files) {
    const L = JSON.parse(readFileSync(dir + f, 'utf8'));
    total += statSync(dir + f).size;
    assert.equal(L.id + '.json', f);
    assert.ok(L.snaps.length >= 3 && L.snaps.length <= 8, f);
    const ys = L.snaps.map(s => s.year);
    assert.deepEqual(ys, [...ys].sort((a, b) => a - b), f + ' years out of order');
    assert.ok(ys.includes(L.year), f + " lacks the round's year");
    assert.ok(Math.max(...ys.map(y => Math.abs(y - L.year))) <= 300, f + ' spans too far');
    for (const s of L.snaps) assert.match(s.geometry.type, /^(Multi)?Polygon$/);
  }
  assert.ok(total < 4.5 * 1024 * 1024, `lapse folder is ${Math.round(total / 1024)} KB`);
});

test("Borderlines today's players: percentile and sparkline after a daily, passport stamp, share image", async () => {
  const b = new Array(101).fill(0); b[40] = 3; b[50] = 4; b[60] = 2; b[90] = 1;
  let posted = null;
  const routes = { '/api/borderlines/': r => {
    if (r.request().method() === 'POST') { posted = JSON.parse(r.request().postData()); const me = Math.round(posted.total / 5); const bb = b.slice(); bb[me]++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, day: posted.day, n: 11, b: bb }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, n: 10, b }) });
  } };
  const { page, ctx, problems } = await openWith({ 'borderlines:run:29': { scores: [80, 80, 80, 80], raw: [80, 80, 80, 80], hints: [], late: false } }, routes);
  await page.locator('#btnDaily').click();
  await page.locator('#btnSubmit').waitFor({ state: 'visible' });
  await playRound(page);
  await next(page);
  await page.locator('#ePct').waitFor({ state: 'visible' });
  const total = (await S(page)).scores.reduce((a, c) => a + c, 0);
  assert.deepEqual({ day: posted.day, total: posted.total }, { day: 30, total });
  assert.match(posted.pid, /^[a-z0-9]{6,40}$/);
  assert.match(await page.textContent('#ePct'), /You beat \d+% of today's players/);
  assert.equal(await page.locator('#ePct svg rect').count(), 25);
  const pass = await page.evaluate(() => JSON.parse(localStorage.getItem('hl.passport.v1')));
  assert.equal(pass.games.borderlines.label, `Daily #30 · ${total}/500`);
  assert.equal(pass.games.borderlines.best, total);
  assert.ok(await page.locator('#btnShareImg').isVisible());
  await page.locator('#btnShareImg').click();
  await page.waitForSelector('.hlx-box img[src^="data:image/png"]');
  await page.keyboard.press('Escape');
  // reopening the finished daily asks for the distribution (GET), it never posts again
  posted = null;
  await page.locator('#btnMenu').click();
  await page.locator('#btnDaily').click();
  await page.locator('#ePct').waitFor({ state: 'visible' });
  assert.equal(posted, null);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test("Borderlines today's players: the line stays hidden when the API is off (204)", async () => {
  const { page, ctx, problems } = await openWith({ 'borderlines:run:29': { scores: [80, 80, 80, 80], raw: [80, 80, 80, 80], hints: [], late: false } },
    { '/api/borderlines/': r => r.fulfill({ status: 204, body: '' }) });
  await page.locator('#btnDaily').click();
  await page.locator('#btnSubmit').waitFor({ state: 'visible' });
  await playRound(page);
  await next(page);
  await page.locator('#end').waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
  assert.ok(await page.locator('#ePct').isHidden());
  assert.deepEqual(problems, []);
  await ctx.close();
});
