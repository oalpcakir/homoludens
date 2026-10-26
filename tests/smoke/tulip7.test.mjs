// Tulip 7 on a phone (browser): one whole winter played by taps on a 390x844 touch screen. Checks that nothing
// scrolls sideways, the Take / Stand buttons are big and in the bottom of the screen, the deck stays at 94 cards,
// a reload at the start of an evening resumes, and the game ends with the record the portal reads.
// Run with the other smoke tests: CHROME=/path/to/chrome node --test tests/smoke/*.test.mjs
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

test('Tulip 7: a whole winter on a 390x844 touch phone', { timeout: 420000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tulip7.set', JSON.stringify({ fast: true, help: true, sound: false, mode: 'winter' })); sessionStorage.setItem('seeded', '1'); } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/status of 204/.test(m.text())) problems.push('console: ' + m.text()); });
  await page.goto(srv.url + '/tulip7/');
  await page.waitForTimeout(800);
  await page.locator('#go').tap();

  let checkedButtons = false, reloaded = false, steps = 0, sideways = 0;
  while (steps++ < 3000) {
    const st = await page.evaluate(() => ({
      over: !!(window.G && G.over), modal: !document.querySelector('#modal').hidden, ann: !document.querySelector('#ann').hidden,
      act: !!document.querySelector('#ctrl [data-act]'), cash: !!document.querySelector('#ctrl [data-cash]'), pick: !!document.querySelector('#ctrl [data-pick]'),
      tip: !!document.querySelector('[data-tip]'), cont: !document.querySelector('#modal').hidden && !!document.querySelector('#cont'),
      wide: document.documentElement.scrollWidth - innerWidth, evening: window.G ? G.evening : 0, nums: window.G ? G.players[0].nums.length : 0,
      cards: window.G ? G.draw.length + G.discard.length + G.players.reduce((a, p) => a + p.cards.length + (p.second ? 1 : 0) + (p.bustCard ? 1 : 0), 0) : 94 }));
    if (st.wide > 1) sideways = Math.max(sideways, st.wide);
    if (st.cont) { await page.locator('#cont').tap(); continue; }
    if (st.ann) { await page.locator('#ann').tap(); continue; }
    if (st.modal) { if (st.over) break; await page.locator('#mbox [data-v]').first().tap(); continue; }
    if (st.tip) { await page.locator('[data-tip]').tap(); continue; }
    if (st.pick) { await page.locator('#ctrl [data-pick]').first().tap(); continue; }
    if (st.cash) {
      if (!reloaded && st.evening >= 1) { // leave mid-game: the next evening's save brings us back
        await page.locator('#ctrl [data-cash="hold"]').tap();
        await page.waitForFunction(e => JSON.parse(localStorage.getItem('tulip7.save.v1') || '{}').evening > e, st.evening, { timeout: 30000 });
        await page.reload(); await page.waitForTimeout(700);
        assert.ok(await page.locator('#cont').isVisible(), 'no Continue after a reload');
        reloaded = true; continue;
      }
      await page.locator(`#ctrl [data-cash="${steps % 3 ? 'hold' : 'sell'}"]`).tap(); continue;
    }
    if (st.act) {
      assert.equal(st.cards, 94);
      if (!checkedButtons) {
        for (const sel of ['#ctrl [data-act="hit"]', '#ctrl [data-act="stay"]']) {
          const b = await page.locator(sel).boundingBox();
          assert.ok(b.height >= 44 && b.width >= 120, `${sel} too small: ${JSON.stringify(b)}`);
          assert.ok(b.y + b.height <= 844 && b.y > 844 * 0.6, `${sel} not in the bottom of the screen: ${JSON.stringify(b)}`);
        }
        checkedButtons = true;
      }
      await page.locator(`#ctrl [data-act="${st.nums < 3 || steps % 2 ? 'hit' : 'stay'}"]`).tap(); continue;
    }
    await page.waitForTimeout(120);
  }
  assert.ok(await page.evaluate(() => G.over), 'the winter did not finish');
  assert.ok(checkedButtons && reloaded);
  assert.equal(sideways, 0, 'the page scrolled sideways');
  const rec = await page.evaluate(() => [JSON.parse(localStorage.getItem('tulip7.record.v1')), localStorage.getItem('tulip7.save.v1')]);
  assert.equal(rec[0].played, 1); assert.equal(rec[0].winters, 1);
  assert.equal(rec[1], null, 'the save outlived the game');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Tulip 7: a 740x360 landscape phone shows the whole hand and both buttons on your turn', { timeout: 180000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(() => localStorage.setItem('tulip7.set', JSON.stringify({ fast: true, help: true, sound: false, mode: 'winter' })));
  const page = await ctx.newPage();
  const problems = []; page.on('pageerror', e => problems.push(e.message));
  await page.goto(srv.url + '/tulip7/'); await page.waitForTimeout(700);
  await page.locator('#go').tap();
  let turns = 0;
  for (let i = 0; i < 1500 && turns < 4; i++) {
    const st = await page.evaluate(() => ({ ann: !document.querySelector('#ann').hidden, modal: !document.querySelector('#modal').hidden, act: !!document.querySelector('#ctrl [data-act]'),
      cash: !!document.querySelector('#ctrl [data-cash]'), pick: !!document.querySelector('#ctrl [data-pick]'), tip: !!document.querySelector('[data-tip]'), n: window.G ? G.players[0].nums.length : 0 }));
    if (st.ann) { await page.locator('#ann').tap(); continue; }
    if (st.modal) { await page.locator('#mbox [data-v]').first().tap(); continue; }
    if (st.pick) { await page.locator('#ctrl [data-pick]').first().tap(); continue; }
    if (st.cash) { await page.locator('#ctrl [data-cash="hold"]').tap(); continue; }
    if (st.act) {
      await page.waitForTimeout(300);
      const bad = await page.evaluate(() => {
        const R = e => e.getBoundingClientRect(), out = [], hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        const cards = [...document.querySelectorAll('#you [data-part=hand] .card')], btns = [...document.querySelectorAll('#ctrl [data-act]')];
        if (scrollY > 0) out.push('page scrolled');
        for (const c of cards) if (R(c).bottom > innerHeight || R(c).right > innerWidth) out.push('card off screen');
        for (const b of btns) { const r = R(b); if (r.bottom > innerHeight || r.height < 44) out.push('button off screen or small'); }
        for (const o of document.querySelectorAll('.tip, .hlfb-btn, .hlfb-dc')) { if (getComputedStyle(o).display === 'none' || !R(o).width || o.closest('#ctrl')) continue;
          if ([...cards, ...btns].some(x => hit(R(o), R(x)))) out.push('covered by ' + o.className); }
        return out;
      });
      assert.deepEqual(bad, []);
      turns++;
      if (st.tip) { await page.locator('[data-tip]').tap(); continue; }
      await page.locator(`#ctrl [data-act="${st.n < 3 ? 'hit' : 'stay'}"]`).tap(); continue;
    }
    if (st.tip) { await page.locator('[data-tip]').tap(); continue; }
    await page.waitForTimeout(120);
  }
  assert.ok(turns >= 4, 'did not reach four turns');
  assert.deepEqual(problems, []);
  await ctx.close();
});

// "You escapes", "you's", "You has": every host line, rendered for every pairing of you and the traders.
const BAD_YOU = /\b(?:You|you) (?:is|has|was|does|[a-z]+(?:es|[^s'u]s))\b|\b[Yy]ou's\b|, You\b|, you[.?!]/;
test('Tulip 7: every templated line is grammatical when it is about you', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  const page = await ctx.newPage();
  await page.goto(srv.url + '/tulip7/'); await page.waitForTimeout(500);
  const lines = await page.evaluate(() => {
    const you = { human: true, short: 'You' }, a = { short: 'Van Cuyck' }, b = { short: 'De Busscher' }, out = [];
    for (const [k, ts] of Object.entries(LINES)) for (const t of ts) for (const [p, q] of [[you, a], [a, you], [a, b], [you, you]]) out.push(k + ': ' + fill(t, { p, q, v: 'Viceroy' }));
    // the log lines built with fill() too
    for (const t of ['{p} gave a spare Rouwkoop to {q}.', "{p's} spare Rouwkoop is discarded.", '<b>{p}</b> sealed {p:his|your} own evening with Wijnkoop.', "<b>{p}</b> sealed {q's} evening with Wijnkoop.",
      '<b>{p}</b> called the seghsman on {p:himself|yourself}: three more papers.', '<b>{p}</b> {p:holds|hold} f100 of paper.'])
      for (const [p, q] of [[you, a], [a, you]]) out.push(fill(t, { p, q }));
    return out;
  });
  assert.ok(lines.length > 100);
  const bad = lines.filter(l => BAD_YOU.test(l) || /\{|\}/.test(l));
  assert.deepEqual(bad, []);
  assert.ok(lines.some(l => /^saved: Regret money! You escape the duplicate\.$/.test(l)));
  await ctx.close();
});

test('Tulip 7: on short laptop screens your hand and the Take / Stand buttons fit without scrolling', { timeout: 180000 }, async () => {
  for (const [w, h] of [[1280, 650], [1366, 657]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
    await ctx.addInitScript(() => localStorage.setItem('tulip7.set', JSON.stringify({ fast: true, help: true, sound: false, mode: 'winter' })));
    const page = await ctx.newPage();
    await page.goto(srv.url + '/tulip7/'); await page.waitForTimeout(500);
    await page.locator('#go').click();
    let checked = 0;
    for (let i = 0; i < 800 && checked < 3; i++) {
      const st = await page.evaluate(() => ({ ann: !document.querySelector('#ann').hidden, modal: !document.querySelector('#modal').hidden, act: !!document.querySelector('#ctrl [data-act]'),
        cash: !!document.querySelector('[data-cash]'), pick: !!document.querySelector('[data-pick]'), n: G.players[0].nums.length }));
      if (st.ann) { await page.locator('#ann').click(); continue; }
      if (st.modal) { await page.locator('#mbox [data-v]').first().click(); continue; }
      if (st.pick) { await page.locator('[data-pick]').first().click(); continue; }
      if (st.cash) { await page.locator('[data-cash=hold]').click(); continue; }
      if (st.act) {
        await page.waitForTimeout(250);
        const r = await page.evaluate(() => {
          const els = [...document.querySelectorAll('#you [data-part=hand] .card, #ctrl [data-act], #you .plate')];
          return { doc: document.documentElement.scrollHeight, vh: innerHeight, bottom: Math.max(...els.map(e => e.getBoundingClientRect().bottom)),
            tipInYou: !!document.querySelector('#you .tip') };
        });
        assert.ok(r.bottom <= r.vh && r.doc <= r.vh + 1 && !r.tipInYou, `${w}x${h}: ${JSON.stringify(r)}`);
        checked++;
        await page.locator(`[data-act=${st.n < 3 ? 'hit' : 'stay'}]`).click(); continue;
      }
      await page.waitForTimeout(100);
    }
    assert.ok(checked >= 3);
    await ctx.close();
  }
});
