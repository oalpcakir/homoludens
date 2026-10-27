// Tulip 7: one scripted winter, recorded as clips (the edit picks frame ranges from them, see assemble.py).
// node t7.mjs land|port <outdir>
// The game is real: the engine, the rivals' AI, the animations. The script only plays the human seat, orders the
// next paper in the pile for some draws (so the camera sees a book, a burn) and keeps the crash for the last evening.
import { launch } from './lib.mjs';
const [variant = 'land', OUT = 'out/t7-' + variant] = process.argv.slice(2);
const V = { land: { width: 1152, height: 648, scale: 5 / 3 }, port: { width: 540, height: 810, scale: 2, touch: true } }[variant];
const { page, rec, srv, close } = await launch({ ...V, seed: 7, init: () => {
  localStorage.setItem('tulip7.set', JSON.stringify({ fast: true, help: false, sound: false, mode: 'winter' }));
  document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'footer,.foot,.site-foot{display:none!important}'; document.head.append(s); });
} });
await page.goto(srv.url + '/tulip7/');
await page.evaluate(() => document.fonts.ready);
await rec.skip(600);
await page.evaluate(() => {
  document.querySelector('#go').click();
  window.__log = []; window.__m = 0; window.__mark = () => { __m = __log.length; }; window.__since = e => __log.slice(__m).some(x => x.startsWith(e));
  const on = window.onEvent;
  window.onEvent = (t, d) => { __log.push(t + (d.p ? ':' + d.p.i : '')); if (t === 'cashoutDone' && G.evening < 7) G.__nc = true; return on(t, d); };
  const r = G.r, w = () => { if (G.__nc) { G.__nc = false; return 0.999; } return r(); };
  Object.defineProperty(w, 's', { get: () => r.s, set: v => { r.s = v; } });
  G.r = w;
  // the rivals ride the index through the last evening, so the crash has paper to take
  const sell = Bot.sell; Bot.sell = (g, p) => g.evening >= 7 ? false : sell(g, p);
  window.__plan = { you: 'new', rivalDup: 0, rivals: null };
  const deal = Object.getPrototypeOf(G).deal;
  G.deal = function (p, f) {
    const pl = this.draw; let want = null;
    if (p.human) want = __plan.you;
    else if (__plan.rivalDup > 0 && p.nums.length >= 1) { want = 'dup'; __plan.rivalDup--; }
    else want = __plan.rivals;
    if (want && pl.length) {
      let j = -1;
      if (want === 'new') { for (const v of [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) { if (p.nums.includes(v)) continue; j = pl.findIndex(c => c.k === 'num' && c.v === v); if (j >= 0) break; } }
      else j = pl.findIndex(c => c.k === 'num' && p.nums.includes(c.v));
      if (j >= 0) pl.push(pl.splice(j, 1)[0]);
    }
    return deal.call(this, p, f);
  };
});

const state = () => page.evaluate(() => ({ over: !!(window.G && G.over), modal: !document.querySelector('#modal').hidden, ann: !document.querySelector('#ann').hidden,
  act: !!document.querySelector('#ctrl [data-act]'), cash: !!document.querySelector('#ctrl [data-cash]'), pick: !!document.querySelector('#ctrl [data-pick]'), tip: !!document.querySelector('[data-tip]'),
  n: G.players[0].nums.length, ev: G.evening, crashed: G.crashed, alk: G.alkmaar, svg: !!document.querySelector('#cbox svg.pc'), roundEnd: __since('roundEnd'), bust: __since('bust:0') }));
const click = sel => page.evaluate(s => document.querySelector(s).click(), sel);

// play the human seat until stop(st) is true. rec: frames are recorded (and presses are visible, with a human pause)
async function drive(stop, { hitTo = 4, cash = () => 'hold', think = 380, max = 120000 } = {}) {
  const t0 = await page.evaluate(() => __vt());
  for (;;) {
    const st = await state();
    if (stop(st)) return st;
    if ((await page.evaluate(() => __vt())) - t0 > max) throw new Error('drive timeout ' + JSON.stringify(st));
    const live = rec.on;
    const go = async sel => { if (live) { await rec.wait(think); await rec.press(sel); } else { await click(sel); } };
    if (st.modal && !st.over) { await go('#mbox [data-v]'); continue; }
    if (st.ann) { if (!live) await click('#ann'); else await rec.frame(); continue; }
    if (st.tip) { await click('[data-tip]'); continue; }
    if (st.pick) { await go('#ctrl [data-pick]'); continue; }
    if (st.cash) { await go(`#ctrl [data-cash="${cash(st)}"]`); continue; }
    if (st.act) { await go(`#ctrl [data-act="${st.n < hitTo ? 'hit' : 'stay'}"]`); continue; }
    if (live) await rec.frame(); else await rec.skip(100);
  }
}
const seen = async ev => page.evaluate(e => __log.includes(e), ev);

// clip 1: evening I: the deal flies out, I build a tulip book (two rivals burn on the way)
await rec.until(() => __log.includes('roundStart'), null, 10000, false);
await page.evaluate(() => { __plan.rivalDup = 3; __plan.rivals = 'new'; });
rec.clip(OUT + '/c1');
await page.evaluate(() => __mark());
await drive(st => st.roundEnd, { hitTo: 7, think: 260 });
await rec.wait(900);
rec.stop(); await page.evaluate(() => { __plan.rivals = null; });
console.log('c1', rec.n);

// evenings II-V: play quietly; evening VI: my own hand goes up in smoke
await drive(st => st.ev === 5 && st.act && st.n >= 4, { hitTo: 4 });
await page.evaluate(() => { __plan.rivals = 'new'; });
rec.clip(OUT + '/c2');
await drive(st => st.n >= 5 && st.act, { hitTo: 9, think: 300 });
await page.evaluate(() => { __plan.you = 'dup'; __mark(); });
await drive(st => st.bust, { hitTo: 9, think: 300 });
await rec.wait(2200);
rec.stop(); await page.evaluate(() => { __plan.you = 'new'; __plan.rivals = null; });
console.log('c2', rec.n);

// end of evening VII: hold the paper, the index board moves on to VIII ×7
await drive(st => st.ev === 6 && st.cash, { hitTo: 4 });
rec.clip(OUT + '/c3');
await drive(st => st.ev === 7 && st.act, { hitTo: 4, think: 600 });
rec.stop();
console.log('c3', rec.n);

// end of evening VIII: cash in, then the crash
await drive(st => st.ev === 7 && st.cash, { hitTo: 4 });
rec.clip(OUT + '/c4');
await drive(st => st.crashed && st.modal, { cash: () => 'sell', think: 600 });
await rec.wait(1800);
rec.stop();
console.log('c4', rec.n);

// Alkmaar, then the end: the real price curve draws in
await drive(st => st.svg, { hitTo: 4 });
rec.clip(OUT + '/c5');
await rec.wait(4500);
rec.stop();
console.log('c5', rec.n);
console.log(JSON.stringify(await page.evaluate(() => ({ line: document.querySelector('#cline')?.textContent, h: document.querySelector('#mbox h2')?.textContent }))));
await rec.shot(OUT + '/end.png');
await close();
