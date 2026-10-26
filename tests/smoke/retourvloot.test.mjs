// Retourvloot browser regressions (QA, October 2026): an event card survives a reload, closing a sheet
// keeps a paused game paused, and the keyboard works on cards. Offline like smoke.test.mjs.
//   CHROME=/path/to/chromium node --test tests/smoke/retourvloot.test.mjs
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

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/status of 204/.test(m.text())) problems.push('console: ' + m.text()); });
  await page.goto(srv.url + '/retourvloot/');
  await page.getByRole('button', { name: 'Take your seat' }).click();
  await page.locator('#coach-skip').click();
  return { page, problems, close: () => ctx.close() };
}
const modalTitle = page => page.evaluate(() => document.getElementById('modal').hidden ? null : document.getElementById('m-title').textContent);
const speed = page => page.evaluate(() => S.speed);

test('an event card that is open when the game saves comes back after a reload', async () => {
  const t = await open();
  // jump to the eve of the Banda decision, skipping other cards
  await t.page.evaluate(() => { while (S.t < tOf(1620, 10, 31)) { step(S); while (S.queue.length) resolveEvent(S, S.queue[0], 0); } save(); });
  await t.page.click('.speed button[data-speed="5"]');
  await t.page.waitForFunction(() => !document.getElementById('modal').hidden, null, { timeout: 15000 });
  assert.match(await modalTitle(t.page), /Banda/);
  await t.page.evaluate(() => save()); // what the 5-second autosave does
  await t.page.reload(); await t.page.waitForTimeout(800);
  assert.match(await modalTitle(t.page) || '', /Banda/, 'the card must reopen after a reload');
  await t.page.locator('.sheet .choice').first().click();
  await t.page.locator('#m-go').click();
  assert.equal(await t.page.evaluate(() => S.flags.banda), 'conquest');
  await t.page.click('.speed button[data-speed="0"]');
  await t.page.reload(); await t.page.waitForTimeout(800);
  assert.equal(await modalTitle(t.page), null, 'an answered card does not come back');
  assert.equal(await t.page.evaluate(() => S.flags.banda), 'conquest');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('closing Sources or an audit keeps a paused game paused and a running game running', async () => {
  const t = await open();
  await t.page.click('.speed button[data-speed="15"]');
  await t.page.click('.speed button[data-speed="0"]');
  await t.page.click('#credits'); await t.page.click('#m-go');
  assert.equal(await speed(t.page), 0, 'Sources restarted a paused game');
  await t.page.evaluate(() => { S.auditLast = -1e9; render(); });
  await t.page.click('#audit'); await t.page.click('#m-go');
  assert.equal(await speed(t.page), 0, 'the audit restarted a paused game');
  await t.page.click('.speed button[data-speed="15"]');
  await t.page.click('#credits');
  assert.equal(await speed(t.page), 0, 'Sources pauses');
  await t.page.click('#m-go');
  assert.equal(await speed(t.page), 15, 'a running game resumes at its speed');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('keyboard: Esc closes a sheet, Tab stays inside it, Space pauses', async () => {
  const t = await open();
  await t.page.click('#credits');
  for (let i = 0; i < 8; i++) {
    await t.page.keyboard.press('Tab');
    assert.ok(await t.page.evaluate(() => document.getElementById('sheet').contains(document.activeElement)), 'focus left the sheet');
  }
  await t.page.keyboard.press('Escape');
  assert.equal(await modalTitle(t.page), null);
  await t.page.evaluate(() => document.activeElement.blur());
  await t.page.keyboard.press('Space');
  assert.ok(await speed(t.page) > 0, 'Space starts time');
  await t.page.keyboard.press('Space');
  assert.equal(await speed(t.page), 0, 'Space pauses');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('starting time during the guide ends it instead of leaving a stale step up', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  const page = await ctx.newPage();
  await page.goto(srv.url + '/retourvloot/');
  await page.getByRole('button', { name: 'Take your seat' }).click();
  await page.click('#equip'); // the guide moves on to step 2
  await page.waitForFunction(() => S.tut && !S.tut.done && !document.getElementById('coach').hidden);
  await page.click('.speed button[data-speed="50"]');
  // at 50× an event card may open (and pause) within a few hundred ms, so wait for the guide state, not a fixed time,
  // and accept a pause caused by an event card
  await page.waitForFunction(() => S.tut.done && document.getElementById('coach').hidden, null, { timeout: 5000 });
  assert.ok(await page.evaluate(() => S.speed === 50 || (typeof modalOpen !== 'undefined' && modalOpen)), 'speed was not applied');
  await ctx.close();
});
