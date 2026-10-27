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
  // the end screen: the price curve, drawn in, with its line of commentary, the passport stamp and the share sheet
  await page.waitForSelector('#cbox svg.pc', { timeout: 10000 });
  await page.waitForTimeout(2600); // the lines draw in
  const end = await page.evaluate(() => {
    const svg = document.querySelector('#cbox svg.pc'), r = svg.getBoundingClientRect();
    return { line: document.querySelector('#cline').textContent, w: r.width, right: r.right, vw: innerWidth, wide: document.documentElement.scrollWidth - innerWidth,
      title: svg.querySelector('title').textContent, desc: svg.querySelector('desc').textContent.length, text: document.querySelectorAll('.ctext li').length,
      ticks: [...svg.querySelectorAll('.tx')].map(t => t.textContent), marks: svg.querySelectorAll('.mk').length,
      drawn: getComputedStyle(svg.querySelector('.gidx')).strokeDashoffset,
      you: !!svg.querySelector('.tyou'), sold: G.sales.some(x => x.i === 0),
      nod: document.querySelector('.facts li.nod')?.innerHTML || '', stamp: JSON.parse(localStorage.getItem('hl.passport.v1') || '{}').games?.tulip };
  });
  assert.match(end.line, /^You (sold at evening|cashed in at evening|held to the end|never held paper)/);
  assert.ok(end.w >= 320 && end.right <= end.vw && end.wide <= 0, `chart does not fit: ${JSON.stringify(end)}`);
  assert.ok(end.title && end.desc > 200 && end.text >= 5);
  assert.deepEqual(end.ticks.slice(0, 8), ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']);
  assert.ok(end.marks >= 1 && parseFloat(end.drawn) === 0, 'the index line did not draw in');
  assert.equal(end.you, end.sold);
  assert.match(end.nod, /href="\/retourvloot\/"/);
  assert.equal(end.stamp.plays, 1); assert.ok(/^Winter of 1636: f[\d,]+, \d(st|nd|rd|th) of 4$/.test(end.stamp.label), end.stamp.label);
  await page.locator('#bShare').tap();
  await page.waitForSelector('.hlx-ov img[src]', { timeout: 10000 });
  const sheet = await page.evaluate(() => ({ h: document.querySelector('.hlx-ov h2').textContent, img: document.querySelector('.hlx-ov img').naturalWidth }));
  assert.equal(sheet.h, 'Share your result'); assert.equal(sheet.img, 1200);
  assert.deepEqual(problems, []);
  await ctx.close();
});

// The end screen's cross-game line: a note about your Retourvloot company if you have one, and no share button or
// Retourvloot link on CrazyGames.
test('Tulip 7: end screen notes Retourvloot, and hides the share button and the link on CrazyGames', { timeout: 120000 }, async () => {
  const finish = async (init) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
    await ctx.addInitScript(init);
    const page = await ctx.newPage(); const problems = []; page.on('pageerror', e => problems.push(e.message));
    await page.goto(srv.url + '/tulip7/'); await page.waitForTimeout(500);
    await page.evaluate(async () => { // a winter played by four bots, then the real end screen
      closeModal();
      const bot = { hitOrStay: (g, p) => T7.AI.hitOrStay(g, p), sell: (g, p) => T7.AI.sell(g, p), target: (g, p, c, cs) => T7.AI.target(g, p, c, cs), giveSecond: (g, p, cs) => T7.AI.giveSecond(g, p, cs) };
      G = new T7.Game({ mode: 'winter', seed: 21, players: [{ name: 'You', short: 'You', human: true, style: 'balanced', agent: bot }, ...RIVALS.map(r => ({ ...r, agent: bot }))], emit: () => {} });
      await G.run(); buildSeats(); render(); endScene();
    });
    await page.waitForSelector('#cbox svg.pc');
    const r = await page.evaluate(() => ({ nod: document.querySelector('.facts li.nod')?.textContent || '', link: !!document.querySelector('.facts a[href="/retourvloot/"]'),
      share: getComputedStyle(document.querySelector('#bShare')).display !== 'none' }));
    await ctx.close(); return { ...r, problems };
  };
  const rv = await finish(() => localStorage.setItem('retourvloot.runs', '[]'));
  assert.equal(rv.nod, "Your Retourvloot company was trading in Amsterdam that winter: VOC shares, not tulips, were the city's other paper market.");
  assert.ok(!rv.link && rv.share); assert.deepEqual(rv.problems, []);
  const cg = await finish(() => { window.HL_PLATFORM = { id: 'crazygames' }; });
  assert.ok(!cg.nod && !cg.link && !cg.share, JSON.stringify(cg)); assert.deepEqual(cg.problems, []);
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
    for (const [k, ts] of Object.entries(LINES)) for (const t of ts) for (const [p, q] of [[you, a], [a, you], [a, b], [you, you]]) out.push(k + ': ' + fill(t, { p, q, v: 'Switsers' }));
    // the log lines built with fill() too
    for (const t of ['{p} gave a spare Rouwkoop to {q}.', "{p's} spare Rouwkoop is discarded.", '<b>{p}</b> sealed {p:his|your} own evening with Wijnkoop.', "<b>{p}</b> sealed {q's} evening with Wijnkoop.",
      '<b>{p}</b> called the seghsman on {p:himself|yourself}: three more papers.', '<b>{p}</b> {p:holds|hold} f100 of paper.'])
      for (const [p, q] of [[you, a], [a, you]]) out.push('log: ' + fill(t, { p, q }));
    return out;
  });
  assert.ok(lines.length > 100);
  // also: a sentence that opens with a tag still opens with a capital ("<b>You</b> sealed…", not "<b>you</b>"), and no
  // tulip name is pluralised by an added s ("Two Switserss")
  const bad = lines.filter(l => BAD_YOU.test(l) || /\{|\}/.test(l) || /^\w+: (?:<[^>]+>)*[a-z]/.test(l) || /Switserss/.test(l));
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

// A tablet in portrait (the dock covers the bottom of the page): on your turn the page lifts your hand above the dock,
// the site's round buttons step aside, and the rivals' status chips never sit on their names. On a 360px phone a
// rival's chip keeps its value in sight ("Stood f260", not "Stood up f2…").
test('Tulip 7: on a 768x1024 tablet your hand is in sight on your turn; rival chips are readable on tablet and phone', { timeout: 240000 }, async () => {
  for (const [w, h] of [[768, 1024], [360, 740]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
    await ctx.addInitScript(() => localStorage.setItem('tulip7.set', JSON.stringify({ fast: true, help: true, sound: false, mode: 'winter' })));
    const page = await ctx.newPage();
    const problems = []; page.on('pageerror', e => problems.push(e.message));
    await page.goto(srv.url + '/tulip7/'); await page.waitForTimeout(600);
    await page.locator('#go').tap();
    let turns = 0;
    for (let i = 0; i < 1500 && turns < 4; i++) {
      const st = await page.evaluate(() => ({ ann: !document.querySelector('#ann').hidden, modal: !document.querySelector('#modal').hidden, act: !!document.querySelector('#ctrl [data-act]'),
        cash: !!document.querySelector('#ctrl [data-cash]'), pick: !!document.querySelector('#ctrl [data-pick]'), tip: !!document.querySelector('[data-tip]'), n: G.players[0].nums.length }));
      if (st.ann) { await page.locator('#ann').tap().catch(() => {}); continue; }
      if (st.modal) { await page.locator('#mbox [data-v]').first().tap(); continue; }
      if (st.tip) { await page.locator('[data-tip]').tap(); continue; }
      if (st.pick) { await page.locator('#ctrl [data-pick]').first().tap(); continue; }
      if (st.cash) { await page.locator('#ctrl [data-cash="hold"]').tap(); continue; }
      if (st.act) {
        await page.waitForTimeout(900); // the page scrolls smoothly
        const bad = await page.evaluate(() => {
          const R = e => e.getBoundingClientRect(), out = [], hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
          const dock = R(document.querySelector('#ctrl')), fixed = getComputedStyle(document.querySelector('#ctrl')).position === 'fixed';
          const mine = [...document.querySelectorAll('#you [data-part=hand] .card, #you .plate')];
          if (fixed) for (const c of mine) if (R(c).bottom > dock.top + 1 || R(c).top < 0) out.push('your hand is under the dock or off screen');
          for (const b of document.querySelectorAll('.hlfb-btn, .hlfb-dc')) if (getComputedStyle(b).display !== 'none' && R(b).width && mine.some(c => hit(R(b), R(c)))) out.push('a site button covers your hand');
          for (const s of document.querySelectorAll('.rivals .seat')) { const c = s.querySelector('.chip'), n = s.querySelector('.plate .nm');
            if (c && n && getComputedStyle(c).position === 'absolute' && hit(R(c), R(n))) out.push('a status chip covers a name'); }
          return [...new Set(out)];
        });
        assert.deepEqual(bad, [], `${w}x${h}`);
        turns++;
        await page.locator(`#ctrl [data-act="${st.n < 3 ? 'hit' : 'stay'}"]`).tap(); continue;
      }
      await page.waitForTimeout(100);
    }
    assert.ok(turns >= 4, `${w}x${h}: did not reach four turns`);
    // every kind of rival chip, with a big value, on this screen
    const clipped = await page.evaluate(() => {
      const out = [], cards = [12, 11, 10, 9].map((v, k) => ({ k: 'num', v, uid: 'q' + k }));
      for (const [st, fr] of [['stayed', true], ['stayed', false], ['book', false], ['active', false]]) {
        G.players.slice(1).forEach(p => { p.status = st; p.frozen = fr; p.cards = cards.slice(); p.nums = [12, 11, 10, 9]; p.mods = []; p.x2 = false; });
        G.turn = null; render();
        for (const c of document.querySelectorAll('.rivals .plate .chip')) if (getComputedStyle(c).overflow === 'hidden' && c.scrollWidth > c.clientWidth + 1) out.push(c.textContent);
      }
      return out;
    });
    assert.deepEqual(clipped, [], `${w}x${h}: rival chips cut off`);
    assert.deepEqual(problems, []);
    await ctx.close();
  }
});

// The tavern game's end: the heading names the winner of the game (not "richest"), the share card's headline is about
// you, and in any open window Tab keeps the focus inside it.
test('Tulip 7: the tavern game ends with the right words, and Tab stays inside the end window', { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  const page = await ctx.newPage(); const problems = []; page.on('pageerror', e => problems.push(e.message));
  await page.goto(srv.url + '/tulip7/'); await page.waitForTimeout(500);
  const r = await page.evaluate(async () => {
    closeModal();
    const bot = { hitOrStay: (g, p) => T7.AI.hitOrStay(g, p), sell: (g, p) => T7.AI.sell(g, p), target: (g, p, c, cs) => T7.AI.target(g, p, c, cs), giveSecond: (g, p, cs) => T7.AI.giveSecond(g, p, cs) };
    const out = [];
    for (const seed of [3, 8, 11, 17, 25]) {
      G = new T7.Game({ mode: 'classic', seed, players: [{ name: 'You', short: 'You', human: true, style: 'balanced', agent: bot }, ...RIVALS.map(r => ({ ...r, agent: bot }))], emit: () => {} });
      await G.run(); buildSeats(); render(); endScene();
      for (let k = 0; k < 50 && !document.querySelector('#bShare'); k++) await new Promise(r => setTimeout(r, 20));
      const o = shareOpts();
      out.push({ h2: document.querySelector('#mbox h2').textContent, title: o.title, lines: o.lines, won: G.players[0].total === Math.max(...G.players.map(p => p.total)) });
    }
    return out;
  });
  for (const x of r) {
    assert.match(x.h2, /^(You win|.+ wins) the tavern game\.$/, x.h2);
    assert.ok(!/richest/.test(x.h2));
    if (x.won) assert.equal(x.title, 'Won the tavern game');
    else { assert.match(x.title, /^\d(st|nd|rd|th) place in the tavern game$/); assert.match(x.lines[1], /^.+ won with \d+, in \d+ rounds$/); }
  }
  assert.ok(r.some(x => !x.won), 'no lost game among the seeds');
  // Tab from the last button wraps to the first one in the window; Shift+Tab from the first goes to the last
  const f = await page.evaluate(() => [...document.querySelectorAll('#mbox a[href], #mbox button, #mbox summary')].filter(x => x.getClientRects().length).length);
  assert.ok(f >= 4);
  await page.locator('#mbox [data-v="menu"]').focus();
  for (let i = 0; i < f + 2; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.querySelector('#mbox').contains(document.activeElement)), 'Tab left the end window');
  }
  assert.deepEqual(problems, []);
  await ctx.close();
});

// Page weight and loading: no image is inlined (every ART entry is a relative img/… file, so the itch / CrazyGames
// packages work), the start screen's images are preloaded, and the first deal waits for the card art, so no card is
// ever drawn blank, even on a slow line. The start window is a named dialog with the focus inside it on a touch
// screen too; the game screen has a <main> and an <h1>.
test('Tulip 7: art loads as files, cards are never blank on the first deal, dialogs are named', { timeout: 120000 }, async () => {
  const html = await (await fetch(srv.url + '/tulip7/')).text();
  assert.ok(html.length < 400000, `page is ${html.length} bytes`);
  assert.ok(!/data:image\/(webp|png|jpeg);base64/.test(html.split('const ART=')[1].split('\n')[0]), 'an ART image is inlined');
  assert.match(html, /<link rel="preload" as="image" href="img\/bg_cover\.webp" fetchpriority="high">/);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  // a slow line for the card art: each image arrives 1.2 s late
  await ctx.route(/\/tulip7\/img\/(t\d\d|m_|a_|ui_frame|ui_cardback)/, async r => { await new Promise(res => setTimeout(res, 1200)); await r.continue(); });
  await ctx.addInitScript(() => localStorage.setItem('tulip7.set', JSON.stringify({ fast: true, help: false, sound: false, mode: 'winter' })));
  const page = await ctx.newPage(); const problems = []; page.on('pageerror', e => problems.push(e.message));
  await page.goto(srv.url + '/tulip7/');
  await page.waitForSelector('#mbox #go');
  const a11y = await page.evaluate(() => {
    const b = document.querySelector('#mbox'), lab = b.getAttribute('aria-labelledby');
    return { role: b.getAttribute('role'), name: lab ? document.getElementById(lab)?.textContent : b.getAttribute('aria-label'), focusIn: b.contains(document.activeElement),
      main: !!document.querySelector('main #table'), h1: document.querySelector('h1')?.textContent.trim(), relative: Object.values(ART).every(u => /^img\/[a-z0-9_]+\.webp$/.test(u)) };
  });
  assert.deepEqual(a11y, { role: 'dialog', name: 'Tulip 7', focusIn: true, main: true, h1: 'Tulip 7', relative: true });
  await page.locator('#go').tap();
  await page.waitForSelector('[data-part=hand] .card img', { timeout: 30000 });
  const blank = await page.evaluate(() => [...document.querySelectorAll('[data-part=hand] .card img')].filter(i => !(i.complete && i.naturalWidth)).length);
  assert.equal(blank, 0, 'a card was dealt before its picture had loaded');
  // a window opened in the game (the rules) is named by its heading
  await page.evaluate(() => showRules());
  assert.equal(await page.evaluate(() => document.getElementById(document.querySelector('#mbox').getAttribute('aria-labelledby')).textContent), 'Tulip 7');
  await page.evaluate(() => showLog());
  assert.equal(await page.evaluate(() => document.getElementById(document.querySelector('#mbox').getAttribute('aria-labelledby')).textContent), 'Tonight at the table');
  assert.ok(await page.evaluate(() => document.querySelector('#mbox').contains(document.activeElement)), 'focus not in the window on a touch screen');
  assert.deepEqual(problems, []);
  await ctx.close();
});
