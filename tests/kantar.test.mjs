// Kantar rules engine and AI fairness. The engine is taken straight from the game page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../src/kantar/kantar.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const engine = script.split('/* ================= sound')[0];
const ctx = { console, Math, JSON, Object, Array, Set };
vm.createContext(ctx);
vm.runInContext('var set={diff:"usta"};' + engine + `
function owner(s){return s.phase==='choose'?1-s.splitter:s.splitter}
function count(s){return s.hidden.length+s.open.length+s.market.length+s.deck.length+tot(s.tab[0])+tot(s.tab[1])+tot(s.burned)+(s.piles?s.piles.flat().length:0)}
function randomGame(first,mode,tut,aiSeat){let s=newGame(first,mode,tut),bad=[];
  while(s.phase!=='end'){
    if(count(s)!==24)bad.push('cards '+count(s));
    SU.forEach(c=>{if(s.price[c]<PMIN||s.price[c]>PMAX)bad.push('price')});
    if(s.phase==='split'&&s.market.length<3)bad.push('market');
    const k=children(s);s=(owner(s)===aiSeat)?aiAct(s)[1]:k[Math.random()*k.length|0][1];
  }
  return {s,bad,r:score(s)};
}
function values(s){return children(s).map(k=>+search(k[1],s.turn+1,-1e9,1e9).toFixed(9))}
function reshuffle(s){const n=cl(s),h=[...s.hidden,...s.deck.slice(3)];for(let i=h.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[h[i],h[j]]=[h[j],h[i]]}
  n.hidden=h.slice(0,3);n.deck=[...s.deck.slice(0,3),...h.slice(3)];return n}`, ctx);
const run = c => JSON.parse(JSON.stringify(vm.runInContext(c, ctx)));

for (const mode of ['classic', 'narh']) {
  test(`random games keep every card and price in range (${mode})`, () => {
    for (let g = 0; g < 250; g++) {
      const { bad, s, r } = run(`randomGame(${g % 2},'${mode}',${g % 3 === 0},-1)`);
      assert.deepEqual(bad, []); assert.equal(s.turn, 6); assert.ok([0, 1, -1].includes(r.w));
    }
  });
}

test('compensation coin: +1 Classic, +2 Narh to the second divider; Classic ties go to them', () => {
  for (const first of [0, 1]) {
    const n = run(`(()=>{const s=newGame(${first},'narh',false);s.phase='end';return score(s)})()`);
    assert.equal(n.kw, 1 - first); assert.equal(n.kefil, 2); assert.equal(n.w, 1 - first);
    const c = run(`(()=>{const s=newGame(${first},'classic',false);s.phase='end';return score(s)})()`);
    assert.equal(c.kefil, 1); assert.equal(c.w, 1 - first);
  }
  const tie = run(`(()=>{const s=newGame(0,'classic',false);s.phase='end';s.tab=[{S:0,I:0,K:0,B:2},{S:0,I:0,K:0,B:0}];return score(s)})()`);
  // player 0: copper 2; player 1: light load 3 + compensation 1 = 4 -> player 1
  assert.deepEqual([tie.p[0], tie.p[1], tie.w], [2, 4, 1]);
});

test('teaching round: no seals in round 1, both seals from round 2', () => {
  assert.deepEqual(run(`(()=>{const s=newGame(0,'narh',true);return [splitOpts(s).some(o=>o.piles.length===3),splitOpts({...s,turn:1}).some(o=>o.piles.length===3)]})()`), [false, true]);
});

test('AI and teacher evaluations never depend on hidden cards (face-down three and deck beyond the caravan)', () => {
  let changed = 0, checked = 0;
  for (let g = 0; g < 25; g++) {
    changed += run(`(()=>{let s=newGame(${g % 2},'${g % 2 ? 'narh' : 'classic'}',false),c=0;
      while(s.phase!=='end'){const a=JSON.stringify(values(s));for(let r=0;r<2;r++)if(JSON.stringify(values(reshuffle(s)))!==a)c++;
        const k=children(s);s=k[Math.random()*k.length|0][1]}return c})()`);
    checked++;
  }
  assert.equal(changed, 0);
});

test('the Master beats a random player almost always', () => {
  let won = 0;
  for (let g = 0; g < 30; g++) if (run(`randomGame(${g % 2},'narh',false,1)`).r.w === 1) won++;
  assert.ok(won >= 25, `Master won ${won}/30`);
});

// The page runs the search in a Web Worker built from the engine's own text (from the "engine:" marker to the sound
// section). Run that exact text as a worker would (no window; self.onmessage / postMessage) and check it answers
// every job exactly as the page's own copy does, on many random positions (same seed -> same move).
const workerSrc = script.slice(script.indexOf('/* ================= engine:'), script.indexOf('/* ================= sound'));
function fakeWorker() {
  const out = [];
  const w = { console, Math, JSON, Object, Array, Set, Error, String, postMessage: m => out.push(JSON.parse(JSON.stringify(m))) };
  w.self = w; vm.createContext(w); vm.runInContext(workerSrc, w);
  return { ask: m => { w.self.onmessage({ data: JSON.parse(JSON.stringify(m)) }); return out.pop(); } };
}
test('worker source is complete and answers like the page (AI moves and teacher analysis, many random positions)', () => {
  assert.ok(workerSrc.length > 2000 && !/document\.|window\./.test(workerSrc.replace(/typeof window/g, '')), 'engine section touches the DOM');
  const W = fakeWorker();
  let n = 0;
  for (let g = 0; g < 24; g++) {
    const states = run(`(()=>{let s=newGame(${g % 2},'${g % 3 ? 'narh' : 'classic'}',${g % 4 === 0}),out=[];
      while(s.phase!=='end'){out.push(s);const k=children(s);s=k[Math.random()*k.length|0][1]}return out})()`);
    for (const s of states) {
      for (const diff of ['usta', 'cirak']) {
        const seed = (n * 2654435761) >>> 0;
        const want = run(`runJob(${JSON.stringify({ type: 'ai', s, diff, seed })})`);
        const got = W.ask({ id: ++n, type: 'ai', s, diff, seed });
        assert.equal(got.ok, true, got.err); assert.equal(got.id, n); assert.deepEqual(got.res, want);
      }
      const owner = s.phase === 'choose' ? 1 - s.splitter : s.splitter;
      if (owner === 0) {
        const want = run(`runJob(${JSON.stringify({ type: 'teach', s })})`);
        const got = W.ask({ id: ++n, type: 'teach', s });
        assert.equal(got.ok, true, got.err); assert.deepEqual(got.res, want);
        assert.ok(got.res.reasons.every(r => Array.isArray(r) && typeof r[0] === 'string'), 'reasons are data');
      }
    }
  }
  assert.ok(n > 400, `only ${n} jobs`);
  assert.equal(W.ask({ id: 1, type: 'nope' }).ok, false);
});

test('seeded AI: same position and seed give the same move; the move is always legal', () => {
  const r = run(`(()=>{let bad=0,diffSeeds=0;for(let g=0;g<20;g++){let s=newGame(g%2,'narh',false);
    while(s.phase!=='end'){const a=JSON.stringify(aiAct(s,'cirak',g*7+s.turn)[0]),b=JSON.stringify(aiAct(s,'cirak',g*7+s.turn)[0]);if(a!==b)bad++;
      if(!children(s).some(k=>JSON.stringify(k[0])===a))bad++;const k=children(s);s=k[Math.random()*k.length|0][1]}}return bad})()`);
  assert.equal(r, 0);
});

test('Narh ties: the Saffron leader wins; no Saffron leader is a draw', () => {
  const r = run(`(()=>{const s=newGame(0,'narh',false);s.phase='end';s.tab=[{S:0,I:1,K:0,B:0},{S:0,I:0,K:0,B:1}];const a=score(s);
    s.tab=[{S:1,I:0,K:0,B:0},{S:0,I:1,K:0,B:2}];const b=score(s);return [a.p,a.w,b.p,b.w]})()`);
  // a: Silk 4 vs Copper 2 + coin 2, Saffron level -> draw; b: Saffron 5 + light load 3 vs Silk 4 + Copper 2 + coin 2 -> 8-8, Saffron leader wins
  assert.deepEqual(r.slice(0, 2), [[4, 4], -1]);
  assert.equal(r[2][0], r[2][1]); assert.equal(r[3], 0);
});

// ---- match review: replay, judging and classification (deterministic positions) ----
// A fixed deal: the stall is Coffee, Copper, Saffron, Silk, Coffee; the rival (seat 1) divides first and offers
// Coffee+Copper / Saffron; the player chooses (Cut is open: no teaching round).
const FIXED = `(()=>{const s=dealFrom('SIKBSIKBSIKBSIKBIKBKBKBB'.split(''),1,'classic',false);const a={idxs:[0,1,2],piles:[['K','B'],['S']]};return {s,a,c:doSplit(s,a.idxs,a.piles)}})()`;

test('review thresholds: best < 0.1 ≤ good < 0.6 ≤ inaccuracy < 1.5 ≤ mistake < 3 ≤ blunder', () => {
  assert.deepEqual(run(`[0,.099,.1,.599,.6,1.499,1.5,2.999,3,9].map(rvClass)`),
    ['best', 'best', 'good', 'good', 'inacc', 'inacc', 'mistake', 'mistake', 'blunder', 'blunder']);
});

test('review: every choice in a fixed position is classified by its loss against the best (all five classes)', () => {
  const r = run(`(()=>{const {c}=${FIXED};return chooseOpts(c).map(o=>{const j=judgeMove(c,o,0);return [JSON.stringify(o),j.cls,+j.loss.toFixed(3),j.cls===rvClass(j.loss),j.best]})})()`);
  const cls = Object.fromEntries(r.map(([o, c]) => [o, c]));
  assert.equal(cls['{"cut":null,"pick":0}'], 'blunder');     // Coffee+Copper, leaving the Saffron
  assert.equal(cls['{"cut":null,"pick":1}'], 'good');        // the Saffron without the Cut
  assert.equal(cls['{"cut":[0,0],"pick":1}'], 'best');       // cut a Coffee, take the Saffron
  assert.equal(cls['{"cut":[0,1],"pick":1}'], 'inacc');
  assert.equal(cls['{"cut":[1,0],"pick":0}'], 'mistake');
  assert.ok(r.every(x => x[3]), 'class does not follow the loss');
  const best = r.find(x => x[1] === 'best');
  assert.equal(best[2], 0); assert.deepEqual(best[4], { cut: [0, 0], pick: 1 });
  // deterministic: the same answer twice
  assert.deepEqual(run(`(()=>{const {c}=${FIXED};return judgeMove(c,{cut:null,pick:0},0)})()`), run(`(()=>{const {c}=${FIXED};return judgeMove(c,{cut:null,pick:0},0)})()`));
});

test('review: the rival\'s seat is judged on the mirrored position; a division matches whatever stall order', () => {
  const r = run(`(()=>{const {s,a,c}=${FIXED};const j1=judgeMove(s,a,1),j0=judgeMove(mirrorS(s),a,0);
    const other={idxs:[4,1,2],piles:[['B','K'],['S']]};   // the other Coffee, piles listed the other way round
    const j2=judgeMove(s,other,1);return [j1.loss,j0.loss,j1.cls,j2.loss,actKey(s,a)===actKey(s,other),j1.gain]})()`);
  assert.equal(r[0], r[1]); assert.equal(r[2], 'mistake'); assert.equal(r[3], r[0]); assert.equal(r[4], true);
  assert.equal(typeof r[5], 'number');
});

test('review: a match replays from its deal and every decision (cuts, Three Pans) can be judged', () => {
  for (let g = 0; g < 8; g++) {
    const r = run(`(()=>{let s=newGame(${g % 2},'${g % 2 ? 'narh' : 'classic'}',${g % 3 === 0}),hist=[];
      while(s.phase!=='end'){const w=s.phase==='choose'?1-s.splitter:s.splitter,k=children(s);
        const pref=k.filter(x=>(x[0].piles&&x[0].piles.length===3)||x[0].cut);const pool=pref.length&&Math.random()<.5?pref:k,[a,n]=pool[Math.random()*pool.length|0];
        hist.push({w,act:a});s=n}
      const rp=replayHist(s.all,s.first,s.mode,s.tut,hist);
      const js=rp.steps.map(st=>judgeMove(st.s,st.act,st.w));
      let wrongSeat=false;try{replayHist(s.all,s.first,s.mode,s.tut,[{w:1-hist[0].w,act:hist[0].act}])}catch(e){wrongSeat=true}
      return {same:JSON.stringify(rp.end)===JSON.stringify(s),n:hist.length,ok:js.every(j=>RV_CLASSES.includes(j.cls)&&j.loss>=0&&j.cls===rvClass(j.loss)),
        bestIsBest:rp.steps.every(st=>judgeMove(st.s,judgeMove(st.s,st.act,st.w).best,st.w).loss===0),wrongSeat}})()`);
    assert.equal(r.same, true, 'replay does not reach the final position');
    assert.ok(r.n >= 12, `only ${r.n} decisions`);
    assert.equal(r.ok, true); assert.equal(r.bestIsBest, true); assert.equal(r.wrongSeat, true);
  }
});

test('review jobs run in the worker exactly as on the page', () => {
  const W = fakeWorker();
  const st = run(`(()=>{const {s,a,c}=${FIXED};return {s,a,c}})()`);
  for (const [s, act, seat] of [[st.c, { cut: [0, 0], pick: 1 }, 0], [st.c, { cut: null, pick: 0 }, 0], [st.s, st.a, 1]]) {
    const want = run(`runJob(${JSON.stringify({ type: 'judge', s, act, seat })})`);
    const got = W.ask({ id: 7, type: 'judge', s, act, seat });
    assert.equal(got.ok, true, got.err); assert.deepEqual(got.res, want);
  }
});
