/* Homo Ludens "next game" card. Include with:
   <script src="/next.js" defer data-game="borderlines|retourvloot|cupoftea|polder|kantar|tulip"></script>
   Then put <div data-hl-next></div> anywhere in a game's end screen (static or added later): it is filled in
   automatically with one other game to play next, plus links to all games and the Homo Ludens Discord. data-hl-lang="tr" gives Turkish labels.
   Choice: a game this browser has not played yet comes first; on a phone, games marked "devices": "desktop"
   in games.json come last; ties follow the hand-picked order in NEXT.
   data-base="https://…" (platform packages): load games.json from the site and open games there in a new tab.
   Events: next_game_shown (the card came into view), next_game_clicked {from, to, unplayed}. */
(function () {
  var me = document.currentScript;
  var GAME = (me && me.getAttribute('data-game')) || '';
  var BASE = ((me && me.getAttribute('data-base')) || '').replace(/\/$/, '');
  var DISCORD = 'https://discord.gg/7PcDfAMdr5';
  var DC_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1A19.7 19.7 0 0 0 6.1 21l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.6 19.6 0 0 0 6-3c.5-5.2-.9-9.7-3.6-13.6zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>';
  var TARGET = BASE ? ' target="_blank" rel="noopener"' : '';
  // games that pair well, in order of preference
  var NEXT = {
    borderlines: ['kantar', 'tulip', 'polder', 'cupoftea', 'retourvloot'],
    retourvloot: ['tulip', 'cupoftea', 'kantar', 'polder', 'borderlines'],
    cupoftea: ['retourvloot', 'tulip', 'kantar', 'borderlines', 'polder'],
    polder: ['tulip', 'retourvloot', 'borderlines', 'kantar', 'cupoftea'],
    kantar: ['tulip', 'borderlines', 'retourvloot', 'cupoftea', 'polder'],
    tulip: ['kantar', 'retourvloot', 'polder', 'borderlines', 'cupoftea']
  };
  // localStorage keys that mean "this browser has played it"
  var PLAYED = {
    borderlines: /^borderlines:(day:|practice|tutorialDone)/,
    retourvloot: /^retourvloot\.(v1|runs)$/,
    cupoftea: /^cupoftea\.v1$/,
    polder: /^polder\.(progress|run)\.v1$/,
    kantar: /^kantar(\.stats\.v1|-game-v04)$/,
    tulip: /^tulip7\.(save\.v1|record\.v1)$/
  };
  var T = {
    en: { kicker: 'Next at Homo Ludens', play: 'Play', all: 'All games', dc: 'Chat on the Homo Ludens Discord', any: 'Any screen', desk: 'Best on a desktop', fresh: 'New to you' },
    tr: { kicker: 'Homo Ludens’ta sırada', play: 'Oyna', all: 'Tüm oyunlar', dc: 'Homo Ludens Discord’unda sohbet et', any: 'Her ekranda', desk: 'Masaüstünde daha iyi', fresh: 'Henüz oynamadın' }
  };

  var css = '\
.hln{margin:18px 0 0;font:inherit;color:inherit;text-align:left}\
.hln a{color:inherit}\
.hln-card{display:flex;gap:14px;align-items:center;padding:10px;border:1px solid rgba(128,128,128,.4);border-radius:4px;background:rgba(128,128,128,.08);text-decoration:none}\
.hln-card:hover{background:rgba(128,128,128,.16)}\
.hln-card:focus-visible{outline:2px solid currentColor;outline-offset:2px}\
.hln-card img{flex:none;width:120px;height:63px;object-fit:cover;border-radius:2px;display:block}\
.hln-t{display:grid;gap:3px;min-width:0;flex:1}\
.hln-k{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7}\
.hln-t b{font-size:18px;line-height:1.15;font-weight:600}\
.hln-s{font-size:13px;line-height:1.35;opacity:.85;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\
.hln-m{font-size:11.5px;opacity:.7}\
.hln-go{flex:none;font-weight:600;font-size:14px;padding:8px 12px;border:1px solid currentColor;border-radius:3px}\
.hln-links{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:6px;font-size:12.5px}\
.hln-all,.hln-dc{display:inline-flex;align-items:center;gap:5px;opacity:.75;min-height:24px}\
.hln-all:hover,.hln-dc:hover{opacity:1}\
.hln-dc svg{width:15px;height:15px;fill:currentColor;flex:none}\
@media (max-width:520px){.hln-card img{width:72px;height:72px}.hln-go{display:none}}';

  var gamesP = null;
  function games() {
    if (!gamesP) gamesP = fetch(BASE + '/games.json').then(function (r) { return r.json(); }).catch(function () { gamesP = null; return []; });
    return gamesP;
  }
  function played(id) {
    var re = PLAYED[id];
    if (!re) return false;
    try { for (var i = 0; i < localStorage.length; i++) if (re.test(localStorage.key(i))) return true; } catch (e) {}
    return false;
  }
  function small() {
    try { return matchMedia('(max-width: 760px), (pointer: coarse)').matches; } catch (e) { return false; }
  }
  function pick(list) {
    var order = NEXT[GAME] || list.map(function (g) { return g.id; });
    var phone = small();
    var c = list.filter(function (g) { return g.id !== GAME && g.url; }).map(function (g) {
      var i = order.indexOf(g.id), fresh = !played(g.id);
      var s = (fresh ? 20 : 0) + (phone && g.devices === 'desktop' ? -40 : 0) - (i < 0 ? 9 : i);
      return { g: g, s: s, fresh: fresh };
    });
    c.sort(function (a, b) { return b.s - a.s; });
    return c[0];
  }
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function capture(name, props, beacon) {
    try { if (window.posthog && posthog.capture) posthog.capture(name, props, beacon ? { transport: 'sendBeacon' } : undefined); } catch (e) {}
  }

  function fill(el) {
    if (el.getAttribute('data-hl-done')) return;
    el.setAttribute('data-hl-done', '1');
    var L = T[el.getAttribute('data-hl-lang') === 'tr' ? 'tr' : 'en'];
    games().then(function (list) {
      var p = pick(list || []);
      if (!p || !el.isConnected) return;
      var g = p.g, meta = [g.length, g.devices === 'any' ? L.any : L.desk];
      if (p.fresh) meta.unshift(L.fresh);
      el.className = (el.className ? el.className + ' ' : '') + 'hln';
      el.innerHTML = '<a class="hln-card" href="' + esc(BASE + g.url) + '"' + TARGET + '>' +
        (g.image ? '<img src="' + esc(BASE + g.image) + '" alt="" loading="lazy">' : '') +
        '<span class="hln-t"><span class="hln-k">' + esc(L.kicker) + '</span><b>' + esc(g.title) + '</b><span class="hln-s">' + esc(g.short) + '</span>' +
        '<span class="hln-m">' + esc(meta.filter(Boolean).join(' · ')) + '</span></span><span class="hln-go">' + esc(L.play) + ' →</span></a>' +
        '<span class="hln-links"><a class="hln-all" href="' + esc(BASE + '/') + '"' + TARGET + '>' + esc(L.all) + '</a>' +
        '<a class="hln-dc" href="' + DISCORD + '" target="_blank" rel="noopener">' + DC_SVG + esc(L.dc) + '</a></span>';
      var props = { from: GAME, to: g.id, unplayed: p.fresh };
      el.querySelector('.hln-card').addEventListener('click', function () { capture('next_game_clicked', props, true); });
      el.querySelector('.hln-dc').addEventListener('click', function () { capture('discord_click', { game: GAME, page: location.pathname, from: 'next_card' }, true); });
      el.querySelector('.hln-all').addEventListener('click', function () { capture('next_game_clicked', { from: GAME, to: 'portal', unplayed: false }, true); });
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) {
          if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); capture('next_game_shown', props); }
        });
        io.observe(el);
      }
    });
  }
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('[data-hl-next]')) fill(root);
    var l = root.querySelectorAll('[data-hl-next]');
    for (var i = 0; i < l.length; i++) fill(l[i]);
  }
  function init() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    scan(document.body);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { for (var i = 0; i < m.addedNodes.length; i++) scan(m.addedNodes[i]); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
