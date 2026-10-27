/* Homo Ludens shared helpers for every game page. Include with:
     <script src="/hl.js" defer data-game="borderlines|retourvloot|cupoftea|polder|kantar|tulip"></script>
   (platform packages rewrite the path; on CrazyGames sharing is off).

   HL.stamp(game, info)   record a finished game in the Homo Ludens passport (localStorage "hl.passport.v1"),
                          read by the portal. info: { result: 'win'|'loss'|'draw'|'done', label: 'short text',
                          score: number (optional, higher is better), date: 'YYYY-MM-DD' (optional) }.
                          The first stamp of a game shows a small "stamped in your passport" toast.
   HL.passport()          the passport object { v: 1, games: { id: { first, last, plays, wins, best, label } } }.
   HL.canShare            false on CrazyGames (no cross-promotion) and where canvas is missing.
   HL.share(opts)         make a 1200×630 result card and open a share sheet (native share with the image on
                          phones, download / copy elsewhere). Returns a promise. opts:
                            game      id (for analytics and the default link)
                            kicker    small line on top, e.g. "Tulip 7 · Winter 1636"
                            title     main line, e.g. "Cashed in at Alkmaar"
                            big       big figure, e.g. "f2,340"            (optional)
                            sub       line under the figure                  (optional)
                            lines     up to 3 short lines                     (optional)
                            art       same-origin image URL for the right side (optional)
                            accent    CSS colour for the figure and rule      (optional, default #9c2f45)
                            dark      true for a dark card                    (optional)
                            text      the text to share / copy (a link is added if missing)
                            url       link (default: the game's page on the site)
                            lang      'tr' for Turkish labels                 (optional)
   HL.on(el, opts|fn)     wire a share button; fn() returns opts at click time. Hides the button when !canShare.
   Events (PostHog when present): result_shared {game, method}, passport_stamp {game, first}. */
(function () {
  var me = document.currentScript;
  var GAME = (me && me.getAttribute('data-game')) || '';
  var SITE = 'https://homoludens.oalpcakir.workers.dev';
  var KEY = 'hl.passport.v1';
  var P = window.HL_PLATFORM || null;
  var CG = !!(P && P.id === 'crazygames');
  var URLS = { borderlines: '/borderlines/', retourvloot: '/retourvloot/', cupoftea: '/cupoftea/', polder: '/polder/', kantar: '/kantar/', tulip: '/tulip7/' };
  var T = {
    en: { share: 'Share', save: 'Save image', copy: 'Copy text', copied: 'Copied', close: 'Close', title: 'Share your result', stamp: 'Stamped in your Homo Ludens passport', made: 'Made the image' },
    tr: { share: 'Paylaş', save: 'Görseli kaydet', copy: 'Metni kopyala', copied: 'Kopyalandı', close: 'Kapat', title: 'Sonucunu paylaş', stamp: 'Homo Ludens pasaportuna mühür basıldı', made: 'Görsel hazır' }
  };

  function capture(name, props) { try { if (window.posthog && posthog.capture) posthog.capture(name, props); } catch (e) {} }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function read() {
    try { var p = JSON.parse(localStorage.getItem(KEY)); if (p && p.v === 1 && p.games && typeof p.games === 'object') return p; } catch (e) {}
    return { v: 1, games: {} };
  }

  /* ---------------------------------------------------------------- passport */
  function stamp(game, info) {
    game = game || GAME; info = info || {};
    var p = read(), g = p.games[game], first = !g, d = info.date || today();
    if (!g) g = p.games[game] = { first: d, plays: 0, wins: 0 };
    g.last = d; g.plays = (g.plays | 0) + 1;
    if (info.result === 'win') g.wins = (g.wins | 0) + 1;
    if (info.label) g.label = String(info.label).slice(0, 80);
    if (typeof info.score === 'number' && isFinite(info.score) && (g.best == null || info.score > g.best)) { g.best = info.score; if (info.label) g.bestLabel = g.label; }
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { return p; }
    capture('passport_stamp', { game: game, first: first });
    if (first && !CG) toast(T[lang()].stamp);
    return p;
  }
  function lang() { var l = (document.documentElement.lang || '').slice(0, 2); return l === 'tr' ? 'tr' : 'en'; }

  /* ---------------------------------------------------------------- styles */
  var css = '\
.hlx-toast{position:fixed;left:50%;bottom:22px;transform:translate(-50%,20px);opacity:0;z-index:2147483000;display:flex;gap:10px;align-items:center;\
background:#1f2b4a;color:#f7f6f2;font:500 14px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;padding:10px 16px 10px 10px;border-radius:999px;\
box-shadow:0 8px 30px rgba(0,0,0,.3);transition:opacity .3s,transform .3s;pointer-events:none;max-width:calc(100vw - 32px)}\
.hlx-toast.on{opacity:1;transform:translate(-50%,0)}\
.hlx-seal{flex:none;width:30px;height:30px;border-radius:50%;background:#9c2f45;display:grid;place-items:center;font:700 13px Georgia,serif;color:#f7e9d0;\
box-shadow:inset 0 0 0 2px rgba(255,255,255,.25);animation:hlx-stamp .5s cubic-bezier(.2,1.6,.4,1) both}\
@keyframes hlx-stamp{from{transform:scale(2.2) rotate(-20deg);opacity:0}to{transform:none;opacity:1}}\
.hlx-ov{position:fixed;inset:0;z-index:2147483001;background:rgba(15,18,28,.62);display:grid;place-items:center;padding:16px;\
font:15px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2b4a}\
.hlx-box{background:#f7f6f2;border-radius:10px;max-width:560px;width:100%;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.4);max-height:calc(100vh - 32px);overflow:auto}\
.hlx-box h2{font:600 18px Georgia,serif;margin:0 0 12px}\
.hlx-box img{display:block;width:100%;height:auto;border-radius:6px;background:#ddd;aspect-ratio:1200/630}\
.hlx-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}\
.hlx-row button{font:600 14px system-ui,-apple-system,Segoe UI,sans-serif;min-height:44px;padding:0 16px;border-radius:6px;border:1px solid #1f2b4a;background:#fff;color:#1f2b4a;cursor:pointer}\
.hlx-row button.pri{background:#1f2b4a;color:#f7f6f2}\
.hlx-row button:focus-visible{outline:3px solid #9c2f45;outline-offset:2px}\
.hlx-row .sp{flex:1}\
@media (prefers-reduced-motion:reduce){.hlx-toast{transition:opacity .2s;transform:translate(-50%,0)}.hlx-seal{animation:none}}';
  var styled = false;
  function style() { if (styled) return; styled = true; var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }

  function toast(msg) {
    style();
    var t = document.createElement('div'); t.className = 'hlx-toast'; t.setAttribute('role', 'status');
    t.innerHTML = '<span class="hlx-seal">HL</span><span></span>'; t.lastChild.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add('on'); }); });
    setTimeout(function () { t.classList.remove('on'); setTimeout(function () { t.remove(); }, 400); }, 3200);
  }

  /* ---------------------------------------------------------------- the card */
  function loadImg(src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src;
    });
  }
  function wrap(ctx, text, maxW, maxLines) {
    var words = String(text || '').split(/\s+/), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
    return lines;
  }
  function card(o) {
    var W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d'), dark = !!o.dark;
    var bg = dark ? '#18140f' : '#f7f6f2', ink = dark ? '#f3ead8' : '#1f2b4a', mute = dark ? 'rgba(243,234,216,.7)' : 'rgba(31,43,74,.68)', acc = o.accent || (dark ? '#e3b25a' : '#9c2f45');
    var serif = 'Georgia, "EB Garamond", "Times New Roman", serif', sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready.catch(function () {}) : Promise.resolve();
    return Promise.all([loadImg(o.art), ready]).then(function (r) {
      var img = r[0];
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      var textW = 640;
      if (img) {
        // art fills the right part, covered, with a soft fade into the text side
        var aw = W - 480, ah = H, s = Math.max(aw / img.width, ah / img.height), dw = img.width * s, dh = img.height * s;
        x.drawImage(img, 480 + (aw - dw) / 2, (ah - dh) / 2, dw, dh);
        var g = x.createLinearGradient(440, 0, 820, 0); g.addColorStop(0, bg); g.addColorStop(1, dark ? 'rgba(24,20,15,0)' : 'rgba(247,246,242,0)');
        x.fillStyle = g; x.fillRect(440, 0, 400, H);
        x.fillStyle = bg; x.fillRect(0, 0, 450, H);
      } else textW = 1040;
      var L = 64, y = 92;
      x.textBaseline = 'alphabetic';
      x.fillStyle = mute; x.font = '600 22px ' + sans;
      x.fillText(String(o.kicker || '').toUpperCase().slice(0, 60), L, y);
      x.fillStyle = acc; x.fillRect(L, y + 18, 56, 4);
      y += 86;
      x.fillStyle = ink; x.font = '600 56px ' + serif;
      wrap(x, o.title, textW - L, 3).forEach(function (l) { x.fillText(l, L, y); y += 64; });
      if (o.big) { y += 34; x.fillStyle = acc; x.font = '700 104px ' + serif; x.fillText(String(o.big).slice(0, 14), L, y); y += 20; }
      if (o.sub) { y += 40; x.fillStyle = ink; x.font = '500 28px ' + sans; wrap(x, o.sub, textW - L, 2).forEach(function (l) { x.fillText(l, L, y); y += 36; }); }
      if (o.lines && o.lines.length) {
        y += 14; x.fillStyle = mute; x.font = '400 24px ' + sans;
        o.lines.slice(0, 3).forEach(function (l) { if (y < H - 90) { x.fillText(wrap(x, l, textW - L, 1)[0] || '', L, y); y += 34; } });
      }
      x.fillStyle = mute; x.font = '600 20px ' + sans;
      x.fillText('HOMO LUDENS', L, H - 48);
      x.font = '400 20px ' + sans;
      x.fillText('small games about the past', L + 160, H - 48);
      return c;
    });
  }

  /* ---------------------------------------------------------------- the sheet */
  function link(o) { return o.url || (P && P.site ? P.site : SITE) + (URLS[o.game || GAME] || '/'); }
  function share(o) {
    if (!api.canShare) return Promise.resolve(false);
    o = o || {}; style();
    var L = T[o.lang === 'tr' ? 'tr' : 'en'], url = link(o), text = o.text || o.title || '';
    if (text.indexOf(url) < 0) text = text + '\n' + url;
    var game = o.game || GAME, last = document.activeElement;
    var ov = document.createElement('div'); ov.className = 'hlx-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', L.title);
    ov.innerHTML = '<div class="hlx-box"><h2></h2><img alt=""><div class="hlx-row">' +
      '<button class="pri" data-a="share"></button><button data-a="save"></button><button data-a="copy"></button><span class="sp"></span><button data-a="close"></button></div></div>';
    ov.querySelector('h2').textContent = L.title;
    ['share', 'save', 'copy', 'close'].forEach(function (k) { ov.querySelector('[data-a="' + k + '"]').textContent = L[k]; });
    var shareBtn = ov.querySelector('[data-a="share"]');
    if (!navigator.share) shareBtn.remove();
    document.body.appendChild(ov);
    var blob = null, close = function () { ov.remove(); document.removeEventListener('keydown', kd, true); try { if (last && last.focus) last.focus(); } catch (e) {} };
    function kd(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') { var f = ov.querySelectorAll('button'); if (!f.length) return; var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
      e.stopPropagation();
    }
    document.addEventListener('keydown', kd, true);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    (ov.querySelector('button') || ov).focus();
    var made = card(o).then(function (c) {
      ov.querySelector('img').src = c.toDataURL('image/png');
      return new Promise(function (res) { c.toBlob(function (b) { blob = b; res(b); }, 'image/png'); });
    }).catch(function () { return null; });
    var file = function () { return blob ? new File([blob], (game || 'homoludens') + '-result.png', { type: 'image/png' }) : null; };
    ov.querySelector('[data-a="close"]').onclick = close;
    ov.querySelector('[data-a="copy"]').onclick = function (e) {
      var b = e.currentTarget, done = function () { b.textContent = L.copied; capture('result_shared', { game: game, method: 'copy' }); };
      try { navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); }); } catch (er) { fallbackCopy(text); done(); }
    };
    ov.querySelector('[data-a="save"]').onclick = function () {
      made.then(function () {
        if (!blob) return;
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file().name; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        capture('result_shared', { game: game, method: 'image' });
      });
    };
    if (shareBtn.isConnected) shareBtn.onclick = function () {
      made.then(function () {
        var f = file(), data = { text: text };
        if (f && navigator.canShare && navigator.canShare({ files: [f] })) data.files = [f]; else data.url = url;
        navigator.share(data).then(function () { capture('result_shared', { game: game, method: data.files ? 'native_image' : 'native' }); close(); }).catch(function () {});
      });
    };
    return made.then(function () { return true; });
  }
  function fallbackCopy(t) {
    var a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); } catch (e) {} a.remove();
  }
  function on(el, opts) {
    if (!el) return;
    if (!api.canShare) { el.hidden = true; el.style.display = 'none'; return; }
    el.addEventListener('click', function (e) { e.preventDefault(); share(typeof opts === 'function' ? opts() : opts); });
  }

  var hasCanvas = (function () { try { return !!document.createElement('canvas').getContext('2d'); } catch (e) { return false; } })();
  var api = { stamp: stamp, passport: read, share: share, card: card, on: on, canShare: !CG && hasCanvas, game: GAME };
  window.HL = api;
})();
