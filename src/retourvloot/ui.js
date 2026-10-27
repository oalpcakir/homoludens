// ================= Retourvloot — interface =================
let S;
const $ = id => document.getElementById(id);
const SAVE_KEY = 'retourvloot.v1';
let resumeSpeed = 5;
let modalOpen = false;

function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
function load() { try { const r = localStorage.getItem(SAVE_KEY); if (r) { const s = JSON.parse(r); if (s && s.v === 1) return s; } } catch (e) {} return null; }

function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- side drawer tabs ----------
let curTab = 'fleet';
function showTab(name) {
  if (!document.querySelector(`.pane[data-pane="${name}"]`)) return;
  curTab = name;
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.pane').forEach(p => { p.hidden = p.dataset.pane !== name; });
  if (name === 'asia' && S && S.report) S.reportSeen = S.report.date;
  sizeCanvases();
  if (S) renderTabDots();
}
function renderTabDots() {
  const dots = {
    fleet: !S.ships.length && !S.auto.n && !S.flags.nationalised ? '' : null,
    market: GOOD_KEYS.some(g => S.wh[g] >= 1) ? '' : null,
    asia: !S.letterSealed ? '' : S.report && S.reportSeen !== S.report.date ? '' : null,
    shares: S.discontent >= 50 ? 'warn' : null,
  };
  document.querySelectorAll('.tabs [data-tab]').forEach(b => {
    const k = b.dataset.tab, want = dots[k] != null && curTab !== k ? dots[k] : null;
    let d = b.querySelector('.dot');
    if (want == null) { if (d) d.remove(); return; }
    if (!d) { d = document.createElement('span'); d.className = 'dot'; d.setAttribute('aria-hidden', 'true'); b.appendChild(d); }
    d.className = 'dot' + (want ? ' ' + want : '');
  });
}

// ---------- static UI setup ----------
function buildStatic() {
  const wh = $('wh'); wh.innerHTML = '';
  for (const g of GOOD_KEYS) {
    const row = document.createElement('div'); row.className = 'good'; row.id = 'row-' + g;
    row.innerHTML = `<img class="gico" src="${'img/rv_good_' + g + '.webp'}" alt="" onerror="this.style.visibility='hidden'">
      <span class="gn">${GOODS[g].name}<small>${GOODS[g].sub}</small></span><span class="gs num" id="st-${g}"></span>
      <div class="gctl"><input type="range" min="0" max="100" step="5" id="rel-${g}" aria-label="Share of ${GOODS[g].name} to sell"><output id="relo-${g}"></output></div>
      <span class="gp" id="pr-${g}"></span>`;
    wh.appendChild(row);
    row.querySelector('input').addEventListener('input', e => { S.release[g] = +e.target.value; render(); });
  }
  const seg = (el, name, opts) => {
    el.innerHTML = Object.entries(opts).map(([k, v]) => `<label><input type="radio" name="${name}" value="${k}" id="${name}-${k}"><span>${v}</span></label>`).join('');
    el.addEventListener('change', e => { S.letter = { ...S.letter, [name]: e.target.value, issued: S.t }; S.letterSealed = false; render(); tutHook('letter'); });
  };
  seg($('f-focus'), 'focus', Object.fromEntries(Object.entries(FOCUS).map(([k, v]) => [k, v.label])));
  seg($('f-wages'), 'wages', { low: 'Low wages', high: 'Higher wages' });
  seg($('f-exp'), 'expansion', EXPANSION);
  $('f-found').addEventListener('change', e => { S.letter = { ...S.letter, found: e.target.value, issued: S.t }; S.letterSealed = false; render(); tutHook('letter'); });

  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('keybtn').addEventListener('click', () => { const k = $('mapkey'), on = k.hidden; k.hidden = !on; $('keybtn').setAttribute('aria-expanded', String(on)); if (on) closePop(); });

  document.querySelectorAll('.speed button').forEach(b => b.addEventListener('click', () => { if (modalOpen || S.ended) return; if (coachStep && !coachStep.wait && !tutActive()) endCtx(); S.speed = +b.dataset.speed; if (S.speed) resumeSpeed = S.speed;
    // Starting time before the guide asks for it ends the guide: its steps describe a paused desk.
    if (S.speed && tutActive() && coachStep && coachStep.wait !== 'speed') { track('tutorial_skip', { step: coachStep.id, by: 'speed' }); S.tut.i = TUT.length - 1; tutNext(); }
    render(); if (S.speed) tutHook('speed'); }));
  $('silver').addEventListener('input', e => { S.silver = +e.target.value; render(); });
  $('equip').addEventListener('click', () => { if (equipShip(S, S.silver, false)) { log(S, `The ${S.ships[S.ships.length - 1].name} is equipped with ${money(S.silver)} in silver.`, 'ship'); if (S.shipSeq === 1) track('first_ship'); tutHook('equip'); } render(); });
  $('auto').addEventListener('change', e => { S.auto.n = +e.target.value; render(); tutHook('auto'); });
  $('autoborrow').addEventListener('change', e => { S.auto.borrow = e.target.checked; });
  $('div').addEventListener('input', e => { S.divRate = +e.target.value; render(); });
  $('borrow').addEventListener('click', () => { S.debt += 1e6; S.cash += 1e6; log(S, 'Borrowed ƒ1M on short-term notes.', 'money'); render(); });
  $('repay').addEventListener('click', () => { const r = Math.min(1e6, S.debt, S.cash); if (r > 0) { S.debt -= r; S.cash -= r; log(S, `Repaid ${money(r)} of debt.`, 'money'); } render(); });
  $('burn').addEventListener('click', () => { const q = Math.floor(S.wh.fine * 0.25); if (q > 0) { S.wh.fine -= q; log(S, `${num(q)} t of fine spices burned in the warehouse to hold up the price.`, 'loss'); } render(); });
  $('audit').addEventListener('click', () => { if (S.t - S.auditLast < 365 * 5) return; showAudit(audit(S)); });
  $('fleet').addEventListener('click', e => { const li = e.target.closest('[data-ship]'); if (li) openPopFor(li.dataset.ship); });
  $('fleet').addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const li = e.target.closest('[data-ship]'); if (li) { e.preventDefault(); openPopFor(li.dataset.ship); } });
  let armed = false;
  $('newgame').addEventListener('click', e => {
    if (!armed) { armed = true; e.target.textContent = 'Click again to start over'; setTimeout(() => { armed = false; e.target.textContent = 'New game'; }, 3000); return; }
    S = newState(); hideCoach(); closePop(); armed = false; e.target.textContent = 'New game'; save(); syncInputs(); render(); track('game_start', { restart: true }); openQueued();
  });
  buildMap();
  new ResizeObserver(() => { fitMap(); sizeCanvases(); }).observe($('mapwrap'));
  new ResizeObserver(() => sizeCanvases()).observe(document.querySelector('.panes'));
  sizeCanvases();
}

function syncInputs() {
  const y = yearOf(S.t);
  $('silver').max = maxSilver(y); $('silver').value = S.silver;
  $('auto').value = String(S.auto.n); $('autoborrow').checked = !!S.auto.borrow;
  $('div').value = S.divRate;
  for (const g of GOOD_KEYS) $('rel-' + g).value = S.release[g];
  for (const [n, v] of [['focus', S.letter.focus], ['wages', S.letter.wages], ['expansion', S.letter.expansion]]) { const r = $(n + '-' + v); if (r) r.checked = true; }
}

// ---------- rendering ----------
let foundKey = '';
function moodOf(d) { return d < 20 ? 'Content' : d < 50 ? 'Grumbling' : d < 75 ? 'Angry' : 'Pamphlets'; }
function render() {
  _S = S;
  const y = yearOf(S.t);
  $('date').textContent = fmtDate(S.t);
  const w = windowAt(S, S.t), nw = nextWindow(S);
  $('season').innerHTML = w ? `<b>${w} fleet</b> is sailing` : nw ? `Next sailing: <b>${nw.name}</b> in ${nw.days} days` : '';
  document.querySelectorAll('.speed button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.speed === S.speed)));

  // headline numbers
  $('s-cash').textContent = money(S.cash);
  const res = tradeResult(S.books);
  $('s-cash2').innerHTML = `this year <span class="${res < 0 ? 'neg' : 'pos'}">${res < 0 ? '' : '+'}${money(res)}</span>`;
  $('s-debt').textContent = money(S.debt); $('s-debt').className = 'num' + (S.debt > 0 ? ' neg' : '');
  $('s-debt2').textContent = S.debt > 0 ? `${money(S.debt * interestRate(S, y))} interest a year` : debtLine(S);
  const exp = expectation(S);
  $('s-div').textContent = y >= 1610 ? S.divRate + '%' : '—';
  $('s-div2').innerHTML = y >= 1610 ? `they expect ${Math.round(exp)}%${S.divRate < Math.round(exp) ? ' · <span class="neg">below</span>' : ''}` : 'dividends from May 1610';
  $('s-mood').textContent = moodOf(S.discontent);
  $('s-moodbar').querySelector('i').style.width = Math.max(3, S.discontent) + '%';
  $('s-moodbar').classList.toggle('bad', S.discontent >= 60);
  $('s-mood2').textContent = `shares at ${Math.round(S.share)}%`;

  // equip
  const cost = shipCost(y) + S.silver;
  $('silver').max = maxSilver(y);
  $('silver-out').textContent = money(S.silver);
  $('equip').textContent = S.flags.nationalised ? 'The committee equips ships now' : `Equip a ship · ${money(cost)}`;
  $('equip').disabled = S.cash < cost || !!S.flags.nationalised;
  $('equip-cap').textContent = `Each ship: ${shipCap(y)} t of cargo, ${CREW} men, hull and stores ${money(shipCost(y))}.`;
  const inH = S.ships.filter(s => s.state === 'harbour').length;
  $('harbour').textContent = inH ? `${inH} ship${inH > 1 ? 's' : ''} at Texel, ${w ? 'leaving with the ' + w + ' fleet' : 'waiting for the ' + (nw ? nw.name : '') + ' fleet'}.` : 'Ships leave only in the sailing seasons: Christmas, Easter' + (S.flags.kermis ? ' and Kermis.' : '.');

  // warehouse
  let est = 0;
  for (const g of GOOD_KEYS) {
    const row = $('row-' + g); const show = goodUnlocked(g, y) || S.wh[g] > 0;
    row.hidden = !show; if (!show) continue;
    $('st-' + g).textContent = num(S.wh[g]) + ' t';
    $('relo-' + g).textContent = S.release[g] + '%';
    const rel = Math.floor(S.wh[g] * S.release[g] / 100);
    const p = auctionPrice(S, g, Math.max(rel, 1), S.wh[g] - rel, y);
    const m = market(S, g, y);
    $('pr-' + g).innerHTML = `${S.wh[g] >= 1 ? `About <b>${money(p)}/t</b> · ` : ''}Europe wants ${num(m.d / 2)} t, the English bring ${num(m.eic / 2)} t`;
    est += rel * p;
    const inp = $('rel-' + g); if (document.activeElement !== inp) inp.value = S.release[g];
  }
  const na = nextAuction(S);
  $('next-auction').textContent = 'next ' + fmtDate(na);
  $('auction-est').textContent = est > 0 ? `If sold today: about ${money(est)}` : 'Nothing to sell yet.';
  $('burn').disabled = S.wh.fine < 4;
  $('burn').textContent = S.wh.fine >= 4 ? `Burn ${num(S.wh.fine * 0.25)} t of fine spice` : 'Burn surplus spice';
  $('silver-eff').innerHTML = silverEffect(y);

  // shareholders
  $('div-out').textContent = `${S.divRate}% · ${money(NOMINAL * S.divRate / 100)}`;
  const dinp = $('div'); if (document.activeElement !== dinp) dinp.value = S.divRate;
  $('disc').querySelector('i').style.width = S.discontent + '%';
  $('disc').classList.toggle('bad', S.discontent >= 60);
  $('disc-txt').textContent = moodOf(S.discontent);
  $('s-share').textContent = `${Math.round(S.share)}% · ${money(NOMINAL * S.share / 100)}`;
  const auditReady = S.t - S.auditLast >= 365 * 5;
  $('audit').disabled = !auditReady;
  $('audit').textContent = auditReady ? 'Commission an audit · ƒ60k' : `Audit again in ${Math.ceil((S.auditLast + 365 * 5 - S.t) / 365)} yr`;
  $('repay').disabled = S.debt <= 0 || S.cash <= 0;
  const pay = NOMINAL * S.divRate / 100;
  const avgRes = S.bookHist.slice(-5).reduce((a, b) => a + b.res, 0) / Math.max(1, S.bookHist.slice(-5).length);
  $('div-eff').innerHTML = y < 1610 ? 'The first dividend can be paid in May 1610.' :
    `Shareholders expect about <b>${Math.round(exp)}%</b>. ${S.divRate < exp ? 'Paying less will raise discontent.' : 'This keeps them content.'} ` +
    (S.bookHist.length ? `Your trading result averaged <b>${money(avgRes)}</b> a year over the last five years; this dividend costs <b>${money(pay)}</b>.` : '');
  drawSpark();
  renderBooks(y);
  renderNotes(y);
  renderAims(y);

  renderFleet();
  renderLog();
  renderReport();
  renderLetter(y);
  renderOther();
  renderTabDots();
  renderMapStatic(y);
  refreshPop();
}
function nextAuction(S) { for (let i = 1; i < 370; i++) { const md = mdOf(S.t + i); if (md === 401 || md === 1001) return S.t + i; } return S.t; }

function viewOf(sh) {
  const t = S.t;
  if (sh.state === 'harbour') return { kind: 'harbour', cls: '', text: 'At Texel' };
  if (sh.revealed) return { kind: 'lost', cls: 'lost', text: sh.state === 'lostOut' ? 'Never reached Batavia' : 'Lost on the way home' };
  if (sh.state === 'done') return { kind: 'done', cls: 'home', text: 'Home at Texel' };
  if (sh.state === 'home' || sh.state === 'lostHome') {
    const p = clamp(1 - (t - sh.dep2) / sh.exp2, 0.02, 1);
    return { kind: 'home', cls: 'home', p, text: p <= 0.02 ? 'Overdue from Batavia' : 'Homebound' };
  }
  const p = (t - sh.dep) / sh.exp;
  if (p < 1) return { kind: 'out', cls: 'out', p, text: p < 0.55 ? 'Outbound, presumed in the Atlantic' : 'Outbound, presumed past the Cape' };
  const inReport = S.report && S.report.inAsia && S.report.inAsia.includes(sh.id);
  return { kind: 'asia', cls: 'asia', text: inReport ? `In Asia (reported ${fmtMon(S.report.date)})` : 'Presumed in Asia' };
}
let fleetKey = '';
function renderFleet() {
  const rows = S.ships.map(sh => ({ sh, v: viewOf(sh) }));
  const order = { harbour: 0, out: 1, asia: 2, home: 3, done: 4, lost: 5 };
  rows.sort((a, b) => order[a.v.kind] - order[b.v.kind] || a.sh.id - b.sh.id);
  const atSea = rows.filter(r => r.v.kind === 'out' || r.v.kind === 'home').length;
  $('fleet-count').textContent = rows.length ? `${atSea} at sea` : '';
  const html = rows.length ? rows.map(({ sh, v }) => {
    const due = v.kind === 'out' ? `due in Batavia ${fmtMon(sh.dep + sh.exp)}` : v.kind === 'home' ? `due at Texel ${fmtMon(sh.dep2 + sh.exp2)}` : '';
    return `<li data-ship="ship:${sh.id}" tabindex="0"><span class="fi ${v.kind === 'lost' ? 'lost' : v.kind}"></span><span class="fn">${esc(sh.name)}</span><span class="fv num">${money(sh.silver)}</span><span class="fs">${v.text}${due ? ' · ' + due : ''}</span></li>`;
  }).join('') : `<li class="empty">No ships yet. Equip one and it will sail with the next fleet.</li>`;
  if (html !== fleetKey) { fleetKey = html; $('fleet').innerHTML = html; }
}
let lastLogKey = '';
function renderLog() {
  const key = S.log.length + ':' + (S.log[0] ? S.log[0].t + S.log[0].text : '');
  if (key === lastLogKey) return; lastLogKey = key;
  $('log').innerHTML = S.log.length ? S.log.slice(0, 40).map(l => `<li class="${l.kind}"><time>${fmtDate(l.t)}</time>${esc(l.text)}</li>`).join('') : `<li>The chamber awaits its first ship.</li>`;
}
function renderReport() {
  const R = S.report, el = $('report');
  if (!R) { el.innerHTML = `<p class="empty">No ship has come back from Asia yet. The first report will arrive with the first return ship, more than a year after it sails.</p>`; return; }
  const age = Math.round((S.t - R.date) / 30.4);
  const goods = GOOD_KEYS.filter(g => R.stock[g] > 0.5).map(g => `${num(R.stock[g])} t ${GOODS[g].name.toLowerCase()}`).join(', ') || 'nothing';
  const L = R.lastYr;
  const letter = R.letterIssued >= 0 && R.letterArrived ? `Your letter of ${fmtMon(R.letterIssued)} arrived in ${fmtMon(R.letterArrived)}.` : 'None of your letters had arrived.';
  el.innerHTML = `<div class="dated">Written in Batavia <b>${fmtDate(R.date)}</b>. It reached you ${age} month${age === 1 ? '' : 's'} later. ${letter}</div>
    <dl class="kv">
      <dt>Silver on hand in Batavia</dt><dd class="${R.capital < 0 ? 'neg' : ''}">${money(R.capital)}</dd>
      <dt>Goods waiting for ships</dt><dd>${goods.length > 30 ? '' : goods}</dd>
      ${goods.length > 30 ? `<dt style="grid-column:1/-1;text-align:right;color:var(--ink)">${goods}</dt>` : ''}
      <dt>Men in service</dt><dd class="${R.personnel < R.need ? 'neg' : ''}">${num(R.personnel)} of ${num(R.need)} needed</dd>
      <dt>Garrisons and posts cost</dt><dd>${money(R.upkeep)} a year</dd>
      <dt>Lost to private trade</dt><dd class="neg">about ${Math.round(R.leak * 100)}%</dd>
      ${L ? `<dt>Trade within Asia, ${L.year}</dt><dd class="${L.intra < 0 ? 'neg' : 'pos'}">${money(L.intra)}</dd>
      ${L.japan ? `<dt>Japanese silver &amp; copper</dt><dd>${money(L.japan)}</dd>` : ''}
      ${L.land ? `<dt>Taxes from conquered land</dt><dd>${money(L.land)}</dd>` : ''}
      <dt>Deaths among servants, ${L.year}</dt><dd class="neg">${num(L.deaths)}</dd>` : ''}
    </dl>
    <p class="note" style="margin-top:8px">Posts: ${R.posts.map(id => POSTS[id].name).join(', ') || 'none'}. Buying: ${FOCUS[R.focus].label.toLowerCase()}.</p>
    ${R.acts.length ? `<ul class="acts">${R.acts.slice().reverse().map(a => `<li><b>${fmtMon(a.t)}</b>${esc(a.text)}</li>`).join('')}</ul>` : ''}`;
}
function renderLetter(y) {
  const f = foundablePosts(S, y).filter(id => !(S.report && S.report.posts.includes(id)));
  const key = f.join(',') + '|' + S.letter.found;
  if (key !== foundKey) {
    foundKey = key;
    const opts = ['<option value="">No new post</option>'].concat(f.map(id => `<option value="${id}">${POSTS[id].name} · ${money(POSTS[id].cost)}${POSTS[id].war ? ' · war' : ''}</option>`));
    $('f-found').innerHTML = opts.join('');
    $('f-found').value = f.includes(S.letter.found) ? S.letter.found : '';
  }
  // a post that was lost or closed while it sat in the letter must not sail with the next ship
  if (S.letter.found && !foundablePosts(S, y).includes(S.letter.found)) S.letter = { ...S.letter, found: '' };
  const P = POSTS[S.letter.found];
  $('found-desc').innerHTML = P ? `${P.desc} Costs Batavia <b>${money(P.cost)}</b> once, then <b>${money(P.upkeep)}</b> a year and <b>${num(P.garrison)}</b> men.${P.good ? ` Supplies up to ${num(P.cap)} t of ${GOODS[P.good].name.toLowerCase()} a year.` : P.intra ? ' Makes trade within Asia more profitable.' : P.silver ? ' Sends Japanese silver to Batavia every year.' : ''}` : f.length ? `${f.length} place${f.length > 1 ? 's' : ''} open to you: ${f.map(id => POSTS[id].name).join(', ')}. You can also order one from the chart.` : 'Nothing new is open to you in this period.';
  for (const [n, v] of [['focus', S.letter.focus], ['wages', S.letter.wages], ['expansion', S.letter.expansion]]) { const r = $(n + '-' + v); if (r && !r.checked) r.checked = true; }
  const L = S.letter, W = FOCUS[L.focus].w;
  const full = GOOD_KEYS.filter(g => W[g] >= 1 && goodUnlocked(g, y)).map(g => GOODS[g].name.toLowerCase());
  const part = GOOD_KEYS.filter(g => W[g] < 1 && goodUnlocked(g, y)).map(g => `${GOODS[g].name.toLowerCase()} ${Math.round(W[g] * 100)}%`);
  $('eff-focus').innerHTML = `Batavia buys <b>${full.join(', ')}</b> as far as the posts can supply${part.length ? `; ${part.join(', ')} of capacity` : ''}. Whatever is bought first fills the return ships.`;
  const lrLow = leakRate({ ...S, asia: { ...S.asia, wages: 'low' } }, y), lrHigh = leakRate({ ...S, asia: { ...S.asia, wages: 'high' } }, y);
  $('eff-wages').innerHTML = `Low: upkeep as is, servants skim about <b>${Math.round(lrLow * 100)}%</b> through private trade. Higher: upkeep <b>+30%</b>, skimming falls to about <b>${Math.round(lrHigh * 100)}%</b>. Skimming grows with every post and every decade.`;
  const au = autonomy(S, y);
  const pexp = k => Math.round(au * { restrain: .12, permit: .35, encourage: .7 }[k] * 100);
  $('eff-exp').innerHTML = `Chance each year that the Governor-General opens or seizes a post on his own: <b>${pexp(L.expansion)}%</b> (restrain ${pexp('restrain')}%, encourage ${pexp('encourage')}%). Every post adds upkeep for good. ${au >= 0.6 ? '<b>Coen</b> rarely waits for orders.' : ''}`;
  const aboard = S.ships.filter(sh => sh.state === 'out' && sh.letter && sh.letter.issued === S.letter.issued).length;
  const ls = $('lstatus');
  const nw = nextWindow(S);
  if (!S.letterSealed) { ls.className = 'lstatus dirty'; ls.textContent = `Unsent. These instructions sail with the next ship${nw ? `, ${nw.days ? 'in ' + nw.days + ' days' : 'this season'}` : ''}. Expect them in Batavia 8 to 11 months after that.`; }
  else { ls.className = 'lstatus'; ls.textContent = aboard ? `Sealed. Copies are aboard ${aboard} ship${aboard > 1 ? 's' : ''} at sea; the first to arrive delivers them.` : 'Sealed and sent. Change anything to write a new letter.'; }
}
let otherKey = '';
function renderOther() {
  $('o-sent').textContent = num(S.humans.sent); $('o-sea').textContent = num(S.humans.diedSea);
  $('o-asia').textContent = num(S.humans.diedAsia); $('o-home').textContent = num(S.humans.returned);
  const key = S.other.length + ':' + Math.floor(S.enslavedBanda / 10);
  if (key === otherKey) return; otherKey = key;
  const lines = S.other.map(o => `<li><b>${esc(o.place)}</b>${esc(o.text)}</li>`);
  if (S.enslavedBanda >= 1) lines.push(`<li><b>Banda nutmeg gardens</b>About ${num(S.enslavedBanda)} enslaved people brought in so far to replace those who died, about 200 a year.</li>`);
  $('o-lines').innerHTML = lines.join('') || `<li class="note" style="border:0">Deaths among the Company's own men are counted above. Other costs of the trade will be entered here as they happen.</li>`;
}

function silverEffect(y) {
  const R = S.report;
  let t = `Arrives in Batavia worth <b>${money(S.silver * 1.25)}</b>: silver buys about 25% more in Asia.`;
  if (R && R.lastYr) {
    const need = R.upkeep + R.lastYr.buy;
    t += ` Batavia spent about <b>${money(need)}</b> last year on goods and garrisons and had <b>${money(R.capital)}</b> left.`;
  }
  return t;
}
function bookRow(label, a, b, cls = '') { return `<tr class="${cls}"><td>${label}</td><td class="r num">${a == null ? '' : money(a)}</td><td class="r num">${b == null ? '' : money(b)}</td></tr>`; }
let booksKey = '';
function renderBooks(y) {
  const B = S.books, L = S.booksLast;
  const key = JSON.stringify(B) + (L ? L.y : '');
  if (key === booksKey) return; booksKey = key;
  $('bk-y1').textContent = B.y + ' so far'; $('bk-y0').textContent = L ? String(L.y) : '';
  const v = (b, f) => b ? f(b) : null;
  let h = bookRow('<b>Auction sales</b>', salesTotal(B), v(L, salesTotal));
  for (const g of GOOD_KEYS) if (B.sales[g] || (L && L.sales[g])) h += bookRow(GOODS[g].name, B.sales[g], v(L, b => b.sales[g]), 'subrow');
  h += bookRow(`Hulls, crews &amp; stores (${B.shipsOut}${L ? ' · ' + L.shipsOut : ''} ships)`, -B.hulls, v(L, b => -b.hulls));
  h += bookRow('Silver sent to Asia', -B.silver, v(L, b => -b.silver));
  h += bookRow('Interest on debt', -B.interest, v(L, b => -b.interest));
  if (B.other || (L && L.other)) h += bookRow('Other', -B.other, v(L, b => -b.other));
  h += bookRow('Trading result', tradeResult(B), v(L, tradeResult), 'tot');
  h += bookRow('Dividends paid', -B.div, v(L, b => -b.div));
  if (B.borrowed || (L && L.borrowed)) h += bookRow('Borrowed', B.borrowed, v(L, b => b.borrowed));
  $('books').innerHTML = h;
  drawBars();
  const last = S.bookHist.slice(-5); const shipsIn = last.reduce((a, b) => a + b.shipsIn, 0), shipsOut = last.reduce((a, b) => a + b.shipsOut, 0);
  if (shipsIn && shipsOut) {
    const perIn = last.reduce((a, b) => a + b.sales, 0) / shipsIn, perOut = last.reduce((a, b) => a + b.cost, 0) / shipsOut;
    $('perShip').innerHTML = `Last five years: each ship sent cost <b>${money(perOut)}</b> with its silver; each ship home brought goods that sold for <b>${money(perIn)}</b>.`;
  } else $('perShip').textContent = 'Once ships start coming home, the cost and return per ship will show here.';
}
function drawBars() {
  const c = $('bars'), x = c.getContext('2d'), W = c.width, H = c.height, dpr = window.devicePixelRatio || 1;
  x.clearRect(0, 0, W, H);
  const h = S.bookHist.slice(-30);
  if (!h.length) { $('bars-cap').textContent = 'Each year\'s trading result will be charted here.'; return; }
  const mx = Math.max(1, ...h.map(d => Math.abs(d.res)), ...h.map(d => d.div));
  const mid = H / 2, bw = W / 30;
  x.strokeStyle = cssVar('--rule'); x.lineWidth = 1; x.beginPath(); x.moveTo(0, mid); x.lineTo(W, mid); x.stroke();
  h.forEach((d, i) => {
    const bh = d.res / mx * (mid - 4);
    x.fillStyle = d.res >= 0 ? cssVar('--gain') : cssVar('--loss');
    x.fillRect(i * bw + bw * .15, bh >= 0 ? mid - bh : mid, bw * .7, Math.abs(bh));
    if (d.div) { x.fillStyle = cssVar('--delft'); const dy = mid - d.div / mx * (mid - 4); x.fillRect(i * bw + bw * .05, dy - dpr, bw * .9, 2 * dpr); }
  });
  $('bars-cap').textContent = `Trading result per year, ${h[0].y}–${h[h.length - 1].y} (largest ${money(mx)}): green a profit, red a loss. Blue marks: dividend paid.`;
}
function renderNotes(y) {
  const n = [], R = S.report;
  if (!S.ships.length && !S.auto.n && !S.stats.voyages) n.push(['', 'Start by equipping a ship, or set standing orders. Nothing earns money until ships sail, and the first cargo will not be home for about two years.']);
  if (!R && S.stats.voyages) n.push(['', 'Your first ships are on their way. Until one comes back you will know nothing about Asia; use the time to decide your instructions to Batavia.']);
  if (R) {
    const work = 1.5e6 + 0.25e6 * R.posts.length;
    if (R.capital > work * 1.3) n.push(['warn', `Batavia is sitting on ${money(R.capital)} in silver it cannot spend; idle silver leaks away at about 1% a month. Send less silver per ship, or order new posts so it can buy more.`]);
    else if (R.capital < 150000) n.push(['warn', `Batavia is short of silver (${money(R.capital)}). It cannot buy goods or pay its garrisons. Put more silver aboard each ship.`]);
    if (R.personnel < R.need * 0.85) n.push(['warn', `Garrisons are under strength: ${num(R.personnel)} men for ${num(R.need)} places, so the posts produce about ${Math.round(R.eff * 100)}%. Each ship leaves about 110 soldiers in Asia.`]);
    const waiting = GOOD_KEYS.reduce((a, g) => a + R.stock[g], 0);
    const capNext = S.ships.filter(s => s.state === 'out' || s.state === 'asia').reduce((a, s) => a + s.cap, 0);
    if (waiting > capNext * 1.5 && waiting > 300) n.push(['', `${num(waiting)} t of goods were waiting in Batavia, more than your ships in Asia can carry. More ships would bring them home.`]);
  }
  for (const g of GOOD_KEYS) {
    if (!S.lastPrice[g]) continue;
    const shipCostPerT = shipCost(y) / shipCap(y);
    const breakEven = GOODS[g].cost * 1.25 + shipCostPerT;
    if (S.lastPrice[g] < breakEven && S.wh[g] > 50) { n.push(['warn', `${GOODS[g].name} sold for ${money(S.lastPrice[g])}/t, below the roughly ${money(breakEven)}/t it costs to buy and ship. Sell less, or tell Batavia to buy something else.`]); break; }
  }
  const D = market(S, 'fine', y).d / 2;
  if (S.wh.fine > D * 1.2) n.push(['warn', `${num(S.wh.fine)} t of fine spices in the warehouse against European demand of about ${num(D)} t per auction. The overhang depresses the price; sell less or burn some.`]);
  if (y >= 1612 && S.bookHist.length >= 3) {
    const avg = S.bookHist.slice(-5).reduce((a, b) => a + b.res, 0) / S.bookHist.slice(-5).length;
    if (NOMINAL * S.divRate / 100 > avg && S.divRate > 0) n.push(['warn', `A ${S.divRate}% dividend (${money(NOMINAL * S.divRate / 100)}) is more than the Company has been earning (${money(avg)} a year). The difference is paid with borrowed money.`]);
  }
  if (!S.letterSealed) n.push(['', 'You have changed your instructions. They go with the next ship to leave.']);
  const open = foundablePosts(S, y).filter(id => !(R && R.posts.includes(id)));
  const nextAim = AIMS.find(a => !S.mono[a.id] && ((a.id === 'cinnamon' && open.includes('ceylon')) || (a.id === 'strait' && open.includes('malacca')) || (a.id === 'japan' && open.includes('japan'))));
  if (nextAim) n.push(['good', `Within reach: ${nextAim.name} (${nextAim.where}). ${nextAim.how}`]);
  const dt = debtText(S); if (dt) n.unshift(['warn', dt]);
  if (!n.length) n.push(['good', 'Nothing needs your attention. Let the fleets sail.']);
  const html = n.slice(0, 4).map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join('');
  if ($('notes').innerHTML !== html) $('notes').innerHTML = html;
}
function renderAims(y) {
  const sh = fineShare(S, y), lk = fineLeaks(S);
  $('fine-share').textContent = Math.round(sh * 100) + '%';
  $('fine-bar').style.width = Math.round(sh * 100) + '%';
  $('s-mono').textContent = `${AIMS.filter(a => S.mono[a.id] > 0).length} of ${AIMS.length} secured`;
  const r = [];
  if (lk.nutmeg) r.push(`nutmeg from Banda ${lk.nutmeg} t`); if (lk.cloves) r.push(`smuggled cloves ${lk.cloves} t`); if (lk.cinnamon) r.push(`Portuguese cinnamon ${lk.cinnamon} t`);
  $('fine-rivals').textContent = r.length ? `Rivals still sell, per year: ${r.join(', ')}.` : 'No one else sells fine spices in Europe. You set the price, as long as you hold back supply.';
  const html = AIMS.map(a => {
    const t = S.mono[a.id];
    const st = t === -1 ? '<span class="pill lost">Lost</span>' : t ? `<span class="pill done">Secured ${yearOf(t)}</span>` : '<span class="pill">Open</span>';
    return `<li><span class="nm">${a.name}<small>${a.where}</small></span>${st}<span class="hw">${t ? `Historically ${a.hist}.` : a.how + ` Historically ${a.hist}.`}</span></li>`;
  }).join('') + `<li><span class="nm">Pepper<small>Java, Sumatra, Malabar</small></span><span class="pill">Never</span><span class="hw">Grown too widely to control. The English kept buying it in Sumatra and Malabar.</span></li>`;
  if ($('aims').innerHTML !== html) $('aims').innerHTML = html;
}

// ---------- canvases (side drawer) ----------
function sizeCanvases() {
  const dpr = window.devicePixelRatio || 1;
  for (const c of [$('spark'), $('bars')]) {
    const r = c.getBoundingClientRect();
    if (!r.width) continue;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  if (S) { drawSpark(); drawBars(); }
}
function drawSpark() {
  const c = $('spark'), x = c.getContext('2d'), W = c.width, H = c.height, h = S.shareHist;
  x.clearRect(0, 0, W, H); if (h.length < 2) return;
  const max = Math.max(...h) * 1.08, min = Math.min(0, ...h);
  const px = i => i / (h.length - 1) * (W - 6) + 3, py = v => H - 3 - (v - min) / (max - min) * (H - 6);
  x.strokeStyle = cssVar('--rule'); x.lineWidth = 1; x.setLineDash([3, 3]);
  x.beginPath(); x.moveTo(0, py(100)); x.lineTo(W, py(100)); x.stroke(); x.setLineDash([]);
  x.beginPath(); h.forEach((v, i) => i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v)));
  x.strokeStyle = cssVar('--delft'); x.lineWidth = 1.6 * (window.devicePixelRatio || 1); x.stroke();
  x.lineTo(px(h.length - 1), H); x.lineTo(px(0), H); x.closePath(); x.fillStyle = cssVar('--delft-soft'); x.fill();
  x.fillStyle = cssVar('--brass'); x.beginPath(); x.arc(px(h.length - 1), py(h[h.length - 1]), 3 * (window.devicePixelRatio || 1), 0, 7); x.fill();
  $('share-range').textContent = `High ${Math.round(Math.max(...h))}%. The dashed line is face value (100%).`;
}

// ---------- the chart of the route east (SVG) ----------
// Equirectangular, same constants as mapdata.js. Everything is drawn in chart units (5 per degree).
const mx = lon => (lon - MAP_LON0) * MAP_K, my = lat => (MAP_LAT0 - lat) * MAP_K;
const G = ([lon, lat]) => [mx(lon), my(lat)];
const MAP_CORE = { x0: mx(-27), x1: mx(149), y0: my(61), y1: my(-46.5) };   // always in view
const MAP_ALL = { x0: 0, x1: mx(180), y0: 0, y1: my(-62) };              // the coastline data
const PORTS = { texel: [4.8, 53.0], cape: [18.4, -33.9], batavia: [106.8, -6.2] };
const ROUTE_A = [[4.8,53],[3,51.6],[0.5,50.6],[-5.5,49.2],[-11,44],[-17,33],[-23,18],[-27,6],[-30,-6],[-31,-18],[-26,-28],[-12,-35],[4,-37],[18.4,-34.8]];
const ROUTE_OLD = [[18.4,-34.8],[30,-35],[37,-28],[41,-20],[43,-12],[50,-7],[64,-4],[80,-4],[93,-5],[101,-7.7],[105.4,-6.4],[106.8,-6.2]];
const ROUTE_BROUWER = [[18.4,-34.8],[32,-39],[60,-41],[88,-40],[101,-33],[104.5,-20],[105.2,-9],[105.6,-6.5],[106.8,-6.2]];
// Homeward: out through the Sunda Strait, across the Indian Ocean to the Cape, by St Helena and Ascension, wide of the
// Azores and north about Scotland to Texel (the usual return in wartime, and common in peace).
const ROUTE_HOME = [[106.8,-6.2],[105.6,-6.2],[104.5,-7.5],[100,-12],[90,-18],[78,-24],[60,-31],[40,-35.6],[26,-35.8],[18.4,-34.5],[13,-29],[2,-21],[-5.7,-15.9],[-14.4,-7.9],[-22,4],[-29,20],[-31,34],[-24,47],[-14,56.5],[-4,59.8],[1.5,58.6],[4.3,55.5],[4.8,53.1]];
const MAP_LABEL = { bantam: ['end', -11, -9], priangan: ['start', 11, 18], ambon: ['start', 11, -6], banda: ['start', 11, 15], japan: ['end', -11, -6], coromandel: ['start', 11, 5], bengal: ['end', -11, -8], ceylon: ['end', -11, 14], malacca: ['end', -11, -6], mocha: ['end', -11, -6], canton: ['end', -11, -8], formosa: ['start', 11, 4], cape: ['start', 12, 18] };
const AIM_POST = { nutmeg: 'banda', cloves: 'ambon', cinnamon: 'ceylon', japan: 'japan', strait: 'malacca' };
const SVGNS = 'http://www.w3.org/2000/svg';

function polyD(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(''); }
function makeRoute(ll) {
  const pts = ll.map(G), len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len, total: len[len.length - 1], d: polyD(pts) };
}
const ROUTES = {};
function outRoute() { const k = S && S.flags.brouwer ? 'b' : 'o'; return ROUTES['out' + k] || (ROUTES['out' + k] = makeRoute(ROUTE_A.concat((k === 'b' ? ROUTE_BROUWER : ROUTE_OLD).slice(1)))); }
function homeRoute() { return ROUTES.home || (ROUTES.home = makeRoute(ROUTE_HOME)); }
// Point and heading at fraction f (0..1) along a route.
function along(r, f) {
  const d = clamp(f, 0, 1) * r.total;
  let i = 1; while (i < r.len.length - 1 && r.len[i] < d) i++;
  const a = r.pts[i - 1], b = r.pts[i], u = (d - r.len[i - 1]) / ((r.len[i] - r.len[i - 1]) || 1);
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, dx: b[0] - a[0], dy: b[1] - a[1] };
}
// Where Amsterdam presumes a ship is. t may be fractional (smooth motion between days).
// Returns null for ships that are not drawn at sea (in harbour, in Asia, home, or long lost).
function shipPos(sh, t) {
  if (sh.revealed) return null;
  if (sh.state === 'out' || sh.state === 'lostOut') {
    const f = (t - sh.dep) / sh.exp;
    return f < 1 ? { ...along(outRoute(), f), dir: 'out', f } : null;
  }
  if (sh.state === 'home' || sh.state === 'lostHome') {
    const f = clamp((t - sh.dep2) / sh.exp2, 0, 0.995);
    return { ...along(homeRoute(), f), dir: 'home', f };
  }
  return null;
}
// Letters at sea, as Amsterdam can know them: your newest instructions ride with the leading outbound ship that carries
// them, until that ship is due in Batavia; Batavia's newest letter rides home with the leading homebound ship.
function lettersAtSea(t) {
  const L = [];
  let best = null;
  for (const sh of S.ships) {
    if (!sh.letter || (sh.state !== 'out' && sh.state !== 'lostOut') || sh.revealed) continue;
    const f = (t - sh.dep) / sh.exp; if (f >= 1) continue;
    if (!best || sh.letter.issued > best.sh.letter.issued || (sh.letter.issued === best.sh.letter.issued && f > best.f)) best = { sh, f };
  }
  if (best) {
    const n = S.ships.filter(s => (s.state === 'out' || s.state === 'lostOut') && !s.revealed && s.letter && s.letter.issued === best.sh.letter.issued && (t - s.dep) / s.exp < 1).length;
    L.push({ kind: 'out', sh: best.sh, issued: best.sh.letter.issued, due: best.sh.dep + best.sh.exp, copies: n });
  }
  let hb = null;
  for (const sh of S.ships) {
    if ((sh.state !== 'home' && sh.state !== 'lostHome') || sh.revealed || !sh.report) continue;
    const f = (t - sh.dep2) / sh.exp2;
    if (!hb || sh.report.date > hb.sh.report.date || (sh.report.date === hb.sh.report.date && f > hb.f)) hb = { sh, f };
  }
  if (hb && (!S.report || hb.sh.report.date > S.report.date)) L.push({ kind: 'home', sh: hb.sh, written: hb.sh.report.date, due: hb.sh.dep2 + hb.sh.exp2 });
  return L;
}
// Status of each post on the chart, from what Amsterdam knows (Batavia's last report, the events, your letter).
function postStatus(y) {
  const known = S.report ? S.report.posts : [], open = foundablePosts(S, y), out = [];
  for (const id in POSTS) {
    const lost = !!(S.flags.lost && S.flags.lost[id]);
    const has = !lost && (known.includes(id) || (id === 'cape' && !!S.asia.posts.cape));
    const can = !has && !lost && open.includes(id);
    if (!has && !can && !lost) continue;
    const aim = Object.keys(AIM_POST).find(a => AIM_POST[a] === id);
    const mono = !!(aim && S.mono[aim] > 0 && has);
    const ordered = can && S.letter.found === id;
    out.push({ id, st: lost ? 'lost' : has ? 'has' : ordered ? 'ordered' : 'can', mono, aim });
  }
  return out;
}
let mapView = null;
function el(tag, attrs, parent) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function buildMap() {
  const svg = $('map');
  const roses = [[-5, -1, 1], [86, -27, 0]];
  let rh = '';
  for (const [lon, lat] of roses) {
    const [cx, cy] = G([lon, lat]);
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI / 16, x2 = cx + Math.cos(a) * 1500, y2 = cy + Math.sin(a) * 1500;
      rh += `<line class="rh${i % 4 ? '' : ' m'}" x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }
  }
  const [rx, ry] = G([-5, -1]), [sx, sy] = G([86, -27]);
  const star = (cx, cy, r) => { let d = ''; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 - Math.PI / 2, rr = i % 2 ? r * 0.28 : (i % 4 ? r * 0.62 : r); d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); } return d + 'Z'; };
  const rgn = (t, ll, size, cls = 'rgn', id = '') => { const [x, y] = G(ll); return `<text class="${cls}"${id ? ` id="${id}"` : ''} x="${x.toFixed(0)}" y="${y.toFixed(0)}" font-size="${size}">${t}</text>`; };
  // Banda is too small for the coastline data: three islets by hand
  const banda = [[129.88, -4.52, 2.4, 1.3], [129.75, -4.55, 1.6, 1], [130.0, -4.6, 1.3, 0.9]].map(([lo, la, a, b]) => { const [x, y] = G([lo, la]); return `<ellipse class="land" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${a}" ry="${b}"/>`; }).join('');
  svg.innerHTML = `<defs><path id="m-landp" d="${LAND_D}"/><clipPath id="m-seaclip"><rect id="m-cliprect" x="0" y="0" width="10" height="10"/></clipPath></defs>
    <g clip-path="url(#m-seaclip)">
    <g aria-hidden="true">${rh}</g>
    <g aria-hidden="true">
      <use href="#m-landp" class="wl" style="stroke-width:16;opacity:.05"/><use href="#m-landp" class="wl" style="stroke-width:9;opacity:.07"/><use href="#m-landp" class="wl" style="stroke-width:4;opacity:.12"/>
      <use href="#m-landp" class="land"/>${banda}
    </g>
    <image href="img/rv_compass.webp" x="${(rx - 42).toFixed(0)}" y="${(ry - 42).toFixed(0)}" width="84" height="84" opacity=".7" aria-hidden="true"/>
    <path d="${star(sx, sy, 26)}" fill="var(--rhumb)" stroke="var(--chart-ink-2)" stroke-width=".8" aria-hidden="true"/>
    <g aria-hidden="true">
      ${rgn('EUROPA', [16, 49], 22)}${rgn('AFRICA', [21, 6], 30)}${rgn('ASIA', [100, 45], 30)}${rgn('ARABIA', [45, 22], 17)}${rgn('PERSIA', [57, 32], 16)}
      ${rgn('INDIA', [78, 22], 18)}${rgn('CHINA', [108, 31], 20)}${rgn('IAPAN', [138, 37.5], 14)}${rgn('Terra incognita', [133, -25], 20, 'rgn', 'm-aus')}
      ${rgn('OCEANUS ATLANTICUS', [-17, 25], 17, 'sea-l')}${rgn('OCEANUS AETHIOPICUS', [-12, -26], 17, 'sea-l')}${rgn('MARE INDICUM', [70, -10], 20, 'sea-l')}${rgn('MARE CHINENSE', [117, 11], 15, 'sea-l')}
    </g>
    <g id="m-frame" aria-hidden="true"></g>
    <path id="r-home" class="route home"/><path id="r-out" class="route out"/>
    <g id="m-posts"></g><g id="m-ports"></g><g id="m-ships"></g><g id="m-letters"></g>
    <g id="m-cart" aria-hidden="true"></g>
    </g>`;
  svg.addEventListener('click', e => { const h = e.target.closest('[data-k]'); if (h) { e.stopPropagation(); openPopFor(h.getAttribute('data-k'), h); } else closePop(); });
  svg.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const h = e.target.closest('[data-k]'); if (h) { e.preventDefault(); openPopFor(h.getAttribute('data-k'), h); } });
  fitMap();
}
// Fit the core of the chart (Texel to Japan, Iceland to the roaring forties) to the box, widening whichever axis has room.
function fitMap() {
  const box = $('mapwrap').getBoundingClientRect();
  if (!box.width || !box.height) return;
  const a = box.width / box.height, C = MAP_CORE, A = MAP_ALL;
  let w = C.x1 - C.x0, h = C.y1 - C.y0, x = C.x0, y = C.y0;
  if (w / h < a) { const nw = Math.min(A.x1 - A.x0, h * a); x = clamp(C.x0 - (nw - w) / 2, A.x0, A.x1 - nw); w = nw; }
  else { const nh = Math.min(A.y1 - A.y0, w / a); y = clamp(C.y0 - (nh - h) / 2, A.y0, A.y1 - nh); h = nh; }
  // k: how much to enlarge marks and labels so they stay readable when the chart is drawn small
  mapView = { x, y, w, h, scale: box.width / w, k: clamp(0.9 / (box.width / w), 1, 1.6) };
  const svg = $('map');
  svg.style.setProperty('--plfs', (15 * mapView.k).toFixed(1) + 'px'); svg.style.setProperty('--hubfs', (19 * mapView.k).toFixed(1) + 'px');
  svg.setAttribute('viewBox', `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const cr = $('m-cliprect'); cr.setAttribute('x', x); cr.setAttribute('y', y); cr.setAttribute('width', w); cr.setAttribute('height', h);
  drawFrame(); drawCartouche(true); mapStaticKey = ''; if (S) { renderMapStatic(yearOf(S.t)); drawMap(); }
}
// Blaeu-style border: a double rule with alternating degree bars every 5°.
function drawFrame() {
  const v = mapView, g = $('m-frame'), o = 3, b = 10;
  let s = `<rect class="frame" x="${v.x + o}" y="${v.y + o}" width="${v.w - 2 * o}" height="${v.h - 2 * o}"/><rect class="frame" x="${v.x + b}" y="${v.y + b}" width="${v.w - 2 * b}" height="${v.h - 2 * b}" style="stroke-width:.8"/>`;
  const lon0 = Math.ceil((v.x / MAP_K + MAP_LON0) / 5) * 5, lon1 = (v.x + v.w) / MAP_K + MAP_LON0;
  for (let lon = lon0, i = 0; lon < lon1; lon += 5, i++) {
    const xa = Math.max(v.x + b, mx(lon)), xb = Math.min(v.x + v.w - b, mx(lon + 5)); if (xb <= xa) continue;
    if (Math.round(lon / 5) % 2) { s += `<rect class="tick" x="${xa}" y="${v.y + o}" width="${xb - xa}" height="${b - o}"/><rect class="tick" x="${xa}" y="${v.y + v.h - b}" width="${xb - xa}" height="${b - o}"/>`; }
  }
  const lat0 = Math.floor((MAP_LAT0 - v.y / MAP_K) / 5) * 5, lat1 = MAP_LAT0 - (v.y + v.h) / MAP_K;
  for (let lat = lat0; lat > lat1; lat -= 5) {
    const ya = Math.max(v.y + b, my(lat)), yb = Math.min(v.y + v.h - b, my(lat - 5)); if (yb <= ya) continue;
    if (Math.round(lat / 5) % 2) { s += `<rect class="tick" x="${v.x + o}" y="${ya}" width="${b - o}" height="${yb - ya}"/><rect class="tick" x="${v.x + v.w - b}" y="${ya}" width="${b - o}" height="${yb - ya}"/>`; }
  }
  g.innerHTML = s;
}
// Title cartouche at the top, over the steppe north of Persia where nothing happens; the year is kept current.
let cartYear = 0;
function drawCartouche(force) {
  const y = S ? yearOf(S.t) : 1602; if (!force && y === cartYear) return; cartYear = y;
  const v = mapView; if (!v) return;
  const W = 232, H = 84, x = clamp(mx(66) - W / 2, v.x + 24, v.x + v.w - W - 24), t = v.y + 20;
  $('m-cart').innerHTML = `<path class="cart-bg" d="M${x + 10} ${t} H${x + W - 10} q10 0 10 10 V${t + H - 10} q0 10 -10 10 H${x + 10} q-10 0 -10 -10 V${t + 10} q0 -10 10 -10Z"/>
    <path class="cart-in" d="M${x + 7} ${t + 6} H${x + W - 7} V${t + H - 6} H${x + 7}Z"/>
    <path class="cart-in" d="M${x - 6} ${t + H / 2} q-8 -12 2 -18 M${x - 6} ${t + H / 2} q-8 12 2 18 M${x + W + 6} ${t + H / 2} q8 -12 -2 -18 M${x + W + 6} ${t + H / 2} q8 12 -2 18" style="stroke-width:1.2"/>
    <text class="cart-t" x="${x + W / 2}" y="${t + 32}" font-size="23">INDIÆ ORIENTALIS</text>
    <text class="cart-s" x="${x + W / 2}" y="${t + 54}" font-size="15">nova descriptio · Kamer Amsterdam</text>
    <text class="cart-s" x="${x + W / 2}" y="${t + 73}" font-size="15">anno ${y}</text>`;
}
// Posts, ports, routes and counts: redrawn only when what they show changes.
let mapStaticKey = '';
function renderMapStatic(y) {
  if (!mapView) return;
  drawCartouche(false);
  const ps = postStatus(y);
  const inH = S.ships.filter(s => s.state === 'harbour').length;
  const inA = S.ships.filter(s => viewOf(s).kind === 'asia').length;
  const sel = popKey || '';
  const key = [S.flags.brouwer, S.flags.batavia, y >= 1644, S.letterSealed, inH, inA, sel, ps.map(p => p.id + p.st + (p.mono ? 'm' : '')).join(',')].join('|');
  renderChips(inH, inA);
  if (key === mapStaticKey) return; mapStaticKey = key;
  $('r-out').setAttribute('d', outRoute().d); $('r-home').setAttribute('d', homeRoute().d);
  const aus = $('m-aus'); if (aus) aus.textContent = y >= 1644 ? 'HOLLANDIA NOVA' : 'Terra incognita';
  const K = mapView.k.toFixed(2);
  let h = '';
  for (const p of ps) {
    if (p.id === 'cape') continue; // the Cape is drawn with the ports
    const P = POSTS[p.id], [x, yy] = G([P.lon, P.lat]), [al, dx, dy] = MAP_LABEL[p.id] || ['start', 11, -6];
    const cls = `hit post ${p.st === 'has' ? '' : p.st}${sel === 'post:' + p.id ? ' sel' : ''}`;
    h += `<g class="${cls}" data-k="post:${p.id}" tabindex="0" role="button" aria-label="${esc(P.name)}: ${p.st === 'has' ? 'Company post' : p.st === 'can' ? 'could be ordered' : p.st === 'ordered' ? 'ordered in your letter' : 'lost'}${p.mono ? ', monopoly secured' : ''}" transform="translate(${x.toFixed(1)} ${yy.toFixed(1)})">
      <g transform="scale(${K})"><circle r="16" fill="transparent"/>${p.mono ? '<circle class="mono" r="10.5"/>' : ''}<circle class="dot badge" r="${p.st === 'has' ? 6.5 : 6}"/>${p.st === 'lost' ? '<path class="x" d="M-3 -3L3 3M3 -3L-3 3"/>' : ''}</g>
      <text class="pl${p.st === 'has' || p.st === 'ordered' ? '' : ' dim'}" text-anchor="${al}" x="${(dx * K).toFixed(1)}" y="${(dy * K).toFixed(1)}">${esc(P.name)}${p.st === 'ordered' ? ' (ordered)' : ''}</text></g>`;
  }
  $('m-posts').innerHTML = h;
  const capeHas = !!S.asia.posts.cape;
  const port = (k, name, ll, extra, label) => { const [x, yy] = G(ll); return `<g class="hit port${sel === 'port:' + k ? ' sel' : ''}" data-k="port:${k}" tabindex="0" role="button" aria-label="${esc(name)}" transform="translate(${x.toFixed(1)} ${yy.toFixed(1)}) scale(${K})"><circle r="18" fill="transparent"/><circle class="dot badge" r="8"/>${label}${extra}</g>`; };
  const count = (n, dx, dy, fill) => n ? `<g transform="translate(${dx} ${dy})"><circle class="countb" r="11" fill="${fill}"/><text class="count">${n}</text></g>` : '';
  h = port('texel', 'Texel', PORTS.texel, count(inH, -15, 14, 'var(--out)'), `<text class="pl hub" style="font-size:19px" x="12" y="-9">Texel</text>`)
    + port('cape', 'Cape of Good Hope', PORTS.cape, '', `<text class="pl${capeHas ? '' : ' dim'}" style="font-size:15px" text-anchor="end" x="-6" y="-13">${capeHas ? 'The Cape' : 'Cape of Good Hope'}</text>`)
    + port('batavia', S.flags.batavia ? 'Batavia' : 'Java', PORTS.batavia, count(inA, -19, 13, 'var(--delft)'), S.flags.batavia ? `<text class="pl hub" style="font-size:19px" x="13" y="-10">Batavia</text>` : '');
  if (!S.letterSealed) { const [x, yy] = G(PORTS.texel); h += `<g class="hit" data-k="letter:unsent" tabindex="0" role="button" aria-label="Unsent letter to Batavia" transform="translate(${(x - 32 * K).toFixed(1)} ${(yy - 14 * K).toFixed(1)}) scale(${K})">${sealSvg()}</g>`; }
  $('m-ports').innerHTML = h;
}
function renderChips(inH, inA) {
  let o = 0, hm = 0;
  for (const sh of S.ships) { const p = shipPos(sh, S.t); if (p) p.dir === 'out' ? o++ : hm++; }
  const lt = lettersAtSea(S.t).length;
  const html = `<span class="chip"><i class="lg-out"></i><b>${o}</b> outbound</span><span class="chip"><i class="lg-home"></i><b>${hm}</b> homebound</span>`
    + `<span class="chip"><i class="lg-asia"></i><b>${inA}</b> in Asia</span>${inH ? `<span class="chip"><b>${inH}</b> at Texel</span>` : ''}`
    + `<span class="chip"><i class="lg-letter"></i><b>${lt}</b> letter${lt === 1 ? '' : 's'} at sea</span>`;
  const c = $('mapchips'); if (c.innerHTML !== html) c.innerHTML = html;
}
function sealSvg() { return `<circle r="15" fill="transparent"/><g class="badge"><rect class="seal-env" x="-9" y="-6.5" width="18" height="13" rx="1"/><path class="seal-env" d="M-9 -6.5L0 1L9 -6.5" fill="none"/><circle class="seal-wax" cx="0" cy="1.5" r="3.4"/></g>`; }
const SHIP_GLYPH = '<circle class="badge" r="10.5"/><g class="glyph"><path class="hull" d="M-6.5 2.2H6.5L4.4 5.6H-4.3Z"/><path class="hull" d="M0.7 -6.8L5.6 1.2H0.7Z"/><path class="hull" d="M-0.7 -5.2L-5.2 1.2H-0.7Z"/><rect class="hull" x="-0.5" y="-7.5" width="1" height="9.5"/></g>';
const shipEls = new Map(), letterEls = new Map();
// Per frame: move ships and letters to their presumed positions (smoothly between days while time runs).
function drawMap() {
  if (!S || !mapView) return;
  const t = S.t + (S.speed > 0 && !modalOpen && !S.ended ? clamp(acc, 0, 0.999) : 0);
  const seen = new Set(), gS = $('m-ships'), K = mapView.k.toFixed(2);
  for (const sh of S.ships) {
    let p = shipPos(sh, t), lost = false;
    if (!p && sh.revealed && S.t - sh.revealT < 90) { // a ship just reported lost: a wreck mark where she was presumed
      const ll = sh.state === 'lostOut' ? along(outRoute(), 0.97) : along(homeRoute(), 0.5); p = { ...ll, dir: 'lost' }; lost = true;
    }
    if (!p) continue;
    seen.add(sh.id);
    let g = shipEls.get(sh.id);
    if (!g) {
      g = el('g', { 'data-k': 'ship:' + sh.id, tabindex: '0', role: 'button' }, gS);
      g.innerHTML = SHIP_GLYPH; shipEls.set(sh.id, g);
    }
    const cls = `hit ship ${lost ? 'lost' : p.dir}${popKey === 'ship:' + sh.id ? ' sel' : ''}`;
    if (g.getAttribute('class') !== cls) { g.setAttribute('class', cls); g.setAttribute('aria-label', `${sh.name}, ${lost ? 'lost' : p.dir === 'out' ? 'outbound' : 'homebound'}`); }
    g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${K})`);
    const flip = p.dx < 0 ? 'scale(-1 1)' : '';
    const gl = g.querySelector('.glyph'); if (gl.getAttribute('transform') !== flip) gl.setAttribute('transform', flip);
  }
  for (const [id, g] of shipEls) if (!seen.has(id)) { g.remove(); shipEls.delete(id); }
  const gL = $('m-letters'), lseen = new Set();
  for (const L of lettersAtSea(t)) {
    const p = shipPos(L.sh, t); if (!p) continue;
    lseen.add(L.kind);
    let g = letterEls.get(L.kind);
    if (!g) { g = el('g', { 'data-k': 'letter:' + L.kind, tabindex: '0', role: 'button', 'aria-label': L.kind === 'out' ? 'Your letter to Batavia' : 'Letter from Batavia' }, gL); g.innerHTML = sealSvg(); letterEls.set(L.kind, g); }
    const cls = `hit letter${popKey === 'letter:' + L.kind ? ' sel' : ''}`; if (g.getAttribute('class') !== cls) g.setAttribute('class', cls);
    g.setAttribute('transform', `translate(${(p.x + 13 * K).toFixed(1)} ${(p.y - 15 * K).toFixed(1)}) scale(${K})`);
  }
  for (const [k, g] of letterEls) if (!lseen.has(k)) { g.remove(); letterEls.delete(k); }
}

// ---------- details popover on the chart ----------
let popKey = null, popAnchor = null, popHtml = '';
function closePop() { popKey = null; popAnchor = null; popHtml = ''; const p = $('pop'); if (p) p.hidden = true; mapStaticKey = ''; }
function popTarget(k) { return document.querySelector(`#map [data-k="${k}"]`); }
function openPopFor(k, anchor) {
  // a ship in harbour or in Asia is shown at its port
  if (k.startsWith('ship:')) {
    const sh = S.ships.find(s => 'ship:' + s.id === k); if (!sh) return;
    const v = viewOf(sh);
    if (!popTarget(k)) { if (v.kind === 'harbour' || v.kind === 'done') anchor = popTarget('port:texel'); else if (v.kind === 'asia') anchor = popTarget('port:batavia'); }
  }
  $('mapkey').hidden = true; $('keybtn').setAttribute('aria-expanded', 'false');
  popKey = k; popAnchor = anchor || null; popHtml = '';
  refreshPop(); mapStaticKey = ''; render();
}
function refreshPop() {
  const p = $('pop'); if (!popKey) { p.hidden = true; return; }
  const html = popContent(popKey);
  if (!html) { closePop(); return; }
  if (html !== popHtml) {
    popHtml = html; p.innerHTML = `<button type="button" class="x" aria-label="Close">×</button>${html}`;
    p.querySelector('.x').addEventListener('click', closePop);
    p.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => popAction(b.dataset.act)));
  }
  p.hidden = false;
  placePop();
}
function placePop() {
  const p = $('pop'), wrap = $('mapwrap').getBoundingClientRect();
  const a = popTarget(popKey) || (popAnchor && popAnchor.isConnected ? popAnchor : null);
  let ax = wrap.width / 2, ay = wrap.height / 2;
  if (a) { const r = a.getBoundingClientRect(); ax = r.left + r.width / 2 - wrap.left; ay = r.top + r.height / 2 - wrap.top; }
  const pw = p.offsetWidth, ph = p.offsetHeight;
  let x = ax + 22, y = ay - ph / 2;
  if (x + pw > wrap.width - 10) x = ax - 22 - pw;
  x = clamp(x, 10, wrap.width - pw - 10); y = clamp(y, 10, Math.max(10, wrap.height - ph - 10));
  p.style.left = x + 'px'; p.style.top = y + 'px';
}
function bar(f, col) { return `<div class="pbar"><i style="width:${Math.round(clamp(f, 0, 1) * 100)}%;background:${col}"></i></div>`; }
function popContent(k) {
  const [kind, id] = k.split(':'), y = yearOf(S.t);
  if (kind === 'ship') {
    const sh = S.ships.find(s => String(s.id) === id); if (!sh) return '';
    const v = viewOf(sh), pos = shipPos(sh, S.t);
    if (v.kind === 'lost') return `<div class="pk" style="color:var(--loss)">Lost</div><h3><i>${esc(sh.name)}</i></h3><p>${v.text}. ${sh.state === 'lostOut' ? `Batavia reports she never arrived: ${CREW} men and ${money(sh.silver)} in silver.` : 'Long overdue from Batavia, presumed lost with her cargo and crew.'}</p>`;
    if (v.kind === 'harbour') { const nw = nextWindow(S), w = windowAt(S, S.t); return `<div class="pk">At Texel</div><h3><i>${esc(sh.name)}</i></h3><p>Equipped ${fmtDate(sh.equipped)} with ${money(sh.silver)} in silver. ${w ? `Leaving with the ${w} fleet.` : nw ? `Waits for the ${nw.name} fleet, in ${nw.days} days.` : ''}</p>`; }
    if (v.kind === 'asia') return `<div class="pk">In Asia</div><h3><i>${esc(sh.name)}</i></h3><p>${v.text}. She sails for home in the return season, November to January, loaded with whatever Batavia has bought.</p><dl class="kv"><dt>Silver she carried</dt><dd>${money(sh.silver)}</dd></dl>`;
    if (v.kind === 'done') return `<div class="pk">Home</div><h3><i>${esc(sh.name)}</i></h3><p>Home at Texel; her cargo is in the warehouse.</p>`;
    if (!pos) return '';
    if (pos.dir === 'out') {
      const L = sh.letter ? `Carries a copy of your letter of ${fmtMon(sh.letter.issued)}.` : '';
      return `<div class="pk" style="color:var(--out)">Outbound to Batavia</div><h3><i>${esc(sh.name)}</i></h3>
        <p>Sailed ${fmtDate(sh.dep)}. Expected in Batavia about <b>${fmtMon(sh.dep + sh.exp)}</b>; ${pos.f < 0.55 ? 'presumed in the Atlantic' : 'presumed past the Cape'}.</p>${bar(pos.f, 'var(--out)')}
        <dl class="kv"><dt>Silver aboard</dt><dd>${money(sh.silver)}</dd><dt>Worth in Asia</dt><dd>${money(sh.silver * 1.25)}</dd><dt>Men aboard at sailing</dt><dd>${CREW}</dd></dl>
        <p class="note" style="margin-top:8px">${L} Amsterdam knows only the schedule. If she has sunk, word will come from Batavia.</p>`;
    }
    return `<div class="pk" style="color:var(--home)">Homebound from Batavia</div><h3><i>${esc(sh.name)}</i></h3>
      <p>Left Batavia about ${fmtMon(sh.dep2)}. Due at Texel about <b>${fmtMon(sh.dep2 + sh.exp2)}</b>${pos.f > 0.99 ? ', and overdue' : ''}.</p>${bar(pos.f, 'var(--home)')}
      <p class="note">What she carries will be known when she reaches Texel. Her cargo goes to the next auction.</p>`;
  }
  if (kind === 'letter') {
    if (id === 'unsent') return `<div class="pk">Unsent</div><h3>Your instructions to Batavia</h3><p>You have changed your orders. The letter sails with the next ship to leave Texel, and takes effect only when a ship carrying it reaches Batavia.</p><div class="row"><button type="button" class="btn small" data-act="tab:asia">Review the letter</button></div>`;
    const L = lettersAtSea(S.t).find(l => l.kind === id); if (!L) return '';
    if (id === 'out') return `<div class="pk">Letter at sea</div><h3>To Batavia, ${fmtMon(L.issued)}</h3><p>Your instructions, with copies aboard ${L.copies} ship${L.copies === 1 ? '' : 's'}. The leading copy, on the <i>${esc(L.sh.name)}</i>, is due in Batavia about <b>${fmtMon(L.due)}</b>.</p><p class="note">If every ship carrying it is lost, Batavia never reads it.</p><div class="row"><button type="button" class="btn ghost small" data-act="tab:asia">See the instructions</button></div>`;
    return `<div class="pk">Letter at sea</div><h3>From Batavia, ${fmtMon(L.written)}</h3><p>The Governor-General's newest report rides home on the <i>${esc(L.sh.name)}</i>, due at Texel about <b>${fmtMon(L.due)}</b>. Until it arrives you know Asia only as it was ${S.report ? 'in ' + fmtMon(S.report.date) : 'never'}.</p>`;
  }
  if (kind === 'port') {
    if (id === 'texel') {
      const inH = S.ships.filter(s => s.state === 'harbour'), nw = nextWindow(S), w = windowAt(S, S.t);
      return `<div class="pk">Home port</div><h3>Texel roads</h3><p>${inH.length ? `${inH.length} ship${inH.length > 1 ? 's' : ''} waiting: ${inH.map(s => '<i>' + esc(s.name) + '</i>').join(', ')}. ` : 'No ships waiting. '}${w ? `The ${w} fleet is sailing now.` : nw ? `Next sailing: the ${nw.name} fleet, in ${nw.days} days.` : ''}</p>${S.auto.n ? `<p class="note">Standing orders: ${S.auto.n} ship${S.auto.n > 1 ? 's' : ''} each season.</p>` : ''}<div class="row"><button type="button" class="btn small" data-act="tab:fleet">Equip ships</button></div>`;
    }
    if (id === 'cape') return S.asia.posts.cape ? `<div class="pk">Company post</div><h3>The Cape</h3><p>${POSTS.cape.desc} Upkeep ${money(POSTS.cape.upkeep)} a year, ${num(POSTS.cape.garrison)} men.</p>` : `<div class="pk">Waypoint</div><h3>Cape of Good Hope</h3><p>Every ship rounds it both ways. There is no Company station here yet, only a post office stone where crews leave letters.</p>`;
    if (id === 'batavia') {
      const R = S.report, inA = S.ships.filter(s => viewOf(s).kind === 'asia');
      const sum = R ? `<dl class="kv"><dt>Last letter written</dt><dd>${fmtMon(R.date)}</dd><dt>Silver on hand</dt><dd class="${R.capital < 0 ? 'neg' : ''}">${money(R.capital)}</dd><dt>Goods waiting</dt><dd>${num(GOOD_KEYS.reduce((a, g) => a + R.stock[g], 0))} t</dd><dt>Men in service</dt><dd class="${R.personnel < R.need ? 'neg' : ''}">${num(R.personnel)} of ${num(R.need)}</dd></dl>` : '<p>No letter from Asia yet. The first comes home with the first return ship.</p>';
      return `<div class="pk">Headquarters in Asia</div><h3>${S.flags.batavia ? 'Batavia' : 'Java'}</h3>${sum}<p class="note" style="margin-top:8px">${inA.length ? `${inA.length} of your ships presumed in Asia: ${inA.slice(0, 6).map(s => '<i>' + esc(s.name) + '</i>').join(', ')}${inA.length > 6 ? '…' : ''}.` : 'None of your ships is presumed in Asia.'}</p><div class="row"><button type="button" class="btn small" data-act="tab:asia">Read the letter</button></div>`;
    }
  }
  if (kind === 'post') {
    const st = postStatus(y).find(p => p.id === id); if (!st) return '';
    const P = POSTS[id], aim = st.aim && AIMS.find(a => a.id === st.aim);
    const head = st.st === 'lost' ? '<div class="pk" style="color:var(--loss)">Lost</div>' : st.mono ? `<div class="pk" style="color:var(--seal)">Monopoly secured ${yearOf(S.mono[st.aim])}</div>` : st.st === 'has' ? '<div class="pk">Company post</div>' : st.st === 'ordered' ? '<div class="pk" style="color:var(--out)">Ordered in your letter</div>' : '<div class="pk">Open to you</div>';
    const supply = P.good ? `<dt>Supplies</dt><dd>${P.good === 'fine' ? '' : 'up to '}${num(st.st === 'has' ? postCap(S, id, y) : P.cap)} t ${GOODS[P.good].name.toLowerCase()} a year</dd>` : P.intra ? '<dt>Effect</dt><dd>more profit from trade within Asia</dd>' : P.silver ? '<dt>Effect</dt><dd>Japanese silver every year</dd>' : '';
    const kv = `<dl class="kv">${supply}<dt>Upkeep</dt><dd>${money(postUpkeep(S, id))} a year</dd><dt>Garrison</dt><dd>${num(postGarrison(S, id))} men</dd>${st.st === 'can' || st.st === 'ordered' ? `<dt>Cost to Batavia</dt><dd>${money(P.cost)}${P.war ? ' · war' : ''}</dd>` : ''}</dl>`;
    const act = st.st === 'can' ? `<div class="row"><button type="button" class="btn small" data-act="order:${id}">Order it in the next letter</button></div>` : st.st === 'ordered' ? `<div class="row"><button type="button" class="btn ghost small" data-act="order:">Take it out of the letter</button></div>` : '';
    return `${head}<h3>${esc(P.name)}</h3><p>${P.desc}</p>${kv}${aim ? `<p class="note" style="margin-top:8px">The Seventeen's aim: ${aim.name.toLowerCase()}. ${st.mono ? `Historically ${aim.hist}.` : aim.how}</p>` : ''}${act}`;
  }
  return '';
}
function popAction(a) {
  const [k, v] = a.split(':');
  if (k === 'tab') { showTab(v); closePop(); return; }
  if (k === 'order') { S.letter = { ...S.letter, found: v, issued: S.t }; S.letterSealed = false; foundKey = ''; render(); tutHook('letter'); }
}

// ---------- modals ----------
function showSheet(html, cls = '') { const sh = $('sheet'); sh.className = 'sheet' + (cls ? ' ' + cls : ''); sh.innerHTML = html; $('modal').hidden = false; modalOpen = true; closePop(); const b = sh.querySelector('button'); if (b) b.focus(); }
function closeSheet() { $('modal').hidden = true; modalOpen = false; }
function pauseForModal() { if (S.speed) resumeSpeed = S.speed; S.speed = 0; }
function openQueued() {
  if (modalOpen) return;
  if (S.ended) { showEnd(); return; }
  if (!S.queue.length) return;
  // peek, don't shift: the event leaves the queue in resolveEvent(), so a save while the card is open keeps it
  const id = S.queue[0]; const e = EVENT_BY_ID[id]; if (!e) { S.queue.shift(); openQueued(); return; }
  const wasRunning = S.speed > 0 || id !== 'founding';
  pauseForModal();
  const info = e.choices.length === 1 && !e.choices[0].fx;
  const when = id === 'founding' ? '20 March 1602' : fmtDate(S.t);
  const im = typeof EVENT_IMAGES !== 'undefined' && EVENT_IMAGES[id];
  const fig = im ? `<figure class="plate"><img src="${im.src}" alt="${esc(im.title)}" onerror="this.closest('.sheet').classList.remove('wide');this.closest('figure').remove()"><figcaption><i>${esc(im.title)}</i>, ${esc(im.maker)}, ${esc(im.date)}. <a href="${im.page}" target="_blank" rel="noopener">Rijksmuseum ${esc(im.obj)}</a></figcaption></figure>` : '';
  showSheet(`${fig}<div class="txt"><div class="when">${when}</div><h3 id="m-title">${e.title}</h3><div class="body">${e.body(S)}</div>
    ${info ? `<div class="hist"><b>Historical note</b>${e.history}</div><div class="actions"><button type="button" class="btn" data-c="0">${e.choices[0].label}</button></div>`
      : `<div class="choices">${visibleChoices(S, e).map(({ c, i }) => `<button type="button" class="choice" data-c="${i}"><b>${c.label}</b>${c.hint ? `<span>${c.hint}</span>` : ''}</button>`).join('')}</div>`}</div>`, im ? 'wide' : '');
  $('sheet').querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
    const c = e.choices[+b.dataset.c];
    if (S.queue[0] !== id) return; // already answered (double click)
    if (info) { resolveEvent(S, id, 0); closeSheet(); S.speed = wasRunning ? resumeSpeed : 5; if (id === 'founding' && tutActive()) { S.speed = 0; save(); render(); tutStart(); return; } save(); render(); openQueued(); return; }
    track('event_choice', { event: id, choice: +b.dataset.c, label: c.label });
    const out = resolveEvent(S, id, +b.dataset.c); save();
    $('sheet').querySelector('.choices').outerHTML = `${out ? `<p class="outcome">${out}</p>` : ''}<div class="hist"><b>What actually happened</b>${e.history}</div><div class="actions"><button type="button" class="btn" id="m-go">Continue</button></div>`;
    $('m-go').focus();
    $('m-go').addEventListener('click', () => { closeSheet(); S.speed = resumeSpeed; render(); openQueued(); });
  }));
}
function showAudit(a) {
  const was = S.speed; pauseForModal();
  const ratio = a.equity / a.mcap;
  showSheet(`<div class="when">${fmtDate(S.t)}</div><h3 id="m-title">An audit of the Company</h3>
    <div class="body"><p>The Company has never drawn up a single balance sheet. Amsterdam keeps its own books; Batavia keeps others, and they reach Holland a year late. Your clerks have tried to add them up.</p>
    <dl class="kv"><dt>Cash in Amsterdam</dt><dd>${money(a.cash)}</dd><dt>Debt</dt><dd class="neg">${money(-a.debt)}</dd>
    <dt>Goods in the warehouse</dt><dd>${money(a.whv)}</dd><dt>Silver and goods in Asia${a.rdate ? `, as of ${fmtMon(a.rdate)}` : ''}</dt><dd>${money(a.asv)}</dd>
    <dt><b>Estimated worth</b></dt><dd><b>${money(a.equity)}</b></dd><dt>What the market pays for the shares</dt><dd>${money(a.mcap)}</dd></dl>
    <p style="margin-top:10px">${ratio < 0.6 ? 'The shares trade far above anything the books can show. The figures leak out, and the price slips.' : 'The books roughly support the share price. Shareholders are reassured.'}</p></div>
    <div class="hist"><b>Historical note</b>The VOC never produced consolidated accounts. In the 1720s its shares traded around six times face value, while profit as a share of turnover was falling from about 18% toward 2–3%.</div>
    <div class="actions"><button type="button" class="btn" id="m-go">Close</button></div>`);
  $('m-go').addEventListener('click', () => { closeSheet(); S.speed = was; render(); });
}
// End-of-game chart: the player's company against the real VOC on the same axes (data from compareData in model.js).
function compareSvg(D) {
  const W = 600, L = 46, R = 14, x = yr => L + (yr - 1600) / 200 * (W - L - R);
  const R0 = D.real;
  // panel 1: dividends
  const t1 = 24, h1 = 128, divMax = Math.max(40, ...D.decades.map(d => d.div || 0)) * 1.08;
  const y1 = v => t1 + h1 - Math.min(v, divMax) / divMax * h1;
  // panel 2: debt in ƒ millions
  const t2 = t1 + h1 + 58, h2 = 118, debtMax = Math.max(130, ...D.decades.map(d => (d.debt || 0) / 1e6), D.endDebt / 1e6) * 1.08;
  const y2 = v => t2 + h2 - v / debtMax * h2;
  const H = t2 + h2 + 30;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Your company's dividends per decade and debt, compared with the real VOC">`;
  const gridY = (top, h, max, step, fy, unit) => { let g = ''; for (let v = 0; v <= max; v += step) { const yy = fy(v); g += `<line class="gr" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end">${v}${unit}</text>`; } return g; };
  s += `<text x="${L}" y="${t1 - 9}" style="font-weight:600;fill:var(--ink)">Dividend, % of capital a year (decade average)</text>`;
  s += gridY(t1, h1, divMax, divMax > 60 ? 20 : 10, y1, '%');
  for (const d of D.decades) if (d.div != null && d.decade >= 1610) { const bw = (x(1610) - x(1600)) * 0.62; s += `<rect class="pb" x="${(x(d.decade + 5) - bw / 2).toFixed(1)}" y="${y1(d.div).toFixed(1)}" width="${bw.toFixed(1)}" height="${(t1 + h1 - y1(d.div)).toFixed(1)}" rx="1.5"><title>${d.decade}s: ${d.div}%</title></rect>`; }
  s += `<path class="rv" d="M${x(R0.firstDiv)} ${y1(R0.avgDiv)} H${x(R0.lastDiv)}"/><path class="rv" d="M${x(R0.lastDiv)} ${y1(0) - 1.5} H${x(1800)}" style="stroke-dasharray:none"/>`;
  s += `<text class="lbl rvt" x="${x(1700)}" y="${y1(R0.avgDiv) - 7}" text-anchor="middle">real VOC: about ${R0.avgDiv}% a year on average</text>`;
  s += `<text class="lbl rvt" x="${x(1800) - 2}" y="${y1(0) + 15}" text-anchor="end">real VOC: none after ${R0.lastDiv}</text>`;
  s += `<text class="lbl rvt" x="${x(1612) + 2}" y="${t1 + 12}">1610–12: ${R0.early.total}% in all ↑</text>`;
  s += `<line class="ax" x1="${L}" x2="${W - R}" y1="${t1 + h1}" y2="${t1 + h1}"/>`;
  // panel 2
  s += `<text x="${L}" y="${t2 - 9}" style="font-weight:600;fill:var(--ink)">Debt at the end of each decade, ƒ million</text>`;
  s += gridY(t2, h2, debtMax, debtMax > 300 ? 100 : 50, y2, '');
  const pts = D.decades.filter(d => d.debt != null).map(d => [x(Math.min(d.decade + 9, D.endYear)), y2(d.debt / 1e6)]);
  if (pts.length) { s += `<path class="pl" d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('')}"/>` + pts.map(p => `<circle class="pd" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.8"/>`).join(''); }
  const ex = x(R0.endDebt.y);
  const ey = y2(R0.endDebt.v / 1e6);
  s += `<rect class="rb" x="${ex - 5}" y="${(ey - 5).toFixed(1)}" width="10" height="10" transform="rotate(45 ${ex} ${ey.toFixed(1)})"/><rect class="rbe" x="${ex - 5}" y="${(ey - 5).toFixed(1)}" width="10" height="10" transform="rotate(45 ${ex} ${ey.toFixed(1)})"/>`;
  s += `<text class="lbl rvt" x="${ex - 12}" y="${(ey + 4).toFixed(1)}" text-anchor="end">real VOC, 1796: about ƒ120M</text>`;
  s += `<line x1="${x(R0.war.y)}" x2="${x(R0.war.y)}" y1="${t2}" y2="${t2 + h2}" stroke="var(--brass)" stroke-dasharray="2 3"/><text class="lbl rvt" x="${x(R0.war.y) - 5}" y="${t2 + h2 - 7}" text-anchor="end">1780–84 war: losses up to ƒ43M</text>`;
  s += `<line class="ax" x1="${L}" x2="${W - R}" y1="${t2 + h2}" y2="${t2 + h2}"/>`;
  for (let yr = 1600; yr <= 1800; yr += 50) s += `<text x="${x(yr)}" y="${t2 + h2 + 18}" text-anchor="middle">${yr}</text><line class="ax" x1="${x(yr)}" x2="${x(yr)}" y1="${t2 + h2}" y2="${t2 + h2 + 4}"/>`;
  s += `<g transform="translate(${W - R - 236} ${t1 - 21})"><rect class="pb" x="0" y="0" width="12" height="12" rx="1.5"/><text x="17" y="10.5">your dividends</text><line class="pl" x1="118" x2="138" y1="6" y2="6"/><text x="143" y="10.5">your debt</text></g>`;
  return s + '</svg>';
}
function showEnd() {
  S.speed = 0; hideCoach();
  const bankrupt = S.endReason === 'bankrupt', yr = yearOf(S.t);
  const D = compareData(S), line = compareLine(S, D);
  const nMono = AIMS.filter(a => S.mono[a.id] > 0).length;
  const yrs = Math.max(1, S.stats.divYears), avg = (S.stats.divPaid / NOMINAL * 100 / yrs).toFixed(1);
  if (!S.endTracked) {
    try { const runs = JSON.parse(localStorage.getItem('retourvloot.runs') || '[]'); runs.push({ endYear: yr, reason: S.endReason || 'charter', avgDiv: +avg, debt: Math.round(S.debt), monopolies: nMono, voyages: S.stats.voyages, at: Date.now() }); localStorage.setItem('retourvloot.runs', JSON.stringify(runs.slice(-20))); } catch (e) {}
    S.endTracked = true; save();
    track('game_end', { reason: S.endReason || 'charter', debt: Math.round(S.debt), cash: Math.round(S.cash), dividends: Math.round(S.stats.divPaid), monopolies: nMono, voyages: S.stats.voyages });
    try { if (window.HL) window.HL.stamp('retourvloot', { result: bankrupt ? 'loss' : 'win', label: `${bankrupt ? 'Bankrupt in ' + yr : 'Charter to 1799'} · ƒ${Math.round(S.stats.divPaid / 1e6)}M paid out`, score: finalScore(S) }); } catch (e) {}
  }
  showSheet(`<div class="endhead"><div class="cart"><img src="img/rv_cartouche.webp" alt="" onerror="this.parentNode.classList.add('noimg')"><h3 id="m-title">${bankrupt ? 'The States take over' : 'The charter expires'}</h3></div>
    <div><div class="when">${fmtDate(S.t)}</div><p class="lede">${bankrupt ? 'Your debts have passed ƒ120 million. No lender will touch Company paper, and the States General take control of its affairs.' : 'On 31 December 1799 the charter lapses. The Batavian state takes over the Company\'s possessions in Asia, and its debts.'}</p>
    <p class="score">Paid to shareholders <b>${money(S.stats.divPaid)}</b> · debt left <b class="neg">${money(S.debt)}</b></p></div></div>
    <div class="endcols"><div>
    <div class="endgrid">
      <span>Voyages sent</span><b class="num">${num(S.stats.voyages)} (${num(S.stats.lost)} lost)</b>
      <span>Silver shipped east</span><b class="num">${money(S.stats.silver)}</b>
      <span>Auction sales</span><b class="num">${money(S.stats.auction)}</b>
      <span>Dividends paid</span><b class="num">${money(S.stats.divPaid)} · avg ${avg}%/yr</b>
      <span>Debt left to the state</span><b class="num neg">${money(S.debt)}</b>
      <span>Monopolies secured</span><b class="num">${nMono} of ${AIMS.length}</b>
      <span>Men sent east</span><b class="num">${num(S.humans.sent)}</b>
      <span>Died at sea or in Asia</span><b class="num neg">${num(S.humans.diedSea + S.humans.diedAsia)}</b>
      <span>Came home</span><b class="num">${num(S.humans.returned)} (${S.humans.sent ? Math.round(S.humans.returned / S.humans.sent * 100) : 0}%)</b>
    </div>
    <div class="hist"><b>The real Company</b>About a million people sailed east for the VOC between 1602 and 1795; roughly a third came home. It paid an average dividend of around 18% a year on its original capital, from 1730 mostly with money it did not earn, and none after 1782. After the revolution of 1795 its debt, about ƒ120 million, became part of the state debt.</div>
    </div>
    <div class="cmp" id="cmp"><h4>Your company and the real VOC</h4><p class="line" id="cmp-line">${esc(line)}</p>${compareSvg(D)}
      <p class="src">Real VOC: lifetime average dividend and 1610–12 payouts after Gaastra (2003) and De Vries &amp; Van der Woude (1997); last dividend 1782; war losses after De Vries &amp; Van der Woude (1997), pp. 454–5. Only cited figures are drawn; see Sources.</p></div>
    </div>
    <div data-hl-next></div>
    <div class="actions"><button type="button" class="btn ghost" id="m-share">Share your result</button><button type="button" class="btn" id="m-new">Start a new company</button></div>`, 'end');
  $('m-new').addEventListener('click', () => { S = newState(); save(); closeSheet(); syncInputs(); render(); track('game_start', { restart: true }); openQueued(); });
  const sb = $('m-share');
  if (window.HL && window.HL.on) window.HL.on(sb, () => shareOpts(D, line, bankrupt, yr, avg, nMono));
  else sb.hidden = true;
}
function shareOpts(D, line, bankrupt, yr, avg, nMono) {
  const title = bankrupt ? `The States took over in ${yr}` : 'The charter ran to 1799';
  return {
    game: 'retourvloot', kicker: 'Retourvloot · VOC 1602–1799', title,
    big: money(S.stats.divPaid), sub: `paid to shareholders · ${avg}% a year (the real VOC: about 18%)`,
    lines: [`Debt left to the state: ${money(S.debt)}`, `${num(S.stats.voyages)} voyages · ${nMono} of ${AIMS.length} monopolies`, `${num(S.humans.diedSea + S.humans.diedAsia)} died at sea or in Asia`],
    art: 'img/founding.jpg',
    text: `Retourvloot: I ran the Dutch East India Company ${bankrupt ? 'until it went under in ' + yr : 'to the end of its charter in 1799'}. ${line}`,
  };
}

// ---------- keyboard ----------
// Esc closes a card that has a single way out (never picks a choice for you); Tab stays inside an open card;
// Space pauses and resumes when focus is not on a control.
function onKey(e) {
  if (modalOpen) {
    const sheet = $('sheet');
    if (e.key === 'Escape') {
      const out = sheet.querySelector('#m-go') || (sheet.querySelectorAll('[data-c]').length === 1 && !sheet.querySelector('.choices') ? sheet.querySelector('[data-c]') : null);
      if (out) { e.preventDefault(); out.click(); }
      return;
    }
    if (e.key === 'Tab') {
      const f = [...sheet.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (!sheet.contains(a)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    }
    return;
  }
  if (e.key === 'Escape' && popKey) { closePop(); return; }
  if (e.key === ' ' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const t = e.target, tag = t && t.tagName;
    if (t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON|A|SUMMARY|OPTION|LI)$/.test(tag) || (t.closest && t.closest('[data-k], .hlfb-ov, .small-screen:not([hidden])')))) return;
    if (!$('small-screen').hidden) return;
    const b = document.querySelector(`.speed button[data-speed="${S.speed ? 0 : resumeSpeed}"]`);
    if (b) { e.preventDefault(); b.click(); }
  }
}

// ---------- main loop ----------
let acc = 0, last = 0, lastRender = 0, lastSave = 0, lastYearSeen = 0;
function frame(ts) {
  const dt = last ? Math.min(0.25, (ts - last) / 1000) : 0; last = ts;
  if (S.speed > 0 && !modalOpen && !S.ended) {
    acc += dt * S.speed;
    while (acc >= 1) {
      acc -= 1; step(S);
      if (S.queue.length || S.ended) { acc = 0; render(); openQueued(); break; }
    }
  }
  if (ts - lastRender > 200) { lastRender = ts; render(); tutCheck(); positionCoach(); const yy = yearOf(S.t); if (yy !== lastYearSeen) { if (lastYearSeen && yy % 10 === 0) track('decade', { decade: yy }); lastYearSeen = yy; } }
  drawMap();
  if (popKey && popKey.startsWith('ship:')) placePop();
  if (ts - lastSave > 5000) { lastSave = ts; save(); }
  requestAnimationFrame(frame);
}

function start(data) {
  S = (data && data.S) || load() || newState();
  if (!S.release || !S.books || !S.mono || !S.news || !S.dynCount) S = newState();
  _S = S;
  if (!S.tut) S.tut = { i: 0, done: true, seen: {}, ctxOn: false };
  // saves from before the year record: start it from the 40 years the books keep
  if (!S.yhist) S.yhist = S.bookHist.filter(b => b.debt != null).map(b => ({ y: b.y, div: +(b.div / NOMINAL * 100).toFixed(2), debt: Math.round(b.debt) }));
  modalOpen = false;
  buildStatic(); syncInputs(); render();
  window.HL_FEEDBACK_CONTEXT = () => S ? `${fmtDate(S.t)} · cash ${money(S.cash)} · debt ${money(S.debt)} · share ${Math.round(S.share)}% · ${S.stats.voyages} voyages` : '';
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ S }));
  if (S.speed) resumeSpeed = S.speed;
  if (S.queue[0] === 'founding') track('game_start', { restart: false }); else track('game_resume');
  openQueued();
  if (tutActive() && !S.queue.length && !modalOpen) tutStart();
  window.addEventListener('scroll', positionCoach, { passive: true }); window.addEventListener('resize', () => { positionCoach(); if (popKey) placePop(); });
  document.querySelector('.panes').addEventListener('scroll', positionCoach, { passive: true });
  $('credits').addEventListener('click', showCredits);
  document.addEventListener('keydown', onKey);
  const sn = $('small-screen'); let dismissed = false; try { dismissed = sessionStorage.getItem('rv-small') === '1'; } catch (e) {}
  if (window.innerWidth < 900 && !dismissed) { sn.hidden = false; $('small-go').addEventListener('click', () => { sn.hidden = true; try { sessionStorage.setItem('rv-small', '1'); } catch (e) {} }); }
  requestAnimationFrame(frame);
}
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
