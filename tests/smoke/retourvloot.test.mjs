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
  await t.page.click('#tab-shares'); // the audit lives in the Shares tab of the side drawer
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

// ---- redesign, October 2026: the chart, the tulip card, the end-of-game comparison and sharing
test('the chart draws posts, ships and letters from the model state, and clicking shows details', async () => {
  const t = await open();
  const r = await t.page.evaluate(() => {
    S.t = tOf(1625, 6, 1); S.flags.brouwer = true; S.flags.batavia = true; S.flags.banda = 'conquest';
    const blank = { pepper: 0, fine: 0, textiles: 0, coffee: 0, tea: 0 };
    S.report = { date: S.t - 200, posts: ['bantam', 'ambon', 'banda'], capital: 1e6, stock: blank, personnel: 500, need: 600, eff: 1, upkeep: 1e5, leak: 0.1, acts: [], letterIssued: -1, letterArrived: null, focus: 'balanced', wages: 'low', expansion: 'restrain', missing: [], lastYr: null, inAsia: [] };
    S.mono = { nutmeg: S.t - 100 }; S.flags.lost = { formosa: true };
    S.ships = []; equipShip(S, 200000, true); equipShip(S, 200000, true); equipShip(S, 200000, true);
    const [a, b, c] = S.ships;
    Object.assign(a, { state: 'out', dep: S.t - 100, exp: 200, days: 210, letter: { ...S.letter, issued: S.t - 120 } });
    Object.assign(b, { state: 'home', dep2: S.t - 50, exp2: 200, days2: 210, cargo: {}, report: { date: S.t - 50 } });
    S.letterSealed = true; S.speed = 0;
    render(); drawMap();
    const g = k => document.querySelector(`#map [data-k="${k}"]`);
    const pa = along(outRoute(), 0.5), pb = along(homeRoute(), 0.25);
    return {
      a: a.id, ta: g('ship:' + a.id).getAttribute('transform'), ca: g('ship:' + a.id).getAttribute('class'),
      tb: g('ship:' + b.id).getAttribute('transform'), cb: g('ship:' + b.id).getAttribute('class'),
      harbour: !g('ship:' + c.id), texelCount: g('port:texel').textContent.trim(),
      pa: `translate(${pa.x.toFixed(1)} ${pa.y.toFixed(1)})`, pb: `translate(${pb.x.toFixed(1)} ${pb.y.toFixed(1)})`,
      letterOut: !!g('letter:out'), letterHome: !!g('letter:home'), unsent: !!g('letter:unsent'),
      banda: g('post:banda').getAttribute('class'), bandaMono: !!g('post:banda').querySelector('.mono'),
      ambon: g('post:ambon').getAttribute('class'), formosa: g('post:formosa').getAttribute('class'), coro: g('post:coromandel').getAttribute('class'),
      future: !!g('post:malacca'), land: document.querySelector('#map defs path').getAttribute('d').length,
      chips: document.getElementById('mapchips').textContent.replace(/\s+/g, ' '),
    };
  });
  assert.ok(r.ta.startsWith(r.pa), `outbound ship at half its voyage: ${r.ta} vs ${r.pa}`);
  assert.ok(r.tb.startsWith(r.pb), `homebound ship a quarter home: ${r.tb} vs ${r.pb}`);
  assert.match(r.ca, /\bship out\b/); assert.match(r.cb, /\bship home\b/);
  assert.ok(r.harbour, 'a ship in harbour is counted at Texel, not drawn at sea'); assert.match(r.texelCount, /1/);
  assert.ok(r.letterOut && r.letterHome && !r.unsent, 'letters at sea');
  assert.ok(r.bandaMono && /post/.test(r.banda), 'Banda holds the nutmeg monopoly');
  assert.match(r.ambon, /^hit post\s*$/); assert.match(r.formosa, /lost/); assert.match(r.coro, /can/);
  assert.ok(!r.future, 'Malacca is not drawn before 1640');
  assert.ok(r.land > 10000, 'coastlines drawn');
  assert.match(r.chips, /1 outbound.*1 homebound.*2 letters at sea/);
  // details on click
  await t.page.click(`#map [data-k="ship:${r.a}"]`);
  assert.match(await t.page.locator('#pop').innerText(), /Outbound to Batavia[\s\S]*Expected in Batavia/i);
  await t.page.click('#map [data-k="letter:out"]');
  assert.match(await t.page.locator('#pop').innerText(), /To Batavia/);
  await t.page.click('#pop .x'); // the card may cover the next mark
  await t.page.click('#map [data-k="post:coromandel"]');
  await t.page.getByRole('button', { name: 'Order it in the next letter' }).click();
  assert.deepEqual(await t.page.evaluate(() => [S.letter.found, S.letterSealed]), ['coromandel', false]);
  assert.match(await t.page.locator('#map [data-k="post:coromandel"]').getAttribute('class'), /ordered/);
  assert.ok(await t.page.locator('#map [data-k="letter:unsent"]').count(), 'an unsent letter waits at Texel');
  await t.page.keyboard.press('Escape');
  assert.ok(await t.page.locator('#pop').isHidden());
  // ships move while time runs
  const p0 = await t.page.evaluate(id => document.querySelector(`#map [data-k="ship:${id}"]`).getAttribute('transform'), r.a);
  await t.page.evaluate(() => { for (let i = 0; i < 20; i++) step(S); while (S.queue.length) resolveEvent(S, S.queue[0], 0); drawMap(); });
  const p1 = await t.page.evaluate(id => document.querySelector(`#map [data-k="ship:${id}"]`).getAttribute('transform'), r.a);
  assert.notEqual(p0, p1, 'the ship moved');
  assert.deepEqual(t.problems, []);
  await t.close();
});

async function openWith(storage) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  if (storage) await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  await page.goto(srv.url + '/retourvloot/');
  await page.getByRole('button', { name: 'Take your seat' }).click();
  await page.locator('#coach-skip').click();
  return { page, problems, close: () => ctx.close() };
}
for (const tulip of [true, false]) {
  test(`Tulips in the taverns appears in February 1637 ${tulip ? 'with' : 'without'} the Tulip 7 nod`, async () => {
    const t = await openWith(tulip ? { 'tulip7.save.v1': '{"v":1}' } : null);
    const cash = await t.page.evaluate(() => { while (S.t < tOf(1637, 2, 8)) { step(S); while (S.queue.length) resolveEvent(S, S.queue[0], 0); } S.speed = 5; render(); return S.cash; });
    await t.page.waitForFunction(() => !document.getElementById('modal').hidden, null, { timeout: 15000 });
    assert.equal(await modalTitle(t.page), 'Tulips in the taverns');
    assert.equal(await t.page.locator('#tulip-link').count(), tulip ? 1 : 0);
    if (tulip) assert.equal(await t.page.locator('#tulip-link').getAttribute('href'), '/tulip7/');
    await t.page.getByRole('button', { name: 'Back to the spice trade' }).click();
    assert.ok(await t.page.evaluate(() => S.done.tulips && !S.queue.includes('tulips')));
    assert.ok(Math.abs(await t.page.evaluate(() => S.cash) - cash) < 1e6, 'no gameplay effect beyond the day passing');
    assert.deepEqual(t.problems, []);
    await t.close();
  });
}

test('the end card compares the company with the real VOC, stamps the passport and shares a result card', async () => {
  const t = await open();
  await t.page.evaluate(() => {
    S.yhist = []; for (let y = 1602; y <= 1799; y++) S.yhist.push({ y, div: y < 1610 ? 0 : y < 1700 ? 22 : 12, debt: Math.max(0, (y - 1700) * 4e5) });
    S.t = END_T; S.debt = 40e6; S.stats.divPaid = 250e6; S.stats.divYears = 190; S.ended = true; S.queue = [];
    openQueued();
  });
  assert.equal(await modalTitle(t.page), 'The charter expires');
  const c = await t.page.evaluate(() => ({
    bars: document.querySelectorAll('#cmp svg rect.pb').length, real: !!document.querySelector('#cmp svg path.rv'),
    debt: document.querySelectorAll('#cmp svg circle.pd').length, range: !!document.querySelector('#cmp svg rect.rb'),
    text: document.querySelector('#cmp svg').textContent, line: document.getElementById('cmp-line').textContent,
    data: compareData(S),
  }));
  assert.equal(c.bars, 19 + 1, '1610s–1790s bars plus the legend swatch');
  assert.ok(c.real && c.range && c.debt >= 19);
  assert.match(c.text, /about 18% a year/); assert.match(c.text, /none after 1782/); assert.match(c.text, /about ƒ120M/);
  assert.equal(c.line, 'Your company paid out more than the real VOC\'s 18% a year until the 1690s, then less, and left ƒ40.0M of debt, against the real Company\'s ƒ120 million or so.');
  assert.equal(c.data.decades.find(d => d.decade === 1650).div, 22);
  assert.equal(c.data.decades.find(d => d.decade === 1750).debt, 59 * 4e5);
  const pass = await t.page.evaluate(() => JSON.parse(localStorage.getItem('hl.passport.v1')).games.retourvloot);
  assert.equal(pass.plays, 1); assert.equal(pass.wins, 1); assert.equal(pass.best, 210);
  assert.match(pass.label, /^Charter to 1799 · ƒ250M paid out$/);
  // share: the button opens the shared result sheet with a card built from the end state
  const opts = await t.page.evaluate(() => { const o = shareOpts(compareData(S), 'x', false, 1799, '13.2', 3); return { ...o }; });
  assert.equal(opts.game, 'retourvloot'); assert.equal(opts.kicker, 'Retourvloot · VOC 1602–1799'); assert.equal(opts.big, 'ƒ250M');
  assert.match(opts.art, /^img\/.+\.jpg$/); assert.equal(opts.lines.length, 3);
  await t.page.click('#m-share');
  await t.page.waitForSelector('.hlx-ov');
  await t.page.waitForFunction(() => /^data:image\/png/.test(document.querySelector('.hlx-ov img').src), null, { timeout: 10000 });
  await t.page.keyboard.press('Escape');
  // a reload does not stamp twice
  await t.page.reload(); await t.page.waitForTimeout(800);
  assert.equal(await t.page.evaluate(() => JSON.parse(localStorage.getItem('hl.passport.v1')).games.retourvloot.plays), 1);
  assert.equal(await t.page.locator('#m-new').count(), 1);
  assert.deepEqual(t.problems, []);
  await t.close();
});

// ---- QA, late October 2026: crowded marks, stale letters, the top of the chart, the end card's buttons
async function openAt(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  await page.goto(srv.url + '/retourvloot/');
  await page.getByRole('button', { name: 'Take your seat' }).click();
  await page.locator('#coach-skip').click();
  return { page, problems, close: () => ctx.close() };
}
for (const [w, h] of [[1366, 768], [1920, 1080]]) {
  test(`every post, port and ship on the chart can be seen and clicked (${w}×${h})`, async () => {
    const t = await openAt(w, h);
    const covered = await t.page.evaluate(() => {
      S.t = tOf(1730, 6, 1); S.flags.brouwer = true; S.flags.batavia = true;
      const blank = { pepper: 0, fine: 0, textiles: 0, coffee: 0, tea: 0 };
      S.report = { date: S.t - 200, posts: Object.keys(POSTS), capital: 1e6, stock: blank, personnel: 500, need: 600, eff: 1, upkeep: 1e5, leak: 0.1, acts: [], letterIssued: -1, letterArrived: null, focus: 'balanced', wages: 'low', expansion: 'restrain', missing: [], lastYr: null, inAsia: [] };
      S.asia.posts.cape = 1; S.ships = [];
      // homebound ships north about Scotland, the northernmost stretch of the route
      for (const f of [0.9, 0.93, 0.96]) { equipShip(S, 200000, true); Object.assign(S.ships[S.ships.length - 1], { state: 'home', dep2: S.t - f * 200, exp2: 200, days2: 210, cargo: {}, report: { date: S.t - 50 } }); }
      render(); drawMap();
      const bad = [];
      for (const g of document.querySelectorAll('#map [data-k]')) {
        const q = (g.querySelector('.badge') || g).getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2;
        const hit = document.elementFromPoint(x, y), k = hit && hit.closest('[data-k]');
        if (!k || k !== g) bad.push(g.getAttribute('data-k') + ' under ' + (k ? k.getAttribute('data-k') : hit && (hit.id || hit.tagName)));
        // and wholly inside the chart's border (10 chart units), not cut off at its edge
        const w = document.getElementById('mapwrap').getBoundingClientRect(), m = 10 * mapView.scale - 1;
        if (q.top < w.top + m || q.left < w.left + m || q.bottom > w.bottom - m || q.right > w.right - m) bad.push(g.getAttribute('data-k') + ' cut by the border');
      }
      return bad;
    });
    assert.deepEqual(covered, []);
    // Bantam sits next to Batavia: a click on its mark opens Bantam, not Batavia
    await t.page.click('#map [data-k="post:bantam"] .badge');
    assert.match(await t.page.locator('#pop h3').innerText(), /Bantam/);
    assert.deepEqual(t.problems, []);
    await t.close();
  });
}

test('orders that already reached Batavia are not drawn as a letter at sea, and the letter says so', async () => {
  const t = await openAt(1366, 768);
  const r = await t.page.evaluate(() => {
    S.t = tOf(1650, 6, 1); S.letterSealed = true; S.letter = { ...S.letter, issued: tOf(1640, 1, 1) };
    S.ships = []; equipShip(S, 200000, true); equipShip(S, 200000, true);
    const [a, b] = S.ships;
    Object.assign(a, { state: 'asia', dep: S.t - 400, exp: 250, letter: { ...S.letter } }); // arrived long ago with these orders
    Object.assign(b, { state: 'out', dep: S.t - 30, exp: 250, days: 260, letter: { ...S.letter } }); // the same orders, again
    render(); drawMap();
    const old = { mark: !!document.querySelector('#map [data-k="letter:out"]'), chips: document.getElementById('mapchips').textContent.replace(/\s+/g, ' '), status: document.getElementById('lstatus').textContent };
    // new orders on the next ship are news again
    S.letter = { ...S.letter, focus: 'cloth', issued: S.t - 20 }; b.letter = { ...S.letter };
    render(); drawMap();
    return { old, fresh: !!document.querySelector('#map [data-k="letter:out"]'), status: document.getElementById('lstatus').textContent };
  });
  assert.equal(r.old.mark, false, 'a delivered letter is still drawn at sea');
  assert.match(r.old.chips, /0 letters at sea/);
  assert.doesNotMatch(r.old.status, /first to arrive delivers/);
  assert.equal(r.fresh, true);
  assert.match(r.status, /Copies are aboard 1 ship at sea/);
  assert.deepEqual(t.problems, []);
  await t.close();
});

for (const [w, h] of [[1280, 720], [1366, 768]]) {
  test(`the end card keeps "Start a new company" on screen and the top bar text whole (${w}×${h})`, async () => {
    const t = await openAt(w, h);
    assert.ok(await t.page.evaluate(() => { const e = document.getElementById('s-div2'); return e.scrollWidth <= e.clientWidth; }), 'the dividend note is cut off');
    await t.page.evaluate(() => {
      S.yhist = []; for (let y = 1602; y <= 1799; y++) S.yhist.push({ y, div: 12, debt: 0 });
      S.t = END_T; S.stats.divPaid = 150e6; S.stats.divYears = 190; S.ended = true; S.queue = []; openQueued();
    });
    const b = await t.page.locator('#m-new').boundingBox();
    assert.ok(b && b.y >= 0 && b.y + b.height <= h, 'Start a new company is below the fold: ' + JSON.stringify(b));
    assert.equal(await t.page.evaluate(() => { const r = document.getElementById('m-new').getBoundingClientRect(); const e = document.elementFromPoint(r.left + 5, r.top + 5); return e && e.id; }), 'm-new');
    assert.deepEqual(t.problems, []);
    await t.close();
  });
}

// ---- accessibility audit, October 2026
test('phone note is a modal dialog; the chart is a group of controls; the guide is named', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  const page = await ctx.newPage();
  const problems = []; page.on('pageerror', e => problems.push(e.message));
  await page.goto(srv.url + '/retourvloot/'); await page.waitForTimeout(500);
  const a = await page.evaluate(() => { const s = document.getElementById('small-screen'); return { role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), name: document.getElementById(s.getAttribute('aria-labelledby')).textContent, focus: document.activeElement.id, inert: document.querySelector('.app').inert && document.getElementById('modal').inert, map: document.getElementById('map').getAttribute('role') }; });
  assert.deepEqual(a, { role: 'dialog', modal: 'true', name: 'Best on a bigger screen', focus: 'small-go', inert: true, map: 'group' });
  await page.keyboard.press('Enter');
  const b = await page.evaluate(() => ({ hidden: document.getElementById('small-screen').hidden, inert: document.querySelector('.app').inert || document.getElementById('modal').inert, focus: document.activeElement.textContent }));
  assert.deepEqual(b, { hidden: true, inert: false, focus: 'Take your seat' });
  await page.keyboard.press('Enter'); // takes the seat: the guide starts
  await page.waitForSelector('#coach:not([hidden])');
  assert.equal(await page.evaluate(() => document.getElementById(document.getElementById('coach').getAttribute('aria-labelledby')).textContent), 'Equip your first ship');
  assert.deepEqual(problems, []);
  await ctx.close();
});
