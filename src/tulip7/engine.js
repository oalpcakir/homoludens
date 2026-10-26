/* Tulip 7 engine: the tavern rules + the winter of 1636-37. No DOM here (the bot simulator loads this file too). */
const T7 = (() => {
const VARIETIES = [
  {n:0, id:'t00', name:'Semper Augustus', hex:'#C8102E', ink:'#fff', note:"Dr Adriaen Pauw would not sell his, whatever he was offered. Listed at 6,290 guilders on 5 February 1637. Worth nothing tonight, but there is only one, so it can never be a duplicate."},
  {n:1, id:'t01', name:'Admirael van Enchuysen', hex:'#B03A78', ink:'#fff', note:"4,900 guilders on 5 February 1637 (Garber's price list)."},
  {n:2, id:'t02', name:'Viceroy', hex:'#7B3FB0', ink:'#fff', note:"4,203 guilders at the Alkmaar auction for one bulb of 658 aas, about 33 grams."},
  {n:3, id:'t03', name:'Admirael Liefkens', hex:'#A3162B', ink:'#fff', note:"2,968 guilders on 5 February 1637."},
  {n:4, id:'t04', name:'Admirael van der Eijck', hex:'#F26A4F', ink:'#fff', note:"1,620 guilders at the Alkmaar auction, 5 February 1637."},
  {n:5, id:'t05', name:'Bruyne Purper', hex:'#6B2D5C', ink:'#fff', note:"'Brown purple'. 2,025 guilders at the Alkmaar auction."},
  {n:6, id:'t06', name:'Parragon Schilder', hex:'#B5177A', ink:'#fff', note:"1,615 guilders at the Alkmaar auction."},
  {n:7, id:'t07', name:'Gouda', hex:'#E8578C', ink:'#fff', note:"1,500 guilders at the Alkmaar auction."},
  {n:8, id:'t08', name:'Gheele ende Roote van Leyden', hex:'#EE7417', ink:'#fff', note:"From 17.5 to 136.5 guilders in the five weeks before the crash."},
  {n:9, id:'t09', name:'Admirael de Man', hex:'#D92B23', ink:'#fff', note:"From 18 to 209 guilders in the five weeks before the crash."},
  {n:10, id:'t10', name:'Witte Croonen', hex:'#EDE6D3', ink:'#2a2018', note:"A cheap white tulip sold by the pound. From 2.2 to 57 in five weeks; by 1642 almost worthless again."},
  {n:11, id:'t11', name:'Switsers', hex:'#F2B705', ink:'#2a2018', note:"Red and yellow like a Swiss guard's uniform. A pound sold for 1,100 guilders in this very tavern on 6 February 1637: about the price of a reasonably nice house."},
  {n:12, id:'t12', name:'Gheele Croonen', hex:'#F7CE3E', ink:'#2a2018', note:"The commonest yellow tulip, sold by the pound. From 0.41 to 20.5 between 2 January and 5 February 1637: fifty times in five weeks."}
];
const SPECIAL = {
  mod:   {art:'m_offset', name:'Offsets', note:"Afsetsels: the small bulbs that grow off a mother bulb. They were sold separately. Adds to your evening."},
  x2:    {art:'m_broken', name:'Broken tulip', note:"The flames that made a tulip precious came from a virus carried by aphids. Nobody knew until 1928. Doubles your tulips."},
  freeze:{art:'a_wijnkoop', name:'Wijnkoop', note:"Wine money. Once the buyer paid it at the end of the evening, the deal was binding. The player you choose must stop and bank, and in winter it goes on paper."},
  flip3: {art:'a_seghsman', name:'Seghsman', note:"The broker who chalked the agreed price on the board. The player you choose must take three more papers."},
  second:{art:'a_rouwkoop', name:'Rouwkoop', note:"Regret money: pay it and walk away from a deal. Saves you from one duplicate."}
};
// Price index of paper written on each evening, and the chance that the crash comes before that evening.
const IDX  = [1, 1.25, 1.5, 2, 2.5, 3.5, 5, 7];
const RISK = [0, 0, 0, .04, .08, .12, .20, .35];   // after evening VIII the crash is certain
const EVENINGS = [
  {date:'Mid-November 1636', short:'Nov', news:"The bulbs are in the ground until June. From now on only paper changes hands in the taverns: promises to deliver at the lifting."},
  {date:'22 November 1636', short:'Nov', news:"Jacob van Halmael, a Mennonite merchant weighing tulip deals, buys goods worth a full 12,000 guilders and pays half in cash."},
  {date:'Early December 1636', short:'Dec', news:"Haarlem's small-claims court hears more tulip cases every month."},
  {date:'Late December 1636', short:'Dec', news:"Some contracts have now changed hands five times. Nobody has seen the bulbs."},
  {date:'2 January 1637', short:'Jan', news:"New price lists for the year. The cheapest bulbs, sold by the pound, are on every slate."},
  {date:'Mid-January 1637', short:'Jan', news:"Half a pound of Witte Croonen averages 64 guilders this month."},
  {date:'Late January 1637', short:'Jan', news:"Common bulbs sold by the pound now fetch twenty or thirty times their autumn price."},
  {date:'Early February 1637', short:'Feb', news:"Wouter Winckel's orphans will sell his bulbs for cash at Alkmaar on the 5th."}
];
const SETTLE = 0.035, FEE = 0.025, BONUS = 15, GPP = 10, TARGET = 200;
const ROMAN = ['I','II','III','IV','V','VI','VII','VIII'];

function rng(seed){ const f = () => { f.s = (f.s + 0x6D2B79F5) >>> 0; let t = f.s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; f.s = seed >>> 0; return f; }
function shuffle(a, r){ for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function makeDeck(){
  const d = []; let u = 0;
  for (let n = 0; n <= 12; n++) for (let c = 0; c < Math.max(1, n); c++) d.push({k:'num', v:n, uid:u++});
  for (const v of [2,4,6,8,10]) d.push({k:'mod', v, uid:u++});
  d.push({k:'x2', uid:u++});
  for (const a of ['freeze','flip3','second']) for (let c = 0; c < 3; c++) d.push({k:a, uid:u++});
  return d; // 94 cards
}

class Game {
  constructor(o){
    this.mode = o.mode || 'winter';
    this.seed = o.seed ?? (Math.random() * 2**32 >>> 0);
    this.r = rng(this.seed);
    this.emit = o.emit || (() => {});
    // persona comes from the seat's definition (never from a save), so saves made before personas existed still resume
    this.players = o.players.map((p, i) => ({i, name:p.name, short:p.short || p.name, style:p.style, persona:PERSONAS[p.persona] ? p.persona : null, human:!!p.human, agent:p.agent,
      total:0, purse:0, units:0, cost:0, soldE:-1, settled:0, atCrash:0, cards:[], nums:[], mods:[], x2:false, second:null,
      status:'idle', dest:null, frozen:false, last:0, lastG:0, lastDest:null, busts:0, books:0, sold:0}));
    this.draw = shuffle(makeDeck(), this.r); this.discard = [];
    this.dealer = Math.floor(this.r() * this.players.length);
    this.evening = 0; this.crashed = false; this.alkmaar = false; this.round = 0; this.over = false; this.roundOver = false;
    this.history = []; this.onSave = o.onSave || null; this.resumed = false;
    // each rival reads the crash risk a little differently this game (greedy traders under-read it)
    for (const p of this.players) p.fear = p.style ? STYLES[p.style].fear * (0.8 + 0.4 * this.r()) : 1;
    if (o.snap) this.restore(o.snap);
  }
  /* Saves happen at the start of an evening (after the crash roll) and before Alkmaar / each classic round. */
  snapshot(){
    const K = ['total','purse','units','cost','soldE','settled','atCrash','busts','books','sold','fear'];
    return {v:1, mode:this.mode, seed:this.seed, rs:this.r.s, dealer:this.dealer, evening:this.evening, crashed:this.crashed,
      crashAfter:this.crashAfter ?? null, alkmaar:this.alkmaar, round:this.round, history:this.history,
      draw:this.draw.map(c => c.uid), discard:this.discard.map(c => c.uid),
      players:this.players.map(p => Object.fromEntries(K.map(k => [k, p[k]]))), when:Date.now()};
  }
  restore(s){
    const deck = makeDeck(), byUid = Object.fromEntries(deck.map(c => [c.uid, c]));
    this.r.s = s.rs; this.dealer = s.dealer; this.evening = s.evening; this.crashed = s.crashed; this.crashAfter = s.crashAfter ?? undefined;
    this.alkmaar = s.alkmaar; this.round = s.round; this.history = s.history || [];
    this.draw = s.draw.map(u => byUid[u]); this.discard = s.discard.map(u => byUid[u]);
    s.players.forEach((q, i) => {
      const p = Object.assign(this.players[i], q);
      // saves from before personas: no cost basis or last sale recorded; treat the paper as bought tonight
      if (q.cost === undefined) p.cost = (p.units || 0) * (this.mode === 'winter' && !this.crashed ? IDX[this.evening] : 1);
      if (q.soldE === undefined) p.soldE = -1;
    });
    this.resumed = true;
  }
  save(){ if (this.onSave) this.onSave(this.snapshot()); }
  get idx(){ return this.mode === 'winter' && !this.crashed ? IDX[this.evening] : 1; }
  riskNext(){ return this.evening + 1 < IDX.length ? RISK[this.evening + 1] : 1; }
  paperValue(p){ return this.crashed ? 0 : p.units * this.idx; }
  standing(p){ return this.mode === 'classic' ? p.total : p.purse + p.settled + this.paperValue(p); }
  roundScore(p){
    let s = p.nums.reduce((a, b) => a + b, 0); if (p.x2) s *= 2;
    s += p.mods.reduce((a, b) => a + b, 0); if (p.nums.length >= 7) s += BONUS; return s;
  }
  pile(){ return this.draw.length ? this.draw : this.discard; }
  bustOdds(p){ const pl = this.pile(); if (!pl.length) return 0; let d = 0; for (const c of pl) if (c.k === 'num' && p.nums.includes(c.v)) d++; return d / pl.length; }
  drawCard(){
    if (!this.draw.length){ this.draw = shuffle(this.discard, this.r); this.discard = []; this.emit('reshuffle', {}); }
    return this.draw.pop();
  }
  active(){ return this.players.filter(p => p.status === 'active'); }

  async run(){
    const P = this.players;
    if (this.mode === 'classic'){
      if (this.resumed) await this.emit('resume', {});
      while (!P.some(p => p.total >= TARGET)){ this.save(); await this.playRound(); }
    } else {
      let skip = this.resumed;
      if (!this.crashed) for (let e = this.evening; e < IDX.length; e++){
        if (!skip && e > 0 && this.r() < RISK[e]) break;
        skip = false;
        this.evening = e;
        this.save();
        await this.emit('evening', {e});
        await this.playRound();
        // the evening's winnings are paper; now each trader decides to cash it all in or hold into the next evening
        await this.emit('cashout', {e});
        for (const p of P){
          if (p.units > 0 && await p.agent.sell(this, p)){
            const v = p.units * IDX[e], fee = Math.round(v * FEE);
            p.purse += Math.round(v) - fee; p.sold += Math.round(v) - fee; p.units = 0; p.cost = 0; p.soldE = e;
            await this.emit('sold', {p, v:Math.round(v), fee});
          } else if (p.units > 0) await this.emit('held', {p});
        }
        await this.emit('cashoutDone', {e});
      }
      if (!this.crashed){
        for (const p of P){ p.atCrash = Math.round(p.units * IDX[this.evening]); p.settled = Math.round(p.atCrash * SETTLE); }
        this.crashed = true; this.crashAfter = this.evening;
        await this.emit('crash', {});
        for (const p of P) p.units = 0;
      }
      this.alkmaar = true;
      this.save();
      await this.emit('alkmaar', {});
      await this.playRound();
    }
    this.over = true;
    await this.emit('gameOver', {});
  }

  async playRound(){
    const P = this.players; this.round++; this.roundOver = false;
    for (const p of P){ Object.assign(p, {cards:[], nums:[], mods:[], x2:false, second:null, status:'active', dest:null, frozen:false, bustCard:null}); }
    const n = P.length, order = []; for (let k = 0; k < n; k++) order.push(P[(this.dealer + 1 + k) % n]);
    this.order = order;
    await this.emit('roundStart', {});
    for (const p of order){ if (this.roundOver) break; if (p.status !== 'active') continue; await this.deal(p, false); }
    while (!this.roundOver && P.some(p => p.status === 'active')){
      for (const p of order){
        if (this.roundOver) break; if (p.status !== 'active') continue;
        this.turn = p; await this.emit('turn', {p});
        const d = await p.agent.hitOrStay(this, p);
        if (d === 'stay'){
          p.status = 'stayed';
          await this.emit('stay', {p});
        } else await this.deal(p, false);
      }
    }
    this.turn = null;
    await this.endRound();
  }

  async deal(p, inF3){
    const odds = this.bustOdds(p) * (p.second ? 0 : 1);
    const c = this.drawCard();
    await this.emit('draw', {p, odds, c});
    if (c.k === 'num'){
      if (p.nums.includes(c.v)){
        if (p.second){ const s = p.second; p.second = null; this.discard.push(c, s); await this.emit('saved', {p, c}); }
        else { p.status = 'bust'; p.busts++; p.bustCard = c; await this.emit('bust', {p, c}); }
        return null;
      }
      p.nums.push(c.v); p.cards.push(c); await this.emit('card', {p, c});
      if (p.nums.length === 7){ this.roundOver = true; p.books++; p.status = 'book'; await this.emit('book', {p}); }
      return null;
    }
    if (c.k === 'mod'){ p.mods.push(c.v); p.cards.push(c); await this.emit('card', {p, c}); return null; }
    if (c.k === 'x2'){ p.x2 = true; p.cards.push(c); await this.emit('card', {p, c}); return null; }
    if (c.k === 'second'){
      await this.emit('action', {p, c});
      if (!p.second){ p.second = c; await this.emit('keep', {p, c}); return null; }
      const cands = this.players.filter(q => q !== p && q.status === 'active' && !q.second);
      if (cands.length){ const q = cands.length === 1 ? cands[0] : await p.agent.giveSecond(this, p, cands); q.second = c; await this.emit('give', {p, q, c}); }
      else { this.discard.push(c); await this.emit('waste', {p, c}); }
      return null;
    }
    await this.emit('action', {p, c});
    if (inF3) return c;
    await this.resolve(p, c); return null;
  }

  async resolve(p, c){
    const cands = this.active();
    if (!cands.length){ this.discard.push(c); return; }
    const q = cands.length === 1 ? cands[0] : await p.agent.target(this, p, c, cands);
    this.discard.push(c);
    if (c.k === 'freeze'){
      q.status = 'stayed'; q.frozen = true;
      await this.emit('freeze', {p, q});
    } else {
      await this.emit('flip3', {p, q});
      const pend = [];
      for (let i = 0; i < 3; i++){
        if (q.status !== 'active' || this.roundOver) break;
        const a = await this.deal(q, true); if (a) pend.push(a);
      }
      for (const a of pend){ if (q.status === 'active' && !this.roundOver) await this.resolve(q, a); else this.discard.push(a); }
    }
  }

  async endRound(){
    for (const p of this.players){
      const s = p.status === 'bust' ? 0 : this.roundScore(p); p.last = s; p.lastG = 0; p.lastDest = null;
      if (p.status === 'bust') continue;
      if (this.mode === 'classic'){ p.total += s; continue; }
      const g = s * GPP;
      if (this.alkmaar){ p.purse += 2 * g; p.lastG = 2 * g; p.lastDest = 'purse'; continue; }
      p.units += g / this.idx; p.cost += g; p.lastG = g; p.lastDest = 'paper';
    }
    this.history.push(this.players.map(p => ({s:p.last, st:p.status, d:p.lastDest})));
    await this.emit('roundEnd', {});
    for (const p of this.players){ this.discard.push(...p.cards); if (p.bustCard) this.discard.push(p.bustCard); if (p.second) this.discard.push(p.second); p.cards = []; p.second = null; p.bustCard = null; }
    this.dealer = (this.dealer + 1) % this.players.length;
  }
}

/* ---------- AI ----------
   Every trader sees exactly what the human sees (the cards on the table, the pile count, the board, who cashed in) and
   plays by the same rules. 'style' is the plain expected-value player (used for the human proxy in the simulator and as
   the fallback); a 'persona' gives each of the three archive traders his own habits. */
const STYLES = {
  cautious:{riskW:1.45, margin:.14, fear:1.3, label:'Cautious'},
  balanced:{riskW:1.0,  margin:.05, fear:1.0, label:'Steady'},
  greedy:  {riskW:.68,  margin:-.03, fear:.5, label:'Greedy'}
};
/* The three traders from the archives (Goldgar 2007; Garber 1989). Where the record is thin the habit comes from the
   documented role: Van Cuyck the buyer who backed out over a guarantor, De Busscher the seller and tulip connoisseur,
   Van Meeckeren one of the 37 who spent over 400 guilders.
   - table: how he decides between another paper and standing up in an evening
   - winter: when he cashes in his paper */
const PERSONAS = {
  cuyck:{style:'cautious', label:'Wants a guarantor',
    table:"Stands up as soon as the chance of a duplicate reaches about one in five, unless he holds a Rouwkoop: that is his guarantor, and then he goes on.",
    specials:"Seals his own evening with Wijnkoop when he has something to lose; sends the Seghsman to whoever has most to lose.",
    winter:"Sells everything as soon as the board shows a crash risk above one in ten, and sooner if anyone else at the table has just cashed in.",
    risk:.21, guarded:.40, warn:.10},
  busscher:{style:'balanced', label:'Collects the book',
    table:"Counts sorts, not odds: he wants five different tulips, and with six he chances the seventh for the book.",
    specials:"Uses Wijnkoop to stop whoever is closest to a full book; calls the Seghsman on himself while his book is thin.",
    winter:"A seller: he takes his profit once his paper is worth two and a half times what he wrote, and always before a 20% crash risk.",
    sorts:5, bookOdds:.36, maxOdds:.30, profit:2.5, riskOut:.20},
  meeckeren:{style:'greedy', label:'Big spender',
    table:"Plays to a sum, not to the odds: he takes papers until his evening is worth about 30, and only a very bad pile stops him sooner.",
    specials:"Calls the Seghsman on himself when the pile looks safe; never wastes wine money on his own evening.",
    winter:"Rides the index: holds his paper deep into the winter and cashes in only when the crash risk looks too steep to him.",
    target:30, maxOdds:.45, ride:.20}
};
function holdEV(g, fear = 1){ // what one guilder of paper is expected to be worth at the next evening, as this trader reads the risk
  const e = g.evening; if (e + 1 >= IDX.length) return SETTLE;
  const r = Math.min(1, RISK[e + 1] * fear); return (1 - r) * IDX[e + 1] / IDX[e] + r * SETTLE;
}
function lead(g, p){ return Math.max(...g.players.filter(q => q !== p).map(q => g.standing(q))); }
function behind(g, p){ return g.mode === 'classic' ? lead(g, p) - p.total > 60 : lead(g, p) - g.standing(p) > 1500; }
const sum = a => a.reduce((x, y) => x + y, 0);
/* expected-value rule: the default for the human proxy and any seat without a persona */
function evHit(g, p, w){
  const S = g.roundScore(p), pl = g.pile();
  let dup = 0, gain = 0, newNum = 0;
  for (const c of pl){
    if (c.k === 'num'){ if (p.nums.includes(c.v)) dup++; else { gain += c.v * (p.x2 ? 2 : 1); newNum++; } }
    else if (c.k === 'mod') gain += c.v; else if (c.k === 'x2') gain += p.x2 ? 0 : sum(p.nums);
    else gain += 3;
  }
  const pb = dup / pl.length; if (pb === 0) return 'hit';
  let up = gain / pl.length; if (p.nums.length === 6) up += BONUS * newNum / pl.length;
  const down = p.second ? 3 : S;
  return up > pb * down * w ? 'hit' : 'stay';
}
const TABLE = {
  cuyck(g, p, P){
    const od = g.bustOdds(p), S = g.roundScore(p);
    let thr = p.second ? P.guarded : P.risk;
    if (behind(g, p)) thr += .05;
    if (S < 8) thr += .08; // not worth standing up for nothing
    return od < thr ? 'hit' : 'stay';
  },
  busscher(g, p, P){
    const od = p.second ? 0 : g.bustOdds(p), n = p.nums.length;
    if (n >= 6) return od <= P.bookOdds ? 'hit' : 'stay';
    if (od >= P.maxOdds) return 'stay';
    return n < P.sorts || od < .12 ? 'hit' : 'stay';
  },
  meeckeren(g, p, P){
    const od = p.second ? 0 : g.bustOdds(p), S = g.roundScore(p);
    let target = P.target + (behind(g, p) ? 8 : 0);
    if (S >= target) return od < .06 ? 'hit' : 'stay';
    return od < P.maxOdds ? 'hit' : 'stay';
  }
};
const CASH = { // true = cash it all in now
  cuyck(g, p, P){
    const rn = g.riskNext(), e = g.evening;
    if (rn >= P.warn) return true;
    // someone else just cashed in (this evening, or last evening): if they sell, he sells
    if (rn > 0 && g.players.some(q => q !== p && q.soldE >= e - 1 && q.soldE >= 0)) return true;
    return false;
  },
  busscher(g, p, P){
    const v = p.units * IDX[g.evening];
    return g.riskNext() * p.fear >= P.riskOut || (p.cost > 0 && v >= p.cost * P.profit);
  },
  meeckeren(g, p, P){ return g.riskNext() * p.fear >= P.ride; }
};
const AI = {
  hitOrStay(g, p){
    const S = g.roundScore(p);
    if (g.pile().length && g.bustOdds(p) === 0) return 'hit';
    if (g.mode === 'classic' && p.total + S >= TARGET) return 'stay';
    if (p.persona) return TABLE[p.persona](g, p, PERSONAS[p.persona]);
    const st = STYLES[p.style]; let w = st.riskW; if (behind(g, p)) w *= .8;
    return evHit(g, p, w);
  },
  dest(g, p){ return holdEV(g, p.fear) > 1 + STYLES[p.style].margin ? 'paper' : 'purse'; },
  sell(g, p){
    if (g.evening + 1 >= IDX.length) return true; // after evening VIII the crash is certain
    if (p.persona) return CASH[p.persona](g, p, PERSONAS[p.persona]);
    return holdEV(g, p.fear) < 1 + STYLES[p.style].margin + FEE;
  },
  target(g, p, c, cands){
    const opp = cands.filter(q => q !== p), norm = g.mode === 'classic' ? 10 : 150, me = cands.includes(p), pe = p.persona;
    const atRisk = q => g.roundScore(q) * g.bustOdds(q);
    const pick = f => { let best = null, bv = -1e9; for (const q of opp){ const v = f(q); if (v > bv){ bv = v; best = q; } } return best || p; };
    if (c.k === 'freeze'){
      if (pe === 'cuyck' && me && g.roundScore(p) >= 15 && g.bustOdds(p) >= .08) return p;
      if (pe === 'busscher') { const q = pick(q => q.nums.length * 10 + g.roundScore(q) / 4); if (q.nums.length >= 5) return q; }
      if (pe !== 'meeckeren' && me && atRisk(p) > 7) return p;
      return pick(q => {
        let v = g.standing(q) / norm + Math.max(0, 22 - g.roundScore(q));
        if (g.mode === 'winter' && !g.alkmaar && holdEV(g) < 1) v += g.roundScore(q) * (1 - holdEV(g)) * 2;
        return v;
      });
    }
    // Seghsman: three more papers
    if (me && pe === 'meeckeren' && g.bustOdds(p) < .15 && p.nums.length <= 4) return p;
    if (me && pe === 'busscher' && p.nums.length <= 2 && g.bustOdds(p) < .1) return p;
    if (pe === 'cuyck') return pick(q => atRisk(q) * 2 + g.standing(q) / (norm * 4));
    return pick(q => atRisk(q) + g.standing(q) / (norm * 2));
  },
  giveSecond(g, p, cands){ return cands.reduce((a, b) => g.standing(a) <= g.standing(b) ? a : b); }
};

return {VARIETIES, SPECIAL, IDX, RISK, EVENINGS, SETTLE, FEE, BONUS, GPP, TARGET, ROMAN, STYLES, PERSONAS, Game, AI, holdEV, makeDeck};
})();
if (typeof module !== 'undefined') module.exports = T7;
