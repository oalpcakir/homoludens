// ================= Retourvloot — guided first ship & analytics =================
function track(name, props) { try { if (window.posthog && window.posthog.capture) window.posthog.capture(name, Object.assign({ game: 'retourvloot', year: S ? yearOf(S.t) : null }, props || {})); } catch (e) {} }

// cardOf(id, tab): the card holding #id, opening its tab in the side drawer first when it lives there.
const cardOf = (id, tab) => { if (tab && typeof showTab === 'function') showTab(tab); const el = document.getElementById(id); return el ? el.closest('.card') || el : null; };
const TUT = [
  { id: 'equip', el: () => cardOf('h-equip', 'fleet'), title: 'Equip your first ship', wait: 'equip',
    text: () => `Europe makes little that Asia wants to buy, so every ship carries silver to pay for cargo. Leave the silver at ${money(S.silver)} and press <b>Equip a ship</b>.` },
  { id: 'season', el: () => document.querySelector('.clock'), title: 'Ships sail in seasons',
    text: () => { const nw = nextWindow(S); return `Your ship now waits at Texel. It leaves with the next fleet${nw ? `, the <b>${nw.name} fleet</b>, in ${nw.days} days` : ''}. The voyage to Batavia takes 8 to 11 months.`; } },
  { id: 'letter', el: () => cardOf('h-letter', 'asia'), title: 'Write to Batavia', wait: 'letter',
    text: () => 'Your orders sail with the ship and take effect only when it arrives. Tell Batavia what to buy first. In its early years the Company went for <b>spices</b>.' },
  { id: 'auto', el: () => { showTab('fleet'); return document.getElementById('auto').closest('.row'); }, title: 'Standing orders', wait: 'auto',
    text: () => 'You do not have to equip every ship by hand. Set <b>2 ships each season</b> and the chamber will send them for you.' },
  { id: 'speed', el: () => document.querySelector('.speed'), title: 'Let time pass', wait: 'speed',
    text: () => 'Press <b>3×</b> or <b>10×</b>. Follow your ship on the chart; click it for details. Your first letter from Batavia, and your first cargo, will come home in about two years.' },
];
const TUT_CTX = [
  { id: 'sailed', when: () => S.stats.voyages > 0, el: () => cardOf('h-map'), title: 'Your ship has sailed',
    text: () => 'The chart shows where Amsterdam <i>presumes</i> your ships are, going by the schedule: blue outbound, amber homebound. The little sealed letter is your instructions on their way. If a ship sinks, you will not know until Batavia writes.' },
  { id: 'report', when: () => !!S.report, el: () => cardOf('h-report', 'asia'), title: 'Your first letter from Batavia',
    text: () => `It was written months ago. Watch two lines: <b>silver on hand</b> tells you whether to send more or less silver; <b>goods waiting for ships</b> tells you whether to send more ships.` },
  { id: 'cargo', when: () => GOOD_KEYS.some(g => S.wh[g] > 0), el: () => cardOf('h-auction', 'market'), title: 'Cargo in the warehouse',
    text: () => 'Goods are sold at auction on 1 April and 1 October. The sliders set how much you put up for sale. Sell everything at once and the price collapses; Europe only buys so much.' },
  { id: 'dividend', when: () => S.t >= tOf(1610, 3, 1), el: () => cardOf('h-share', 'shares'), title: 'Shareholders want their money',
    text: () => 'From May 1610 you pay a dividend every year. Shareholders expect about 10% at first, and whatever you paid lately after that. Pay more than you earn and you will be paying it with borrowed money.' },
  { id: 'aims', when: () => S.t >= tOf(1619, 1, 1), el: () => cardOf('h-aims', 'aims'), title: 'The Seventeen’s aims',
    text: () => 'The directors want monopolies on the fine spices. Each one raises your prices. Each one was also won by force, and its cost goes in the other ledger.' },
];
let coachEl = null, coachStep = null, coachPrevSpeed = 0;
function tutActive() { return S.tut && !S.tut.done; }
function showCoach(step, n, total, ctx) {
  hideCoach();
  const el = step.el(); if (!el) return;
  coachStep = step; coachEl = el;
  el.classList.add('coach-on');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  let sp = document.getElementById('coach-spot'); if (!sp) { sp = document.createElement('div'); sp.id = 'coach-spot'; sp.className = 'coach-spot'; document.body.appendChild(sp); }
  sp.hidden = false;
  const b = $('coach');
  b.innerHTML = `<div class="coach-n">${ctx ? 'Tip' : `Step ${n} of ${total}`}</div><h4>${step.title}</h4><p>${step.text()}</p>
    <div class="coach-act">${ctx ? '' : '<button type="button" class="linkbtn" id="coach-skip">Skip the guide</button>'}${step.wait ? '' : `<button type="button" class="btn small" id="coach-next">${ctx ? 'Got it' : 'Next'}</button>`}</div>`;
  b.hidden = false;
  const nx = $('coach-next'); if (nx) nx.addEventListener('click', () => ctx ? endCtx() : tutNext());
  const sk = $('coach-skip'); if (sk) sk.addEventListener('click', () => { track('tutorial_skip', { step: step.id }); S.tut.done = true; hideCoach(); });
  setTimeout(positionCoach, 350);
}
function hideCoach() { if (coachEl) coachEl.classList.remove('coach-on'); coachEl = null; coachStep = null; const b = $('coach'); if (b) b.hidden = true; const sp = document.getElementById('coach-spot'); if (sp) sp.hidden = true; }
function positionCoach() {
  if (!coachEl) return;
  const b = $('coach'), r = coachEl.getBoundingClientRect(), bw = b.offsetWidth, bh = b.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  // the dimmed backdrop with a hole over the highlighted card (a box-shadow on the card itself would be clipped by the scrolling drawer)
  const sp = document.getElementById('coach-spot'); if (sp) { sp.style.left = (r.left - 4) + 'px'; sp.style.top = (r.top - 4) + 'px'; sp.style.width = (r.width + 8) + 'px'; sp.style.height = (r.height + 8) + 'px'; }
  let top, left;
  if (r.right + 16 + bw < vw) { left = r.right + 16; top = r.top; }
  else if (r.left - 16 - bw > 0) { left = r.left - 16 - bw; top = r.top; }
  else { left = r.left; top = r.bottom + 12 + bh < vh ? r.bottom + 12 : r.top - bh - 12; }
  b.style.left = Math.max(12, Math.min(vw - bw - 12, left)) + 'px';
  b.style.top = Math.max(12, Math.min(vh - bh - 12, top)) + 'px';
}
function tutStart() { if (!tutActive()) return; S.speed = 0; showCoach(TUT[S.tut.i], S.tut.i + 1, TUT.length); track('tutorial_step', { step: TUT[S.tut.i].id }); }
function tutNext() {
  S.tut.i++;
  if (S.tut.i >= TUT.length) { S.tut.done = true; S.tut.ctxOn = true; hideCoach(); track('tutorial_done'); return; }
  showCoach(TUT[S.tut.i], S.tut.i + 1, TUT.length); track('tutorial_step', { step: TUT[S.tut.i].id });
}
function tutHook(kind) { if (tutActive() && coachStep && coachStep.wait === kind) setTimeout(tutNext, kind === 'speed' ? 50 : 250); }
function endCtx() { hideCoach(); S.speed = coachPrevSpeed || resumeSpeed; render(); }
function tutCheck() {
  if (!S.tut || !S.tut.ctxOn || modalOpen || coachStep) return;
  for (const c of TUT_CTX) {
    if (S.tut.seen[c.id] || !c.when()) continue;
    S.tut.seen[c.id] = true;
    coachPrevSpeed = S.speed; S.speed = 0;
    showCoach(c, 0, 0, true); track('tip', { tip: c.id });
    return;
  }
}
function showCredits() {
  const was = S.speed; pauseForModal();
  const rows = Object.entries(EVENT_IMAGES).map(([id, im]) => `<li><a href="${im.page}" target="_blank" rel="noopener">${esc(im.title)}</a>, ${esc(im.maker)}, ${esc(im.date)}. Rijksmuseum ${esc(im.obj)}.</li>`).join('');
  showSheet(`<h3 id="m-title">Sources</h3><div class="body">
    <p>Retourvloot is a game, not a textbook. Prices, costs and quantities are simplified so the economy can be played. Dates, people, events and the human costs in the other ledger follow the historical record.</p>
    <p>Main works behind it: Femme Gaastra, <i>The Dutch East India Company</i>; J. R. Bruijn, F. S. Gaastra and I. Schöffer, <i>Dutch-Asiatic Shipping</i>; Jan de Vries and Ad van der Woude, <i>The First Modern Economy</i>; Om Prakash on the Asian trade; Markus Vink on slavery in the Indian Ocean; Chris Nierstrasz on the Company's decline.</p>
    <p>The end-of-game comparison draws only figures that can be cited: the VOC's average dividend of about 18% a year on its original capital, and the 162.5% paid out in 1610–12, mostly in spices (Gaastra, <i>The Dutch East India Company</i>, 2003; De Vries and Van der Woude, <i>The First Modern Economy</i>, 1997); no dividend after 1782 (Gaastra; Bryan Taylor, "The First and the Greatest", Global Financial Data, 2013); losses of up to ƒ43 million in the war of 1780–84, after which loans brought the Company's net assets to zero (De Vries and Van der Woude, pp. 454–455); and a debt at the end usually put at roughly ƒ100–120 million, an estimate that varies with what is counted.</p>
    <p>The tulip card of February 1637 follows Anne Goldgar, <i>Tulipmania: Money, Honor, and Knowledge in the Dutch Golden Age</i> (2007). The chart's coastlines come from Natural Earth (public domain).</p>
    <p>All images come from the Rijksmuseum, Amsterdam, and are in the public domain (CC0):</p><ul class="credits">${rows}</ul></div>
    <div class="actions"><button type="button" class="btn" id="m-go">Close</button></div>`);
  $('m-go').addEventListener('click', () => { closeSheet(); S.speed = was; render(); });
}
