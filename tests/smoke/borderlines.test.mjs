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
  assert.ok(await page.locator('#intro').isHidden(), 'the title screen stays open behind the results');
  await page.evaluate(() => localStorage.setItem('borderlines:day:3', JSON.stringify({ scores: [50, 50, 50, 50, 50], late: true })));
  await page.locator('#btnMenu').click();
  await page.locator('#btnArchive').click();
  await page.locator('#aList button[data-view="3"]').click();
  await page.locator('#end').waitFor({ state: 'visible' });
  assert.ok(await page.locator('#archive').isHidden(), 'the archive stays open behind the results');
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

// ---------------------------------------------------------------- QA regressions
test('Borderlines: all five rounds played but the tab closed before the final score: it resumes at the end, never restarts', async () => {
  const run = { scores: [70, 60, 50, 40, 30], raw: [70, 60, 50, 40, 30], hints: [], late: false };
  const { page, ctx, problems } = await openWith({ 'borderlines:run:29': run });
  assert.match(await page.textContent('#btnDaily'), /Continue Daily #30[\s\S]*All 5 rounds played · 250 points[\s\S]*Results/);
  assert.equal(await page.locator('#dailyPips .pip.done').count(), 5);
  await page.locator('#btnDaily').click();
  await page.locator('#end').waitFor({ state: 'visible' });
  const s = await S(page);
  assert.equal(s.phase, 'end', 'the daily restarted from round 1');
  assert.deepEqual(s.scores, run.scores);
  const ls = await page.evaluate(() => ({ day: JSON.parse(localStorage.getItem('borderlines:day:29')), run: localStorage.getItem('borderlines:run:29'), pass: JSON.parse(localStorage.getItem('hl.passport.v1')) }));
  assert.deepEqual(ls.day, { scores: run.scores, late: false });
  assert.equal(ls.run, null);
  assert.equal(ls.pass.games.borderlines.best, 250);
  // the same in the archive, for an older day: "Finish", and it counts as played late
  await page.evaluate(() => localStorage.setItem('borderlines:run:20', JSON.stringify({ scores: [10, 20, 30, 40, 50], hints: [] })));
  await page.locator('#btnMenu').click();
  await page.locator('#btnArchive').click();
  await page.locator('#aList button[data-play="20"]', { hasText: 'Finish' }).click();
  await page.locator('#end').waitFor({ state: 'visible' });
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('borderlines:day:20'))), { scores: [10, 20, 30, 40, 50], late: true });
  assert.deepEqual(problems, []);
  await ctx.close();
});

test("Borderlines share image: a daily's card never names its realms (the people it is sent to may not have played it)", async () => {
  const { page, ctx, problems } = await openWith({ 'borderlines:run:29': { scores: [80, 80, 80, 80], raw: [80, 80, 80, 80], hints: [], late: false } });
  await page.evaluate(() => { window.__shared = []; window.HL.share = (o) => { window.__shared.push(o); return Promise.resolve(true); }; });
  await page.locator('#btnDaily').click();
  await page.locator('#btnSubmit').waitFor({ state: 'visible' });
  await playRound(page);
  await next(page);
  await page.locator('#btnShareImg').click();
  const shared = await page.evaluate(() => window.__shared);
  assert.equal(shared.length, 1);
  const card = JSON.stringify(shared[0]);
  for (const q of DAY30) assert.ok(!card.includes(q.label), 'the share card names ' + q.label);
  assert.match(shared[0].lines.join(' '), /Easy 80/);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Borderlines title screen: moves on to the new daily after midnight, and the drifting map never scrolls the page', async () => {
  const { page, ctx, problems } = await openWith({ 'borderlines:day:29': done([50, 50, 50, 50, 50]) });
  assert.match(await page.textContent('#dailyKick'), /Daily #30/);
  assert.match(await page.textContent('#dailyTitle'), /Done/);
  await page.evaluate(() => { scrollTo(200, 200); document.scrollingElement.scrollLeft = 200; });
  assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), [0, 0], 'the title screen scrolled');
  await page.clock.setFixedTime(new Date(NOW.getTime() + 13 * 3600e3)); // 01:00 the next day
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.match(await page.textContent('#dailyKick'), /Daily #31/);
  assert.match(await page.textContent('#dailyTitle'), /Today's challenge/);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test("Borderlines on a phone: the tutorial realm and a round's answer are framed in the free strip of map, not under the cards", async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Amsterdam' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r =>
    r.request().url().includes('/d3.min.js') ? r.fulfill({ body: D3, contentType: 'text/javascript' }) : r.fulfill({ status: 204, body: '' }));
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  await page.goto(srv.url + '/borderlines/');
  await page.waitForFunction(() => !!window.__borderlines);
  await page.locator('#btnDaily').click();
  await page.locator('#coach').waitFor({ state: 'visible' });
  await page.waitForTimeout(900); // the zoom transition
  const r = await page.evaluate(() => {
    const B = window.__borderlines, [[x0, y0], [x1, y1]] = B.path().bounds(B.q().geometry), z = B.z();
    const st = document.getElementById('stage').getBoundingClientRect();
    return { top: z.applyY(y0) + st.top, bottom: z.applyY(y1) + st.top, coach: document.getElementById('coach').getBoundingClientRect().bottom, tools: document.getElementById('tools').getBoundingClientRect().top, label: B.q().label };
  });
  assert.equal(r.label, 'Australia');
  assert.ok(r.top >= r.coach && r.bottom <= r.tools, `Australia spans ${Math.round(r.top)}–${Math.round(r.bottom)}px, the free gap is ${Math.round(r.coach)}–${Math.round(r.tools)}px`);
  // after Submit the answer is framed above the result card, not under it
  await paint(page);
  await page.locator('#btnSubmit').click();
  await page.waitForFunction(() => window.__borderlines.state.phase === 'result');
  await page.waitForTimeout(900);
  const q = await page.evaluate(() => {
    const t = document.querySelector('#topG .truth').getBoundingClientRect();
    return { top: t.top, bottom: t.bottom, card: document.getElementById('cartouche').getBoundingClientRect().bottom, result: document.getElementById('result').getBoundingClientRect().top };
  });
  assert.ok(q.top >= q.card - 1 && q.bottom <= q.result + 1, `the answer spans ${Math.round(q.top)}–${Math.round(q.bottom)}px, the free gap is ${Math.round(q.card)}–${Math.round(q.result)}px`);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Borderlines keyboard: focus follows to the next screen when the button used disappears (final score, Menu, Archive)', async () => {
  const { page, ctx, problems } = await openWith({ 'borderlines:run:29': { scores: [80, 80, 80, 80], raw: [80, 80, 80, 80], hints: [], late: false }, 'borderlines:day:2': done([50, 50, 50, 50, 50], true) });
  const active = () => page.evaluate(() => document.activeElement.id || document.activeElement.tagName);
  assert.equal(await active(), 'BODY', 'the first load should not grab focus');
  await page.locator('#btnDaily').focus(); await page.keyboard.press('Enter');
  await page.locator('#btnSubmit').waitFor({ state: 'visible' });
  await paint(page);
  await page.keyboard.press('Enter'); // submit
  await page.waitForFunction(() => window.__borderlines.state.phase === 'result');
  await page.keyboard.press('Enter'); // see final score
  await page.locator('#end').waitFor({ state: 'visible' });
  assert.equal(await active(), 'end');
  await page.locator('#btnMenu').focus(); await page.keyboard.press('Enter');
  assert.equal(await active(), 'btnDaily');
  await page.locator('#btnArchive').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('#aList')), true);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Borderlines load: the base map comes from a cached map.json (not inline script), D3 is deferred, labels match the visible text', async () => {
  const html = readFileSync(ROOT + 'public/borderlines/index.html', 'utf8');
  assert.ok(html.length < 300 * 1024, `page is ${Math.round(html.length / 1024)} KB`);
  assert.ok(!/"land":/.test(html) && !/"pool":/.test(html), 'map data is still inline');
  assert.match(html, /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/d3\/7\.9\.0\/d3\.min\.js" defer><\/script>/);
  const m = html.match(/mapUrl: "\/borderlines\/map\.json\?v=([0-9a-f]{10})"/);
  assert.ok(m, 'no versioned mapUrl');
  const map = JSON.parse(readFileSync(ROOT + 'public/borderlines/map.json', 'utf8'));
  assert.deepEqual(Object.keys(map).sort(), ['lakes', 'land', 'pool', 'rivers']);
  const { page, ctx, problems, fetched } = await openWith({});
  assert.ok(fetched.includes('/borderlines/map.json'), 'map.json not fetched');
  assert.ok(await page.locator('#baseG path.land').count() === 1, 'the map did not draw');
  assert.equal(await page.getAttribute('#stage', 'role'), 'region');
  assert.match(await page.getAttribute('#btnDaily', 'aria-label'), /\. Play$/);
  assert.deepEqual(problems, []);
  await ctx.close();
  // without the map file the title screen says so and offers a retry
  const bad = await openWithRaw(r => r.fulfill({ status: 503, body: '' }));
  assert.match(await bad.page.textContent('#dailyTitle'), /couldn't load/);
  await bad.ctx.close();
});
async function openWithRaw(mapRoute) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r =>
    r.request().url().includes('/d3.min.js') ? r.fulfill({ body: D3, contentType: 'text/javascript' }) : r.fulfill({ status: 204, body: '' }));
  await ctx.route(/\/borderlines\/map\.json/, mapRoute);
  const page = await ctx.newPage();
  await page.goto(srv.url + '/borderlines/');
  await page.waitForTimeout(800);
  return { page, ctx };
}

test('_headers: valid rules (one splat each, no two Cache-Control rules for one path) and the intended cache lifetimes', () => {
  const lines = readFileSync(ROOT + 'public/_headers', 'utf8').split('\n');
  const rules = []; let cur = null;
  for (const l of lines) {
    if (!l.trim() || l.startsWith('#')) continue;
    if (!/^\s/.test(l)) { cur = { path: l.trim(), h: {} }; rules.push(cur); continue; }
    const [k, ...v] = l.trim().split(':'); cur.h[k.trim().toLowerCase()] = v.join(':').trim();
  }
  for (const r of rules) assert.ok((r.path.match(/\*/g) || []).length <= 1, 'more than one splat: ' + r.path);
  const re = (p) => new RegExp('^' + p.replace(/[.?+^$()|[\]\\]/g, '\\$&').replace(/:[a-z_]+/g, '[^/]+').replace(/\*/g, '.*') + '$');
  const cc = (url) => rules.filter(r => r.h['cache-control'] && re(r.path).test(url)).map(r => r.h['cache-control']);
  const want = { '/': /max-age=300, must-revalidate/, '/borderlines/': /max-age=300/, '/cupoftea/2/': /max-age=300/, '/hl.js': /max-age=300/, '/next.js': /max-age=300/, '/feedback.js': /max-age=300/, '/games.json': /max-age=300/,
    '/tulip7/img/portal-plate.jpg': /max-age=2592000/, '/shots/kantar.jpg': /max-age=2592000/, '/og-polder.jpg': /max-age=2592000/, '/borderlines/og/250.png': /max-age=2592000/,
    '/borderlines/days/12.json': /max-age=604800/, '/borderlines/lapse/d1-1.json': /max-age=604800/, '/borderlines/map.json': /max-age=/ };
  for (const [u, w] of Object.entries(want)) { const c = cc(u); assert.equal(c.length, 1, u + ' matches ' + c.length + ' Cache-Control rules'); assert.match(c[0], w, u); }
  assert.ok(rules.length <= 100);
});
