const {VARIETIES:V, SPECIAL:SP, IDX, RISK, EVENINGS:EV, ROMAN, STYLES, GPP, FEE, SETTLE, TARGET} = T7;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = g => 'f' + Math.round(g).toLocaleString('en-US');
const pct = x => Math.round(x * 100) + '%';
const sleep = ms => new Promise(r => setTimeout(r, ms));
document.body.style.setProperty('--bg', `url(${ART.bg_tavern})`);
$('#table').style.setProperty('--carpet', `url(${ART.ui_table || CARPET})`);
if (ART.ui_cardback) document.documentElement.style.setProperty('--cardback', `url(${ART.ui_cardback}) center/cover`);
if (ART.ui_frame) document.documentElement.style.setProperty('--frame', `url(${ART.ui_frame}) center/100% 100%`);
if (ART.ui_frame) document.documentElement.classList.add('has-frame');
if (ART.ui_emblem){ const l = document.createElement('link'); l.rel = 'icon'; l.href = ART.ui_emblem; document.head.appendChild(l); }
if (ART.ui_sign){ const s = document.createElement('img'); s.className = 'hsign'; s.src = ART.ui_sign; s.alt = 'The sign of the Menniste Bruyloft'; s.title = 'The Menniste Bruyloft, Oude Brugsteeg, Amsterdam'; $('#where').before(s); }
if (ART.ui_seal) document.documentElement.style.setProperty('--sealimg', `url(${ART.ui_seal}) center/cover`);
if (ART.ui_logo) $('#brand').innerHTML = `<a class="hl" href="/">Homo Ludens</a><img class="logo" src="${ART.ui_logo}" alt="Tulip 7">`;
$('#hostImg').src = ART.c_theunisz;

/* ---------- settings ---------- */
const SET = Object.assign({help:true, fast:false, sound:true, mode:'winter'}, (() => { try { return JSON.parse(localStorage.getItem('tulip7.set')) || {}; } catch(e){ return {}; } })());
const saveSet = () => { try { localStorage.setItem('tulip7.set', JSON.stringify(SET)); } catch(e){} };
function syncBtns(){
  $('#bHelp').classList.toggle('on', SET.help); $('#bHelp').textContent = 'Help: ' + (SET.help ? 'on' : 'off');
  $('#bSpeed').textContent = 'Speed: ' + (SET.fast ? 'fast' : 'normal');
  $('#bSound').classList.toggle('on', SET.sound); $('#bSound').textContent = 'Sound: ' + (SET.sound ? 'on' : 'off');
}
$('#bHelp').onclick = () => { SET.help = !SET.help; if (!SET.help) ui.tip = null; saveSet(); syncBtns(); render(); };
$('#bSpeed').onclick = () => { SET.fast = !SET.fast; saveSet(); syncBtns(); };
$('#bSound').onclick = () => { SET.sound = !SET.sound; saveSet(); syncBtns(); ambience(); };
$('#bRules').onclick = () => showRules();
$('#bAch').onclick = () => showAchievements();
$('#bNew').onclick = () => showStart();
syncBtns();
const pace = (k = 1) => sleep((SET.fast ? 260 : 680) * k);
/* Analytics (the site adds PostHog; standalone this does nothing). Event names map to the shared ones in posthog_head.html. */
function track(ev, props){ try { if (window.posthog && posthog.capture) posthog.capture(ev, Object.assign({mode:G ? G.mode : SET.mode}, props || {})); } catch(e){} }
/* A small summary the Homo Ludens portal reads for "Your record". */
function saveRecord(win, worth){
  try {
    const r = JSON.parse(localStorage.getItem('tulip7.record.v1')) || {v:1, played:0, won:0, winters:0, wintersWon:0, best:0};
    r.played++; if (win) r.won++;
    if (G.mode === 'winter'){ r.winters++; if (win) r.wintersWon++; r.best = Math.max(r.best || 0, Math.round(worth)); }
    r.ach = Object.keys(ACHS).length; r.last = Date.now();
    localStorage.setItem('tulip7.record.v1', JSON.stringify(r));
  } catch(e){}
}

/* ---------- sound (Web Audio, no files) ---------- */
let AC = null;
function ac(){ if (!SET.sound) return null; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; } catch(e){ return null; } }
function noise(a, dur, f1, f2, q = 1, gain = .25){
  const n = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource(); s.buffer = n; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f1, a.currentTime); f.frequency.exponentialRampToValueAtTime(f2, a.currentTime + dur);
  const g = a.createGain(); g.gain.setValueAtTime(0, a.currentTime); g.gain.linearRampToValueAtTime(gain, a.currentTime + dur * .15); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
  s.connect(f).connect(g).connect(a.destination); s.start();
}
function tone(a, f, dur, gain = .12, type = 'sine', t0 = 0, f2){
  const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, a.currentTime + t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, a.currentTime + t0 + dur);
  g.gain.setValueAtTime(gain, a.currentTime + t0); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + t0 + dur);
  o.connect(g).connect(a.destination); o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + dur);
}
const SND = {
  flip(){ const a = ac(); if (a) noise(a, .09, 3000, 1500, .7, .18); },
  slide(){ const a = ac(); if (a) noise(a, .22, 1200, 3200, .6, .1); },
  clink(){ const a = ac(); if (!a) return; [2637, 3520, 4186].forEach((f, i) => tone(a, f * (1 + Math.random() * .01), .9, .05, 'sine', i * .002)); tone(a, 2700, .7, .04, 'sine', .09); },
  fire(){ const a = ac(); if (!a) return; noise(a, 1.4, 250, 900, .5, .3); for (let i = 0; i < 14; i++) setTimeout(() => { const b = ac(); if (b) noise(b, .03, 4000 + Math.random() * 3000, 2500, 3, .12 + Math.random() * .1); }, 80 + Math.random() * 1100); },
  book(){ const a = ac(); if (!a) return; [523, 659, 784, 1047].forEach((f, i) => tone(a, f, .5, .08, 'triangle', i * .09)); },
  thud(){ const a = ac(); if (a){ tone(a, 110, .25, .25, 'sine'); noise(a, .12, 400, 120, .7, .2); } },
  coin(){ const a = ac(); if (!a) return; tone(a, 1800, .25, .06, 'square'); tone(a, 2400, .3, .05, 'sine', .05); },
  chalk(){ const a = ac(); if (!a) return; for (let i = 0; i < 3; i++) setTimeout(() => { const b = ac(); if (b) noise(b, .12, 5000, 3000, 2, .12); }, i * 140); },
  heart(){ const a = ac(); if (!a) return; tone(a, 62, .16, .4, 'sine'); tone(a, 56, .2, .3, 'sine', .2); },
  phew(){ const a = ac(); if (!a) return; tone(a, 660, .25, .05, 'triangle'); tone(a, 880, .35, .05, 'triangle', .1); },
  ach(){ const a = ac(); if (!a) return; [784, 988, 1175, 1568].forEach((f, i) => tone(a, f, .6, .06, 'triangle', i * .07)); },
  crash(){ const a = ac(); if (!a) return; tone(a, 196, 1.6, .16, 'triangle'); tone(a, 185, 1.6, .12, 'triangle', .05); noise(a, 1.6, 600, 150, .5, .2); }
};
/* The tavern itself: a low murmur, and now and then the mechanical birdsong John Evelyn heard there in 1641. */
let AMB = null;
function ambience(){
  if (!SET.sound){ if (AMB){ try { AMB.g.gain.value = 0; AMB.src.stop(); } catch(e){} clearInterval(AMB.t); AMB = null; } return; }
  if (AMB) return; const a = ac(); if (!a) return;
  const len = a.sampleRate * 4, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0); let last = 0;
  for (let i = 0; i < len; i++){ last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = .7;
  const g = a.createGain(); g.gain.value = .05; src.connect(f).connect(g).connect(a.destination); src.start();
  const t = setInterval(() => { const b = ac(); if (!b || document.hidden) return; const r = Math.random();
    if (r < .45){ const base = 2600 + Math.random() * 1400; for (let i = 0; i < 3; i++) tone(b, base, .09, .015, 'sine', i * .13, base * 1.35); }
    else if (r < .65) tone(b, 2900 + Math.random() * 500, .5, .012, 'sine'); }, 7000);
  AMB = {src, g, t};
}
document.addEventListener('pointerdown', () => ambience(), {once:true});

/* ---------- state ---------- */
let G = null, ui = freshUI();
function freshUI(){ return {pick:null, turn:null, cash:null, log:[], blown:new Set(), pending:null, bubbles:{}, tip:null, after:false, lastOdds:0, anim:new Set(), flip:null, kinds:new Set(), st:{hold:0, soldAt:-1}}; }
const RIVALS = [
  {name:'Joost van Cuyck', short:'Van Cuyck', style:'cautious', img:'c_cuyck',
   info:`<p>Twenty-nine, from Amsterdam. On 6 February 1637, in this very tavern, he bought a pound of Switsers from Andries de Busscher for 1,100 guilders, about the price of a reasonably nice house, on condition that De Busscher found a guarantor. He paid the <i>wijnkoop</i> for the room's drinks and two shillings for the poor.</p><p>The next morning he backed out: "I am not content with the guarantor. I want to find a guarantor of my own liking." On the 11th a witness told a notary that the two men had shaken hands.</p><p><b>At this table:</b> cautious. Stands up early and reads the risk of a crash high.</p>`},
  {name:'Andries de Busscher', short:'De Busscher', style:'balanced', img:'c_busscher',
   info:`<p>Thirty-one, a cooper from Haarlem, from a family of art collectors and himself a connoisseur of tulips: at least one tulip, purple and white striped, was named after him.</p><p>He was the seller in the Switsers deal. His brother-in-law Alister van de Cruijs promised 1,200 guilders as security, and still Van Cuyck walked away.</p><p><b>At this table:</b> steady. Weighs every paper.</p>`},
  {name:'Abraham van Meeckeren', short:'Van Meeckeren', style:'greedy', img:'c_meeckeren',
   info:`<p>A brewer from Haarlem. The historian Anne Goldgar found only 37 people in the archives who spent more than 400 guilders on tulips; he is one of them.</p><p><b>At this table:</b> greedy. Takes one more paper than he should and under-reads the risk of a crash.</p>`}
];
const HOST_INFO = `<p>Jan Theunisz kept the Menniste Bruyloft ("the Mennonite Wedding"), a tavern and music house in the Oude Brugsteeg, a tiny alley in Amsterdam near the port and the exchange. It was often the scene of tulip deals. When John Evelyn visited in 1641 he heard water-driven "artificial Musique, noises of Beasts and Chirping of Birds".</p><p>Theunisz was a religious liberal, a printer and a scholar of Latin, Greek, Arabic and Hebrew. He probably died between 1635 and 1640, so his pouring the wine in the winter of 1636 is a small liberty.</p>`;
const LINES = {
  bust:["Up in smoke, {p}.","Windhandel! {p}'s papers go up in flames.","Two {v}s in one evening, {p}? Into the fire.","That is what they call trading in wind, {p}."],
  book:["A full tulip book! {p} closes the evening.","Seven tulips, seven pages. Well played, {p}.","{p} has the whole book. Everyone stops."],
  freeze:["{p} pays the wine money for {q}. Sealed.","{q}'s evening is sealed with {p}'s wine.","Drink up, {q}. {p} has closed your deal."],
  freezeSelf:["{p} pays the wine money and stands up.","{p} seals the evening with a glass."],
  flip3:["The seghsman chalks three more for {q}.","{p} calls the broker: three papers for {q}!","Three strokes on the slate for {q}."],
  saved:["{p} pays rouwkoop and walks away from the second {v}.","Regret money! {p} escapes the duplicate.","{p} buys their way out. Honour saved."],
  stay:["{p} stands up.","{p} has had enough for tonight.","{p} calls for wine and stands up."],
  turnYou:["Your turn. Another paper?","Well? The seghsman is waiting.","Another, or a glass of wine?"],
  give:["{p} hands a spare rouwkoop to {q}."]
};
const BUB = {
  hit:["Another!","Keep them coming.","One more paper.","Easy money."],
  hitRisky:["Fortune favours the bold!","Just one more…","I can feel it.","Don't look at me like that."],
  stay:["That'll do.","Wine, please.","Enough for tonight.","I'll stand."],
  bust:["Ach!","No, no, no!","Fire!","Not again…"],
  phew:["Phew!","Ha! Lucky.","Close one!"],
  book:["A full book!","Seven!"],
  sold:["Cashing in.","Coins, please.","I'll take the money."],
  held:["I'll hold.","It can only go up.","Paper suits me."]
};
const pickA = a => a[Math.floor(Math.random() * a.length)];
const pickLine = (k, d) => pickA(LINES[k]).replace(/\{(\w)\}/g, (_, x) => x === 'p' ? d.p : x === 'q' ? d.q : d.v);
function say(t){ $('#say').textContent = t; }
function log(h){ ui.log.unshift(h); ui.log = ui.log.slice(0, 40); $('#log').innerHTML = ui.log.map(x => `<p>${x}</p>`).join(''); }
function toast(html, ms = 1100){ const t = $('#toast'); t.innerHTML = html; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), SET.fast ? ms * .6 : ms); }
const nm = p => p.human ? 'You' : p.short;
const nmIn = p => p.human ? 'you' : p.short;
const bubT = {};
function bubble(p, text, ms = 1500){
  if (p.human) return;
  ui.bubbles[p.i] = text; render();
  clearTimeout(bubT[p.i]); bubT[p.i] = setTimeout(() => { delete ui.bubbles[p.i]; if (G) render(); }, SET.fast ? ms * .6 : ms);
}
const handEl = p => document.querySelector(`[data-seat="${p.i}"] [data-part="hand"]`);
function floatAt(p, text, color){
  const el = handEl(p); if (!el) return;
  const r = el.getBoundingClientRect(), f = document.createElement('div');
  f.className = 'float'; f.textContent = text; if (color) f.style.color = color;
  f.style.left = (r.left + Math.min(r.width, 240) / 2 - 30) + 'px'; f.style.top = (r.top + 10) + 'px';
  document.body.appendChild(f); setTimeout(() => f.remove(), 1400);
}

/* ---------- first-game tips ---------- */
const TIPS = {
  first:"Each paper is a tulip. Keep collecting different ones, or stand up to bank what is on the table. If a tulip you already hold comes a second time, your whole evening goes up in smoke.",
  danger:"The red chips count the copies of your tulips still in the pile: the papers that would burn your evening. The more tulips you hold, the riskier the next paper.",
  book:"Two more different tulips and your tulip book is full: +15, and the evening ends for everyone.",
  bust:"Up in smoke: a duplicate tulip burns that player's whole evening.",
  cash:"Everything you win in the winter is paper. It grows with the index each evening, but if the crash comes first it is worth only 3½%. Cash in when the risk looks too high."
};
let TIPSEEN = (() => { try { return JSON.parse(localStorage.getItem('tulip7.tips')) || {}; } catch(e){ return {}; } })();
function tip(k){ if (!SET.help || TIPSEEN[k] || ui.tip) return; ui.tip = {k, t:TIPS[k]}; render(); }
function dismissTip(){ if (!ui.tip) return; TIPSEEN[ui.tip.k] = 1; try { localStorage.setItem('tulip7.tips', JSON.stringify(TIPSEEN)); } catch(e){} ui.tip = null; render(); }

/* ---------- achievements: each one is a real event of 1624-1638 ---------- */
const ACH = [
  {id:'pauw', art:'t00', t:"Dr Pauw's tulip", c:"Draw the Semper Augustus.", h:"In 1624 Dr Adriaen Pauw, a director of the VOC, would not sell his Semper Augustus at any price."},
  {id:'book', art:'i_book', t:"A tulip book", c:"Complete a tulip book: seven different tulips in one evening.", h:"Growers sold from painted albums, with the name, weight and price of each bulb on its page."},
  {id:'pound', art:'t12', t:"Pound goods", c:"Stand up holding Gheele Croonen, Switsers and Witte Croonen together.", h:"The cheap bulbs sold by the pound rose twenty to fifty times in January 1637: Gheele Croonen from 0.41 to 20.5."},
  {id:'wijnkoop', art:'a_wijnkoop', t:"Wine money", c:"Seal the leader's evening with Wijnkoop.", h:"A tavern deal became binding when the buyer paid the wijnkoop: the drinks for the whole room."},
  {id:'rouwkoop', art:'a_rouwkoop', t:"Regret money", c:"Escape a duplicate with Rouwkoop.", h:"Rouwkoop let a buyer walk away from a deal for a small payment and keep his honour."},
  {id:'broken', art:'m_broken', t:"The breaking virus", c:"Bank 60 or more in one evening with a Broken tulip.", h:"The prized flames came from a virus carried by aphids. Dorothy Cayley proved it in 1928."},
  {id:'windhandel', art:'i_wind', t:"Windhandel", c:"Lose f600 or more in one evening to a duplicate.", h:"After the crash, people called the paper trade windhandel: trading in wind."},
  {id:'fivetimes', art:'i_paper', t:"Five times sold", c:"Hold your paper through five evenings in a row.", h:"That winter some contracts changed hands five times before anyone saw a bulb."},
  {id:'guarantor', art:'c_cuyck', t:"Not content with the guarantor", c:"Cash in all your paper on the last evening before a surprise crash.", h:"On 7 February 1637 Joost van Cuyck walked away from a 1,100-guilder deal: \"I am not content with the guarantor.\""},
  {id:'settle', art:'i_purse', t:"Three and a half per cent", c:"Be caught by the crash holding f1,500 or more of paper.", h:"In May 1638 Haarlem let buyers walk away from their contracts for 3½ per cent of the price."},
  {id:'alkmaar', art:'t02', t:"The orphans' auction", c:"Win f1,000 or more on the Alkmaar evening.", h:"On 5 February 1637 Wouter Winckel's bulbs sold for about 90,000 guilders, for his orphans. A Viceroy fetched 4,203."},
  {id:'the37', art:'c_meeckeren', t:"One of the 37", c:"Finish a winter with f4,000 or more.", h:"Goldgar found only 37 people who spent more than 400 guilders on tulips. Abraham van Meeckeren was one."},
  {id:'house', art:'t11', t:"A reasonably nice house", c:"Finish a winter richest at the table.", h:"A pound of Switsers sold here for 1,100 guilders: about the price of a reasonably nice house."},
  {id:'tavern', art:'c_theunisz', t:"The Menniste Bruyloft", c:"Win the tavern game.", h:"A tavern and music house in the Oude Brugsteeg, near the port and the exchange; often the scene of tulip deals."}
];
let ACHS = (() => { try { return JSON.parse(localStorage.getItem('tulip7.ach')) || {}; } catch(e){ return {}; } })();
const achQueue = [];
function unlock(id){
  if (ACHS[id]) return; const a = ACH.find(x => x.id === id); if (!a) return;
  ACHS[id] = new Date().toISOString().slice(0, 10); try { localStorage.setItem('tulip7.ach', JSON.stringify(ACHS)); } catch(e){}
  log(`<b>Achievement:</b> ${esc(a.t)}`); track('tulip_achievement', {id}); achQueue.push(a); if (achQueue.length === 1) showAchToast();
}
/* Achievement art: a painted Dutch tile per achievement once the tile pack is merged (ach_<id>, ach_locked); until then a wax seal. */
const sealHTML = (a, locked) => {
  const t = ART['ach_' + a.id];
  if (t) return `<div class="tileach">${locked ? (ART.ach_locked ? `<img src="${ART.ach_locked}" alt="">` : `<img class="gray" src="${t}" alt="">`) : `<img src="${t}" alt="">`}</div>`;
  return `<div class="seal"><img src="${ART[a.art]}" alt=""></div>`;
};
function showAchToast(){
  const a = achQueue[0]; if (!a) return; const t = $('#achToast');
  t.innerHTML = `${sealHTML(a)}<div><small>Achievement</small><b>${esc(a.t)}</b></div>`; SND.ach();
  t.classList.add('on'); setTimeout(() => { t.classList.remove('on'); setTimeout(() => { achQueue.shift(); showAchToast(); }, 400); }, 2800);
}
function showAchievements(){
  const n = ACH.filter(a => ACHS[a.id]).length;
  modal(`<div class="kick">The winter of 1636–37</div><h2>Achievements</h2><p style="color:var(--muted);margin:4px 0 0">${n} of ${ACH.length}. Each one is something that really happened.</p>
    <div class="achs">${ACH.map(a => `<div class="ach ${ACHS[a.id] ? '' : 'locked'}">${sealHTML(a, !ACHS[a.id])}<b>${esc(a.t)}</b><small>${esc(a.c)}</small>${ACHS[a.id] ? `<div class="h">${esc(a.h)}</div><div class="d">Unlocked ${ACHS[a.id]}</div>` : ''}</div>`).join('')}</div>
    <div class="row"><button class="btn primary" data-v="x">Close</button></div>`, 'wide');
  $('#mbox [data-v]').onclick = () => { closeModal(); if (!G) showStart(); };
}

/* ---------- the designed card ---------- */
const SPEC = {
  freeze:{eff:"Stops a player", long:"Whoever draws it picks a player still at the table. That player must stop now and bank what they have."},
  flip3:{eff:"Three more papers", long:"Whoever draws it picks a player still at the table. That player must take three more papers, one after another."},
  second:{eff:"Saves one duplicate", long:"Keep it. The next time one of your tulips comes twice, you pay rouwkoop instead: the duplicate is thrown away and you stay in."},
  x2:{eff:"Doubles", long:"Doubles the total of your tulip numbers this evening (not the Offsets)."},
  mod:{eff:"Adds", long:"Adds N to your evening. It is not a tulip, so it can never be a duplicate."}
};
function cardHTML(c, extra = ''){
  const u = `data-uid="${c.uid}"`;
  if (c.k === 'num'){ const v = V[c.v];
    return `<div class="card num ${extra}" ${u} style="--c:${v.hex};--ci:${v.ink}" title="${esc(v.name + ' (' + v.n + '): ' + v.note)}" aria-label="${esc(v.name)}, ${v.n}"><div class="fr"><b class="pip tl">${v.n}</b><div class="win"><img src="${ART[v.id]}" alt=""></div><div class="rb ${v.name.length > 16 ? 'long' : ''}">${esc(v.name)}</div><span class="cp">${v.n ? v.n + ' in deck' : 'only one'}</span><b class="pip br" aria-hidden="true">${v.n}</b></div></div>`; }
  if (c.k === 'mod') return `<div class="card mod ${extra}" ${u} title="${esc(SP.mod.note)}"><div class="fr"><b class="pip tl">+${c.v}</b><div class="win"><img src="${ART.m_offset}" alt=""></div><div class="rb">Offsets</div><span class="cp">adds ${c.v}</span><b class="pip br" aria-hidden="true">+${c.v}</b></div></div>`;
  if (c.k === 'x2') return `<div class="card x2 ${extra}" ${u} title="${esc(SP.x2.note)}"><div class="fr"><b class="pip tl">×2</b><div class="win"><img src="${ART.m_broken}" alt=""></div><div class="rb">Broken tulip</div><span class="cp">doubles</span><b class="pip br" aria-hidden="true">×2</b></div></div>`;
  const s = SP[c.k], ic = {freeze:'✋', flip3:'3', second:'↺'}[c.k];
  return `<div class="card act ${c.k === 'second' ? 'held' : ''} ${extra}" ${u} title="${esc(s.name + ': ' + SPEC[c.k].long)}"><div class="fr"><b class="pip tl">${ic}</b><div class="win"><img src="${ART[s.art]}" alt=""></div><div class="rb">${s.name}</div><span class="cp">${SPEC[c.k].eff}</span></div></div>`;
}
const BACK_SVG = `<svg viewBox="0 0 40 40"><path d="M20 36V20" stroke="#3f8a4a" stroke-width="2.5"/><path d="M20 26c-6-1-9-5-10-9 5 0 9 3 10 9zM20 26c6-1 9-5 10-9-5 0-9 3-10 9z" fill="#3f8a4a"/><path d="M12 8c2 6 4 10 8 12 4-2 6-6 8-12-3 2-5 3-6 5-1-3-1-5-2-7-1 2-1 4-2 7-1-2-3-3-6-5z" fill="#d7261e"/></svg>`;
const backHTML = (extra = '', uid = '') => `<div class="card facedown ${ART.ui_cardback ? 'img' : ''} ${extra}" ${uid ? `data-uid="${uid}"` : ''}><span class="mark">${BACK_SVG}</span></div>`;

/* ---------- seats ---------- */
function handHTML(p){
  if (ui.blown.has(p.i)) return '';
  let h = p.cards.map(c => cardHTML(c)).join('');
  if (p.second) h += cardHTML(p.second);
  if (p.bustCard) h += cardHTML(p.bustCard, 'dupe');
  if (ui.pending && ui.pending.p === p) h += backHTML(ui.pending.odds >= .25 ? 'shake' : '', 'fd' + ui.pending.id);
  return h;
}
function bookHTML(p, big){
  let h = '';
  for (let k = 0; k < 7; k++){ const n = p.nums[k]; if (n === undefined) h += '<span></span>'; else { const v = V[n]; h += `<span class="f" style="--c:${v.hex};--ci:${v.ink}">${big ? n : ''}</span>`; } }
  return `<div class="book ${big ? '' : 'sm'}" title="Tulip book: ${p.nums.length} of 7 different tulips">${h}${big ? `<small>tulip book ${p.nums.length}/7${p.nums.length >= 5 ? ' · +15 at seven' : ''}</small>` : ''}</div>`;
}
function statusChip(p){
  if (G.turn === p && p.status === 'active') return `<span class="chip turn">${p.human ? 'Your turn' : 'Thinking…'}</span>`;
  if (ui.after && p.status !== 'idle'){
    if (p.status === 'bust') return `<span class="chip bust">Up in smoke</span>`;
    return `<span class="chip ${p.status === 'book' ? 'book' : 'stayed'}">${G.mode === 'classic' ? '+' + p.last : '+' + fmt(p.lastG)}${p.status === 'book' ? ' · book' : ''}</span>`;
  }
  const m = {active:['', 'At the table'], stayed:['stayed', p.frozen ? 'Sealed' : 'Stood up'], bust:['bust', 'Up in smoke'], book:['book', 'Tulip book!']};
  const x = m[p.status]; return x ? `<span class="chip ${x[0]}">${x[1]}</span>` : '';
}
function moneyHTML(p){
  if (G.mode === 'classic') return `<span class="tot">Total <b>${p.total}</b> / ${TARGET}</span>`;
  const paper = G.crashed ? `<span>Settled <b>${fmt(p.settled)}</b></span>` : `<span>Paper <b>${fmt(G.paperValue(p))}</b></span>`;
  return `<span>Purse <b>${fmt(p.purse)}</b></span>${paper}<span class="tot">Worth <b>${fmt(G.standing(p))}</b></span>`;
}
const tableValue = p => { const s = G.roundScore(p); return G.mode === 'classic' ? s + ' pts' : fmt(s * GPP * (G.alkmaar ? 2 : 1)); };
function plateHTML(p){
  const r = RIVALS[p.i - 1];
  const img = p.human ? '' : `<img class="pt" src="${ART[r.img]}" alt="">`;
  return `${img}<div class="who"><div class="nm"><span class="fn">${esc(p.name)}</span><span class="sn">${esc(p.short)}</span></div><div class="mn">${moneyHTML(p)}</div></div>${statusChip(p)}`;
}
function belowHTML(p){
  const show = p.nums.length || p.status === 'active';
  const s = ['active', 'stayed', 'book'].includes(p.status) ? G.roundScore(p) : 0;
  return (show ? bookHTML(p, p.human) : '') + (!p.human && s && !ui.after ? `<span class="tag">on the table <b>${tableValue(p)}</b></span>` : '');
}
function buildSeats(){
  const mk = (p, cls) => `<div class="${cls}" data-seat="${p.i}"><div data-part="bub"></div><div class="plate" data-part="plate"></div><div class="hand ${p.human ? '' : 'mini'}" data-part="hand"></div><div class="below" data-part="below"></div></div>`;
  $('#rivals').innerHTML = G.players.slice(1).map(p => mk(p, 'seat')).join('');
  $('#you').innerHTML = `<div id="tipBox"></div>` + mk(G.players[0], 'seat me');
  document.querySelectorAll('[data-seat]').forEach(el => el.onclick = () => { if (ui.pick){ const q = G.players[+el.dataset.seat]; if (ui.pick.cands.includes(q)) ui.pick.done(q); } });
  $('#you .me').style.cssText = 'background:none;padding:0';
}
function setPart(el, html){ if (el && el._h !== html){ el.innerHTML = html; el._h = html; } }

/* ---------- render ---------- */
function renderBoard(){
  const b = $('#board'), st = $('#strip');
  if (!G || G.mode === 'classic'){ b.hidden = true; st.hidden = true; return; }
  b.hidden = false; st.hidden = false;
  let h = '';
  for (let e = 0; e < IDX.length; e++){
    const dead = G.crashed && e > G.crashAfter, now = !G.crashed && e === G.evening && !G.alkmaar, past = e < G.evening || (G.crashed && e <= G.crashAfter);
    const rk = RISK[e] ? `crash ${pct(RISK[e])}` : 'no risk';
    h += `<div class="cell ${now ? 'now' : ''} ${past && !now ? 'past' : ''} ${dead ? 'dead' : ''}" title="Index ×${IDX[e]} on this evening. Chance the crash comes before this evening: ${pct(RISK[e])}"><b>${ROMAN[e]}</b>${EV[e].short}<div class="ix">×${IDX[e]}</div><div class="rk ${RISK[e] >= .2 ? 'hot' : ''}">${rk}</div></div>`;
  }
  h += `<div class="cell crash ${G.crashed ? 'hit' : ''}" title="After evening VIII the crash is certain"><b>3 Feb</b>Haarlem<div class="ix" style="color:inherit">crash</div><div class="rk" style="color:inherit">paper → 3½%</div></div>`;
  h += `<div class="cell alk ${G.alkmaar && !G.over ? 'now' : ''}" title="A cash auction: winnings go to the purse, doubled"><b>5 Feb</b>Alkmaar<div class="ix" style="color:inherit">cash ×2</div><div class="rk" style="color:inherit">final</div></div>`;
  setPart(b, h);
  setPart(st, G.alkmaar ? `<b>Alkmaar · 5 February 1637</b><span>Cash auction for Wouter Winckel's orphans. What you win tonight goes into your purse, twice over.</span>`
    : G.crashed ? `<b>3 February 1637</b><span>The crash. All paper has settled at 3½ per cent.</span>`
    : `<b>Evening ${ROMAN[G.evening]} · ${EV[G.evening].date}</b><span>${EV[G.evening].news}</span>`);
}
function render(){
  if (!G) return;
  renderBoard();
  if (!document.querySelector('[data-seat]')) buildSeats();
  for (const p of G.players){
    const seat = document.querySelector(`[data-seat="${p.i}"]`); if (!seat) continue;
    seat.classList.toggle('turn', G.turn === p);
    seat.classList.toggle('pick', !!(ui.pick && ui.pick.cands.includes(p)));
    setPart(seat.querySelector('[data-part="bub"]'), ui.bubbles[p.i] ? `<div class="bubble">${esc(ui.bubbles[p.i])}</div>` : '');
    setPart(seat.querySelector('[data-part="plate"]'), plateHTML(p));
    setPart(seat.querySelector('[data-part="hand"]'), handHTML(p));
    setPart(seat.querySelector('[data-part="below"]'), belowHTML(p));
  }
  setPart($('#tipBox'), ui.tip ? `<div class="tip"><span>${esc(ui.tip.t)}</span><button data-tip="1">Got it</button></div>` : '');
  const tb = $('#tipBox [data-tip]'); if (tb) tb.onclick = dismissTip;
  setPart($('#ctrl'), ctrlHTML()); wireCtrl();
  setPart($('#deckPile'), backHTML() + backHTML() + (G.draw.length ? backHTML() : ''));
  $('#deckN').textContent = G.draw.length; $('#discN').textContent = G.discard.length;
  const ev = G.alkmaar ? 'Alkmaar, 5 February 1637' : G.mode === 'winter' ? `Evening ${ROMAN[G.evening]} · ${EV[G.evening].date}` : `Round ${G.round} · first to ${TARGET}`;
  $('#where').textContent = ev + (G.alkmaar || ART.ui_sign ? '' : ' · Menniste Bruyloft, Amsterdam');
  animateNew();
}
/* Every new card flies in from the pile; a drawn card is turned over where it lands. */
function animateNew(){
  const deck = $('#deckPile').getBoundingClientRect();
  document.querySelectorAll('[data-part="hand"] .card[data-uid]').forEach(el => {
    const uid = el.dataset.uid; if (ui.anim.has(uid)) return; ui.anim.add(uid);
    if (uid === String(ui.flip)){ ui.flip = null; el.animate([{transform:'perspective(600px) rotateY(90deg) scale(1.1)'}, {transform:'none'}], {duration:SET.fast ? 160 : 280, easing:'ease-out'}); return; }
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const dx = deck.left + deck.width / 2 - (r.left + r.width / 2), dy = deck.top + deck.height / 2 - (r.top + r.height / 2);
    el.animate([{transform:`translate(${dx}px,${dy}px) scale(${deck.width / r.width}) rotate(-12deg)`}, {transform:'none'}], {duration:SET.fast ? 260 : 440, easing:'cubic-bezier(.2,.9,.3,1)'});
  });
}
function dangerHTML(me){
  if (!me.nums.length || me.status !== 'active') return '';
  const pl = G.pile(), cnt = {}; for (const c of pl) if (c.k === 'num') cnt[c.v] = (cnt[c.v] || 0) + 1;
  const chips = [...me.nums].sort((a, b) => b - a).map(n => { const k = cnt[n] || 0, v = V[n]; return `<span class="dchip ${k ? '' : 'safe'}" title="${k} more ${esc(v.name)} in the pile"><i style="--c:${v.hex};--ci:${v.ink}">${n}</i>${k} left</span>`; }).join('');
  const dup = me.nums.reduce((s, n) => s + (cnt[n] || 0), 0), od = pl.length ? dup / pl.length : 0;
  return `<div class="danger">${chips}</div><div class="odds"><b>${dup}</b> of ${pl.length} papers would burn your evening: <b class="${od >= .25 ? 'hot' : ''}">${pct(od)}</b>${me.second ? '<br>Your Rouwkoop saves you from one.' : ''}</div><div class="meter"><i style="width:${Math.min(100, od * 100)}%;background-position:${-od * 300}px 0"></i></div>`;
}
function stakeHTML(me){ return me.status === 'active' && me.cards.length ? `<div class="stake"><span>On the table</span><b>${tableValue(me)}</b></div>` : ''; }
function cashHTML(){
  const me = G.players[0], e = G.evening, v = me.units * IDX[e], fee = Math.round(v * FEE), rn = G.riskNext(), last = e + 1 >= IDX.length;
  const next = last ? `After this evening <b class="hot">the crash is certain</b>.`
    : `Evening ${ROMAN[e + 1]}: index ×${IDX[e]} → ×${IDX[e + 1]} (+${Math.round((IDX[e + 1] / IDX[e] - 1) * 100)}%), but <b class="${rn >= .2 ? 'hot' : ''}">${pct(rn)}</b> chance the crash comes first.`;
  return `<div class="cash"><div class="t">End of evening ${ROMAN[e]}. Your paper: ${fmt(v)}</div><div class="odds">${next}</div>
    <button class="btn paper" data-cash="hold"><img src="${ART.i_paper}" alt="">Hold it<small>${last ? 'it will settle at 3½%' : 'worth ' + fmt(me.units * IDX[e + 1]) + ' next evening, if no crash'}</small></button>
    <button class="btn purse" data-cash="sell"><img src="${ART.i_purse}" alt="">Cash it all in: ${fmt(v - fee)}<small>safe in your purse · wine money ${fmt(fee)}</small></button></div>`;
}
function ctrlHTML(){
  const me = G.players[0];
  if (ui.pick){
    const lbl = ui.pick.kind === 'give' ? 'Give your spare Rouwkoop to:' : `Who gets ${SP[ui.pick.card.k].name}?`;
    return `<div class="picker"><div class="t">${lbl}</div><small class="odds">${esc(SPEC[ui.pick.kind === 'give' ? 'second' : ui.pick.card.k].long)}</small>${ui.pick.cands.map(q => `<button class="btn" data-pick="${q.i}">${q.human ? 'Yourself' : esc(q.name)}${q.status === 'active' ? `<small>on the table ${tableValue(q)} · ${q.nums.length} tulips</small>` : ''}</button>`).join('')}</div>`;
  }
  if (ui.cash) return cashHTML();
  if (!ui.turn) return stakeHTML(me) + (SET.help ? dangerHTML(me) : '') + `<div class="wait">${G.over ? '' : me.status === 'active' ? 'Wait for your turn…' : 'Watching the others…'}</div>`;
  const s = G.roundScore(me);
  let stay;
  if (G.mode === 'classic') stay = `<button class="btn purse" data-act="stay"><img src="${ART.i_purse}" alt="">Stand up · bank ${s}<small>total would be ${me.total + s}</small></button>`;
  else if (G.alkmaar) stay = `<button class="btn alk" data-act="stay"><img src="${ART.i_purse}" alt="">Stand up · cash ${fmt(s * GPP * 2)}<small>Alkmaar pays double, in cash</small></button>`;
  else stay = `<button class="btn paper" data-act="stay"><img src="${ART.i_paper}" alt="">Stand up · ${fmt(s * GPP)} on paper<small>you can cash it in at the end of the evening</small></button>`;
  return stakeHTML(me) + (SET.help ? dangerHTML(me) : '') + `<button class="btn hit" data-act="hit">Take another paper<small>one more tulip from the pile</small></button>${stay}`;
}
function wireCtrl(){
  document.querySelectorAll('#ctrl [data-act]').forEach(b => b.onclick = () => { const f = ui.turn; ui.turn = null; f && f(b.dataset.act); });
  document.querySelectorAll('#ctrl [data-pick]').forEach(b => b.onclick = () => ui.pick && ui.pick.done(G.players[+b.dataset.pick]));
  document.querySelectorAll('#ctrl [data-cash]').forEach(b => b.onclick = () => ui.cash && ui.cash.done(b.dataset.cash));
}

/* ---------- special-paper announcement ---------- */
function announce(p, c){
  const title = c.k === 'mod' ? 'Offsets +' + c.v : SP[c.k].name;
  const eff = c.k === 'mod' ? SPEC.mod.long.replace('N', c.v) : SPEC[c.k].long;
  const box = $('#ann');
  box.innerHTML = `<div class="abox">${cardHTML({...c, uid:'A' + c.uid})}<div><div class="kick">Special paper</div><h2>${esc(title)}</h2><p class="eff">${esc(eff)}</p><p class="hist">${esc(SP[c.k].note.split('. ')[0])}.</p><div class="who">${p.human ? 'You drew it.' : esc(p.name) + ' drew it.'} <span style="color:var(--muted);font-weight:400">· click to continue</span></div></div></div>`;
  box.hidden = false;
  return new Promise(res => { let done = false; const end = () => { if (done) return; done = true; box.hidden = true; res(); };
    box.onclick = end; setTimeout(end, c.k === 'mod' || c.k === 'x2' ? (SET.fast ? 1000 : 2000) : (SET.fast ? 1400 : 3000)); });
}

/* ---------- modal helpers ---------- */
function modal(html, cls = ''){ const m = $('#modal'), b = $('#mbox'); b.className = 'mbox ' + cls; b.innerHTML = html; m.hidden = false; const f = b.querySelector('button'); f && f.focus(); return b; }
function closeModal(){ $('#modal').hidden = true; }
function ask(html, cls){ return new Promise(res => { const b = modal(html, cls); b.querySelectorAll('[data-v]').forEach(x => x.onclick = () => { closeModal(); res(x.dataset.v); }); }); }

/* ---------- agents ---------- */
const Human = {
  hitOrStay(g, p){
    return new Promise(res => {
      say(pickLine('turnYou', {}));
      ui.turn = a => { if (a === 'hit' && !ui.firstDraw){ ui.firstDraw = true; track('tulip_first_draw', {}); } res(a === 'hit' ? 'hit' : 'stay'); render(); };
      tip('first'); if (g.bustOdds(p) >= .2) tip('danger'); if (p.nums.length >= 5) tip('book');
      render();
    });
  },
  sell(g, p){ return new Promise(res => { say('The evening is over. Hold your paper, or cash it in?'); ui.cash = {done(v){ ui.cash = null; res(v === 'sell'); render(); }}; tip('cash'); render(); }); },
  target(g, p, c, cands){ return pickFrom('target', c, cands); },
  giveSecond(g, p, cands){ return pickFrom('give', null, cands); }
};
function pickFrom(kind, card, cands){
  return new Promise(res => { ui.pick = {kind, card, cands, done(q){ ui.pick = null; res(q); render(); }}; say(kind === 'give' ? 'You already have a Rouwkoop. Who gets the spare?' : `${SP[card.k].name}! Choose a player.`); render(); });
}
const Bot = {
  async hitOrStay(g, p){
    const od = g.bustOdds(p) * (p.second ? 0 : 1);
    await pace(.4 + od * 1.8);
    const d = T7.AI.hitOrStay(g, p);
    bubble(p, pickA(d === 'hit' ? (od >= .25 ? BUB.hitRisky : BUB.hit) : BUB.stay));
    await pace(.45); return d;
  },
  sell: (g, p) => T7.AI.sell(g, p),
  async target(g, p, c, cands){ await pace(.5); return T7.AI.target(g, p, c, cands); },
  giveSecond: (g, p, c) => T7.AI.giveSecond(g, p, c)
};
const leader = p => G.players.every(x => x === p || G.standing(p) >= G.standing(x));

/* ---------- events from the engine ---------- */
async function onEvent(t, d){
  const p = d.p, q = d.q, me = G.players[0];
  switch (t){
    case 'evening':
      ui.after = false; G.players.forEach(x => { x.status = 'idle'; x.nums = []; }); render();
      track('tulip_evening', {evening:d.e + 1, worth:Math.round(G.standing(G.players[0]))});
      toast(`Evening ${ROMAN[d.e]} · ${EV[d.e].date}`, 1600); say(EV[d.e].news); log(`<b>Evening ${ROMAN[d.e]}</b>: index ×${IDX[d.e]}.`);
      await pace(1.6); break;
    case 'roundStart': ui.blown = new Set(); ui.after = false; render(); await pace(.4); break;
    case 'turn': render(); if (!p.human) await pace(.15); break;
    case 'draw':
      ui.pending = {p, odds:d.odds, id:(ui.pid = (ui.pid || 0) + 1)}; ui.lastOdds = d.odds; ui.flip = d.c.uid; SND.slide(); render();
      if (d.odds >= .25) SND.heart();
      await sleep((SET.fast ? 280 : 560) + d.odds * (SET.fast ? 450 : 1100));
      ui.pending = null; break;
    case 'card':
      SND.flip(); render();
      if (ui.lastOdds >= .3 && d.c.k === 'num'){ floatAt(p, p.human ? 'Phew!' : pickA(BUB.phew)); SND.phew(); if (!p.human) bubble(p, pickA(BUB.phew)); }
      if (p.human){ if (d.c.k === 'num' && d.c.v === 0) unlock('pauw'); if (p.nums.length >= 5) tip('book'); }
      if ((d.c.k === 'mod' || d.c.k === 'x2') && !ui.kinds.has(d.c.k)){ ui.kinds.add(d.c.k); await announce(p, d.c); }
      await pace(.55); break;
    case 'action':
      SND.flip(); render(); log(`<b>${nm(p)}</b> drew <b>${SP[d.c.k].name}</b>.`);
      if (d.c.k === 'flip3') SND.chalk(); if (d.c.k === 'freeze') SND.clink();
      await sleep(SET.fast ? 150 : 320); await announce(p, d.c); render(); break;
    case 'keep': render(); break;
    case 'give': log(`${nm(p)} gave a spare Rouwkoop to ${nmIn(q)}.`); say(pickLine('give', {p:nm(p), q:nmIn(q)})); render(); await pace(.8); break;
    case 'waste': log(`${nm(p)}'s spare Rouwkoop is discarded.`); render(); break;
    case 'saved': SND.coin(); say(pickLine('saved', {p:nm(p), v:V[d.c.v].name})); log(`<b>${nm(p)}</b> paid rouwkoop: the second ${V[d.c.v].name} is gone.`); floatAt(p, 'Rouwkoop!', '#c9f2cf'); if (p.human) unlock('rouwkoop'); render(); await pace(1.1); break;
    case 'bust': {
      const lost = G.roundScore(p) * (G.mode === 'classic' ? 10 : GPP * (G.alkmaar ? 2 : 1));
      if (p.human && lost >= 600) unlock('windhandel');
      await burn(p); bubble(p, pickA(BUB.bust), 1800); floatAt(p, 'Up in smoke', '#ffb38a');
      say(pickLine('bust', {p:nm(p), v:V[d.c.v].name})); log(`<b>${nm(p)}</b> drew a second ${V[d.c.v].name}. Up in smoke.`);
      tip('bust'); break; }
    case 'book': SND.book(); toast(`${nm(p)}: tulip book complete! +15`, 1600); bubble(p, pickA(BUB.book)); say(pickLine('book', {p:nm(p)})); log(`<b>${nm(p)}</b> completed a tulip book (+15). The evening ends.`); if (p.human) unlock('book'); render(); await pace(1.6); break;
    case 'freeze': say(p === q ? pickLine('freezeSelf', {p:nm(p)}) : pickLine('freeze', {p:nm(p), q:nmIn(q)})); log(`<b>${nm(p)}</b> sealed ${p === q ? 'their own' : nmIn(q) + "'s"} evening with Wijnkoop.`); if (p.human && q !== p && leader(q)) unlock('wijnkoop'); render(); await pace(1); break;
    case 'flip3': say(pickLine('flip3', {p:nm(p), q:nmIn(q)})); log(p === q ? `<b>${nm(p)}</b> called the seghsman on ${p.human ? 'yourself' : 'themselves'}: three more papers.` : `<b>${nm(p)}</b> sent the seghsman to ${nmIn(q)}: three more papers.`); render(); await pace(.8); break;
    case 'stay': SND.thud(); say(pickLine('stay', {p:nm(p)})); log(`<b>${nm(p)}</b> stood up with ${tableValue(p)}.`); render(); await pace(.5); break;
    case 'reshuffle': log('The floor is swept: the discards are shuffled into a new pile.'); break;
    case 'roundEnd':
      ui.after = true; render();
      for (const x of G.players){ if (x.status !== 'bust') floatAt(x, G.mode === 'classic' ? '+' + x.last : '+' + fmt(x.lastG)); }
      if (me.status !== 'bust'){
        if (me.x2 && me.last >= 60) unlock('broken');
        if ([10, 11, 12].every(n => me.nums.includes(n))) unlock('pound');
        if (G.alkmaar && me.lastG >= 1000) unlock('alkmaar');
      }
      SND.coin(); await pace(G.mode === 'classic' ? 2.2 : 1.4); break;
    case 'cashout': render(); break;
    case 'sold':
      if (!p.human){ bubble(p, pickA(BUB.sold), 1800); log(`<b>${nm(p)}</b> cashed in ${fmt(d.v - d.fee)}.`); }
      else { log(`You cashed in ${fmt(d.v - d.fee)} (wine money ${fmt(d.fee)}).`); ui.st.hold = 0; ui.st.soldAt = G.evening; }
      SND.coin(); render(); await pace(.5); break;
    case 'held':
      if (!p.human){ bubble(p, pickA(BUB.held), 1800); log(`<b>${nm(p)}</b> holds ${fmt(G.paperValue(p))} of paper.`); }
      else { ui.st.hold++; if (ui.st.hold >= 5) unlock('fivetimes'); }
      render(); await pace(.4); break;
    case 'cashoutDone': await pace(1.1); break;
    case 'crash':
      track('tulip_crash', {after:G.crashAfter + 1, paper:me.atCrash});
      if (me.atCrash >= 1500) unlock('settle');
      if (ui.st.soldAt === G.crashAfter && G.crashAfter < IDX.length - 1 && me.atCrash === 0) unlock('guarantor');
      await crashScene(); break;
    case 'alkmaar': await alkmaarScene(); break;
    case 'gameOver': {
      try { localStorage.removeItem(SAVE_KEY); } catch(e){}
      const best = Math.max(...G.players.map(x => G.standing(x)));
      if (G.mode === 'winter'){ if (G.standing(me) >= 4000) unlock('the37'); if (G.standing(me) === best) unlock('house'); }
      else if (me.total === best) unlock('tavern');
      { const rank = 1 + G.players.filter(x => G.standing(x) > G.standing(me)).length, worth = G.standing(me);
        track('tulip_game_end', {result:rank === 1 ? 'win' : 'lose', rank, worth:Math.round(worth), rounds:G.round, crash_after:G.mode === 'winter' ? G.crashAfter + 1 : null, achievements:Object.keys(ACHS).length});
        saveRecord(rank === 1, worth); }
      render(); await pace(1); await endScene(); break; }
    case 'resume': render(); await pace(.5); break;
  }
}
async function burn(p){
  render(); await pace(.6);
  const hand = handEl(p);
  SND.fire();
  if (hand){
    hand.classList.add('burn');
    hand.querySelectorAll('.card').forEach((c, k) => { c.style.setProperty('--k', k); c.style.setProperty('--rot', (Math.random() * 24 - 12) + 'deg'); });
    const r = hand.getBoundingClientRect(), n = Math.min(36, 10 + hand.children.length * 6);
    for (let k = 0; k < n; k++){
      const s = document.createElement('div'), ash = k % 3 === 0;
      s.className = 'spark ' + (ash ? 'ash' : 'ember');
      s.style.left = (r.left + Math.random() * Math.min(r.width, 500)) + 'px'; s.style.top = (r.top + r.height * (.3 + Math.random() * .6)) + 'px';
      s.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px'); s.style.setProperty('--dy', (ash ? 40 + Math.random() * 60 : -(60 + Math.random() * 140)) + 'px');
      s.style.setProperty('--r', (Math.random() * 360) + 'deg'); s.style.setProperty('--t', (0.9 + Math.random() * 0.9) + 's');
      s.style.animationDelay = (200 + Math.random() * 700) + 'ms'; document.body.appendChild(s); setTimeout(() => s.remove(), 2600);
    }
  }
  await sleep(SET.fast ? 900 : 1600);
  if (hand) hand.classList.remove('burn');
  ui.blown.add(p.i); render();
}

/* ---------- scenes ---------- */
async function crashScene(){
  SND.crash();
  const early = G.crashAfter < IDX.length - 1;
  const rows = G.players.map(p => `<tr><td>${p.human ? '<b>You</b>' : esc(p.name)}</td><td class="n">${fmt(p.atCrash)}</td><td class="n">${fmt(p.settled)}</td></tr>`).join('');
  renderBoard();
  await ask(`<div class="kick">${early ? 'Weeks pass in the taverns. Then:' : 'Then:'}</div><h2>Tuesday, 3 February 1637</h2>
    <p class="news">In Haarlem a pound of Witte Croonen is offered at 1,250 guilders, then 1,100, then 1,000. Nobody bids.</p>
    <p>Within a week nobody in any town is buying. Buyers stop paying, and the courts will not touch contracts they call gambling. Every paper in this room is now worth what a buyer can be made to pay: in the end, in May 1638, Haarlem settled on <b>3½ per cent</b>.</p>
    <table><tr><th></th><th class="n">Paper at the crash</th><th class="n">Settled at 3½%</th></tr>${rows}</table>
    <div class="row"><button class="btn primary" data-v="ok">On to Alkmaar</button></div>`);
  render();
}
async function alkmaarScene(){
  await ask(`<div class="kick">The last evening</div><h2>Thursday, 5 February 1637, Alkmaar</h2>
    <p class="news">Two days after Haarlem, the orphans of Wouter Winckel sell his bulbs for cash in the Nieuwe Schutters-Doelen. A Viceroy goes for 4,203 guilders; the sale makes about 90,000.</p>
    <p>An estate sale for cash, watched over by the orphans' guardians, not paper in a tavern. Tonight there is no paper: everything you win goes into your purse, <b>twice over</b>.</p>
    <div class="row"><button class="btn primary" data-v="ok">Ride to Alkmaar</button></div>`);
  say('Cash tonight. The orphan masters are watching.'); render();
}
async function endScene(){
  const P = [...G.players].sort((a, b) => G.standing(b) - G.standing(a));
  const me = G.players[0], win = P[0] === me;
  const rows = P.map((p, k) => `<tr><td>${k + 1}. ${p.human ? '<b>You</b>' : esc(p.name)}</td><td class="n">${G.mode === 'classic' ? p.total : fmt(p.purse + p.settled)}</td></tr>`).join('');
  let mine = '';
  if (G.mode === 'winter') mine = me.atCrash > 0 ? `<p>Your paper at the crash was worth <b>${fmt(me.atCrash)}</b>. It settled for <b>${fmt(me.settled)}</b>.</p>` : `<p>You held no paper when the crash came.</p>`;
  const facts = G.mode === 'winter' ? `<div class="facts"><b>What really happened</b><ul>
    <li>Only a few hundred people traded: about 285 in Haarlem and 60 in Amsterdam. Only 37 spent more than 400 guilders.</li>
    <li>Most of the winter's prices were never paid. On 27 April 1637 the States of Holland suspended the contracts; in May 1638 Haarlem let buyers walk away for 3½ per cent: <i>rouwkoop</i>.</li>
    <li>Historians have found almost no bankruptcies caused by tulips, and nobody drowned in a canal. Those stories came from pamphlets, from Charles Mackay's 1841 book and from a novel.</li>
    <li>The commonest bulbs swelled the most. That is why the 12s are the most valuable cards and the most dangerous.</li></ul>
    <div class="src">Sources: Peter Garber, "Tulipmania" (1989); Anne Goldgar, <i>Tulipmania</i> (2007).</div></div>` : '';
  const n = ACH.filter(a => ACHS[a.id]).length;
  const v = await ask(`<div class="kick">${G.mode === 'winter' ? 'The winter of 1636–37' : 'Game over'}</div><h2>${win ? 'You finish richest.' : esc(P[0].name) + ' finishes richest.'}</h2>
    <table>${rows}</table>${mine}${facts}<div data-hl-next></div><div class="row"><button class="btn primary" data-v="again">Play again</button><button class="btn" data-v="ach">Achievements (${n}/${ACH.length})</button><button class="btn" data-v="menu">Change mode</button></div>`);
  if (v === 'again') start(G.mode); else if (v === 'ach'){ G = null; showAchievements(); } else showStart();
}
function legendHTML(){ return `<div class="legend">${V.slice().reverse().map(v => cardHTML({k:'num', v:v.n, uid:'L' + v.n})).join('')}</div>`; }
function showRules(){
  modal(`<div class="rules"><div class="kick">How to play</div><h2>Tulip 7</h2>
  <p>Amsterdam, winter 1636. The bulbs are in the ground; what changes hands in the tavern is paper. Each evening you take papers one at a time, each a promise for a tulip you have not seen.</p>
  <h3>Each evening</h3><ul>
  <li>On your turn, <b>take another paper</b> or <b>stand up</b> and bank what is in front of you.</li>
  <li>If a tulip you already have comes again, your evening goes <b>up in smoke</b>: you score nothing.</li>
  <li>Seven different tulips is a <b>tulip book</b>: +15, and the evening ends for everyone.</li>
  <li>Your evening = the tulip numbers added up, doubled by a <b>Broken tulip</b>, plus any <b>Offsets</b>.</li></ul>
  <h3>Special papers</h3><ul>
  <li><b>Wijnkoop</b> (wine money): ${SPEC.freeze.long}</li>
  <li><b>Seghsman</b> (the broker): ${SPEC.flip3.long}</li>
  <li><b>Rouwkoop</b> (regret money): ${SPEC.second.long}</li></ul>
  <h3>The winter</h3><ul>
  <li>What you win in an evening (${GPP} guilders a point) is written <b>on paper</b>. Paper grows with the index: ×1 in November, ×7 in February.</li>
  <li>At the end of each evening you choose: <b>hold</b> your paper into the next evening, or <b>cash it all in</b> to your purse (2½% wine money). Money in the purse is safe.</li>
  <li>The board shows the chance that the crash comes before each evening. After evening VIII it is certain. When it comes, all paper settles at <b>3½ per cent</b>.</li>
  <li>The last evening is the Alkmaar auction: cash only, doubled. Richest at the end wins.</li></ul>
  <h3>Reading a card</h3><p>The number in the corners is the card's value, and also how many of that tulip are in the deck: a 12 has twelve copies, so it is the likeliest to come twice. The number is how much that variety swelled on paper that winter: cheap bulbs sold by the pound swelled fifty times, the famous rarities hardly moved. Semper Augustus is 0: its owner would not sell.</p>
  ${legendHTML()}
  <div class="row"><button class="btn primary" data-v="x">Back to the table</button></div></div>`, 'wide');
  $('#mbox [data-v]').onclick = () => { closeModal(); if (!G) showStart(); };
}
function loadSave(){ try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v === 1 && s.players && s.players.length === 4 ? s : null; } catch(e){ return null; } }
function showStart(){
  let mode = SET.mode; const sv = loadSave();
  const people = [...RIVALS.map(r => ({name:r.name, img:r.img, role:STYLES[r.style].label, info:r.info})), {name:'Jan Theunisz', img:'c_theunisz', role:'The host', info:HOST_INFO}];
  const head = ART.ui_logo ? `<img class="logo" src="${ART.ui_logo}" alt="Tulip 7">` : `<h1><small>Homo Ludens</small>Tulip 7</h1>`;
  const sign = ART.ui_sign ? `<img class="sign" src="${ART.ui_sign}" alt="">` : '';
  const b = modal(`<div class="art" style="--cover:url(${ART.bg_cover})">${head}${sign}</div><div class="in">
    <p style="font-family:'EB Garamond',serif;font-size:20px;margin-top:0">Amsterdam, winter 1636. Seven tulips, one tavern, and a market made of paper.</p>
    <div class="modes"><div class="mode" data-m="winter" tabindex="0"><b>The winter of 1636</b><small>Eight evenings, a rising price index and a crash you can see coming. Cash in, or hold?</small></div>
    <div class="mode" data-m="classic" tabindex="0"><b>The tavern game</b><small>Just the evenings, no winter and no crash: first to ${TARGET} points wins.</small></div></div>
    <p style="font-size:14px;color:var(--muted);margin:12px 0 0">At the table: three traders from the archives, and the host. Click a portrait to read who they were.</p>
    <div class="traders">${people.map((x, k) => `<button class="trader" data-t="${k}"><img src="${ART[x.img]}" alt=""><b>${esc(x.name)}</b>${esc(x.role)}</button>`).join('')}</div>
    <div id="tinfo"></div>
    <div class="row">${sv ? `<button class="btn primary" id="cont">Continue your ${sv.mode === 'winter' ? 'winter' : 'tavern game'}<small>${sv.mode === 'winter' ? (sv.alkmaar ? 'Alkmaar, the last evening' : 'Evening ' + ROMAN[sv.evening] + ', ' + EV[sv.evening].date) : 'Round ' + (sv.round + 1)}</small></button>` : ''}<button class="btn ${sv ? '' : 'primary'}" id="go">${sv ? 'New game' : 'Sit down at the table'}</button><button class="btn" id="rl">How to play</button><button class="btn" id="ac">Achievements</button></div></div>`, 'cover');
  const sel = () => b.querySelectorAll('.mode').forEach(m => m.classList.toggle('sel', m.dataset.m === mode));
  b.querySelectorAll('.mode').forEach(m => { m.onclick = () => { mode = m.dataset.m; sel(); }; m.onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); mode = m.dataset.m; sel(); } }; });
  b.querySelectorAll('.trader').forEach(t => t.onclick = () => {
    const open = t.classList.contains('sel'); b.querySelectorAll('.trader').forEach(x => x.classList.remove('sel'));
    if (open){ $('#tinfo').innerHTML = ''; return; }
    t.classList.add('sel'); const x = people[+t.dataset.t];
    $('#tinfo').innerHTML = `<div class="tinfo"><h3>${esc(x.name)}</h3>${x.info}<div class="src">Source: Anne Goldgar, "Tulipmania: the overblown crisis", <i>History Today</i>, and <i>Tulipmania</i> (2007).</div></div>`;
  });
  sel(); $('#go').onclick = () => { SET.mode = mode; saveSet(); closeModal(); start(mode); }; $('#rl').onclick = showRules; $('#ac').onclick = showAchievements;
  if (sv) $('#cont').onclick = () => { closeModal(); start(sv.mode, sv); };
}
let runId = 0;
const SAVE_KEY = 'tulip7.save.v1';
async function start(mode, snap){
  const my = ++runId;
  ui = freshUI(); $('#log').innerHTML = '';
  const players = [{name:'You', short:'You', human:true, style:'balanced', agent:Human}, ...RIVALS.map(r => ({...r, agent:Bot}))];
  G = new T7.Game({mode, players, snap, emit: async (t, d) => { if (my !== runId) throw 'stale'; await onEvent(t, d); if (my !== runId) throw 'stale'; },
    onSave: s => { if (my === runId) try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch(e){} }});
  window.G = G;
  buildSeats(); render(); say(snap ? 'Welcome back. Your seat is still warm.' : 'Sit down. The wine is poured.');
  if (snap) log('Game resumed from the start of the evening.');
  track(snap ? 'tulip_resume' : 'tulip_game_start', {mode});
  try { await G.run(); } catch(e){ if (e !== 'stale') { console.error(e); } }
}
showStart();
