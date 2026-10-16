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

// ---------- static UI setup ----------
function buildStatic() {
  const wh = $('wh'); wh.innerHTML = '';
  for (const g of GOOD_KEYS) {
    const tr = document.createElement('tr'); tr.id = 'row-' + g;
    tr.innerHTML = `<td>${GOODS[g].name}<span class="sub">${GOODS[g].sub}</span></td><td class="r num" id="st-${g}"></td>
      <td><div class="rel"><input type="range" min="0" max="100" step="5" id="rel-${g}" aria-label="Share of ${GOODS[g].name} to sell"><output id="relo-${g}"></output></div></td>
      <td class="r num" id="pr-${g}"></td>`;
    wh.appendChild(tr);
    tr.querySelector('input').addEventListener('input', e => { S.release[g] = +e.target.value; render(); });
  }
  const seg = (el, name, opts) => {
    el.innerHTML = Object.entries(opts).map(([k, v]) => `<label><input type="radio" name="${name}" value="${k}" id="${name}-${k}"><span>${v}</span></label>`).join('');
    el.addEventListener('change', e => { S.letter = { ...S.letter, [name]: e.target.value, issued: S.t }; S.letterSealed = false; render(); tutHook('letter'); });
  };
  seg($('f-focus'), 'focus', Object.fromEntries(Object.entries(FOCUS).map(([k, v]) => [k, v.label])));
  seg($('f-wages'), 'wages', { low: 'Low wages', high: 'Higher wages' });
  seg($('f-exp'), 'expansion', EXPANSION);
  $('f-found').addEventListener('change', e => { S.letter = { ...S.letter, found: e.target.value, issued: S.t }; S.letterSealed = false; render(); tutHook('letter'); });

  document.querySelectorAll('.speed button').forEach(b => b.addEventListener('click', () => { if (modalOpen || S.ended) return; if (coachStep && !coachStep.wait && !tutActive()) endCtx(); S.speed = +b.dataset.speed; if (S.speed) resumeSpeed = S.speed; render(); if (S.speed) tutHook('speed'); }));
  $('silver').addEventListener('input', e => { S.silver = +e.target.value; render(); });
  $('equip').addEventListener('click', () => { if (equipShip(S, S.silver, false)) { log(S, `The ${S.ships[S.ships.length - 1].name} is equipped with ${money(S.silver)} in silver.`, 'ship'); if (S.shipSeq === 1) track('first_ship'); tutHook('equip'); } render(); });
  $('auto').addEventListener('change', e => { S.auto.n = +e.target.value; render(); tutHook('auto'); });
  $('autoborrow').addEventListener('change', e => { S.auto.borrow = e.target.checked; });
  $('div').addEventListener('input', e => { S.divRate = +e.target.value; render(); });
  $('borrow').addEventListener('click', () => { S.debt += 1e6; S.cash += 1e6; log(S, 'Borrowed ƒ1M on short-term notes.', 'money'); render(); });
  $('repay').addEventListener('click', () => { const r = Math.min(1e6, S.debt, S.cash); if (r > 0) { S.debt -= r; S.cash -= r; log(S, `Repaid ${money(r)} of debt.`, 'money'); } render(); });
  $('burn').addEventListener('click', () => { const q = Math.floor(S.wh.fine * 0.25); if (q > 0) { S.wh.fine -= q; log(S, `${num(q)} t of fine spices burned in the warehouse to hold up the price.`, 'loss'); } render(); });
  $('audit').addEventListener('click', () => { if (S.t - S.auditLast < 365 * 5) return; showAudit(audit(S)); });
  let armed = false;
  $('newgame').addEventListener('click', e => {
    if (!armed) { armed = true; e.target.textContent = 'Click again to start over'; setTimeout(() => { armed = false; e.target.textContent = 'New game'; }, 3000); return; }
    S = newState(); hideCoach(); armed = false; e.target.textContent = 'New game'; save(); syncInputs(); render(); track('game_start', { restart: true }); openQueued();
  });
  new ResizeObserver(() => sizeCanvases()).observe($('map'));
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
function render() {
  _S = S;
  const y = yearOf(S.t);
  $('date').textContent = fmtDate(S.t);
  const w = windowAt(S, S.t), nw = nextWindow(S);
  $('season').innerHTML = w ? `<b>${w} fleet</b> is sailing` : nw ? `Next sailing: <b>${nw.name}</b> in ${nw.days} days` : '';
  document.querySelectorAll('.speed button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.speed === S.speed)));

  // stats
  $('s-cash').textContent = money(S.cash);
  const res = tradeResult(S.books);
  $('s-cash2').innerHTML = `trading this year: <span class="${res < 0 ? 'neg' : 'pos'}">${res < 0 ? '' : '+'}${money(res)}</span>`;
  $('s-debt').textContent = money(S.debt); $('s-debt').className = S.debt > 0 ? 'neg' : '';
  $('s-debt2').textContent = S.debt > 0 ? `interest ${money(S.debt * 0.04)} a year` : '4% a year';
  $('s-share').textContent = Math.round(S.share) + '%';
  $('s-share2').textContent = `market value ${money(NOMINAL * S.share / 100)}`;
  $('s-exp').textContent = y >= 1610 ? Math.round(expectation(S)) + '%' : '—';
  $('s-exp2').textContent = y >= 1610 ? `you set ${S.divRate}% for May` : 'no dividend before 1610';
  const nMono = AIMS.filter(a => S.mono[a.id] > 0).length;
  $('s-mono').textContent = `${nMono} of ${AIMS.length}`;
  $('s-mono2').textContent = `fine-spice share ${Math.round(fineShare(S, y) * 100)}%`;

  // equip
  const cost = shipCost(y) + S.silver;
  $('silver').max = maxSilver(y);
  $('silver-out').textContent = money(S.silver);
  $('equip').textContent = S.flags.nationalised ? 'The committee equips ships now' : `Equip a ship · ${money(cost)}`;
  $('equip').disabled = S.cash < cost || !!S.flags.nationalised;
  $('equip-cap').textContent = `${shipCap(y)} t · ${CREW} men · hull ${money(shipCost(y))}`;
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
    $('pr-' + g).innerHTML = `${S.wh[g] >= 1 ? money(p) + '/t' : '—'}<span class="sub">Europe ${num(m.d / 2)} t · English ${num(m.eic / 2)} t</span>`;
    est += rel * p;
    const inp = $('rel-' + g); if (document.activeElement !== inp) inp.value = S.release[g];
  }
  const na = nextAuction(S);
  $('next-auction').textContent = 'next: ' + fmtDate(na);
  $('auction-est').textContent = est > 0 ? `If sold today: about ${money(est)}` : 'Nothing to sell yet.';
  $('burn').disabled = S.wh.fine < 4;
  $('burn').textContent = S.wh.fine >= 4 ? `Burn ${num(S.wh.fine * 0.25)} t of fine spice` : 'Burn surplus spice';
  $('silver-eff').innerHTML = silverEffect(y);

  // shareholders
  $('div-out').textContent = `${S.divRate}% · ${money(NOMINAL * S.divRate / 100)}`;
  const dinp = $('div'); if (document.activeElement !== dinp) dinp.value = S.divRate;
  $('disc').querySelector('i').style.width = S.discontent + '%';
  $('disc').classList.toggle('bad', S.discontent >= 60);
  $('disc-txt').textContent = S.discontent < 20 ? 'Content' : S.discontent < 50 ? 'Grumbling' : S.discontent < 75 ? 'Angry' : 'Pamphlets';
  const auditReady = S.t - S.auditLast >= 365 * 5;
  $('audit').disabled = !auditReady;
  $('audit').textContent = auditReady ? 'Commission an audit · ƒ60k' : `Audit again in ${Math.ceil((S.auditLast + 365 * 5 - S.t) / 365)} yr`;
  $('repay').disabled = S.debt <= 0 || S.cash <= 0;
  const exp = expectation(S), pay = NOMINAL * S.divRate / 100;
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
function renderFleet() {
  const rows = S.ships.map(sh => ({ sh, v: viewOf(sh) }));
  const order = { harbour: 0, out: 1, asia: 2, home: 3, done: 4, lost: 5 };
  rows.sort((a, b) => order[a.v.kind] - order[b.v.kind] || a.sh.id - b.sh.id);
  const atSea = rows.filter(r => r.v.kind !== 'harbour' && r.v.kind !== 'done' && r.v.kind !== 'lost').length;
  $('fleet-count').textContent = rows.length ? `${atSea} away from home` : '';
  $('fleet').innerHTML = rows.length ? rows.map(({ sh, v }) => `<tr><td>${esc(sh.name)}</td><td><span class="pill ${v.cls}">${v.text}</span></td><td class="r num">${money(sh.silver)}</td></tr>`).join('')
    : `<tr><td colspan="3" class="empty">No ships yet. Equip one and it will sail with the next fleet.</td></tr>`;
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
      <dt>Goods waiting for ships</dt><dd>${goods.length > 34 ? '' : goods}</dd>
      ${goods.length > 34 ? `<dt style="grid-column:1/-1;text-align:right;color:var(--ink)">${goods}</dt>` : ''}
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
  const P = POSTS[S.letter.found];
  $('found-desc').innerHTML = P ? `${P.desc} Costs Batavia <b>${money(P.cost)}</b> once, then <b>${money(P.upkeep)}</b> a year and <b>${num(P.garrison)}</b> men.${P.good ? ` Supplies up to ${num(P.cap)} t of ${GOODS[P.good].name.toLowerCase()} a year.` : P.intra ? ' Makes trade within Asia more profitable.' : P.silver ? ' Sends Japanese silver to Batavia every year.' : ''}` : f.length ? `${f.length} place${f.length > 1 ? 's' : ''} open to you: ${f.map(id => POSTS[id].name).join(', ')}.` : 'Nothing new is open to you in this period.';
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
  $('bars-cap').textContent = `Bars: trading result per year, ${h[0].y}–${h[h.length - 1].y} (largest ${money(mx)}). Blue marks: dividend paid.`;
}
function renderNotes(y) {
  const n = [], R = S.report;
  const inH = S.ships.filter(s => s.state === 'harbour').length;
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
  if (!n.length) n.push(['good', 'Nothing needs your attention. Let the fleets sail.']);
  $('notes').innerHTML = n.slice(0, 4).map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join('');
}
function renderAims(y) {
  const sh = fineShare(S, y), lk = fineLeaks(S);
  $('fine-share').textContent = Math.round(sh * 100) + '%';
  $('fine-bar').style.width = Math.round(sh * 100) + '%';
  const r = [];
  if (lk.nutmeg) r.push(`nutmeg from Banda ${lk.nutmeg} t`); if (lk.cloves) r.push(`smuggled cloves ${lk.cloves} t`); if (lk.cinnamon) r.push(`Portuguese cinnamon ${lk.cinnamon} t`);
  $('fine-rivals').textContent = r.length ? `Rivals still sell, per year: ${r.join(', ')}.` : 'No one else sells fine spices in Europe. You set the price, as long as you hold back supply.';
  $('aims').innerHTML = AIMS.map(a => {
    const t = S.mono[a.id];
    const st = t === -1 ? '<span class="pill lost">Lost</span>' : t ? `<span class="pill done">Secured ${yearOf(t)}</span>` : '<span class="pill">Open</span>';
    return `<li><span class="nm">${a.name}<small>${a.where}</small></span>${st}<span class="hw">${t ? `Historically ${a.hist}.` : a.how + ` Historically ${a.hist}.`}</span></li>`;
  }).join('') + `<li><span class="nm">Pepper<small>Java, Sumatra, Malabar</small></span><span class="pill">Never</span><span class="hw">Grown too widely to control. The English kept buying it in Sumatra and Malabar.</span></li>`;
}

// ---------- canvases ----------
function sizeCanvases() {
  const dpr = window.devicePixelRatio || 1;
  for (const c of [$('map'), $('spark'), $('bars')]) {
    const r = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
  }
  drawMap(); drawSpark(); drawBars();
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
  $('share-range').textContent = `high ${Math.round(Math.max(...h))}% · dashed line = face value`;
}
// Equirectangular view: lon -40..147, lat 68..-49 (aspect 16:10)
const VIEW = { lon0: -40, lonSpan: 187, lat0: 68, latSpan: 117 };
const proj = ([lon, lat]) => [(lon - VIEW.lon0) / VIEW.lonSpan, (VIEW.lat0 - lat) / VIEW.latSpan];
const PORTS = { texel: [4.8, 53.0], cape: [18.4, -33.9], batavia: [106.8, -6.2] };
const LAND = [
  // Eurasia
  [[5,72],[150,72],[150,60],[140,54],[135,45],[129,40],[129.4,35.2],[126.5,34.4],[125,38.5],[121.5,40.5],[122.5,37],[120.5,34],[121.8,31],[119.5,25.5],[116,22.8],[113.5,22.2],[110,21],[108,21.5],[106.5,18],[109.2,13],[107,10.5],[104.8,8.6],[104.5,10.5],[101,13],[100,7.5],[103.4,1.3],[101,3],[98.3,8],[97.7,16.5],[94.3,16.5],[92.3,21],[89,22],[86.9,21],[85,19.5],[80.3,15.5],[80,10.5],[77.5,8],[76,10],[74,15],[72.8,19],[72.5,21.5],[70,22.5],[67,24.8],[61.5,25.2],[57.5,25.5],[56.4,26.4],[54,24.2],[51.5,24],[50,26.5],[48,29.8],[49.5,27],[51.6,25.9],[52.6,24],[56,24.8],[56.5,24],[59.8,22.5],[57.5,18.7],[55.5,17.5],[52.2,16],[48.5,14],[45,12.8],[43.4,12.7],[42.7,15.5],[39.2,21.5],[36.5,26],[34.8,28.3],[34.3,30.4],[32.6,30],[32.3,31.3],[34.3,31.3],[35.1,33.2],[36,35.8],[34,36.2],[30.5,36.4],[27.3,37],[26.2,39.8],[26.5,40.8],[23,40.4],[23.8,38],[21.7,36.8],[21,39.5],[19.5,41.5],[16,43.4],[13.6,45.6],[12.3,44.3],[14.3,42.4],[18.5,40.2],[16.6,38],[15.7,40],[12.3,41.8],[10.2,43.9],[8.8,44.4],[6.5,43.1],[3.2,43.2],[3.1,41.9],[0.9,41],[-0.4,39.4],[-0.7,37.6],[-2.2,36.7],[-5.4,36.1],[-6.4,36.8],[-8.9,37],[-8.7,40.8],[-9.3,43.1],[-8,43.7],[-1.8,43.4],[-1.2,46],[-2.6,47.4],[-4.6,48.4],[-1.6,48.7],[1.4,50.1],[2.5,51.1],[4.2,51.5],[4.6,52.9],[5.6,53.4],[8.5,53.6],[8.6,55.5],[8.1,56.9],[10.4,57.6],[10.6,56.2],[12.5,55.7],[12.8,54.4],[14.3,53.9],[19.5,54.4],[21.2,55.2],[21,57.1],[23.7,57.3],[24.4,59.5],[28.5,60],[22.9,59.8],[21.4,60.8],[21.5,61.8],[25.4,65.2],[22,65.9],[17.5,62.3],[18.9,59.8],[16.4,57.3],[14.6,56],[12.7,56.4],[11.1,58.9],[8,58.1],[5.6,58.9],[5,62],[10,64],[14,67],[18,70]],
  // Africa
  [[-17,21],[-17.4,14.7],[-15.1,10.9],[-13.1,8.4],[-11.3,6.6],[-7.5,4.4],[-2,4.8],[1.6,6.2],[4.7,6.2],[6.9,4.4],[9,3.9],[9.6,2],[9.3,-0.9],[11.9,-5],[13.3,-8.8],[13.6,-12],[11.8,-17],[14.5,-22.9],[15.1,-26.7],[16.5,-28.6],[18.4,-34.2],[20,-34.8],[22.5,-34],[25.6,-34],[27.9,-33],[30.9,-30],[32.4,-28.6],[32.9,-26],[35.5,-24],[35.4,-22],[34.8,-20],[36.9,-17.9],[40.5,-15.3],[40.4,-10.5],[39.3,-6.8],[39.8,-3.8],[41.6,-1.6],[44.1,1.2],[47.5,4.6],[49.7,8.6],[51.3,11.8],[48.9,11.3],[45.2,10.6],[43.3,11.8],[42.8,12.6],[41.2,14.6],[39.3,15.8],[38.5,18],[37.4,19.4],[36.9,22],[35.6,23.9],[34.1,26.4],[33.2,28.1],[32.6,29.9],[32.3,31.3],[29.7,31.2],[25.2,31.6],[20.1,30.9],[19.6,30.4],[15.2,32.3],[11.1,33.3],[10.3,36.9],[8.4,36.9],[3.2,36.8],[-1.2,35.3],[-5.9,35.8],[-6.8,34],[-9.6,30.4],[-13.2,27.6],[-16,23.7]],
  [[49.3,-12],[50.4,-15.5],[49.5,-17],[47.1,-24.9],[45.2,-25.5],[43.7,-23.5],[43.3,-21.5],[44.3,-18],[44,-16.6],[46.3,-15.7],[47.9,-13.6]],
  [[-5.7,50.1],[1.4,51.3],[1.7,52.7],[0.2,53.5],[-0.3,54.6],[-1.6,55.6],[-2,57.6],[-3.8,57.6],[-3,58.6],[-5,58.6],[-6.2,56.5],[-5.2,55.2],[-4.8,54.8],[-3.1,54.9],[-3.2,53.4],[-4.6,53.3],[-4.2,52.3],[-5.3,51.7],[-3.2,51.4],[-4.2,51.2]],
  [[-6,52.2],[-6.1,54],[-5.6,54.6],[-7.3,55.3],[-8.5,54.4],[-10.1,54.2],[-9.9,53.4],[-10.4,51.9],[-9.7,51.5],[-8.3,51.8]],
  [[-24.3,65.6],[-22,66.4],[-16,66.5],[-13.6,65.1],[-15,64.2],[-18.8,63.4],[-22.7,63.8]],
  [[-50,0.5],[-48,-1],[-44.3,-2.5],[-41,-2.9],[-38.5,-3.7],[-35.3,-5.2],[-34.8,-7.5],[-35.3,-9.4],[-37.1,-11],[-38.9,-13.4],[-39.1,-17.6],[-40.3,-20.3],[-41,-22],[-42.5,-23],[-44.6,-23.4],[-48,-25.5],[-48.6,-28.4],[-50,-30],[-52,-33],[-55,-35]],
  [[79.9,9.7],[81.2,8.5],[81.9,7.5],[81.7,6.4],[80.6,5.9],[80,6.3],[79.8,8]],
  [[95.3,5.6],[97.5,5.2],[98.6,3.9],[100.4,2.3],[103.8,0.1],[104.6,-1.8],[106.1,-3.1],[105.9,-5.9],[104.6,-5.9],[102.3,-4],[100.9,-2.6],[99.3,0],[98.6,1.7],[96.4,3.8]],
  [[105.2,-6.8],[106.4,-6],[108.5,-6.4],[111,-6.4],[112.6,-6.9],[114.4,-7.7],[114.5,-8.7],[112,-8.4],[108.6,-7.8],[106.4,-7.4]],
  [[109,1.5],[109.7,2],[111.2,2.7],[113,3.3],[115.4,5.1],[116.7,6.9],[117.7,6.4],[119.2,5.3],[118,4.4],[117.8,1.8],[119,0.9],[117.5,0.1],[116.6,-1.5],[116.4,-3.9],[114.6,-4.1],[113,-3.2],[111.7,-3],[110.2,-1.7],[109.1,-0.4]],
  [[119.4,-5.5],[120.4,-5.6],[120.4,-2.8],[121.4,-4.3],[122.7,-5.3],[123.2,-4.7],[122.2,-3.4],[121.4,-2.3],[123.1,-1],[121.6,-0.9],[120.9,0.4],[123,0.5],[124.4,0.4],[125.2,1.4],[124.6,1.6],[122.8,0.9],[120.2,0.9],[119.7,-0.3],[119.2,-2.7],[119.5,-3.5]],
  [[127.9,-3.1],[129.6,-2.8],[130.8,-3.3],[130.6,-3.8],[129.1,-3.5],[128.2,-3.6]],
  [[127.4,1.8],[128.2,2.3],[128.6,1.6],[128.1,0.9],[128.5,0.3],[127.9,-0.6],[127.4,0.6]],
  [[131,-1.2],[132.4,-0.4],[134,-0.9],[135.4,-3.3],[137.9,-1.5],[141,-2.6],[145.7,-4.8],[147.6,-6.1],[148.3,-8.6],[146,-8.1],[143.4,-9],[141,-9.1],[139,-8.1],[138,-7.6],[137.8,-5.3],[135.1,-4.4],[133.2,-4],[132,-2.8]],
  [[113.4,-21.8],[113.9,-26],[115,-33.6],[115.7,-34.4],[118,-35],[121.9,-33.9],[124,-33],[129,-31.7],[131.3,-31.5],[134.2,-32.7],[136,-35],[138,-34.3],[138.1,-35.6],[139.6,-37.4],[141.6,-38.4],[143.6,-38.8],[146.4,-39.1],[148,-37.8],[152,-37],[153.6,-28.2],[153,-25],[150,-22.4],[147,-19.2],[145.4,-14.9],[143.4,-12.6],[142.5,-10.7],[141.6,-12.6],[141.5,-15.8],[140.6,-17.5],[139.2,-17.4],[137,-15.9],[135.4,-14.8],[136.8,-12.3],[135.9,-11.9],[133,-11.3],[131,-12.2],[129.4,-14.4],[128.1,-15],[126.1,-14.1],[124.4,-16.3],[122.3,-17.2],[121.7,-18.7],[119,-20],[116.7,-20.6]],
  [[129.7,33.1],[130.2,31.4],[131.4,31.4],[132,33.2],[133.3,33.4],[135.1,33.8],[136.8,34.4],[138.8,34.7],[140.9,35.7],[141,38.3],[142,39.6],[141.4,41.4],[139.9,40.6],[140,39.4],[139,38],[137.2,36.8],[136.7,37.3],[136.1,36],[133.2,35.5],[131.4,34.4]],
  [[140,41.5],[141.6,42.6],[143.3,42],[145.5,43.3],[144.5,44],[141.8,45.4],[141.2,43.2],[140.3,42.9]],
  [[121.9,25.2],[121.8,24.1],[120.9,22],[120.1,23.1],[120.7,24.6]],
  [[108.7,19.6],[110.5,20.1],[111,19.6],[110.1,18.4],[109.3,18.3]],
  [[120.6,18.5],[122.3,18.4],[122.2,16.2],[121.6,15.9],[121.7,14.2],[124,13.7],[124.1,12.5],[122.7,13.2],[120.6,14.2],[120,16]],
  [[122,7],[123.6,7.8],[125.4,7.1],[126.5,7.3],[126.4,8.5],[125.5,9.8],[123.7,8.6],[122.1,7.8]],
  [[123.9,-10.2],[125,-9],[127.3,-8.4],[126.4,-9.2],[124.4,-10.2]],
];
const LABEL = { bantam: ['right', -7, -5], priangan: ['left', 7, 13], ambon: ['left', 7, -6], banda: ['left', 7, 12], japan: ['right', -7, -6], coromandel: ['left', 7, 4], bengal: ['right', -7, -6], ceylon: ['right', -7, 10], malacca: ['right', -7, -5], mocha: ['right', -7, -6], canton: ['right', -7, -6], formosa: ['left', 7, -2], cape: ['left', 8, 14] };
const ROUTE_A = [[4.8,53],[3,51.6],[0.5,50.6],[-5.5,49.2],[-11,44],[-17,33],[-23,18],[-27,6],[-30,-6],[-31,-18],[-26,-28],[-12,-35],[4,-37],[18.4,-34.8]];
const ROUTE_OLD = [[18.4,-34.8],[30,-35],[37,-28],[41,-20],[43,-12],[50,-7],[64,-4],[80,-4],[93,-5],[101,-7.7],[105.4,-6.4],[106.8,-6.2]];
const ROUTE_BROUWER = [[18.4,-34.8],[32,-39],[60,-41],[88,-40],[101,-33],[104.5,-20],[105.2,-9],[105.6,-6.5],[106.8,-6.2]];
let routeCache = null;
function route() {
  const key = S.flags.brouwer ? 'b' : 'o';
  if (routeCache && routeCache.key === key) return routeCache;
  const pts = ROUTE_A.concat((S.flags.brouwer ? ROUTE_BROUWER : ROUTE_OLD).slice(1)).map(proj);
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], (pts[i][1] - pts[i - 1][1]) * 0.625));
  routeCache = { key, pts, len, total: len[len.length - 1] };
  return routeCache;
}
function routePoint(p) {
  const r = route(), d = clamp(p, 0, 1) * r.total;
  let i = 1; while (i < r.len.length - 1 && r.len[i] < d) i++;
  const u = (d - r.len[i - 1]) / ((r.len[i] - r.len[i - 1]) || 1);
  return [r.pts[i - 1][0] + (r.pts[i][0] - r.pts[i - 1][0]) * u, r.pts[i - 1][1] + (r.pts[i][1] - r.pts[i - 1][1]) * u];
}
function drawMap() {
  const c = $('map'); if (!c || !S) return;
  const x = c.getContext('2d'), W = c.width, H = c.height, dpr = window.devicePixelRatio || 1;
  const P = ([u, v]) => [u * W, v * H];
  const G = ll => P(proj(ll));
  x.clearRect(0, 0, W, H);
  const rule = cssVar('--rule'), rule2 = cssVar('--rule-2'), delft = cssVar('--delft'), brass = cssVar('--brass'), ink = cssVar('--ink'), ink2 = cssVar('--ink-2'), ink3 = cssVar('--ink-3'), loss = cssVar('--loss');
  // graticule every 20°
  x.strokeStyle = rule2; x.lineWidth = 1;
  for (let lon = -40; lon <= 140; lon += 20) { const [a] = G([lon, 0]); x.beginPath(); x.moveTo(a, 0); x.lineTo(a, H); x.stroke(); }
  for (let lat = -40; lat <= 60; lat += 20) { const [, b] = G([0, lat]); x.beginPath(); x.moveTo(0, b); x.lineTo(W, b); x.stroke(); }
  // land
  x.fillStyle = cssVar('--land'); x.strokeStyle = cssVar('--land-edge'); x.lineWidth = 0.8 * dpr; x.lineJoin = 'round';
  for (const poly of LAND) { x.beginPath(); poly.forEach((ll, i) => { const [a, b] = G(ll); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.closePath(); x.fill(); x.stroke(); }
  // equator
  x.setLineDash([2 * dpr, 4 * dpr]); x.strokeStyle = rule; const [, eq] = G([0, 0]); x.beginPath(); x.moveTo(0, eq); x.lineTo(W, eq); x.stroke(); x.setLineDash([]);
  x.fillStyle = ink3; x.font = `italic ${Math.round(12.5 * dpr)}px "IM Fell DW Pica", Georgia, serif`; x.textAlign = 'center';
  let [a0, b0] = G([-24, 28]); x.fillText('Oceanus', a0, b0); x.fillText('Atlanticus', a0, b0 + 14 * dpr);
  [a0, b0] = G([75, -22]); x.fillText('Mare Indicum', a0, b0);
  [a0, b0] = G([20, 8]); x.fillText('Africa', a0, b0);
  [a0, b0] = G([40, 55]); x.fillText('Europa', a0, b0);
  [a0, b0] = G([90, 40]); x.fillText('Asia', a0, b0);
  if (S.flags.brouwer) { [a0, b0] = G([62, -45]); x.fillText('the roaring forties', a0, b0); }
  // route
  x.setLineDash([5 * dpr, 4 * dpr]); x.strokeStyle = delft; x.globalAlpha = 0.45; x.lineWidth = 1.4 * dpr; x.beginPath();
  route().pts.forEach((pt, i) => { const [a, b] = P(pt); i ? x.lineTo(a, b) : x.moveTo(a, b); });
  x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
  // posts
  const y = yearOf(S.t), known = S.report ? S.report.posts : [];
  const open = foundablePosts(S, y);
  const [ba, bb] = G(PORTS.batavia);
  for (const id in POSTS) {
    const p = POSTS[id]; const has = known.includes(id) || (id === 'cape' && S.asia.posts.cape);
    const can = open.includes(id) && !has;
    if (!has && !can) continue;
    const [a, b] = G([p.lon, p.lat]);
    if (has && id !== 'cape') { x.strokeStyle = brass; x.globalAlpha = 0.35; x.lineWidth = 1.1 * dpr; x.beginPath(); x.moveTo(ba, bb); x.lineTo(a, b); x.stroke(); x.globalAlpha = 1; }
    x.beginPath(); x.arc(a, b, 3.6 * dpr, 0, 7);
    if (has) { x.fillStyle = brass; x.fill(); } else { x.fillStyle = cssVar('--chart'); x.fill(); x.strokeStyle = brass; x.lineWidth = 1.4 * dpr; x.stroke(); }
    const [al, dx, dy] = LABEL[id] || ['left', 7, -5];
    x.fillStyle = has ? ink : ink3; x.font = `${Math.round(11 * dpr)}px Spectral, Georgia, serif`; x.textAlign = al;
    x.fillText(p.name, a + dx * dpr, b + dy * dpr);
  }
  for (const [k, label, al, dx, dy] of [['texel', 'Texel', 'left', 8, -6], ['cape', S.asia.posts.cape ? '' : 'Cape of Good Hope', 'left', 8, 14], ['batavia', S.flags.batavia ? 'Batavia' : '', 'left', 8, -7]]) {
    const [a, b] = G(PORTS[k]);
    x.fillStyle = delft; x.beginPath(); x.arc(a, b, 4.6 * dpr, 0, 7); x.fill();
    if (label) { x.fillStyle = ink; x.font = `${Math.round(13.5 * dpr)}px "IM Fell DW Pica", Georgia, serif`; x.textAlign = al; x.fillText(label, a + dx * dpr, b + dy * dpr); }
  }
  // ships
  let harbour = 0, asia = 0;
  const tex = proj(PORTS.texel), bat = proj(PORTS.batavia);
  for (const sh of S.ships) {
    const v = viewOf(sh);
    let pos, dir = 1, col = delft;
    if (v.kind === 'harbour') { pos = [tex[0] - 0.012 - 0.011 * (harbour % 6), tex[1] + 0.03 + 0.028 * Math.floor(harbour / 6)]; harbour++; }
    else if (v.kind === 'out') pos = routePoint(v.p);
    else if (v.kind === 'home') { pos = routePoint(v.p); dir = -1; col = brass; }
    else if (v.kind === 'asia') { const k = asia++; pos = [bat[0] - 0.035 - 0.012 * (k % 8), bat[1] + 0.07 + 0.026 * Math.floor(k / 8)]; }
    else if (v.kind === 'lost' && S.t - sh.revealT < 60) { pos = sh.state === 'lostOut' ? bat : tex; col = loss; }
    else continue;
    const [a, b] = P(pos);
    let ang = v.kind === 'asia' || v.kind === 'harbour' ? (v.kind === 'asia' ? Math.PI : 0) : 0;
    if (v.kind === 'out' || v.kind === 'home') { const [a2, b2] = P(routePoint(clamp(v.p + 0.01 * dir, 0, 1))); ang = Math.atan2(b2 - b, a2 - a); }
    x.save(); x.translate(a, b); x.rotate(ang); x.fillStyle = col; x.strokeStyle = cssVar('--chart'); x.lineWidth = 1 * dpr;
    x.beginPath(); x.moveTo(6.5 * dpr, 0); x.lineTo(-4.5 * dpr, -4 * dpr); x.lineTo(-4.5 * dpr, 4 * dpr); x.closePath(); x.fill(); x.stroke(); x.restore();
  }
}

// ---------- modals ----------
function showSheet(html) { $('sheet').innerHTML = html; $('modal').hidden = false; modalOpen = true; const b = $('sheet').querySelector('button'); if (b) b.focus(); }
function closeSheet() { $('modal').hidden = true; modalOpen = false; }
function pauseForModal() { if (S.speed) resumeSpeed = S.speed; S.speed = 0; }
function openQueued() {
  if (modalOpen) return;
  if (S.ended) { showEnd(); return; }
  if (!S.queue.length) return;
  const id = S.queue.shift(); const e = EVENT_BY_ID[id]; if (!e) return;
  const wasRunning = S.speed > 0 || id !== 'founding';
  pauseForModal();
  const info = e.choices.length === 1 && !e.choices[0].fx;
  const when = id === 'founding' ? '20 March 1602' : fmtDate(S.t);
  const im = typeof EVENT_IMAGES !== 'undefined' && EVENT_IMAGES[id];
  const fig = im ? `<figure class="plate"><img src="${im.src}" alt="${esc(im.title)}" onerror="this.closest('figure').remove()"><figcaption><i>${esc(im.title)}</i>, ${esc(im.maker)}, ${esc(im.date)}. <a href="${im.page}" target="_blank" rel="noopener">Rijksmuseum ${esc(im.obj)}</a></figcaption></figure>` : '';
  showSheet(`${fig}<div class="when">${when}</div><h3 id="m-title">${e.title}</h3><div class="body">${e.body(S)}</div>
    ${info ? `<div class="hist"><b>Historical note</b>${e.history}</div><div class="actions"><button type="button" class="btn" data-c="0">${e.choices[0].label}</button></div>`
      : `<div class="choices">${e.choices.map((c, i) => `<button type="button" class="choice" data-c="${i}"><b>${c.label}</b>${c.hint ? `<span>${c.hint}</span>` : ''}</button>`).join('')}</div>`}`);
  $('sheet').querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
    const c = e.choices[+b.dataset.c];
    if (info) { closeSheet(); S.speed = wasRunning ? resumeSpeed : 5; if (id === 'founding' && tutActive()) { S.speed = 0; render(); tutStart(); return; } render(); openQueued(); return; }
    track('event_choice', { event: id, choice: +b.dataset.c, label: c.label });
    const out = c.fx ? c.fx(S) : '';
    $('sheet').querySelector('.choices').outerHTML = `${out ? `<p class="outcome">${out}</p>` : ''}<div class="hist"><b>What actually happened</b>${e.history}</div><div class="actions"><button type="button" class="btn" id="m-go">Continue</button></div>`;
    $('m-go').focus();
    $('m-go').addEventListener('click', () => { closeSheet(); S.speed = resumeSpeed; render(); openQueued(); });
  }));
}
function showAudit(a) {
  pauseForModal();
  const ratio = a.equity / a.mcap;
  showSheet(`<div class="when">${fmtDate(S.t)}</div><h3 id="m-title">An audit of the Company</h3>
    <div class="body"><p>The Company has never drawn up a single balance sheet. Amsterdam keeps its own books; Batavia keeps others, and they reach Holland a year late. Your clerks have tried to add them up.</p>
    <dl class="kv"><dt>Cash in Amsterdam</dt><dd>${money(a.cash)}</dd><dt>Debt</dt><dd class="neg">${money(-a.debt)}</dd>
    <dt>Goods in the warehouse</dt><dd>${money(a.whv)}</dd><dt>Silver and goods in Asia${a.rdate ? `, as of ${fmtMon(a.rdate)}` : ''}</dt><dd>${money(a.asv)}</dd>
    <dt><b>Estimated worth</b></dt><dd><b>${money(a.equity)}</b></dd><dt>What the market pays for the shares</dt><dd>${money(a.mcap)}</dd></dl>
    <p style="margin-top:10px">${ratio < 0.6 ? 'The shares trade far above anything the books can show. The figures leak out, and the price slips.' : 'The books roughly support the share price. Shareholders are reassured.'}</p></div>
    <div class="hist"><b>Historical note</b>The VOC never produced consolidated accounts. In the 1720s its shares traded around six times face value, while profit as a share of turnover was falling from about 18% toward 2–3%.</div>
    <div class="actions"><button type="button" class="btn" id="m-go">Close</button></div>`);
  $('m-go').addEventListener('click', () => { closeSheet(); S.speed = resumeSpeed; render(); });
}
function showEnd() {
  S.speed = 0; hideCoach();
  if (!S.endTracked) {
    try { const runs = JSON.parse(localStorage.getItem('retourvloot.runs') || '[]'); runs.push({ endYear: yearOf(S.t), reason: S.endReason || 'charter', avgDiv: +(S.stats.divPaid / NOMINAL * 100 / Math.max(1, S.stats.divYears)).toFixed(1), debt: Math.round(S.debt), monopolies: AIMS.filter(a => S.mono[a.id] > 0).length, voyages: S.stats.voyages, at: Date.now() }); localStorage.setItem('retourvloot.runs', JSON.stringify(runs.slice(-20))); } catch (e) {}
  }
  if (!S.endTracked) { S.endTracked = true; track('game_end', { reason: S.endReason || 'charter', debt: Math.round(S.debt), cash: Math.round(S.cash), dividends: Math.round(S.stats.divPaid), monopolies: AIMS.filter(a => S.mono[a.id] > 0).length, voyages: S.stats.voyages }); }
  const yrs = Math.max(1, S.stats.divYears);
  const bankrupt = S.endReason === 'bankrupt';
  showSheet(`<div class="when">${fmtDate(S.t)}</div><h3 id="m-title">${bankrupt ? 'The States take over' : 'The charter expires'}</h3>
    <div class="body"><p>${bankrupt ? 'Your debts have passed ƒ120 million. No lender will touch Company paper, and the States General take control of its affairs.' : 'On 31 December 1799 the charter lapses. The Batavian state takes over the Company\'s possessions in Asia, and its debts.'}</p>
    <div class="endgrid">
      <span>Voyages sent</span><b class="num">${num(S.stats.voyages)} (${num(S.stats.lost)} lost)</b>
      <span>Silver shipped east</span><b class="num">${money(S.stats.silver)}</b>
      <span>Auction sales</span><b class="num">${money(S.stats.auction)}</b>
      <span>Dividends paid</span><b class="num">${money(S.stats.divPaid)} · avg ${(S.stats.divPaid / NOMINAL * 100 / yrs).toFixed(1)}%/yr</b>
      <span>Debt left to the state</span><b class="num neg">${money(S.debt)}</b>
      <span>Men sent east</span><b class="num">${num(S.humans.sent)}</b>
      <span>Died at sea or in Asia</span><b class="num neg">${num(S.humans.diedSea + S.humans.diedAsia)}</b>
      <span>Came home</span><b class="num">${num(S.humans.returned)} (${S.humans.sent ? Math.round(S.humans.returned / S.humans.sent * 100) : 0}%)</b>
    </div></div>
    <div class="hist"><b>The real Company</b>About a million people sailed east for the VOC between 1602 and 1795; roughly a third came home. It paid an average dividend of around 18% a year on its original capital, from 1730 mostly with money it did not earn. At nationalisation its debt is usually put at about ƒ120 million; sources vary.</div>
    <div data-hl-next></div>
    <div class="actions"><button type="button" class="btn" id="m-new">Start a new company</button></div>`);
  $('m-new').addEventListener('click', () => { S = newState(); save(); closeSheet(); syncInputs(); render(); track('game_start', { restart: true }); openQueued(); });
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
  if (ts - lastSave > 5000) { lastSave = ts; save(); }
  requestAnimationFrame(frame);
}

function start(data) {
  S = (data && data.S) || load() || newState();
  if (!S.release || !S.books || !S.mono || !S.news || !S.dynCount) S = newState();
  _S = S;
  if (!S.tut) S.tut = { i: 0, done: true, seen: {}, ctxOn: false };
  modalOpen = false;
  buildStatic(); syncInputs(); render();
  window.HL_FEEDBACK_CONTEXT = () => S ? `${fmtDate(S.t)} · cash ${money(S.cash)} · debt ${money(S.debt)} · share ${Math.round(S.share)}% · ${S.stats.voyages} voyages` : '';
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ S }));
  if (S.speed) resumeSpeed = S.speed;
  if (S.queue[0] === 'founding') track('game_start', { restart: false }); else track('game_resume');
  openQueued();
  if (tutActive() && !S.queue.length && !modalOpen) tutStart();
  window.addEventListener('scroll', positionCoach, { passive: true }); window.addEventListener('resize', positionCoach);
  $('credits').addEventListener('click', showCredits);
  const sn = $('small-screen'); let dismissed = false; try { dismissed = sessionStorage.getItem('rv-small') === '1'; } catch (e) {}
  if (window.innerWidth < 900 && !dismissed) { sn.hidden = false; $('small-go').addEventListener('click', () => { sn.hidden = true; try { sessionStorage.setItem('rv-small', '1'); } catch (e) {} }); }
  requestAnimationFrame(frame);
}
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
