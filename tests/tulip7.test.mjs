// Tulip 7 engine tests: the 94-card deck stays whole, scores follow the rules, the AI only makes legal moves,
// saves (including ones written before the rival personas) resume to the same game, and the three archive
// traders really play differently while staying balanced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const T7 = createRequire(import.meta.url)('../src/tulip7/engine.js');
const { Game, AI, makeDeck, PERSONAS, IDX } = T7;

const errors = [];
const bot = {
  hitOrStay: (g, p) => AI.hitOrStay(g, p),
  sell: (g, p) => AI.sell(g, p),
  target: (g, p, c, cands) => { const q = AI.target(g, p, c, cands); if (!cands.includes(q) || q.status !== 'active') errors.push('illegal target'); return q; },
  giveSecond: (g, p, cands) => { const q = AI.giveSecond(g, p, cands); if (!cands.includes(q) || q === p || q.second) errors.push('illegal give'); return q; }
};
// seat 0 is the human proxy (no persona); seats 1-3 are the game's three traders
const seats = (persona = true) => [
  { name: 'You', human: true, style: 'balanced' },
  { name: 'Joost van Cuyck', style: 'cautious', persona: persona ? 'cuyck' : undefined },
  { name: 'Andries de Busscher', style: 'balanced', persona: persona ? 'busscher' : undefined },
  { name: 'Abraham van Meeckeren', style: 'greedy', persona: persona ? 'meeckeren' : undefined }
].map(p => ({ ...p, agent: bot }));
const inPlay = g => [...g.draw, ...g.discard, ...g.players.flatMap(p => [...p.cards, ...(p.second ? [p.second] : []), ...(p.bustCard ? [p.bustCard] : [])])];
const rules = p => { let s = p.nums.reduce((a, b) => a + b, 0); if (p.x2) s *= 2; s += p.mods.reduce((a, b) => a + b, 0); if (p.nums.length >= 7) s += 15; return s; };

async function play(mode, seed, extra = {}) {
  const saves = [], log = { book: 0, bust: 0, crash: 0 };
  const g = new Game({ mode, seed, players: seats(), onSave: s => saves.push(JSON.stringify(s)), ...extra, emit: (t, d) => {
    if (t === 'roundStart' || t === 'turn' || t === 'roundEnd') {
      const all = inPlay(g);
      if (all.length !== 94) errors.push(`${all.length} cards at ${t}`);
      if (new Set(all.map(c => c.uid)).size !== all.length) errors.push('a card is in two places');
    }
    if (t === 'roundEnd') for (const p of g.players) {
      if (p.last !== (p.status === 'bust' ? 0 : rules(p))) errors.push('score off the rules');
      if (new Set(p.nums).size !== p.nums.length || p.nums.length > 7) errors.push('a duplicate was kept');
    }
    if (t === 'book') { log.book++; if (d.p.nums.length !== 7) errors.push('book without seven'); }
    if (t === 'bust') log.bust++;
    if (t === 'crash') log.crash++;
  } });
  await g.run();
  return { g, saves, log };
}

test('the deck: 94 cards, tulips 0-12 with n copies of n, offsets, ×2 and three of each special', () => {
  const d = makeDeck();
  assert.equal(d.length, 94);
  for (let n = 0; n <= 12; n++) assert.equal(d.filter(c => c.k === 'num' && c.v === n).length, Math.max(1, n));
  assert.deepEqual(d.filter(c => c.k === 'mod').map(c => c.v), [2, 4, 6, 8, 10]);
  assert.equal(d.filter(c => c.k === 'x2').length, 1);
  for (const k of ['freeze', 'flip3', 'second']) assert.equal(d.filter(c => c.k === k).length, 3);
});

test('400 full games in each mode: 94 cards throughout, scores follow the rules, AI moves legal', async () => {
  errors.length = 0; let books = 0, busts = 0;
  for (let s = 1; s <= 400; s++) for (const mode of ['winter', 'classic']) {
    const { g, log } = await play(mode, s);
    assert.ok(g.over);
    books += log.book; busts += log.bust;
    for (const p of g.players) assert.ok(Number.isFinite(g.standing(p)) && g.standing(p) >= 0);
    if (mode === 'classic') assert.ok(g.players.some(p => p.total >= 200));
    else { assert.ok(g.crashed && g.alkmaar); assert.ok(g.players.every(p => p.units === 0 && p.settled === Math.round(p.atCrash * 0.035))); }
  }
  assert.deepEqual([...new Set(errors)], []);
  assert.ok(books > 0 && busts > 0);
});

test('resuming from every save gives the same game as playing straight through', async () => {
  for (let s = 1; s <= 60; s++) for (const mode of ['winter', 'classic']) {
    const { g, saves } = await play(mode, s);
    const want = g.players.map(p => Math.round(g.standing(p))).join();
    for (const sv of saves) {
      const h = new Game({ mode, players: seats(), snap: JSON.parse(sv) });
      await h.run();
      assert.equal(h.players.map(p => Math.round(h.standing(p))).join(), want, `${mode} seed ${s} evening ${JSON.parse(sv).evening}`);
    }
  }
});

test('a save from before the personas (no cost or soldE fields) still resumes and finishes', async () => {
  const { saves } = await play('winter', 11);
  for (const raw of saves) {
    const old = JSON.parse(raw);
    for (const p of old.players) { delete p.cost; delete p.soldE; }
    delete old.ui;
    const h = new Game({ mode: 'winter', players: seats(), snap: old });
    assert.ok(h.players.every(p => Number.isFinite(p.cost) && p.soldE === -1));
    assert.equal(h.players[1].persona, 'cuyck'); // from the seat, not the save
    await h.run();
    assert.ok(h.over && inPlay(h).length === 94);
  }
});

/* ---- persona behaviour, on hand-built positions ---- */
function position(nums, { second = false, pile } = {}) {
  const g = new Game({ mode: 'classic', seed: 5, players: seats(), emit: () => {} });
  const deck = makeDeck();
  // a pile with a chosen share of duplicates: dup copies of the held numbers, the rest safe cards
  g.draw = pile(deck); g.discard = [];
  for (const p of g.players) { p.nums = [...nums]; p.cards = []; p.status = 'active'; p.second = second ? { k: 'second', uid: 999 } : null; }
  return g;
}
// pile of 100: `dup` cards that duplicate a 9 held, the rest offsets (never a duplicate)
const pileWith = dup => () => [...Array(dup)].map((_, i) => ({ k: 'num', v: 9, uid: 1000 + i })).concat([...Array(100 - dup)].map((_, i) => ({ k: 'mod', v: 2, uid: 2000 + i })));

test('Van Cuyck stands at about one in five; a Rouwkoop (his guarantor) lets him go on', () => {
  let g = position([9, 12], { pile: pileWith(15) }); assert.equal(AI.hitOrStay(g, g.players[1]), 'hit');
  g = position([9, 12], { pile: pileWith(24) }); assert.equal(AI.hitOrStay(g, g.players[1]), 'stay');
  g = position([9, 12], { second: true, pile: pileWith(24) }); assert.equal(AI.hitOrStay(g, g.players[1]), 'hit');
});

test('De Busscher plays for sorts: chases the book at six, stops at five once the pile is risky', () => {
  let g = position([1, 2, 3, 4, 5, 9], { pile: pileWith(33) }); assert.equal(AI.hitOrStay(g, g.players[2]), 'hit'); // six sorts: go for seven
  g = position([1, 2, 3, 4, 9], { pile: pileWith(15) }); assert.equal(AI.hitOrStay(g, g.players[2]), 'stay'); // five sorts at 15%
  g = position([2, 9], { pile: pileWith(25) }); assert.equal(AI.hitOrStay(g, g.players[2]), 'hit'); // only two sorts
});

test('Van Meeckeren plays to a sum: pushes through risk below 30, stands once he has it', () => {
  let g = position([9, 12], { pile: pileWith(35) }); assert.equal(AI.hitOrStay(g, g.players[3]), 'hit'); // 21 on the table, 35%
  g = position([9, 12, 11], { pile: pileWith(20) }); assert.equal(AI.hitOrStay(g, g.players[3]), 'stay'); // 32 on the table
  // the plain expected-value player (seat 0) stands where Van Meeckeren pushes
  g = position([9, 12], { pile: pileWith(35) }); assert.equal(AI.hitOrStay(g, g.players[0]), 'stay');
});

test('cashing in: Van Cuyck sells early and follows a seller, Van Meeckeren rides the index, De Busscher takes profit', () => {
  const g = new Game({ mode: 'winter', seed: 3, players: seats(), emit: () => {} });
  const [, c, b, m] = g.players;
  for (const p of g.players) { p.units = 100; p.cost = 100; p.fear = 1; }
  g.evening = 1; // next evening has no crash risk
  assert.equal(AI.sell(g, c), false); assert.equal(AI.sell(g, m), false);
  g.players[0].soldE = 1; assert.equal(AI.sell(g, c), false, 'no panic while the board shows no risk');
  g.evening = 2; g.players[0].soldE = 2; assert.equal(AI.sell(g, c), true, 'if he sells, I sell');
  g.players[0].soldE = -1; g.evening = 4; // next risk 12%
  assert.equal(AI.sell(g, c), true); assert.equal(AI.sell(g, m), false);
  b.units = 100; b.cost = 100 * IDX[4] / 2.6; assert.equal(AI.sell(g, b), true, 'paper worth 2.6x what he wrote');
  b.cost = 100 * IDX[4]; assert.equal(AI.sell(g, b), false);
  g.evening = 6; // next risk 35%
  assert.equal(AI.sell(g, m), true);
  g.evening = 7; for (const p of g.players) assert.equal(AI.sell(g, p), true, 'after VIII the crash is certain');
  assert.ok(PERSONAS.cuyck.table && PERSONAS.busscher.winter && PERSONAS.meeckeren.specials);
});

test('balance: 3,000 winters and 3,000 tavern games, each trader wins 18-34%, the human proxy is playable', async () => {
  for (const mode of ['winter', 'classic']) {
    const win = [0, 0, 0, 0], N = 3000;
    for (let s = 1; s <= N; s++) {
      const g = new Game({ mode, seed: s * 7919, players: seats(), emit: () => {} });
      await g.run();
      const st = g.players.map(p => g.standing(p)), best = Math.max(...st), k = st.filter(x => x === best).length;
      st.forEach((x, i) => { if (x === best) win[i] += 1 / k; });
    }
    const pct = win.map(w => w / N);
    for (const r of pct.slice(1)) assert.ok(r >= 0.18 && r <= 0.34, `${mode}: ${pct.map(x => (x * 100).toFixed(1)).join(' / ')}`);
    assert.ok(pct[0] >= 0.2 && pct[0] <= 0.36, `${mode} proxy ${pct[0]}`);
  }
});

/* ---- the price curve at the end of a winter (chart.js) ---- */
const TC = createRequire(import.meta.url)('../src/tulip7/chart.js');
const fakeWinter = ({ crashAfter, sales = [], at = {}, paper } = {}) => {
  const names = [['You', 'You', null], ['Joost van Cuyck', 'Van Cuyck', 'cuyck'], ['Andries de Busscher', 'De Busscher', 'busscher'], ['Abraham van Meeckeren', 'Van Meeckeren', 'meeckeren']];
  const players = names.map(([name, short, persona], i) => ({ i, name, short, persona, human: i === 0, soldE: -1, atCrash: at[i] || 0, settled: Math.round((at[i] || 0) * 0.035), lastG: 0 }));
  return { crashAfter, alkmaar: true, sales, players, paperLog: paper || IDX.slice(0, crashAfter + 1).map((_, e) => [100 * (e + 1), 50, 50, 50]), standing: () => 0 };
};

test('price curve data: the game line, the cited real prices, every sale and every evening of paper', async () => {
  const real = Object.fromEntries(TC.REAL.map(r => [r.id, r.pts.map(p => +p[1].toFixed(2))]));
  assert.deepEqual(real, { gheele: [1, 50], switsers: [1, 30, 19.41], witte: [1, 26.06, 1.3] }); // Garber 1989, see chart.js
  assert.ok(TC.CRASH_DAY < TC.ALK_DAY && TC.ALK_DAY < TC.STATES_DAY && TC.EV_DAY.every((d, i) => !i || d > TC.EV_DAY[i - 1]));
  for (let s = 1; s <= 150; s++) {
    const { g } = await play('winter', s);
    const d = TC.chartData(g), c = g.crashAfter;
    assert.deepEqual(d.game.map(p => p.v), IDX.slice(0, c + 1));
    assert.equal(d.settle, IDX[c] * 0.035);
    assert.equal(d.ghost.length, IDX.length - 1 - c);
    assert.equal(g.paperLog.length, c + 1);
    for (const p of d.players) {
      assert.equal(p.paper.filter(v => v != null).length, c + 1);
      assert.equal(p.sold.reduce((a, x) => a + x.v, 0), g.players[p.i].sold, 'sales add up to what was cashed in');
      assert.ok(p.sold.every(x => x.e >= 0 && x.e <= c));
      // what you held at the crash is the paper written on the last evening, minus nothing sold that evening
      if (p.atCrash > 0) assert.equal(p.paper[c], p.atCrash);
    }
    assert.ok(d.you.human);
    const svg = TC.chartSVG(d, 340);
    assert.match(svg, /^<svg class="pc" viewBox="0 0 340 \d+"[^>]* role="img" aria-labelledby="pcT pcD"/);
    assert.match(svg, /<title id="pcT">[^<]+<\/title><desc id="pcD">[^<]{200,}<\/desc>/);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), 'a broken number in the svg');
    assert.equal(/You cashed in here/.test(svg), d.you.sold.length > 0);
    assert.ok(TC.commentary(d).length > 30);
  }
});

test('the journey survives a save: resuming gives the same paper log and sales', async () => {
  for (let s = 1; s <= 30; s++) {
    const { g, saves } = await play('winter', s);
    for (const sv of saves) {
      const h = new Game({ mode: 'winter', players: seats(), snap: JSON.parse(sv) });
      await h.run();
      assert.deepEqual([h.paperLog, h.sales], [g.paperLog, g.sales]);
    }
  }
  // a save from before the price curve: no log, the chart still draws from soldE
  const { saves } = await play('winter', 4);
  const old = JSON.parse(saves[saves.length - 1]); delete old.paperLog; delete old.sales;
  const h = new Game({ mode: 'winter', players: seats(), snap: old }); await h.run();
  const svg = TC.chartSVG(TC.chartData(h), 600);
  assert.ok(!/NaN|undefined/.test(svg));
});

test('the one line of commentary says what happened', () => {
  const say = o => TC.commentary(TC.chartData(fakeWinter(o)));
  assert.equal(say({ crashAfter: 7, sales: [{ e: 5, i: 0, v: 900 }, { e: 4, i: 1, v: 300 }], at: { 3: 1244 } }),
    'You sold at evening VI, two evenings before the crash. Van Meeckeren rode it to the end and lost f1,200 of paper.');
  assert.equal(say({ crashAfter: 4, sales: [{ e: 4, i: 0, v: 900 }, { e: 2, i: 1, v: 300 }, { e: 3, i: 2, v: 300 }, { e: 4, i: 3, v: 300 }] }),
    'You sold at evening V, the very last evening before the crash. Every rival got out in time; Van Meeckeren was the last, at evening V.');
  assert.equal(say({ crashAfter: 6, sales: [{ e: 5, i: 0, v: 900 }], at: { 0: 1000, 2: 500 } }),
    'You cashed in at evening VI, but wrote more paper and lost f965 of it in the crash. De Busscher rode it to the end and lost f482 of paper.');
  assert.equal(say({ crashAfter: 3, at: { 0: 2000, 1: 100 }, sales: [{ e: 1, i: 1, v: 50 }] }),
    'You held to the end, and the crash took f1,930 of your paper. Van Cuyck was caught holding f100 and lost f96 of it.');
  assert.equal(say({ crashAfter: 2, sales: [{ e: 0, i: 0, v: 10 }, { e: 1, i: 2, v: 10 }] }),
    'You sold at evening I, two evenings before the crash. Every rival got out in time; De Busscher was the last, at evening II.');
  // rivals who sold on the same last evening are all named
  assert.equal(say({ crashAfter: 7, sales: [{ e: 4, i: 0, v: 9 }, { e: 7, i: 1, v: 9 }, { e: 7, i: 3, v: 9 }, { e: 5, i: 2, v: 9 }] }),
    'You sold at evening V, three evenings before the crash. Every rival got out in time; Van Cuyck and Van Meeckeren were the last, at evening VIII.');
  assert.equal(say({ crashAfter: 7, sales: [{ e: 7, i: 1, v: 9 }, { e: 7, i: 2, v: 9 }, { e: 7, i: 3, v: 9 }] }),
    'You never held paper when it mattered: the crash took nothing from you. Every rival got out in time; Van Cuyck, De Busscher and Van Meeckeren were the last, at evening VIII.');
  assert.equal(say({ crashAfter: 5 }), 'You never held paper when it mattered: the crash took nothing from you.');
  const txt = TC.summaryText(TC.chartData(fakeWinter({ crashAfter: 7, sales: [{ e: 3, i: 1, v: 1 }, { e: 5, i: 1, v: 1 }, { e: 6, i: 1, v: 1 }] }))).join(' ');
  assert.match(txt, /Van Cuyck: cashed in at evenings IV, VI and VII\./);
  assert.match(txt, /Your paper each evening: I f100, II f200/);
});
