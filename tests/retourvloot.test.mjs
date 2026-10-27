// Retourvloot model sanity checks: whole runs under a few fixed policies must end cleanly with sane numbers.
// (src/retourvloot/test.js stays as the balance printout; this file is the pass/fail version.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'retourvloot');
const ctx = { console, Math, Date, Object, JSON }; vm.createContext(ctx);
vm.runInContext(readFileSync(join(DIR, 'model.js'), 'utf8') + readFileSync(join(DIR, 'events.js'), 'utf8') + `
function play(policy, pick) {
  const S = newState(); S.auto.n = policy.n; S.auto.borrow = true; S.release.fine = 40; S.release.pepper = 80; S.silver = policy.silver;
  let steps = 0; const fired = [];
  while (!S.ended && steps++ < 200000) {
    step(S);
    while (S.queue.length) { const id = S.queue.shift(); fired.push(id); const e = EVENT_BY_ID[id]; const c = e.choices[pick(e.choices.length)]; if (c.fx) c.fx(S); }
    const y = yearOf(S.t); if (y >= 1612) S.divRate = policy.div;
    if (mdOf(S.t) === 101) { const f = foundablePosts(S, y); if (f.length && !S.letter.found) S.letter = { ...S.letter, found: f[0], issued: S.t }; else if (S.asia.posts[S.letter.found]) S.letter = { ...S.letter, found: '', issued: S.t }; }
  }
  return { S, steps, fired, year: yearOf(S.t) };
}`, ctx);
const play = (policy, pick) => vm.runInContext('play', ctx)(policy, pick);
const finite = v => typeof v === 'number' && Number.isFinite(v);

const POLICIES = [{ n: 2, silver: 200000, div: 15 }, { n: 3, silver: 150000, div: 15 }, { n: 2, silver: 300000, div: 10 }, { n: 2, silver: 200000, div: 0 }];

for (const p of POLICIES) {
  test(`full run ends cleanly: ${JSON.stringify(p)}`, () => {
    const { S, steps, year } = play(p, () => 0);
    assert.ok(S.ended, `did not end after ${steps} steps (year ${year})`);
    assert.ok(year >= 1602 && year <= 1800, 'end year ' + year);
    for (const k of ['cash', 'debt', 'share', 'discontent']) assert.ok(finite(S[k]), `${k} = ${S[k]}`);
    assert.ok(S.debt >= 0, 'debt negative');
    const h = S.humans;
    for (const k of Object.keys(h)) assert.ok(finite(h[k]) && h[k] >= 0, `humans.${k} = ${h[k]}`);
    assert.ok(h.returned <= h.sent, 'more men came home than were sent');
    // Not checked: returned + died <= sent. Soldiers recruited in Asia (garrison event) join A.personnel without being
    // "sent", so they can die in Asia or sail home; the overview's percentages then mix the two groups. Design question, see AUDIT.
    if (!S.flags.asianTroops) assert.ok(h.returned + h.diedSea + h.diedAsia <= h.sent, 'more men accounted for than were sent');
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(S)), 'state must survive a save round-trip');
  });
}

test('random choices: five runs end without errors and only known events fire', () => {
  const ids = new Set(Object.keys(vm.runInContext('EVENT_BY_ID', ctx)));
  for (let k = 0; k < 5; k++) {
    const { S, fired } = play({ n: 2, silver: 200000, div: 15 }, n => Math.floor(Math.random() * n));
    assert.ok(S.ended);
    for (const id of fired) assert.ok(ids.has(id), 'unknown event ' + id);
  }
});

test('every event has at least one choice and a body', () => {
  const E = vm.runInContext('EVENT_BY_ID', ctx);
  for (const [id, e] of Object.entries(E)) {
    assert.ok(Array.isArray(e.choices) && e.choices.length, id + ' has no choices');
    for (const c of e.choices) assert.equal(typeof c.label, 'string', id + ' choice without label');
  }
});

// ---- regressions from QA, October 2026
const V = name => vm.runInContext(name, ctx);
const at = (y, m = 1, d = 1) => V('tOf')(y, m, d);

test('#1 an event stays in the queue (and in saves) until it is answered', () => {
  const S = V('newState')(); const step = V('step'), resolveEvent = V('resolveEvent');
  let guard = 0;
  while (S.queue[0] !== 'banda' && guard++ < 100000) { step(S); while (S.queue.length && S.queue[0] !== 'banda') resolveEvent(S, S.queue[0], 0); }
  assert.equal(S.queue[0], 'banda');
  assert.ok(S.done.banda, 'dated event is marked done when queued');
  const saved = JSON.parse(JSON.stringify(S)); // the autosave taken while the card is open
  assert.equal(saved.queue[0], 'banda', 'a save taken while the card is open still holds the event');
  resolveEvent(saved, 'banda', 0);
  assert.equal(saved.flags.banda, 'conquest');
  assert.ok(!saved.queue.includes('banda'));
  // an old save, where the card was already shifted off before the reload, keeps playing
  const old = JSON.parse(JSON.stringify(S)); old.queue.shift();
  assert.doesNotThrow(() => { for (let i = 0; i < 400; i++) { step(old); while (old.queue.length) resolveEvent(old, old.queue[0], 0); } });
  assert.equal(resolveEvent(S, 'not-an-event', 0), '');
});

test('#2 a lost or closed post is never founded from an old letter or a pending order', () => {
  const deliverLetter = V('deliverLetter'), asiaMonth = V('asiaMonth');
  const letter = (found, issued) => ({ focus: 'balanced', wages: 'low', expansion: 'restrain', found, issued });
  let S = V('newState')(); S.t = at(1662, 6); S.flags.lost = { formosa: true }; S.asia.capital = 1e6;
  deliverLetter(S, letter('formosa', at(1661, 10)));
  assert.ok(!S.asia.posts.formosa, 'Formosa re-taken after 1662');
  S = V('newState')(); S.t = at(1795, 6); S.flags.lost = { ceylon: true, cape: true }; S.asia.capital = 2e6;
  deliverLetter(S, letter('ceylon', at(1794, 10)));
  assert.ok(!S.asia.posts.ceylon, 'Ceylon re-taken after 1795');
  S = V('newState')(); S.t = at(1663); S.flags.lost = { formosa: true }; S.asia.pendingFound = 'formosa'; S.asia.capital = 5e5;
  asiaMonth(S, 1663);
  assert.ok(!S.asia.posts.formosa && !S.asia.pendingFound, 'pending order for a lost post is dropped');
  S = V('newState')(); S.t = at(1625, 6); S.asia.capital = 1e6;
  deliverLetter(S, letter('formosa', at(1625, 1)));
  assert.ok(S.asia.posts.formosa, 'an open post can still be ordered');
});

test('#8 one-off costs borrow instead of leaving the treasury negative', () => {
  const S = V('newState')(); S.cash = 1000;
  V('EVENT_BY_ID').corruption.choices[0].fx(S);
  assert.ok(S.cash >= 0, 'cash ' + S.cash);
  assert.equal(S.debt, 149000);
  S.cash = 10000; V('audit')(S);
  assert.ok(S.cash >= 0 && S.debt === 199000, `cash ${S.cash} debt ${S.debt}`);
});

test('#9 the debt card shows the rate actually charged; #10 growing debt is explained', () => {
  const debtLine = V('debtLine');
  const S = V('newState')(); S.debt = 10e6;
  S.t = at(1700); assert.match(debtLine(S), /ƒ400k a year \(4%\)/);
  S.t = at(1775); S.flags.credit1773 = true; assert.match(debtLine(S), /ƒ550k a year \(5\.5%\)/);
  S.t = at(1779); assert.match(debtLine(S), /\(4%\)/);
  S.debt = 0; assert.equal(debtLine(S), '4% a year');
  assert.equal(V('debtText')(S), '', 'no note without history');
  S.bookHist = [{ y: 1700, res: 0, div: 0, interest: 0, debt: 20e6 }, { y: 1701, res: -2e6, div: 640000, interest: 800000, debt: 24e6 }];
  const t = V('debtText')(S);
  assert.match(t, /Debt rose from ƒ20.0M to ƒ24.0M in 1701/);
  assert.match(t, /Interest cost ƒ800k, dividends ƒ640k, and trading lost ƒ2.00M/);
  S.bookHist[1].debt = 20.1e6; assert.equal(V('debtText')(S), '', 'small rises stay quiet');
  // a full run records the year-end debt
  const { S: R } = play({ n: 2, silver: 200000, div: 15 }, () => 0);
  assert.ok(R.bookHist.every(b => typeof b.debt === 'number'));
});

test('#7 the emergency silver ship is not offered after the board is dismissed', () => {
  const S = V('newState')(); S.flags.nationalised = true;
  const e = V('EVENT_BY_ID').silverplea;
  assert.ok(!V('visibleChoices')(S, e).some(({ i }) => i === 0));
  assert.match(e.choices[0].fx(S), /No emergency ship/);
});

// ---- redesign, October 2026: the end-of-game comparison with the real VOC, and the tulip card
test('every year is recorded for the comparison, and the decade data are sound', () => {
  const { S } = play({ n: 2, silver: 200000, div: 15 }, () => 0);
  const end = V('yearOf')(S.t);
  assert.ok(S.yhist.length >= end - 1603, `only ${S.yhist.length} years recorded up to ${end}`);
  assert.ok(S.yhist.every((r, i) => i === 0 || r.y === S.yhist[i - 1].y + 1), 'years are consecutive');
  assert.equal(S.yhist[0].y, 1602);
  const D = V('compareData')(S);
  assert.ok(D.decades.length >= 2);
  for (const d of D.decades) {
    assert.equal(d.decade % 10, 0);
    assert.ok(d.decade >= 1600 && d.decade <= 1790, 'decade ' + d.decade);
    if (d.decade >= 1620) assert.ok(d.div > 0 && d.div <= 40, `${d.decade}s dividend ${d.div}`); // policy pays 15% from 1612
  }
  const mid = D.decades.find(d => d.decade === 1650);
  if (mid) assert.equal(mid.div, 15, 'a steady 15% shows as 15% a year');
  assert.ok(Math.abs(D.avgDiv - 15) < 1.5, 'lifetime average ' + D.avgDiv);
  assert.equal(D.endDebt, S.debt);
});

test('the real VOC figures are the cited ones', () => {
  const R = V('REAL_VOC');
  assert.equal(R.avgDiv, 18);
  assert.equal(R.firstDiv, 1610);
  assert.equal(R.lastDiv, 1782);
  assert.deepEqual({ ...R.early }, { from: 1610, to: 1612, total: 162.5 });
  assert.deepEqual({ ...R.war }, { y: 1780, loss: 43e6 });
  assert.deepEqual({ ...R.endDebt }, { y: 1796, v: 120e6, lo: 102e6, hi: 138e6 });
});

test('one line of commentary compares the player with the real Company', () => {
  const mk = (f, debt, extra = {}) => {
    const S = V('newState')(); S.t = V('END_T'); S.debt = debt; Object.assign(S, extra);
    S.yhist = []; for (let y = 1602; y <= 1799; y++) S.yhist.push({ y, div: y < 1610 ? 0 : f(y), debt: Math.round(debt * (y - 1602) / 197) });
    return S;
  };
  const line = S => V('compareLine')(S);
  assert.match(line(mk(y => y < 1690 ? 25 : 10, 50e6)), /^Your company paid out more than the real VOC's 18% a year until the 1680s, then less, and left ƒ50.0M of debt, against the real Company's ƒ120 million or so\.$/);
  assert.match(line(mk(() => 25, 0)), /matched or beat the real VOC's 18% a year in every decade, and left no debt at all/);
  assert.match(line(mk(() => 5, 110e6)), /never matched .* about what the real Company left/);
  assert.match(line(mk(y => (Math.floor(y / 10) % 2 ? 25 : 10), 150e6)), /in \d+ of 17 decades, most of all in the \d{4}s \(25%\), and left ƒ150M of debt, more than/);
  const B = mk(() => 20, 121e6, { endReason: 'bankrupt' }); B.t = at(1700, 3); B.yhist = B.yhist.filter(r => r.y < 1700);
  assert.match(line(B), /went under in 1699 with ƒ121M of debt/);
  assert.equal(V('finalScore')({ stats: { divPaid: 300e6 }, debt: 50e6 }), 250);
});

test('Tulips in the taverns: a one-off card in February 1637, no gameplay effect, a nod only for Tulip 7 players', () => {
  const E = V('EVENT_BY_ID').tulips;
  assert.ok(E, 'event exists');
  assert.deepEqual([...E.at], [1637, 2, 9]);
  assert.equal(E.choices.length, 1); assert.equal(E.choices[0].fx, undefined, 'no effect');
  assert.match(E.history, /Goldgar/);
  // fires once in a normal game, around the Haarlem crash
  const S = V('newState')(); const step = V('step'), resolveEvent = V('resolveEvent');
  let when = null;
  while (S.t < at(1638) && !when) { step(S); while (S.queue.length) { if (S.queue[0] === 'tulips') when = S.t; resolveEvent(S, S.queue[0], 0); } }
  assert.equal(when, at(1637, 2, 9));
  for (let i = 0; i < 400; i++) { step(S); while (S.queue.length) { assert.notEqual(S.queue[0], 'tulips', 'fired twice'); resolveEvent(S, S.queue[0], 0); } }
  // an old save already past 1637 skips it
  const L = V('newState')(); L.t = at(1700); L.done = { founding: true }; L.queue = [];
  V('checkEvents')(L);
  assert.ok(!L.queue.includes('tulips'), 'a late save gets the card');
  // the nod: none without Tulip 7 in this browser; a link to /tulip7/ with it; no link on CrazyGames
  assert.doesNotMatch(E.body(S), /Tulip 7/);
  ctx.localStorage = { getItem: k => k === 'tulip7.record.v1' ? '{"best":1}' : null };
  try {
    assert.match(E.body(S), /You may have seen the tavern trade yourself.*href="\/tulip7\/"/s);
    ctx.window = { HL_PLATFORM: { id: 'crazygames' } };
    assert.match(E.body(S), /You may have seen/); assert.doesNotMatch(E.body(S), /<a /);
    ctx.window = { HL_PLATFORM: { id: 'itch' } };
    assert.match(E.body(S), /href="https:\/\/homoludens\.oalpcakir\.workers\.dev\/tulip7\/"/);
    ctx.localStorage = { getItem: k => k === 'tulip7.save.v1' ? '{}' : null }; ctx.window = undefined;
    assert.match(E.body(S), /href="\/tulip7\/"/);
  } finally { delete ctx.localStorage; delete ctx.window; }
});
