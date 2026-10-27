// A Cup of Tea regression tests: in-scene save and resume, finished scenes reopening solved, broken saves,
// keyboard play, and no sideways scroll on a 360px phone (Scene 3, and Scene 1 once the Labour column is open).
//   CHROME=/path/to/chrome node --test tests/smoke/cupoftea.test.mjs
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

const PHONE = { width: 360, height: 740 };
async function open(path, { viewport = { width: 1400, height: 900 }, storage } = {}) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.route(/\/api\//, r => r.fulfill({ status: 200, body: '{}', contentType: 'application/json' }));
  if (storage) await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, storage);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/status of 204/.test(m.text())) problems.push('console: ' + m.text()); });
  await page.goto(srv.url + path);
  await page.waitForTimeout(400);
  return { page, problems, close: () => ctx.close() };
}
const introOpen = page => page.locator('#intro:not(.off)').count();
async function skipIntro(page) {
  while (await introOpen(page)) { await page.locator('#introCard button[data-go]').last().click(); await page.waitForTimeout(60); }
}
const tab = (page, id) => page.click(`.doctab[data-d="${id}"]`);
const clue = (page, c) => page.click(`#doc .c[data-c="${c}"]`);
async function convert(page, s, d, u) {
  await tab(page, 'table');
  await page.fill('#reck [data-k="s"]', String(s)); await page.fill('#reck [data-k="d"]', String(d));
  await page.selectOption('#reck [data-k="u"]', u); await page.click('#reckNote');
}
async function place(page, id, slot) { await page.click(`#chips .chip[data-id="${id}"]`); await page.click(`.slot[data-slot="${slot}"]`); }
const width = page => page.evaluate(() => document.documentElement.scrollWidth);
const save = (page, n) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), 'cupoftea.scene' + n);

// Scene 1 to the end: every note, the three lines, and the pull.
async function solveScene1(page) {
  await clue(page, 'grocer');
  await tab(page, 'hn'); await clue(page, 'w_margin');
  await tab(page, 'russell'); await clue(page, 'w_duty'); await clue(page, 'crown');
  await tab(page, 'h1848'); await clue(page, 'w_freight'); await clue(page, 'shipowner');
  await tab(page, 'wilson'); await clue(page, 'havana');
  await convert(page, 17, 0, 'cwt'); await convert(page, 6, 0, 'cwt'); await convert(page, 22, 4, 'cwt');
  await page.click('#work');
  for (const [r, v] of [['r1', ['grocer', 'w_margin', 'd029']], ['r2', ['crown', 'w_duty', 'd182']], ['r3', ['shipowner', 'w_freight', 'd064']]])
    for (const [i, f] of ['who', 'what', 'share'].entries()) await place(page, v[i], `${r}.${f}`);
  await page.waitForTimeout(1600);
  await page.click('#pull');
  await page.waitForSelector('#door.on', { timeout: 4000 });
}

test('Cup of Tea: Scene 1 progress survives a reload, without the briefing', async () => {
  const t = await open('/cupoftea/');
  await skipIntro(t.page);
  await clue(t.page, 'grocer');
  await tab(t.page, 'russell'); await clue(t.page, 'w_duty'); await clue(t.page, 'crown');
  await convert(t.page, 17, 0, 'cwt');
  await convert(t.page, 18, 6, 'cwt'); // a decoy figure, worked out by the player
  // one wrong attempt (a blot), then the right line
  for (const [i, f] of ['who', 'what', 'share'].entries()) await place(t.page, ['crown', 'w_duty', 'x1_98d'][i], `r2.${f}`);
  await place(t.page, 'd182', 'r2.share'); // correcting one box of a full line is not another blot
  assert.equal(await t.page.locator('#r2.locked').count(), 1);
  await t.page.reload(); await t.page.waitForTimeout(500);
  assert.equal(await introOpen(t.page), 0, 'briefing shown again on resume');
  assert.equal(await t.page.locator('#r2.locked').count(), 1, 'locked line lost');
  assert.equal(await t.page.locator('#chips .chip[data-id="x1_98d"]').count(), 1, 'worked-out figure lost');
  assert.equal(await t.page.locator('#chips .chip').count(), 5);
  assert.equal(await t.page.locator('#tray .pile').count(), 2, 'coins not moved back to the Crown');
  assert.equal((await save(t.page, 1)).blots, 1);
  assert.equal(await t.page.locator('.doctab.on').getAttribute('data-d'), 'table', 'open paper not restored');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Cup of Tea: Scene 1 after the pull fits a 360px phone, reopens solved, and can be replayed', async () => {
  const t = await open('/cupoftea/', { viewport: PHONE });
  await skipIntro(t.page);
  await solveScene1(t.page);
  await t.page.keyboard.press('Escape');
  assert.equal(await t.page.locator('#door.on').count(), 0, 'Escape did not close the end screen');
  assert.ok(await t.page.locator('#ltable.showEmek').count(), 'Labour column not shown');
  assert.ok(await width(t.page) <= 360, `page is ${await width(t.page)}px wide on a 360px phone`);
  await t.page.reload(); await t.page.waitForTimeout(600);
  assert.equal(await introOpen(t.page), 0);
  assert.equal(await t.page.locator('#door.on').count(), 1, 'finished scene did not reopen on its end screen');
  assert.equal(await t.page.locator('#ltable tr.locked').count(), 3);
  assert.equal(await t.page.locator('tr.labour').count(), 1);
  assert.ok(await width(t.page) <= 360);
  await t.page.locator('#door .replayBtn').click();
  await t.page.waitForLoadState('load'); await t.page.waitForTimeout(500);
  assert.equal(await introOpen(t.page), 1, 'replay did not start the scene again');
  assert.equal(await t.page.locator('#ltable tr.locked').count(), 0);
  assert.deepEqual(await t.page.evaluate(() => JSON.parse(localStorage.getItem('cupoftea.v1')).done), [1], 'replay forgot the scene was finished');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Cup of Tea: Scene 3 fits a 360px phone and resumes, including worked-out figures', async () => {
  const t = await open('/cupoftea/3/', { viewport: PHONE });
  await skipIntro(t.page);
  assert.ok(await width(t.page) <= 360, `page is ${await width(t.page)}px wide on a 360px phone`);
  await tab(t.page, 'day'); await clue(t.page, 'w_tduty'); await clue(t.page, 'crown');
  await convert(t.page, 2, 2.25, 'lb'); await convert(t.page, 3, 0, 'lb');
  await t.page.selectOption('#rem [data-r="a"]', 'l3600'); await t.page.selectOption('#rem [data-r="b"]', 'l2625'); await t.page.click('#remNote');
  await t.page.selectOption('#scale [data-r="a"]', 'l2625'); await t.page.click('#scaleNote');
  for (const [i, f] of ['who', 'what', 'share'].entries()) await place(t.page, ['crown', 'w_tduty', 'd328'][i], `r1.${f}`);
  assert.equal(await t.page.locator('#r1.locked').count(), 1);
  assert.ok(await width(t.page) <= 360, 'a locked line with its Labour note widens the page');
  await t.page.reload(); await t.page.waitForTimeout(500);
  assert.equal(await introOpen(t.page), 0);
  assert.equal(await t.page.locator('#r1.locked').count(), 1);
  assert.equal(await t.page.locator('#chips .chip[data-id="l975"]').count(), 1, 'remainder note lost');
  assert.match(await t.page.innerText('#sum'), /3\.28d/);
  assert.ok(await width(t.page) <= 360);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Cup of Tea: a scene finished before in-scene saves reopens solved', async () => {
  const t = await open('/cupoftea/2/', { storage: { 'cupoftea.v1': JSON.stringify({ done: [1, 2], blots: { 2: 3 }, cur: 2 }) } });
  assert.equal(await introOpen(t.page), 0);
  assert.equal(await t.page.locator('#door.on').count(), 1);
  assert.equal(await t.page.locator('#mtable tr.locked, #ltable tr.locked').count(), 4);
  assert.match(await t.page.innerText('#fslot'), /3 hours/);
  assert.equal((await save(t.page, 2)).blots, 3);
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Cup of Tea: broken or foreign saves are ignored', async () => {
  for (const bad of ['{not json', '{"v":1,"got":["nope"]}', '{"v":1,"got":["crown"],"place":{"r1.who":"grocer"},"lockOrder":["r1"],"lockAns":{"r1":0}}', '{"v":7}', 'null']) {
    const t = await open('/cupoftea/', { storage: { 'cupoftea.scene1': bad } });
    assert.equal(await introOpen(t.page), 1, 'bad save skipped the briefing: ' + bad);
    await skipIntro(t.page);
    assert.equal(await t.page.locator('#chips .chip').count(), 0, 'bad save leaked notes: ' + bad);
    await clue(t.page, 'grocer');
    assert.equal(await t.page.locator('#chips .chip').count(), 1);
    assert.deepEqual(t.problems, [], bad);
    await t.close();
  }
});

test('Cup of Tea: the ledger can be filled with the keyboard alone', async () => {
  const t = await open('/cupoftea/');
  await skipIntro(t.page);
  const word = t.page.locator('#doc .c[data-c="grocer"]');
  assert.equal(await word.getAttribute('tabindex'), '0');
  await word.focus(); await t.page.keyboard.press('Enter');
  const chip = t.page.locator('#chips .chip[data-id="grocer"]');
  await chip.focus(); await t.page.keyboard.press('Enter');
  assert.equal(await t.page.locator('#chips .chip.sel').count(), 1, 'Enter did not pick the note');
  assert.equal(await t.page.evaluate(() => document.activeElement?.dataset.id), 'grocer', 'focus lost after picking');
  // Tab from the note reaches the ledger boxes
  let reached = false;
  for (let i = 0; i < 30 && !reached; i++) { await t.page.keyboard.press('Tab'); reached = await t.page.evaluate(() => document.activeElement?.dataset.slot === 'r1.who'); }
  assert.ok(reached, 'Tab never reached the first ledger box');
  await t.page.keyboard.press('Enter');
  assert.equal(await t.page.locator('.slot[data-slot="r1.who"] .chip').count(), 1, 'Enter did not place the note');
  assert.equal(await t.page.evaluate(() => document.activeElement?.dataset.slot), 'r1.who', 'focus lost after placing');
  const ring = await t.page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.notEqual(ring, 'none', 'no visible focus ring');
  assert.deepEqual(t.problems, []);
  await t.close();
});

// "Where the farthings went": the Sankey diagrams on the end screens, the share sheet, the passport stamp.
const flows = (page, spec) => page.evaluate(s => {
  const svg = document.querySelector(`.sk svg[data-spec="${s}"]`);
  if (!svg) return null;
  const v = [...svg.querySelectorAll('.sk-flow')].map(p => +p.dataset.v);
  return { total: +svg.dataset.total, sum: Math.round(v.reduce((a, b) => a + b, 0) * 1e6) / 1e6, n: v.length, layout: svg.dataset.layout,
    rows: svg.closest('.sk').querySelectorAll('details table tbody tr').length, trace: svg.querySelectorAll('path.tr').length,
    title: svg.querySelector('title')?.textContent, desc: svg.querySelector('desc')?.textContent };
}, spec);

test('Cup of Tea: Scene 1 ends with a Sankey of the 4½d, a passport stamp and a share sheet', async () => {
  const t = await open('/cupoftea/');
  await skipIntro(t.page);
  await solveScene1(t.page);
  await t.page.waitForSelector('#skSugar svg', { timeout: 4000 });
  const f = await flows(t.page, 'sugar');
  assert.equal(f.total, 4.5); assert.equal(f.sum, 4.5, 'the flows do not add up to the receipt');
  assert.equal(f.n, 4); assert.equal(f.trace, 1, 'no labour line'); assert.equal(f.layout, 'horizontal');
  assert.ok(f.rows >= 5, 'table fallback missing rows'); assert.match(f.desc, /HM Customs 1\.82d/);
  const pass = await t.page.evaluate(() => JSON.parse(localStorage.getItem('hl.passport.v1')));
  assert.equal(pass.games.cupoftea.plays, 1); assert.match(pass.games.cupoftea.label, /Scene 1 solved · \d+ blots?/);
  await t.page.click('#rShare');
  await t.page.waitForSelector('.hlx-ov', { timeout: 3000 });
  assert.equal(await t.page.locator('.hlx-ov h2').count(), 1, 'share sheet has no heading');
  assert.equal(await t.page.locator('#rCopy').isVisible(), true, 'Copy as text gone');
  assert.deepEqual(t.problems, []);
  await t.close();
});

test('Cup of Tea: the final ending draws the tea (5d) and the whole receipt (9½d), and fits a phone', async () => {
  const storage = { 'cupoftea.v1': JSON.stringify({ done: [1, 2, 3], blots: { 3: 1 }, cur: 3 }) };
  const t = await open('/cupoftea/3/', { storage });
  await t.page.waitForSelector('#skWhole svg', { timeout: 4000 });
  const tea = await flows(t.page, 'tea'), whole = await flows(t.page, 'whole');
  assert.equal(tea.sum, 5); assert.equal(tea.total, 5);
  assert.equal(whole.sum, 9.5); assert.equal(whole.total, 9.5);
  assert.equal(whole.trace, 2, 'labour lines for the cane-cutter and the tea pickers');
  assert.match(whole.desc, /The Cuban planter 1\.07d/, 'Scene 2 done: the Havana share should be split');
  // the VOC line links Retourvloot
  assert.equal(await t.page.locator('#vocLine a[href="/retourvloot/"]').count(), 1);
  assert.match(await t.page.innerText('#vocLine'), /Dutch East India Company/);
  await t.page.click('#rShare');
  await t.page.waitForSelector('.hlx-ov', { timeout: 3000 });
  assert.deepEqual(t.problems, []);
  await t.close();

  const p = await open('/cupoftea/3/', { viewport: { width: 390, height: 844 }, storage: { ...storage, 'retourvloot.runs': '[{"endYear":1700}]' } });
  await p.page.waitForSelector('#skWhole svg', { timeout: 4000 });
  assert.equal((await flows(p.page, 'whole')).layout, 'vertical');
  assert.equal((await flows(p.page, 'tea')).layout, 'vertical');
  assert.ok(await width(p.page) <= 390, `page is ${await width(p.page)}px wide on a 390px phone`);
  const over = await p.page.evaluate(() => { const c = document.querySelector('#door .card'); return c.scrollWidth - c.clientWidth; });
  assert.ok(over <= 0, 'the end screen scrolls sideways');
  assert.match(await p.page.innerText('#vocLine'), /^Her tea came by a long road\. Your Retourvloot company/);
  assert.deepEqual(p.problems, []);
  await p.close();
});

test('Cup of Tea: on CrazyGames the VOC line has no link and there is no Share button', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(() => { window.HL_PLATFORM = { id: 'crazygames' }; localStorage.setItem('cupoftea.v1', JSON.stringify({ done: [1, 3], cur: 3 })); });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(srv.url + '/cupoftea/3/'); await page.waitForSelector('#skWhole svg', { timeout: 4000 });
  assert.equal(await page.locator('#vocLine a').count(), 0);
  assert.equal(await page.locator('#rShare').isVisible(), false);
  const whole = await flows(page, 'whole');
  assert.equal(whole.sum, 9.5);
  assert.match(whole.desc, /Stayed in Havana 1\.75d/, 'Scene 2 not done: the 1.75d stays in one piece');
  assert.deepEqual(errs, []);
  await ctx.close();
});

// The end screen is a modal dialog: Tab and Shift+Tab cycle through its links and buttons and never reach the
// ledger behind it.
test('Cup of Tea: Tab stays inside the end screen', async () => {
  for (const path of ['/cupoftea/', '/cupoftea/2/', '/cupoftea/3/']) {
    const t = await open(path, { viewport: { width: 1366, height: 768 }, storage: { 'cupoftea.v1': JSON.stringify({ done: [1, 2, 3], cur: 3 }) } });
    await t.page.waitForSelector('#door.on', { timeout: 4000 });
    await t.page.waitForTimeout(300);
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < 40; i++) {
        await t.page.keyboard.press(key);
        assert.ok(await t.page.evaluate(() => document.querySelector('#door .card').contains(document.activeElement)), `${path}: ${key} left the end screen`);
      }
    }
    assert.deepEqual(t.problems, []);
    await t.close();
  }
});

// Loading and accessibility: the briefing's picture has its size (and a 640w variant), the page does not jump while
// the script draws it (CLS), the ledger's first header cell is not empty, and the receipt's other line is readable.
test('Cup of Tea: no layout shift on load, sized intro picture, named ledger column, readable receipt', async () => {
  for (const [n, path] of [[1, '/cupoftea/'], [2, '/cupoftea/2/'], [3, '/cupoftea/3/']]) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 204, body: '' }));
    await ctx.addInitScript(() => { window.__cls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(srv.url + path); await page.waitForTimeout(1200);
    const r = await page.evaluate(() => { const i = document.querySelector('#intro .iplate img');
      return { cls: window.__cls, w: i.getAttribute('width'), h: i.getAttribute('height'), srcset: i.getAttribute('srcset'), ratio: +(i.getBoundingClientRect().width / i.getBoundingClientRect().height).toFixed(2), boot: document.body.classList.contains('boot') }; });
    assert.ok(r.cls < 0.05, `${path}: layout shift ${r.cls}`);
    assert.deepEqual([r.w, r.h, r.ratio, r.boot], ['1280', '560', 2.29, false], path);
    assert.match(r.srcset, new RegExp(`tea_intro_${n}-640\\.webp 640w`));
    assert.equal((await fetch(srv.url + `/cupoftea/img/tea_intro_${n}-640.webp`)).status, 200);
    while (await introOpen(page)) await page.locator('#introCard button[data-go]').last().click();
    const th = await page.evaluate(() => [...document.querySelectorAll('table.ledger tr:first-child th, #ltable tr:first-child th, #mtable tr:first-child th')].filter(t => !t.textContent.trim()).length);
    assert.equal(th, 0, `${path}: an empty header cell in the ledger`);
    const muted = await page.evaluate(() => [...document.querySelectorAll('.receipt .row')].map(r => getComputedStyle(r)).filter(c => +c.opacity < 1 || c.color === 'rgb(136, 128, 117)').length);
    assert.equal(muted, 0, `${path}: a faded receipt line`);
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

// Scene 3 can be solved from the papers with the desk's own tools: 2s 2¼d and 3s a pound converted, the remainder
// 9.75d, both brought down to two ounces, the 0.50d left over, and the 269 per cent.
test('Cup of Tea: Scene 3 shares and the 269% come from the tools, not from the answer key', async () => {
  const t = await open('/cupoftea/3/');
  await skipIntro(t.page);
  for (const d of await t.page.$$eval('.doctab', b => b.map(x => x.dataset.d))) {
    await tab(t.page, d);
    for (const c of await t.page.$$eval('#doc .c[data-c]:not(.got)', b => b.map(x => x.dataset.c))) await clue(t.page, c);
  }
  await convert(t.page, 2, 2.25, 'lb'); await convert(t.page, 3, 0, 'lb');
  await t.page.selectOption('#rem [data-r="a"]', 'l3600'); await t.page.selectOption('#rem [data-r="b"]', 'l2625'); await t.page.click('#remNote');
  for (const v of ['l2625', 'l975']) { await tab(t.page, 'table'); await t.page.selectOption('#scale [data-r="a"]', v); await t.page.click('#scaleNote'); }
  await tab(t.page, 'table');
  await t.page.selectOption('#rem [data-r="a"]', 'd500'); await t.page.selectOption('#rem [data-r="b"]', 'd328'); await t.page.selectOption('#rem [data-r="c"]', 'd122'); await t.page.click('#remNote');
  await t.page.selectOption('#prop [data-r="a"]', 'l2625'); await t.page.selectOption('#prop [data-r="b"]', 'l975'); await t.page.click('#propNote');
  assert.deepEqual(await t.page.evaluate(() => ['d328', 'd122', 'd050', 'p269'].filter(k => !S.got.has(k))), []);
  for (const [r, v] of [['r1', ['crown', 'w_tduty', 'd328']], ['r2', ['grocer', 'w_margin', 'd050']], ['r3', ['china', 'w_bond', 'd122']]])
    for (const [i, f] of ['who', 'what', 'share'].entries()) await place(t.page, v[i], `${r}.${f}`);
  await place(t.page, 'p269', 'f1.pct');
  await t.page.waitForSelector('#door.on', { timeout: 5000 });
  assert.deepEqual(t.problems, []);
  await t.close();
});
