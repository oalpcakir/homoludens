/* Tulip 7: the price curve at the end of a winter. No DOM here (the unit tests load this file too).
   chartData(game) turns a finished winter into the numbers the chart draws; commentary(data) writes the one line about
   what happened; chartSVG(data, width) draws it as an inline SVG string; summaryHTML(data) is the same chart as text.

   Two kinds of line share one log scale, each as a multiple of its own first price in the record:
   - the game's index (IDX in engine.js: x1 in mid-November to x7 in early February). It is stylised: the shape follows
     the January 1637 jump in Garber's prices, the numbers were set for play.
   - REAL: prices of common bulbs sold by the pound, from Peter Garber, "Tulipmania", Journal of Political Economy 97
     (1989), as summarised in the game's research notes (tulips/Lale cilginligi oyun analizi.md):
       Gheele Croonen 0.41 guilders on 2 Jan 1637, 20.5 on 5 Feb 1637 (x50).
       Switsers x1 on 2 Jan 1637 to x30 on 5 Feb 1637; per aas 0.17 guilders on 5 Feb, 0.11 in the notarial contracts of
         6 and 9 Feb (so x30 * 0.11 / 0.17 = x19.4 on 9 Feb).
       Witte Croonen (half pound) January 1637 average 64 guilders (drawn at mid-January), 1,668 on 5 Feb (x26.1), and
         within a week about 1/20 of that peak (drawn at 12 Feb as x1.3, marked "about").
     Dates: 3 Feb 1637 Haarlem sale with no bid; 5 Feb Alkmaar; 27 Apr 1637 the States of Holland suspend the contracts;
     May 1638 Haarlem settles at 3.5% (Goldgar 2007; History Today). Nothing else is plotted as history. */
const TC = (() => {
const E = typeof T7 !== 'undefined' ? T7 : require('./engine.js');
const {IDX, ROMAN, SETTLE} = E;
// days after 1 November 1636 (Nov 30, Dec 31, Jan 31 days)
const DAY = {nov: d => d - 1, dec: d => 29 + d, jan: d => 60 + d, feb: d => 91 + d, apr: d => 150 + d};
// the game's evenings, on the dates EVENINGS gives them (mid-month = the 15th, early = the 5th / 1 Feb, late = the 24th / 27th)
const EV_DAY = [DAY.nov(15), DAY.nov(22), DAY.dec(5), DAY.dec(24), DAY.jan(2), DAY.jan(15), DAY.jan(27), DAY.feb(1)];
const CRASH_DAY = DAY.feb(3), ALK_DAY = DAY.feb(5), STATES_DAY = DAY.apr(27);
const REAL = [
  {id:'gheele', name:'Gheele Croonen', pts:[[DAY.jan(2), 1], [DAY.feb(5), 50]], note:'0.41 → 20.5 guilders a pound, 2 Jan to 5 Feb 1637'},
  {id:'switsers', name:'Switsers', pts:[[DAY.jan(2), 1], [DAY.feb(5), 30], [DAY.feb(9), 30 * 0.11 / 0.17]], note:'×30 from 2 Jan to 5 Feb 1637; a third lower in the contracts of 6 and 9 Feb'},
  {id:'witte', name:'Witte Croonen', pts:[[DAY.jan(15), 1], [DAY.feb(5), 1668 / 64], [DAY.feb(12), 1668 / 64 / 20]], about:2, note:'half a pound: 64 guilders on average in January, 1,668 on 5 Feb 1637, about a twentieth of that a week later'}
];
const COLORS = {you:'#c0262d', cuyck:'#2d3340', busscher:'#8a5a32', meeckeren:'#c08a1e', other:'#5a6b7d', index:'#1f4e9c'};
const fmt = g => 'f' + Math.round(g).toLocaleString('en-US');
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/* ---------- data ---------- */
function chartData(g){
  const c = g.crashAfter ?? (IDX.length - 1);
  const paper = g.paperLog || [], sales = g.sales || [];
  const players = g.players.map(p => {
    let sold = sales.filter(s => s.i === p.i).map(s => ({e:s.e, v:s.v}));
    if (!sales.length && p.soldE >= 0) sold = [{e:p.soldE, v:null}]; // a save from before the journey was recorded
    return {i:p.i, name:p.name, short:p.short || p.name, human:!!p.human, persona:p.persona || null,
      color:p.human ? COLORS.you : COLORS[p.persona] || COLORS.other, sold, atCrash:p.atCrash || 0, settled:p.settled || 0,
      paper:IDX.map((_, e) => e <= c && paper[e] ? paper[e][p.i] || 0 : null), alk:g.alkmaar ? (p.lastG || 0) : 0, worth:Math.round(g.standing(p))};
  });
  const game = [];
  for (let e = 0; e <= c; e++) game.push({e, day:EV_DAY[e], v:IDX[e]});
  return {crashAfter:c, early:c < IDX.length - 1, game, settle:IDX[c] * SETTLE, ghost:IDX.slice(c + 1).map((v, k) => ({e:c + 1 + k, day:EV_DAY[c + 1 + k], v})),
    real:REAL, players, you:players.find(p => p.human) || players[0]};
}

/* ---------- the one line ---------- */
function evWord(n){ return n === 1 ? 'one evening' : (WORDS[n] || n) + ' evenings'; }
function commentary(d){
  const you = d.you, c = d.crashAfter, out = [];
  const last = you.sold.length ? you.sold[you.sold.length - 1].e : -1;
  const lost = p => Math.max(0, p.atCrash - p.settled);
  if (last >= 0 && you.atCrash === 0){
    const gap = c - last;
    out.push(gap === 0 ? `You sold at evening ${ROMAN[last]}, the very last evening before the crash.`
      : `You sold at evening ${ROMAN[last]}, ${evWord(gap)} before the crash.`);
  } else if (last >= 0) out.push(`You cashed in at evening ${ROMAN[last]}, but wrote more paper and lost ${fmt(lost(you))} of it in the crash.`);
  else if (you.atCrash > 0) out.push(`You held to the end, and the crash took ${fmt(lost(you))} of your paper.`);
  else out.push('You never held paper when it mattered: the crash took nothing from you.');
  const rivals = d.players.filter(p => !p.human), caught = rivals.filter(p => lost(p) > 0).sort((a, b) => lost(b) - lost(a));
  if (caught.length){
    const r = caught[0];
    out.push(r.sold.length ? `${r.short} was caught holding ${fmt(r.atCrash)} and lost ${fmt(lost(r))} of it.` : `${r.short} rode it to the end and lost ${fmt(lost(r))} of paper.`);
  } else {
    const sellers = rivals.filter(p => p.sold.length).sort((a, b) => b.sold[b.sold.length - 1].e - a.sold[a.sold.length - 1].e);
    if (sellers.length) out.push(`Every rival got out in time; ${sellers[0].short} was the last, at evening ${ROMAN[sellers[0].sold[sellers[0].sold.length - 1].e]}.`);
  }
  return out.join(' ');
}

/* ---------- the SVG ---------- */
const r1 = x => Math.round(x * 10) / 10;
const escX = s => String(s).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
function chartSVG(d, W = 600, o = {}){
  W = Math.max(300, Math.min(760, Math.round(W)));
  const narrow = W < 460, fs = narrow ? 10.5 : 12;
  const ml = narrow ? 30 : 36, mr = narrow ? 6 : 10, top = 12, ph = o.short ? 150 : narrow ? 178 : 220, gap = 30, bh = o.short ? 46 : narrow ? 56 : 66, axis = 34; // short: a phone held sideways
  const H = top + ph + gap + bh + axis;
  // the time axis runs evening by evening (evenly spaced), then the crash, Alkmaar and the spring, compressed after 5 Feb
  const unit = [0, 1, 2, 3, 4, 5, 6, 7, 8.3, 9.7, 12.5], days = [...EV_DAY, CRASH_DAY, ALK_DAY, STATES_DAY];
  const step = (W - ml - mr) / (unit[unit.length - 1] + 0.9), X0 = ml + step * 0.45;
  const X = day => { // piecewise linear between the knots
    if (day <= days[0]) return X0;
    for (let k = 1; k < days.length; k++) if (day <= days[k]) return X0 + step * (unit[k - 1] + (unit[k] - unit[k - 1]) * (day - days[k - 1]) / (days[k] - days[k - 1]));
    return X0 + step * unit[unit.length - 1];
  };
  const lo = Math.log(0.03), hi = Math.log(70), Y = v => top + ph * (1 - (Math.log(Math.max(v, 0.03)) - lo) / (hi - lo));
  const xC = X(CRASH_DAY), xA = X(ALK_DAY), xS = X(STATES_DAY), xEnd = W - mr;
  let s = '';
  // grid + y ticks
  for (const [v, l] of [[0.1, '1/10'], [1, '×1'], [10, '×10'], [50, '×50']]){
    s += `<line class="tg" x1="${ml}" x2="${xEnd}" y1="${r1(Y(v))}" y2="${r1(Y(v))}"/><text class="ty" x="${ml - 4}" y="${r1(Y(v) + 3.5)}" text-anchor="end">${l}</text>`;
  }
  // events: crash, Alkmaar, States of Holland
  s += `<line class="tcrash" x1="${r1(xC)}" x2="${r1(xC)}" y1="${top}" y2="${top + ph}"/>`;
  s += `<text class="tl tcl" x="${r1(xC - 4)}" y="${top + ph - 6}" text-anchor="end">3 Feb · Haarlem: no bid</text>`;
  s += `<line class="tev" x1="${r1(xS)}" x2="${r1(xS)}" y1="${r1(Y(4))}" y2="${top + ph}"/>`; // starts below the peak labels
  // the real series
  const real = d.real.map((ser, k) => {
    const pts = ser.pts.map(([day, v]) => `${r1(X(day))},${r1(Y(v))}`).join(' ');
    const dots = ser.pts.map(([day, v], j) => `<circle class="rd${ser.about === j ? ' about' : ''}" cx="${r1(X(day))}" cy="${r1(Y(v))}" r="2.6"/>`).join('');
    return `<g class="real r${k}"><polyline${k === 0 ? ' class="draw" pathLength="1"' : ''} points="${pts}"/>${dots}</g>`;
  }).join('');
  s += real;
  // peak labels at 5 Feb, to the right of the Alkmaar point (x50 at the top, then x30 and x26 below it)
  const pk = d.real.map(ser => ({n:ser.name, v:ser.pts.find(p => p[0] === ALK_DAY)[1]})).sort((a, b) => b.v - a.v);
  let ly = -1e9; const lx = xA + 9;
  for (const p of pk){ let y = Math.max(Y(p.v) + 4, ly + fs + 1); ly = y; s += `<text class="tl tr" x="${r1(lx)}" y="${r1(y)}">${narrow ? p.n.split(' ')[0] : p.n} ×${Math.round(p.v)}</text>`; }
  // the game's index: drawn to the last evening played, then on to the crash and down to 3½%
  const gpts = d.game.map(p => [X(p.day), Y(p.v)]), lastG = gpts[gpts.length - 1];
  if (d.ghost.length) s += `<polyline class="ghost" points="${[lastG, ...d.ghost.map(p => [X(p.day), Y(p.v)])].map(p => p.map(r1).join(',')).join(' ')}"/>`;
  const gpath = gpts.map(p => p.map(r1).join(',')).join(' ') + ` ${r1(xC)},${r1(lastG[1])} ${r1(xC)},${r1(Y(d.settle))}`;
  s += `<polyline class="gidx draw" pathLength="1" points="${gpath}"/>`;
  s += `<polyline class="gset" points="${r1(xC)},${r1(Y(d.settle))} ${r1(xEnd)},${r1(Y(d.settle))}"/>`;
  s += `<text class="tl tset" x="${r1(xC + 5)}" y="${r1(Y(d.settle) - 5)}">${narrow ? 'settles at 3½%' : 'paper settles at 3½%'}</text>`;
  for (const p of gpts) s += `<circle class="gd" cx="${r1(p[0])}" cy="${r1(p[1])}" r="2.4"/>`;
  // who cashed in where (initials in the portrait colour); who was caught by the crash (a ring on the drop)
  const at = {}; let you = null;
  const mark = (p, x, y, caught) => {
    const k = `${r1(x)}`, n = at[k] = (at[k] || 0) + 1, yy = y + (n - 1) * (narrow ? 14.5 : 16.5);
    const r = narrow ? 6.5 : 7.5, ini = p.human ? 'Y' : p.short.replace(/^(Van|De) /, '')[0];
    return `<g class="mk${caught ? ' caught' : ''}" style="--d:${(1.3 + 0.12 * n).toFixed(2)}s"><title>${escX(p.human ? 'You' : p.name)} ${caught ? (p.human ? 'were' : 'was') + ' caught by the crash' : 'cashed in here'}</title><circle cx="${r1(x)}" cy="${r1(yy)}" r="${r}" fill="${caught ? '#fffaf0' : p.color}" stroke="${caught ? p.color : '#fffaf0'}" stroke-width="${caught ? 2.4 : 1.6}"/><text x="${r1(x)}" y="${r1(yy + fs * .36)}" text-anchor="middle" fill="${caught ? p.color : '#fff'}">${ini}</text></g>`;
  };
  const order = [...d.players.filter(p => p.human), ...d.players.filter(p => !p.human)]; // yours sits on the line, the rivals' hang below
  for (const p of order){
    for (const sl of p.sold){ const x = X(EV_DAY[sl.e]), y = Y(IDX[sl.e]); s += mark(p, x, y, false); if (p.human) you = {x, y}; }
    if (p.atCrash > 0) s += mark(p, xC, Y(IDX[d.crashAfter]), true);
  }
  if (you){ // a callout above the line
    const tw = (narrow ? 96 : 112), tx = Math.min(Math.max(you.x - 18, ml + tw / 2), xC - tw / 2 - 4), ty = Math.max(top + 12, you.y - 30);
    s += `<g class="mk you" style="--d:1.9s"><line class="lead" x1="${r1(you.x)}" y1="${r1(you.y - 8)}" x2="${r1(tx)}" y2="${r1(ty + 3)}"/><text class="tyou" x="${r1(tx)}" y="${r1(ty)}" text-anchor="middle">You cashed in here</text></g>`;
  }
  // your paper, evening by evening (guilders), then what the crash left and Alkmaar's cash
  const by = top + ph + gap, me = d.you, vals = [...me.paper.filter(v => v != null), me.atCrash, me.alk], mx = Math.max(1, ...vals) * 1.22; // room for the top label
  s += `<text class="tband" x="${ml}" y="${by - 10}">Your paper each evening${narrow ? '' : ', in guilders'}</text>`;
  s += `<line class="tg" x1="${ml}" x2="${xEnd}" y1="${by + bh}" y2="${by + bh}"/>`;
  const bw = Math.min(14, step * 0.5), soldE = new Set(me.sold.map(x => x.e));
  const bar = (x, v, cls, k, t) => { const h = Math.max(v > 0 ? 2 : 0, bh * v / mx); return `<rect class="bar ${cls}" style="--d:${(0.15 + k * 0.08).toFixed(2)}s" x="${r1(x - bw / 2)}" y="${r1(by + bh - h)}" width="${r1(bw)}" height="${r1(h)}"><title>${escX(t)}</title></rect>`; };
  me.paper.forEach((v, e) => { if (v != null) s += bar(X(EV_DAY[e]), v, soldE.has(e) ? 'sold' : 'held', e, `Evening ${ROMAN[e]}: ${fmt(v)} of paper${soldE.has(e) ? ', cashed in' : ''}`); });
  if (me.atCrash > 0){ s += bar(xC, me.atCrash, 'lost', 9, `At the crash: ${fmt(me.atCrash)} of paper, settled for ${fmt(me.settled)}`); s += bar(xC, me.settled, 'settled', 10, `Settled for ${fmt(me.settled)}`); }
  if (me.alk > 0) s += bar(xA, me.alk, 'alk', 11, `Alkmaar: ${fmt(me.alk)} in cash`);
  const big = me.paper.reduce((b, v, e) => v != null && v > (me.paper[b] || 0) ? e : b, 0);
  if (me.paper[big] > 0) s += `<text class="tl tbv" x="${r1(X(EV_DAY[big]))}" y="${r1(by + bh - bh * me.paper[big] / mx - 3)}" text-anchor="middle">${fmt(me.paper[big])}</text>`;
  // x axis: evenings, months, the crash and Alkmaar
  const ay = by + bh + 14, xSl = xEnd; // the 27 Apr caption ends at the right edge
  EV_DAY.forEach((day, e) => { s += `<text class="tx${e > d.crashAfter ? ' off' : ''}" x="${r1(X(day))}" y="${ay}" text-anchor="middle">${ROMAN[e]}</text>`; });
  for (const [e, m] of [[0, 'Nov'], [2, 'Dec'], [4, 'Jan'], [7, 'Feb']]) s += `<text class="tm" x="${r1(X(EV_DAY[e]))}" y="${ay + fs + 2}" text-anchor="middle">${m}</text>`;
  s += `<text class="tx crash td" x="${r1(xC)}" y="${ay}" text-anchor="middle">3 Feb</text><text class="tx td" x="${r1(xA)}" y="${ay}" text-anchor="middle">5 Feb</text><text class="tx td" x="${r1(xSl)}" y="${ay}" text-anchor="end">27 Apr</text>`;
  s += `<text class="tm" x="${r1(xA)}" y="${ay + fs + 2}" text-anchor="middle">Alkmaar</text><text class="tm" x="${r1(xSl)}" y="${ay + fs + 2}" text-anchor="end">suspended</text>`;
  // the axis break between 5 Feb and 27 Apr (the spring is squeezed)
  const xb = (xA + xS) / 2;
  const yb = by + bh;
  s += `<rect x="${r1(xb - 4)}" y="${yb - 6}" width="8" height="12" fill="#fffdf7"/><path class="tbrk" d="M${r1(xb - 6)} ${yb + 5}l4 -10M${r1(xb + 2)} ${yb + 5}l4 -10"/>`;
  const title = 'The winter of 1636–37: prices and your paper';
  const desc = summaryText(d).join(' ');
  return `<svg class="pc" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="pcT pcD" style="--fs:${fs}px"><title id="pcT">${escX(title)}</title><desc id="pcD">${escX(desc)}</desc>${s}</svg>`;
}

/* ---------- the same as text ---------- */
function summaryText(d){
  const g = d.game, me = d.you, out = [];
  out.push(`The game's index went from ×${g[0].v} at evening I to ×${g[g.length - 1].v} at evening ${ROMAN[d.crashAfter]}; then the crash, and all paper settled at 3½ per cent.`);
  out.push('Real prices of common bulbs (Garber 1989) rose far more steeply, and later: Gheele Croonen fifty times and Switsers thirty times between 2 January and 5 February 1637, Witte Croonen twenty-six times from its January average.');
  out.push('After the Haarlem sale of 3 February found no buyer, Switsers contracts were a third lower by 9 February and Witte Croonen fell to about a twentieth of its peak within a week. On 27 April the States of Holland suspended the contracts.');
  const paper = me.paper.map((v, e) => v != null ? `${ROMAN[e]} ${fmt(v)}` : null).filter(Boolean).join(', ');
  out.push(`Your paper each evening: ${paper || 'none'}.`);
  for (const p of d.players){
    const who = p.human ? 'You' : p.short, r = p.sold.map(x => ROMAN[x.e]), s = r.length > 1 ? `evenings ${r.slice(0, -1).join(', ')} and ${r[r.length - 1]}` : r.length ? `evening ${r[0]}` : '';
    out.push(`${who}: ${s ? `cashed in at ${s}` : 'never cashed in'}${p.atCrash > 0 ? `; ${fmt(p.atCrash)} of paper at the crash, settled for ${fmt(p.settled)}` : ''}.`);
  }
  return out;
}
function summaryHTML(d){ return `<ul>${summaryText(d).map(t => `<li>${escX(t)}</li>`).join('')}</ul>`; }

return {chartData, commentary, chartSVG, summaryText, summaryHTML, REAL, EV_DAY, CRASH_DAY, ALK_DAY, STATES_DAY, COLORS};
})();
if (typeof module !== 'undefined') module.exports = TC;
