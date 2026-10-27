// ================= Retourvloot — simulation model =================
const EPOCH = Date.UTC(1602, 0, 1);
const DAYMS = 864e5;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MON3 = MONTHS.map(m => m.slice(0, 3));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = Math.random;
function dateOf(t) { return new Date(EPOCH + Math.floor(t) * DAYMS); }
function yearOf(t) { return dateOf(t).getUTCFullYear(); }
function tOf(y, m = 1, d = 1) { return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAYMS); }
function mdOf(t) { const d = dateOf(t); return (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
function fmtDate(t) { const d = dateOf(t); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
function fmtMon(t) { const d = dateOf(t); return MON3[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
function money(v) {
  const s = v < 0 ? '−' : ''; v = Math.abs(v);
  if (v >= 1e6) return s + 'ƒ' + (v / 1e6).toFixed(v >= 1e8 ? 0 : v >= 1e7 ? 1 : 2) + 'M';
  if (v >= 1e3) return s + 'ƒ' + Math.round(v / 1e3) + 'k';
  return s + 'ƒ' + Math.round(v);
}
function num(v) { return Math.round(v).toLocaleString('en-US'); }

const START_T = tOf(1602, 3, 20);
const END_T = tOf(1800, 1, 1);
const NOMINAL = 6424588;
const CREW = 250, SOLDIERS = 110, SAILORS_HOME = 140;

const SHIP_NAMES = ['Amsterdam','Mauritius','Hollandia','Zeelandia','Gelderland','Nassau','Oranje','Delft','Middelburg','Enkhuizen','Hoorn','Rotterdam','Duyfken','Wapen van Hoorn','Walcheren','Vlissingen','Den Briel','Leyden','Utrecht','Haarlem','Witte Leeuw','Batavia','Texel','Westfriesland','Sloten','Schiedam','Vergulde Draeck','Ridderschap','Hof van Zeeland','Amersfoort','Zuytdorp','Zeewijk','Huis te Kruiningen','Princes Maria','Gouden Leeuw','Wapen van Delft','Arnemuiden','Veere','Goes','Purmerend','Edam','Monnickendam','Medemblik','Alkmaar','Dordrecht','Gouda'];

const GOODS = {
  pepper:   { name: 'Pepper',      sub: 'Java & Malabar',               cost: 200 },
  fine:     { name: 'Fine spices', sub: 'nutmeg, mace, cloves, cinnamon', cost: 350 },
  textiles: { name: 'Textiles',    sub: 'Indian cottons & silk',         cost: 1200 },
  coffee:   { name: 'Coffee',      sub: 'Mocha & Java',                  cost: 350 },
  tea:      { name: 'Tea',         sub: 'Canton',                        cost: 700 },
};
const GOOD_KEYS = ['pepper', 'fine', 'textiles', 'coffee', 'tea'];
const LOAD_ORDER = ['fine', 'textiles', 'tea', 'coffee', 'pepper'];
function goodUnlocked(g, y) { return g === 'coffee' ? y >= 1700 : g === 'tea' ? y >= 1729 : true; }

// European market. d = yearly demand (t), p0 = price at which demand clears, e = elasticity, eic = English supply (t/yr)
function market(S, g, y) {
  switch (g) {
    case 'pepper': return { p0: 1100, d: 1800 + Math.max(0, y - 1650) * 4, e: 1.2, eic: 300 + Math.max(0, y - 1620) * 4 - (S.flags.bantamWar ? 150 : 0) };
    case 'fine': {
      return { p0: 5200, d: 260, e: 0.7, eic: fineLeaks(S).total };
    }
    case 'textiles': {
      const d = Math.min(2600, 120 + Math.max(0, y - 1610) * 22);
      const boost = S.flags.eicIndia ? 1.25 : 1;
      return { p0: 3400, d, e: 1.4, eic: d * Math.min(0.9, 0.15 + Math.max(0, y - 1640) * 0.006) * boost };
    }
    case 'coffee': {
      const k = clamp((y - 1711) / 80, 0, 1);
      return { p0: 3000 - 2300 * k, d: 150 + 1400 * k, e: 1.3, eic: (150 + 1400 * k) * 0.35 };
    }
    case 'tea': {
      const k = clamp((y - 1729) / 60, 0, 1);
      const boost = S.flags.eicIndia ? 1.25 : 1;
      return { p0: 2400 - 900 * k, d: 300 + 2500 * k, e: 1.5, eic: (300 + 2500 * k) * (0.8 + 0.6 * k) * boost };
    }
  }
}
// Who else sells fine spices in Europe: each source closes when its monopoly is won
function fineLeaks(S) {
  const nutmeg = S.flags.banda === 'conquest' ? 0 : 50;
  const cloves = S.flags.hongi && S.flags.makassar ? 0 : (S.flags.hongi || S.flags.makassar ? 15 : 30) - (S.flags.amboyna ? 5 : 0);
  const cinnamon = S.asia.posts.ceylon ? 0 : 20;
  const smuggled = S.flags.privateTrade ? 10 : 0;
  return { nutmeg, cloves, cinnamon, smuggled, total: nutmeg + cloves + cinnamon + smuggled };
}
function auctionPrice(S, g, released, remaining, y) {
  const m = market(S, g, y);
  const D = m.d / 2;
  const Q = Math.max(1, released + m.eic / 2);
  let p = m.p0 * Math.pow(D / Q, 1 / m.e);
  p = clamp(p, 0.15 * m.p0, 3 * m.p0);
  p *= 1 / (1 + 0.35 * remaining / D); // merchants know what is still in the warehouse
  return p;
}

// Trading posts. how: auto (comes with the period), letter (you can order it), event
const POSTS = {
  bantam:     { name: 'Bantam', good: 'pepper', cap: 1600, upkeep: 40000, garrison: 150, from: 1603, how: 'auto', lon: 106.1, lat: -6.0, desc: 'Pepper port on Java.' },
  ambon:      { name: 'Ambon', good: 'fine', cap: 90, upkeep: 90000, garrison: 400, from: 1605, how: 'auto', war: true, lon: 128.2, lat: -3.7, desc: 'Clove fort taken from the Portuguese.' },
  banda:      { name: 'Banda', good: 'fine', cap: 80, upkeep: 30000, garrison: 80, from: 1609, how: 'auto', lon: 129.9, lat: -4.5, desc: 'The only source of nutmeg and mace.' },
  japan:      { name: 'Hirado · Dejima', silver: true, upkeep: 30000, garrison: 30, from: 1609, how: 'letter', cost: 80000, lon: 129.9, lat: 32.7, desc: 'Japanese silver pays for Indian cloth.' },
  coromandel: { name: 'Coromandel', good: 'textiles', cap: 170, upkeep: 50000, garrison: 150, from: 1610, how: 'letter', cost: 150000, lon: 80.3, lat: 13.4, desc: 'Painted cottons that buy spices in the islands.' },
  formosa:    { name: 'Formosa', intra: 0.03, upkeep: 100000, garrison: 700, from: 1624, until: 1662, how: 'letter', cost: 300000, war: true, lon: 120.2, lat: 23.0, desc: 'Fort Zeelandia, gateway to Chinese silk and sugar.' },
  bengal:     { name: 'Bengal', good: 'textiles', cap: 380, upkeep: 60000, garrison: 150, from: 1634, how: 'letter', cost: 200000, lon: 88.4, lat: 22.9, desc: 'Silk and muslin, the great cloth market.' },
  ceylon:     { name: 'Ceylon', good: 'fine', cap: 110, upkeep: 220000, garrison: 1200, from: 1638, how: 'letter', cost: 600000, war: true, lon: 80.2, lat: 6.0, desc: 'Cinnamon, won by war with the Portuguese.' },
  malacca:    { name: 'Malacca', intra: 0.02, upkeep: 150000, garrison: 600, from: 1640, how: 'letter', cost: 500000, war: true, lon: 102.2, lat: 2.2, desc: 'Controls the strait. Taken by siege.' },
  cape:       { name: 'Cape', upkeep: 60000, garrison: 100, from: 1652, how: 'event', lon: 18.4, lat: -33.9, desc: 'Refreshment station: fewer deaths, a month longer.' },
  mocha:      { name: 'Mocha', good: 'coffee', cap: 120, costMult: 3, upkeep: 30000, garrison: 20, from: 1700, how: 'letter', cost: 100000, lon: 43.3, lat: 13.3, desc: 'Buy coffee on the Yemeni market.' },
  priangan:   { name: 'Priangan', good: 'coffee', cap: 900, upkeep: 50000, garrison: 200, from: 1707, how: 'event', lon: 107.6, lat: -7.0, desc: 'Coffee grown under forced deliveries.' },
  canton:     { name: 'Canton', good: 'tea', cap: 800, upkeep: 40000, garrison: 20, from: 1729, how: 'letter', cost: 150000, lon: 113.3, lat: 23.1, desc: 'Tea, bought with silver.' },
};

const FOCUS = {
  spices:   { label: 'Spices first',     w: { fine: 1, pepper: 1, textiles: .35, coffee: .35, tea: .35 } },
  balanced: { label: 'Balanced',         w: { fine: 1, pepper: 1, textiles: 1, coffee: 1, tea: 1 } },
  cloth:    { label: 'Cloth, tea & coffee first', w: { fine: .7, pepper: .5, textiles: 1, coffee: 1, tea: 1 } },
};
const EXPANSION = { restrain: 'Restrain', permit: 'Permit', encourage: 'Encourage' };

function newState() {
  return {
    v: 1, t: START_T, speed: 0, cash: NOMINAL, debt: 0,
    share: 100, sent: 1, shareHist: [100], divRate: 0, divHist: [], discontent: 0,
    ships: [], shipSeq: 0,
    wh: { pepper: 0, fine: 0, textiles: 0, coffee: 0, tea: 0 },
    lastPrice: {},
    release: { pepper: 50, fine: 50, textiles: 70, coffee: 70, tea: 70 },
    auto: { n: 0, borrow: false }, silver: 250000,
    asia: {
      capital: 0, stock: { pepper: 0, fine: 0, textiles: 0, coffee: 0, tea: 0 }, personnel: 0, posts: {},
      focus: 'balanced', wages: 'low', expansion: 'restrain',
      letterIssued: -1, letterArrived: null, pendingFound: null, acts: [], missing: [],
      yr: blankYr(), lastYr: null, eff: 1, need: 0,
    },
    letter: { focus: 'balanced', wages: 'low', expansion: 'restrain', found: '', issued: START_T },
    letterSealed: false, letterCopies: 0,
    report: null,
    humans: { sent: 0, diedSea: 0, diedAsia: 0, returned: 0 },
    other: [], enslavedBanda: 0,
    flags: {}, done: { founding: true }, queue: ['founding'],
    log: [],
    stats: { voyages: 0, lost: 0, silver: 0, auction: 0, divPaid: 0, divYears: 0 },
    auditLast: -99999, pamphletLast: -99999,
    news: { losses: [] }, dynLast: {}, dynCount: {}, tut: { i: 0, done: false, seen: {}, ctxOn: false },
    books: blankBooks(1602), booksLast: null, bookHist: [], mono: {},
    ended: false,
  };
}
function blankBooks(y) { return { y, sales: { pepper: 0, fine: 0, textiles: 0, coffee: 0, tea: 0 }, hulls: 0, silver: 0, div: 0, interest: 0, other: 0, borrowed: 0, repaid: 0, shipsOut: 0, shipsIn: 0 }; }
function salesTotal(b) { return GOOD_KEYS.reduce((a, g) => a + b.sales[g], 0); }
function tradeResult(b) { return salesTotal(b) - b.hulls - b.silver - b.interest - b.other; }
function blankYr() { return { intra: 0, leak: 0, upkeep: 0, land: 0, buy: 0, deaths: 0, silverIn: 0, japan: 0 }; }

function log(S, text, kind = '') { S.log.unshift({ t: S.t, text, kind }); if (S.log.length > 80) S.log.pop(); }
function act(S, text) { S.asia.acts.push({ t: S.t, text }); if (S.asia.acts.length > 12) S.asia.acts.shift(); }
function addOther(S, place, text) { S.other.push({ t: S.t, place, text }); }

// ---------- Asia helpers ----------
function autonomy(S, y) {
  if ((y >= 1618 && y <= 1623) || (y >= 1627 && y <= 1629)) return 0.6; // Coen
  return y < 1700 ? 0.3 : 0.4;
}
function postCap(S, id, y) {
  const P = POSTS[id];
  if (id === 'banda') return S.flags.banda === 'conquest' ? 220 : 80;
  if (id === 'priangan') return P.cap * clamp((y - 1711) / 20, 0.1, 1);
  const since = S.asia.posts[id] ? yearOf(S.asia.posts[id].since) : y;
  const grow = P.good === 'fine' ? 1 : 1 + clamp((y - since) / 60, 0, 1) * (P.good === 'pepper' ? 0.3 : 1); // networks deepen over 60 years
  if (id === 'coromandel' && y >= 1781) return P.cap * grow * 0.5;
  return (P.cap || 0) * grow;
}
function postUpkeep(S, id) { return id === 'banda' && S.flags.banda === 'conquest' ? 120000 : POSTS[id].upkeep; }
function postGarrison(S, id) { return id === 'banda' && S.flags.banda === 'conquest' ? 600 : POSTS[id].garrison; }
function upkeepTotal(S) {
  const y = yearOf(S.t), A = S.asia;
  let u = Object.keys(A.posts).reduce((a, id) => a + postUpkeep(S, id), 0);
  if (A.loanUntil && y < A.loanUntil) u += 80000;
  if (S.flags.asianTroops) u += 60000;
  if (S.flags.capeSlaves && A.posts.cape) u -= 20000;
  if (A.economyUntil && y < A.economyUntil) u *= 0.85;
  return u;
}
function garrisonNeed(S) { return Object.keys(S.asia.posts).reduce((a, id) => a + postGarrison(S, id), 0); }
function conquered(S) { return Object.keys(S.asia.posts).filter(id => POSTS[id].war || (id === 'banda' && S.flags.banda === 'conquest')).length; }
function intraRate(S, y) {
  let r = y < 1619 ? 0.03 : y < 1635 ? 0.08 : y < 1690 ? 0.15 : y < 1720 ? 0.04 : -0.02;
  if (S.asia.posts.malacca) r += POSTS.malacca.intra;
  if (S.asia.posts.formosa) r += POSTS.formosa.intra;
  return r;
}
function workingCap(S) { return 1.5e6 + 0.25e6 * Object.keys(S.asia.posts).length; }
function japanYield(y) { return y < 1668 ? 600000 : y < 1685 ? 200000 : 120000; }
function asiaMort(y) { return y < 1733 ? 0.006 : 0.016; }
function leakRate(S, y) {
  const n = Object.keys(S.asia.posts).length;
  let r = clamp(0.03 + 0.0011 * (y - 1602) + 0.006 * n, 0, 0.45) * (S.asia.wages === 'high' ? 0.55 : 1);
  if (S.flags.privateTrade) r *= 0.5;
  if (S.asia.commissionUntil && y < S.asia.commissionUntil) r *= 0.6;
  return r;
}
function foundablePosts(S, y) {
  return Object.keys(POSTS).filter(id => {
    const P = POSTS[id];
    return P.how === 'letter' && !S.asia.posts[id] && P.from <= y && !(P.until && y >= P.until) && !(S.flags.lost && S.flags.lost[id]);
  });
}
function foundPost(S, id, own) {
  const P = POSTS[id], A = S.asia;
  A.capital -= P.cost || 0;
  A.posts[id] = { since: S.t };
  if (own) act(S, `On his own authority the Governor-General ${P.war ? 'took' : 'opened a post at'} ${P.name}. It adds ${money(P.upkeep)} a year in upkeep and needs ${num(P.garrison)} men.`);
  else act(S, `${P.war ? 'Took' : 'Opened a post at'} ${P.name}, as instructed from Amsterdam.`);
}

// ---------- Ships ----------
function baseShipCost(y) { return y < 1650 ? 150000 : y < 1700 ? 200000 : 250000; }
let _S = null; // current state for cost modifiers
function shipCost(y) { let c = baseShipCost(y); if (_S && _S.flags.provisions) c += 10000; if (_S && _S.flags.sailorPay) c += 5000; if (_S && _S.flags.convoys) c *= 1.15; return Math.round(c); }
function shipCap(y) { return y < 1650 ? 450 : y < 1700 ? 600 : 800; }
function maxSilver(y) { return y < 1700 ? 400000 : 500000; }
// Pay a one-off cost from the treasury, borrowing on short-term notes whatever it lacks.
function payOther(S, amt) {
  if (S.cash < amt) { const b = amt - Math.max(0, S.cash); S.debt += b; S.cash += b; S.books.borrowed += b; }
  S.cash -= amt; S.books.other += amt;
}
function equipShip(S, silver, borrow) {
  const y = yearOf(S.t);
  if (S.flags.nationalised) return false;
  const cost = shipCost(y) + silver;
  if (S.cash < cost) {
    if (!borrow) return false;
    const b = cost - Math.max(0, S.cash); S.debt += b; S.cash += b; S.books.borrowed += b;
  }
  S.cash -= cost; S.books.hulls += shipCost(y); S.books.silver += silver; S.books.shipsOut++;
  const base = SHIP_NAMES[S.shipSeq % SHIP_NAMES.length];
  const round = Math.floor(S.shipSeq / SHIP_NAMES.length);
  S.shipSeq++;
  S.ships.push({ id: S.shipSeq, name: round ? base + ' ' + ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][Math.min(round - 1, 6)] : base, state: 'harbour', silver, crew: CREW, cap: shipCap(y), equipped: S.t });
  return true;
}
function windowAt(S, t) {
  const md = mdOf(t);
  if (md >= 1215 || md <= 131) return 'Christmas';
  if (md >= 401 && md <= 515) return 'Easter';
  if (S.flags.kermis && md >= 901 && md <= 1015) return 'Kermis';
  return null;
}
function nextWindow(S) {
  for (let i = 0; i < 400; i++) { const w = windowAt(S, S.t + i); if (w) return { name: w, days: i }; }
  return null;
}
function batWindow(t) { const md = mdOf(t); return md >= 1115 || md <= 131; }

function depart(S, sh) {
  const A = S.asia, y = yearOf(S.t);
  sh.state = 'out'; sh.dep = S.t;
  const cape = !!A.posts.cape;
  sh.exp = (S.flags.brouwer ? 220 : 330) + (cape ? 25 : 0);
  sh.days = Math.round(sh.exp * (0.88 + rnd() * 0.3));
  const war = S.flags.war4 && y <= 1784;
  sh.lost = rnd() < (war ? 0.3 : 0.02) * (S.flags.convoys ? 0.5 : 1);
  sh.letter = { ...S.letter };
  S.letterSealed = true;
  S.humans.sent += sh.crew; S.stats.voyages++; S.stats.silver += sh.silver;
}
function arriveAsia(S, sh) {
  const A = S.asia;
  if (sh.lost) { sh.state = 'lostOut'; S.humans.diedSea += sh.crew; S.stats.lost++; return; }
  let m = 0.15 * (A.posts.cape ? 0.7 : 1) * (S.flags.provisions ? 0.8 : 1) * (0.45 + rnd() * 1.1);
  if (rnd() < 0.03) m = 0.4 + rnd() * 0.25;
  // mutiny: rare, likelier on low wages and deadly voyages
  if (!S.news.mutiny && rnd() < (S.asia.wages === 'low' ? 0.006 : 0.002) * (m > 0.3 ? 3 : 1) * (S.flags.sailorPay ? 0.3 : 1)) {
    sh.lost = true; sh.state = 'lostOut'; S.humans.diedSea += sh.crew; S.stats.lost++; S.news.mutiny = { name: sh.name, t: S.t }; return;
  }
  if (m >= 0.4) A.disaster = { name: sh.name, deaths: Math.round(sh.crew * m), t: S.t };
  const deaths = Math.round(sh.crew * m);
  S.humans.diedSea += deaths; sh.crew -= deaths; sh.deathsOut = deaths;
  const soldiers = Math.round(sh.crew * (SOLDIERS + (S.flags.crimps ? 40 : 0)) / CREW);
  A.personnel += soldiers; sh.crew -= soldiers;
  A.capital += sh.silver * 1.25; A.yr.silverIn += sh.silver * 1.25;
  deliverLetter(S, sh.letter);
  sh.state = 'asia'; sh.arr = S.t; sh.ready = S.t + 50;
}
function departAsia(S, sh) {
  const A = S.asia;
  A._dis = null;
  const need = SAILORS_HOME - sh.crew;
  if (need > 0) { const take = Math.min(need, Math.max(0, Math.floor(A.personnel))); sh.crew += take; A.personnel -= take; }
  let room = sh.cap; sh.cargo = {};
  for (const g of LOAD_ORDER) {
    const q = Math.min(room, A.stock[g]);
    if (q > 0.5) { sh.cargo[g] = q; A.stock[g] -= q; room -= q; }
  }
  sh.report = snapshot(S); A._dis = null;
  sh.state = 'home'; sh.dep2 = S.t;
  sh.exp2 = 200 + (A.posts.cape ? 20 : 0);
  sh.days2 = Math.round(sh.exp2 * (0.88 + rnd() * 0.3));
  const war = S.flags.war4 && yearOf(S.t) <= 1784;
  sh.lostH = rnd() < (war ? 0.35 : 0.045) * (S.flags.convoys ? 0.5 : 1);
}
function cargoText(c) {
  const parts = LOAD_ORDER.filter(g => c && c[g] > 0.5).map(g => num(c[g]) + ' t ' + GOODS[g].name.toLowerCase());
  return parts.length ? parts.join(', ') : 'an empty hold';
}
function arriveHome(S, sh) {
  if (sh.lostH) { sh.state = 'lostHome'; S.humans.diedSea += sh.crew; S.stats.lost++; return; }
  const deaths = Math.round(sh.crew * 0.07 * (0.4 + rnd() * 1.2));
  S.humans.diedSea += deaths; S.humans.returned += sh.crew - deaths;
  for (const g in sh.cargo) S.wh[g] += sh.cargo[g];
  S.books.shipsIn++;
  if (!S.report || sh.report.date > S.report.date) {
    S.report = sh.report; S.reportNew = true;
    if (sh.report.disaster && sh.report.disaster.t > (S.news.lastDisasterT || 0)) { S.news.disaster = sh.report.disaster; S.news.lastDisasterT = sh.report.disaster.t; }
    revealMissing(S, sh.report.missing);
  } else revealMissing(S, sh.report.missing);
  S.sent += 0.015;
  log(S, `The ${sh.name} is home at Texel with ${cargoText(sh.cargo)}. ${num(sh.crew - deaths)} of ${CREW} men came back.`, 'ship');
  sh.state = 'done'; sh.doneT = S.t;
}
function revealMissing(S, names) {
  for (const id of names || []) {
    const sh = S.ships.find(s => s.id === id);
    if (sh && !sh.revealed) {
      sh.revealed = true; sh.revealT = S.t; S.sent -= 0.03; S.news.losses.push(S.t);
      log(S, `Batavia reports the ${sh.name} never arrived. She is presumed lost with ${CREW} men and ${money(sh.silver)} in silver.`, 'loss');
    }
  }
}
function snapshot(S) {
  const A = S.asia, y = yearOf(S.t);
  const m = A.missing.slice(); A.missing = [];
  const dis = A.disaster; A.disaster = null; if (dis) A._dis = dis;
  return {
    date: S.t, capital: A.capital, stock: { ...A.stock }, personnel: Math.floor(A.personnel), need: garrisonNeed(S), eff: A.eff,
    upkeep: upkeepTotal(S) * (A.wages === 'high' ? 1.3 : 1), leak: leakRate(S, y), posts: Object.keys(A.posts),
    acts: A.acts.slice(-5), letterIssued: A.letterIssued, letterArrived: A.letterArrived, focus: A.focus, wages: A.wages, expansion: A.expansion,
    disaster: A._dis || null, missing: m, lastYr: A.lastYr ? { ...A.lastYr } : null, inAsia: S.ships.filter(s => s.state === 'asia').map(s => s.id),
  };
}

function shipsDaily(S) {
  const y = yearOf(S.t), bw = batWindow(S.t), md = mdOf(S.t);
  const blockade = S.flags.war4 && (y === 1781 || y === 1782);
  for (const sh of S.ships) {
    if (sh.state === 'out' && S.t >= sh.dep + sh.days) arriveAsia(S, sh);
    else if (sh.state === 'asia') {
      if (bw && S.t >= sh.ready && !blockade && (rnd() < 0.08 || md === 131)) departAsia(S, sh);
    } else if (sh.state === 'home' && S.t >= sh.dep2 + sh.days2) arriveHome(S, sh);
    else if (sh.state === 'lostOut' && !sh.batNoted && S.t >= sh.dep + sh.exp + 60) { sh.batNoted = true; S.asia.missing.push(sh.id); }
    else if (sh.state === 'lostHome' && !sh.revealed && S.t >= sh.dep2 + sh.exp2 + 90) {
      sh.revealed = true; sh.revealT = S.t; S.sent -= 0.04; S.news.losses.push(S.t);
      log(S, `The ${sh.name} is long overdue from Batavia. She is presumed lost with her cargo and crew.`, 'loss');
    }
  }
  S.ships = S.ships.filter(sh => !((sh.state === 'done' && S.t - sh.doneT > 30) || (sh.revealed && S.t - sh.revealT > 120)));
}

// ---------- Letters ----------
function deliverLetter(S, L) {
  const A = S.asia, y = yearOf(S.t);
  if (!L || L.issued <= A.letterIssued) return;
  A.letterIssued = L.issued; A.letterArrived = S.t;
  if (L.focus !== A.focus) {
    if (rnd() < autonomy(S, y) * 0.35) act(S, `Your letter of ${fmtMon(L.issued)} asked for "${FOCUS[L.focus].label}". The Governor-General kept his own priorities.`);
    else A.focus = L.focus;
  }
  A.wages = L.wages; A.expansion = L.expansion;
  if (L.found && foundablePosts(S, y).includes(L.found)) { // never a post that is lost or out of its period
    const P = POSTS[L.found];
    if (A.capital >= P.cost * 0.6) foundPost(S, L.found, false);
    else { A.pendingFound = L.found; act(S, `Ordered to take up ${P.name}, but Batavia lacks the funds (${money(P.cost)}). Waiting for silver.`); }
  }
}

// ---------- Periodic ----------
function asiaMonth(S, y) {
  const A = S.asia;
  const need = garrisonNeed(S); A.need = need;
  const eff = need ? clamp(Math.pow(A.personnel / need, 0.7), 0.05, 1) : 1; A.eff = eff;
  let inc = 0;
  if (A.posts.japan) { const j = japanYield(y) / 12; inc += j; A.yr.japan += j; }
  const work = workingCap(S);
  const intra = A.capital > 0 ? Math.min(A.capital, work) * intraRate(S, y) / 12 : A.capital * 0.08 / 12;
  const idle = A.capital > work ? (A.capital - work) * 0.01 : 0; // silver lying idle in Batavia drains away
  let land = y >= 1680 ? conquered(S) * 25000 * (1 + (y - 1680) / 40) / 12 : 0;
  if (S.flags.opium) land += 150000 / 12;
  if (S.flags.sugar && y < 1740) land += 60000 / 12;
  const upkeep = upkeepTotal(S) * (A.wages === 'high' ? 1.3 : 1) / 12 * (S.flags.war4 && y <= 1784 ? 1.4 : 1);
  let budget = Math.max(0, A.capital + inc + intra + land - upkeep) * 0.5;
  let buy = 0;
  const W = FOCUS[A.focus].w;
  const posts = Object.keys(A.posts).filter(id => POSTS[id].good).sort((a, b) => W[POSTS[b].good] - W[POSTS[a].good]);
  const disrupt = (S.flags.disrupt1740 && y <= 1742 ? (S.flags.sugar ? 0.55 : 0.7) : 1) * (A.economyUntil && y < A.economyUntil ? 0.85 : 1);
  for (const id of posts) {
    if (budget <= 0) break;
    const P = POSTS[id];
    const cap = postCap(S, id, y) / 12 * eff * W[P.good] * disrupt;
    const c = GOODS[P.good].cost * (P.costMult || 1) * (P.good === 'fine' && S.flags.banda !== 'conquest' ? 1.8 : 1);
    const q = Math.min(cap, budget / c);
    A.stock[P.good] += q; budget -= q * c; buy += q * c;
  }
  const leak = leakRate(S, y) * (buy + upkeep) + idle;
  A.capital += inc + intra + land - upkeep - buy - leak;
  for (const g of GOOD_KEYS) A.stock[g] *= 0.992;
  const mr = asiaMort(y);
  const dd = Math.round(A.personnel * mr); A.personnel -= dd;
  let shipD = 0;
  for (const sh of S.ships) if (sh.state === 'asia') { const k = Math.round(sh.crew * mr); sh.crew -= k; shipD += k; }
  S.humans.diedAsia += dd + shipD;
  Object.assign(A.yr, { intra: A.yr.intra + intra, leak: A.yr.leak + leak, upkeep: A.yr.upkeep + upkeep, land: A.yr.land + land, buy: A.yr.buy + buy, deaths: A.yr.deaths + dd + shipD });
  if (A.pendingFound && !foundablePosts(S, y).includes(A.pendingFound)) A.pendingFound = null;
  if (A.pendingFound && A.capital >= POSTS[A.pendingFound].cost) { const id = A.pendingFound; A.pendingFound = null; if (!A.posts[id]) foundPost(S, id, false); }
}
function interestRate(S, y) { return S.flags.credit1773 && y >= 1773 && y < 1778 ? 0.055 : 0.04; }
// Debt card line: the rate actually charged this year.
function debtLine(S) {
  const ir = interestRate(S, yearOf(S.t));
  const pct = +(ir * 100).toFixed(1) + '%';
  return S.debt > 0 ? `interest ${money(S.debt * ir)} a year (${pct})` : pct + ' a year';
}
// Why debt grew over the last full year, or null. Uses the year-end debt kept in bookHist.
function debtGrowth(S) {
  const h = S.bookHist, a = h[h.length - 2], b = h[h.length - 1];
  if (!a || !b || a.debt == null || b.debt == null) return null;
  const rise = b.debt - a.debt;
  if (rise < 250000 || rise < a.debt * 0.03) return null;
  return { year: b.y, from: a.debt, to: b.debt, interest: b.interest || 0, div: b.div, res: b.res };
}
function debtText(S) {
  const g = debtGrowth(S); if (!g) return '';
  const trade = g.res >= 0 ? `trading earned ${money(g.res)} after interest, not enough to cover the rest` : `trading lost ${money(-g.res)} after interest`;
  return `Debt rose from ${money(g.from)} to ${money(g.to)} in ${g.year}. Interest cost ${money(g.interest)}, dividends ${money(g.div)}, and ${trade}. Whatever the treasury lacks is borrowed${S.auto.borrow ? ', including the silver and hulls for your standing orders' : ''}, and next year's interest grows with it.`;
}
function monthly(S) {
  const y = yearOf(S.t);
  const ir = interestRate(S, y); S.cash -= S.debt * ir / 12; S.books.interest += S.debt * ir / 12;
  asiaMonth(S, y);
  if (S.flags.banda === 'conquest') S.enslavedBanda += 200 / 12;
  const r = S.divHist.slice(-5);
  const avg = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
  const target = (100 + avg / 100 / 0.045 * 100 * 0.85) * S.sent;
  S.share = Math.max(20, S.share + (target - S.share) * 0.08 + (rnd() - 0.5) * S.share * 0.02);
  S.sent += (1 - S.sent) * 0.04;
  S.shareHist.push(S.share); if (S.shareHist.length > 360) S.shareHist.shift();
  S.discontent = Math.max(0, S.discontent - 0.8);
  if (S.cash < 0) {
    log(S, `The treasury is empty. ${money(-S.cash)} borrowed on short-term notes.`, 'loss');
    S.debt += -S.cash; S.books.borrowed += -S.cash; S.cash = 0;
  }
  updateMono(S);
  if (S.debt > 120e6 && !S.flags.nationalised) { S.ended = true; S.endReason = 'bankrupt'; S.speed = 0; return; }
  if (S.discontent >= 75 && S.done.revolt && S.t - S.pamphletLast > 365 * 5) { S.pamphletLast = S.t; S.queue.push('pamphlets'); }
}
// The Heeren XVII's monopoly aims. Amsterdam counts a post only once a Batavia report confirms it.
const AIMS = [
  { id: 'nutmeg', name: 'Nutmeg & mace', where: 'Banda Islands', hist: 1621, how: 'Conquer Banda (the 1620 decision).' },
  { id: 'cloves', name: 'Cloves', where: 'Ambon & the Moluccas', hist: 1669, how: 'Hongi patrols and tree-cutting (1650s) and the war against Makassar (1666).' },
  { id: 'cinnamon', name: 'Cinnamon', where: 'Ceylon', hist: 1658, how: 'Order Ceylon taken from the Portuguese (from 1638).' },
  { id: 'japan', name: 'The Japan trade', where: 'Hirado, then Dejima', hist: 1641, how: 'Have a post in Japan when the Portuguese are expelled in 1641.' },
  { id: 'strait', name: 'The Strait of Malacca', where: 'Malacca', hist: 1641, how: 'Order Malacca taken (from 1640).' },
];
function reported(S, id) { return S.report && S.report.posts.includes(id); }
function aimDone(S, id) {
  switch (id) {
    case 'nutmeg': return S.flags.banda === 'conquest';
    case 'cloves': return !!(S.flags.hongi && S.flags.makassar);
    case 'cinnamon': return reported(S, 'ceylon');
    case 'japan': return reported(S, 'japan') && yearOf(S.t) >= 1641;
    case 'strait': return reported(S, 'malacca');
  }
}
function updateMono(S) {
  for (const a of AIMS) {
    const d = aimDone(S, a.id);
    if (d && !S.mono[a.id]) { S.mono[a.id] = S.t; log(S, `Monopoly secured: ${a.name.toLowerCase()} (${a.where}). The Heeren XVII achieved this in ${a.hist}.`, 'money'); }
    if (!d && S.mono[a.id] && a.id === 'cinnamon' && S.flags.lost && S.flags.lost.ceylon) S.mono[a.id] = -1;
  }
}
function fineShare(S, y) {
  const own = Object.keys(S.asia.posts).filter(id => POSTS[id].good === 'fine').reduce((a, id) => a + postCap(S, id, y), 0);
  const other = fineLeaks(S).total;
  return own + other > 0 ? own / (own + other) : 0;
}
function yearly(S) {
  const y = yearOf(S.t), A = S.asia;
  for (const id in POSTS) {
    const P = POSTS[id];
    if (P.how === 'auto' && P.from <= y && !A.posts[id]) { A.posts[id] = { since: S.t }; act(S, `${P.name}: ${P.desc}`); }
  }
  const p = autonomy(S, y) * { restrain: .12, permit: .35, encourage: .7 }[A.expansion];
  if (A.capital > 0 && rnd() < p) {
    const c = foundablePosts(S, y);
    if (c.length) foundPost(S, c[Math.floor(rnd() * c.length)], true);
  }
  A.lastYr = { ...A.yr, year: y - 1 }; A.yr = blankYr();
  S.booksLast = S.books; S.bookHist.push({ y: S.books.y, res: tradeResult(S.books), div: S.books.div, sales: salesTotal(S.books), shipsIn: S.books.shipsIn, shipsOut: S.books.shipsOut, cost: S.books.hulls + S.books.silver, interest: S.books.interest, debt: S.debt });
  if (S.bookHist.length > 40) S.bookHist.shift();
  // full-length record for the end-of-game comparison (bookHist keeps only 40 years): dividend as % of capital, year-end debt
  (S.yhist || (S.yhist = [])).push({ y: S.books.y, div: +(S.books.div / NOMINAL * 100).toFixed(2), debt: Math.round(S.debt) });
  S.books = blankBooks(y);
}
function auction(S) {
  const y = yearOf(S.t); let total = 0; const parts = [];
  for (const g of GOOD_KEYS) {
    const st = S.wh[g]; if (st < 1) continue;
    const rel = Math.floor(st * S.release[g] / 100); if (rel < 1) continue;
    const p = auctionPrice(S, g, rel, st - rel, y);
    S.wh[g] -= rel; S.lastPrice[g] = p; total += rel * p; S.books.sales[g] += rel * p;
    parts.push(`${num(rel)} t ${GOODS[g].name.toLowerCase()} at ${money(p)}/t`);
  }
  S.cash += total; S.stats.auction += total;
  if (total > 0) log(S, `${mdOf(S.t) < 600 ? 'Spring' : 'Autumn'} auction: ${money(total)}. ${parts.join('; ')}.`, 'money');
}
function expectation(S) {
  const r = S.divHist.slice(-5);
  if (!r.length) return 10;
  return Math.max(5, r.reduce((a, b) => a + b, 0) / r.length);
}
function dividend(S) {
  const y = yearOf(S.t);
  if (S.skipDivYear === y) return;
  const exp = expectation(S);
  const pay = NOMINAL * S.divRate / 100;
  if (pay > 0) {
    let borrowed = 0;
    if (S.cash < pay) { borrowed = pay - S.cash; S.debt += borrowed; S.cash = 0; S.books.borrowed += borrowed; } else S.cash -= pay;
    S.books.div += pay;
    S.stats.divPaid += pay;
    log(S, `Dividend of ${S.divRate}% paid: ${money(pay)}${borrowed ? `, of which ${money(borrowed)} borrowed` : ''}.`, borrowed ? 'loss' : 'money');
  } else log(S, `No dividend this year. Shareholders expected about ${Math.round(exp)}%.`, 'loss');
  S.divHist.push(S.divRate); S.stats.divYears++;
  const gap = exp - S.divRate;
  S.discontent = clamp(S.discontent + (gap > 0 ? gap * 3 : -Math.min(15, -gap * 1.5 + 5)), 0, 100);
}
function autoEquip(S) {
  let n = 0;
  for (let i = 0; i < S.auto.n; i++) if (equipShip(S, Math.min(S.silver, maxSilver(yearOf(S.t))), S.auto.borrow)) n++;
  if (S.auto.n > 0) log(S, n ? `Standing orders: ${n} ship${n > 1 ? 's' : ''} equipped for the ${windowAt(S, S.t)} fleet.` : `Standing orders: no money to equip ships for the ${windowAt(S, S.t)} fleet.`, n ? 'ship' : 'loss');
}
function audit(S) {
  const y = yearOf(S.t);
  S.auditLast = S.t; payOther(S, 60000);
  let whv = 0; for (const g of GOOD_KEYS) whv += S.wh[g] * (S.lastPrice[g] || market(S, g, y).p0 * 0.8);
  const R = S.report; let asv = 0;
  if (R) { asv = R.capital; for (const g of GOOD_KEYS) asv += R.stock[g] * GOODS[g].cost; }
  const equity = S.cash - S.debt + whv + asv;
  const mcap = NOMINAL * S.share / 100;
  S.discontent = Math.max(0, S.discontent - 25);
  if (equity < mcap * 0.6) S.sent -= 0.12;
  return { equity, mcap, cash: S.cash, debt: S.debt, whv, asv, rdate: R ? R.date : null };
}

function step(S) {
  if (S.ended) return;
  _S = S;
  S.t++;
  const t = S.t, y = yearOf(t), md = mdOf(t);
  const w = windowAt(S, t);
  if (w && w !== windowAt(S, t - 1)) autoEquip(S);
  if (w) for (const sh of S.ships) if (sh.state === 'harbour' && rnd() < 0.09) depart(S, sh);
  shipsDaily(S);
  if (dateOf(t).getUTCDate() === 1) monthly(S);
  if (md === 101) yearly(S);
  if (md === 401 || md === 1001) auction(S);
  if (md === 515 && y >= 1610) dividend(S);
  checkEvents(S);
  if (dateOf(t).getUTCDate() === 1) S.reportNew = false;
  if (t >= END_T) { S.ended = true; S.speed = 0; }
}
function checkEvents(S) {
  const monthStart = dateOf(S.t).getUTCDate() === 1;
  for (const e of EVENTS) {
    if (e.check) {
      if (!monthStart || S.done[e.id] || S.queue.includes(e.id)) continue;
      if (S.t - (S.dynLast[e.id] ?? -1e9) < (e.cooldown || 10) * 365) continue;
      if (e.from && yearOf(S.t) < e.from) continue;
      if (e.max && (S.dynCount[e.id] || 0) >= e.max) continue;
      if (!e.check(S)) continue;
      S.dynLast[e.id] = S.t; S.dynCount[e.id] = (S.dynCount[e.id] || 0) + 1; if (e.once) S.done[e.id] = true;
      if (e.onTrigger) e.onTrigger(S);
      S.queue.push(e.id); continue;
    }
    if (S.done[e.id]) continue;
    if (S.t < tOf(...e.at)) continue;
    S.done[e.id] = true;
    if (e.cond && !e.cond(S)) continue;
    if (e.onTrigger) e.onTrigger(S);
    S.queue.push(e.id);
  }
}

// ---------- the real VOC, for the end-of-game comparison ----------
// Only figures that can be cited; the Sources sheet lists the same works.
//  avgDiv  ~18% of the nominal capital a year over the Company's life: F. S. Gaastra, The Dutch East India Company (2003);
//          J. de Vries & A. van der Woude, The First Modern Economy (1997). Drawn as the lifetime average, not a yearly series.
//  early   1610–12: dividends of 162.5% of capital in all, mostly paid in mace, pepper and cloves (Gaastra 2003).
//  lastDiv no dividend was paid after 1782 (Gaastra 2003; B. Taylor, "The First and the Greatest", Global Financial Data, 2013).
//  war     the Fourth Anglo-Dutch War (1780–84) cost the Company up to ƒ43 million and the loans that kept it going brought
//          its net assets to zero (De Vries & Van der Woude 1997, pp. 454–455).
//  endDebt after the revolution of 1795 the Company's debt stood at about ƒ120 million and became part of the state debt
//          (De Vries & Van der Woude 1997, p. 457). Drawn as one point at 1796; "about the same" means within 15%.
const REAL_VOC = {
  avgDiv: 18, firstDiv: 1610, lastDiv: 1782,
  early: { from: 1610, to: 1612, total: 162.5 },
  war: { y: 1780, loss: 43e6 },
  endDebt: { y: 1796, v: 120e6, lo: 102e6, hi: 138e6 },
};
// Player's company by decade: average dividend (% of capital a year, from 1610) and debt at the end of the decade.
function compareData(S) {
  let rows = (S.yhist && S.yhist.length) ? S.yhist.slice() : S.bookHist.map(b => ({ y: b.y, div: +(b.div / NOMINAL * 100).toFixed(2), debt: b.debt == null ? null : Math.round(b.debt) }));
  const last = rows.length ? rows[rows.length - 1].y : 1601;
  if (S.books && S.books.y > last && S.books.y <= 1799 && S.t < END_T) rows = rows.concat([{ y: S.books.y, div: +(S.books.div / NOMINAL * 100).toFixed(2), debt: Math.round(S.debt), part: true }]);
  const dec = {};
  for (const r of rows) {
    const d = Math.floor(r.y / 10) * 10;
    const o = dec[d] || (dec[d] = { decade: d, divSum: 0, divYears: 0, debt: null });
    if (r.y >= REAL_VOC.firstDiv) { o.divSum += r.div; o.divYears++; }
    if (r.debt != null) o.debt = r.debt;
  }
  const decades = Object.values(dec).sort((a, b) => a.decade - b.decade).map(o => ({ decade: o.decade, div: o.divYears ? +(o.divSum / o.divYears).toFixed(1) : null, debt: o.debt }));
  const divYears = rows.filter(r => r.y >= REAL_VOC.firstDiv);
  const avgDiv = divYears.length ? divYears.reduce((a, r) => a + r.div, 0) / divYears.length : 0;
  return { decades, avgDiv: +avgDiv.toFixed(1), endYear: rows.length ? rows[rows.length - 1].y : yearOf(S.t), endDebt: S.debt, real: REAL_VOC };
}
// One line of commentary comparing the player's dividends and debt with the real Company.
function compareLine(S, data) {
  const D = data || compareData(S), R = D.real, avg = R.avgDiv;
  const ds = D.decades.filter(d => d.div != null && d.decade >= 1620 && d.decade <= 1780); // the 1610s are skewed by the first payouts in kind
  let a;
  if (!ds.length) a = 'Your company never paid a dividend';
  else {
    const runs = [];
    for (const d of ds) { const up = d.div >= avg; if (runs.length && runs[runs.length - 1].up === up) runs[runs.length - 1].to = d.decade; else runs.push({ up, from: d.decade, to: d.decade }); }
    const word = up => up ? 'more' : 'less';
    if (runs.length === 1) a = runs[0].up ? `Your company matched or beat the real VOC's ${avg}% a year in every decade` : `Your company never matched the real VOC's ${avg}% a year in any decade`;
    else if (runs.length === 2) a = `Your company paid out ${word(runs[0].up)} than the real VOC's ${avg}% a year until the ${runs[0].to}s, then ${word(runs[1].up)}`;
    else {
      const n = ds.filter(d => d.div >= avg).length, top = ds.reduce((b, d) => d.div > b.div ? d : b, ds[0]);
      a = `Your company matched or beat the real VOC's ${avg}% a year in ${n} of ${ds.length} decades, most of all in the ${top.decade}s (${top.div}%)`;
    }
  }
  const debt = D.endDebt, yr = D.endYear;
  let b;
  if (S.endReason === 'bankrupt') b = `went under in ${yr} with ${money(debt)} of debt, a sum the real Company reached only at its very end`;
  else if (debt > R.endDebt.hi) b = `left ${money(debt)} of debt, more than the real Company's ƒ120 million or so`;
  else if (debt >= R.endDebt.lo) b = `left ${money(debt)} of debt, about what the real Company left (some ƒ120 million)`;
  else if (debt > 0) b = `left ${money(debt)} of debt, against the real Company's ƒ120 million or so`;
  else b = 'left no debt at all, where the real Company left some ƒ120 million';
  return `${a}, and ${b}.`;
}
// Final score for the passport: millions of guilders paid to shareholders, less the debt left behind.
function finalScore(S) { return Math.round((S.stats.divPaid - S.debt) / 1e6); }
