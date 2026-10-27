// Kantar: one scripted match against Apprentice Yusuf (Narh rules), recorded as clips for assemble.py.
// node ka.mjs land|port <outdir>
// The human seat plays the engine's own best move (the rival's search, run from our side of the table); on the first
// two turns it is made to use its seals (Three Pans, then Cut) so the camera sees them. Everything else is the game.
import { launch } from './lib.mjs';
const [variant = 'land', OUT = 'out/ka-' + variant] = process.argv.slice(2);
const V = { land: { width: 1440, height: 810, scale: 4 / 3 }, port: { width: 540, height: 810, scale: 2, touch: true } }[variant];
const SET = { snd: false, teach: false, tut: false, diff: 'cirak', mode: 'narh', pv: true };
const { page, rec, srv, close } = await launch({ ...V, seed: Number(process.env.SEED || 1), initArg: SET, init: s => {
  localStorage.setItem('kantar-lang', 'en'); localStorage.setItem('kantar-set', JSON.stringify(s));
} });
await page.goto(srv.url + '/kantar/');
await page.evaluate(() => document.fonts.ready);
await rec.skip(600);
await rec.until(() => typeof start === 'function' && typeof mirrorS === 'function', null, 30000, false);
await page.evaluate(() => {
  document.getElementById('rules').classList.add('hide'); start(0);
  // the best move for the human seat, among the moves that pass `want`
  window.__best = want => {
    const m = mirrorS(G), kids = children(m).filter(([o]) => want(o, G));
    let best = -1e9, bi = 0;
    kids.forEach((k, i) => { const v = search(k[1], m.turn + 2, -1e9, 1e9); if (v > best) { best = v; bi = i; } });
    return kids[bi][0];
  };
});
const port = variant === 'port';
// on a phone the page scrolls: keep the scale and the stall in view
const view = async () => { if (port) await page.evaluate(() => { const el = document.querySelector('#prompt') || document.querySelector('#scale'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 8); }); };

const st = () => page.evaluate(() => ({ phase: G.phase, mine: ownerOf(G) === 0 && !ui.busy, turn: G.turn, end: !document.getElementById('endM').classList.contains('hide') }));

// make my move: visibly, one good at a time (live) or at once (skipping)
async function move(policy, think = 450) {
  const live = rec.on;
  const s = await st();
  const pause = async ms => { if (live) await rec.wait(ms); };
  const press = async sel => { if (live) await rec.press(sel); else await page.evaluate(q => document.querySelector(q).click(), sel); };
  if (s.phase === 'split') {
    const o = await page.evaluate(p => { const o = __best(eval(p)); return { idxs: o.idxs, piles: o.piles }; }, policy.split.toString());
    await pause(think);
    if (o.piles.length === 3) { await press('button.seal[data-seal="uc"]'); await pause(380); }
    const free = o.idxs.slice(), market = await page.evaluate(() => G.market);
    for (const [k, pile] of o.piles.entries()) for (const c of pile) {
      const j = free.findIndex(i => market[i] === c); const mi = free.splice(j, 1)[0];
      if (live) { await page.evaluate(i => document.querySelector(`#market [data-mi="${i}"]`)?.classList.add('vpress'), mi); await rec.wait(110); }
      await page.evaluate(([i, k]) => placeCard(i, k), [mi, k]);
      await pause(430);
    }
    await pause(250);
    await press('#offer');
  } else {
    const o = await page.evaluate(p => __best(eval(p)), (s.phase === 'choose' ? policy.choose : (o => true)).toString());
    await pause(think);
    if (o.cut) {
      await press('button.seal[data-seal="kes"]'); await pause(450);
      await press(`.dish button.card[data-pan="${o.cut[0]}"][data-i="${o.cut[1]}"]`); await pause(800);
    }
    await press('#pan' + o.pick);
  }
}
const NOSEAL = { split: o => o.piles.length === 2, choose: o => !o.cut };
async function play(until, policy = NOSEAL, think) {
  for (let i = 0; i < 20000; i++) {
    const s = await st();
    if (await until(s)) return s;
    if (s.mine && s.phase !== 'end') { await move(policy, think); continue; }
    if (rec.on) await rec.frame(); else await rec.skip(100);
  }
  throw new Error('play: stuck');
}

// clip 1: my first split with the Three Pans seal; the rival picks a pan, I keep one of the other two, the third burns
await rec.skip(1200); await view();
rec.clip(OUT + '/c1');
await play(s => s.turn >= 1 && s.phase === 'choose' && s.mine, { split: o => o.piles.length === 3, choose: o => !o.cut });
await rec.wait(300);
rec.stop();
console.log('c1', rec.n);
// clip 2: the rival divides; I cut one good with the Cut seal and take a pan
await view();
rec.clip(OUT + '/c2');
await play(s => s.turn >= 2, { split: o => o.piles.length === 2, choose: o => !!o.cut });
await rec.wait(1200);
rec.stop();
console.log('c2', rec.n);
// the rest of the match, quietly; then the end sheet with its art
await play(s => s.phase === 'end');
await page.evaluate(() => { const r = score(G); return r; }).then(r => console.log('score', JSON.stringify(r.p), 'winner', r.w));
rec.clip(OUT + '/c3');
await play(s => s.end);
await rec.wait(5000);
rec.stop();
console.log('c3', rec.n);
await rec.shot(OUT + '/end.png');
await close();
