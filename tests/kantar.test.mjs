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
