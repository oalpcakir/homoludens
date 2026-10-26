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
