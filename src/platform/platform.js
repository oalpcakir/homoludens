/* Homo Ludens platform adapter (itch.io and CrazyGames packages). Built into each package by
   src/platform/build_platforms.py; the web site never loads it. The game code stays the same everywhere:

   - The game's own <script>s are held back (type="text/hl-deferred") until the adapter is ready, then run in
     order. On CrazyGames "ready" means SDK.init() has finished (it preloads the player's saved data), so a
     game can never start fresh and overwrite a save that has not arrived yet. init() has a time limit: if the
     SDK fails or hangs, the game still starts, saving only in this browser and never touching SDK data.
   - localStorage: on CrazyGames it is replaced by a thin layer over SDK.data (same keys, so saves follow the
     player's account); anywhere storage is blocked (e.g. a third-party iframe in some browsers) it falls back
     to memory, with a one-line notice that progress will not be kept.
   - Sound: every Web Audio context the game creates is suspended while an ad plays, while the platform's
     mute setting is on, or while the tab is hidden, and resumed afterwards (unless the game itself paused it).
   - Gameplay start/stop: from a small per-game "playing" check, polled; or by the game itself (Polder).
   - Ads (CrazyGames): HLP.ad('midgame' | 'rewarded') resolves true only when an ad finished; the game is
     paused and silent meanwhile; errors, "no fill" and a missing SDK all resolve false and the game goes on.
     adBefore selectors: a click on these controls (natural breaks: "play again", "next scene") first asks
     for a midgame ad (the SDK itself allows at most one every 3 minutes).
   - Links: root-relative links to the Homo Ludens site open the site in a new tab (itch) or are hidden (CG).

   Config (window.HL_PLATFORM, written by the builder): { id, game, site, sdk, playing, adBefore, hide, keys, timeout } */
(function () {
  'use strict';
  var C = window.HL_PLATFORM || {};
  var CG = C.id === 'crazygames';
  var HLP = window.HLP = { id: C.id || 'web', game: C.game || '', site: C.site || '', sdk: null, env: null,
    storage: 'local', muted: false, adPlaying: false, locale: '', device: '' };
  window.HL_SITE = C.site || '';
  var log = function () { try { if (/[?&]hldebug/.test(location.search)) console.log.apply(console, ['[HLP]'].concat([].slice.call(arguments))); } catch (e) {} };

  // ---------------------------------------------------------------- storage
  var realLS = null;
  try { realLS = window.localStorage; var t = '__hl_test'; realLS.setItem(t, '1'); realLS.removeItem(t); } catch (e) { realLS = null; }
  function memStore() {
    var m = {}, k = function () { return Object.keys(m); };
    return { getItem: function (x) { x = String(x); return Object.prototype.hasOwnProperty.call(m, x) ? m[x] : null; },
      setItem: function (x, v) { m[String(x)] = String(v); }, removeItem: function (x) { delete m[String(x)]; },
      clear: function () { m = {}; }, key: function (i) { return k()[i] == null ? null : k()[i]; }, get length() { return k().length; } };
  }
  // SDK.data has no key()/length; an index of the keys we wrote keeps "reset this game's progress" loops working
  function sdkStore(d) {
    var IDX = '__hl_keys', keys = [];
    try { keys = JSON.parse(d.getItem(IDX) || '[]'); if (!Array.isArray(keys)) keys = []; } catch (e) { keys = []; }
    (C.keys || []).forEach(function (k) { try { if (d.getItem(k) != null && keys.indexOf(k) < 0) keys.push(k); } catch (e) {} });
    var save = function () { try { d.setItem(IDX, JSON.stringify(keys)); } catch (e) {} };
    return { getItem: function (k) { try { var v = d.getItem(String(k)); return v == null ? null : String(v); } catch (e) { return null; } },
      setItem: function (k, v) { k = String(k); d.setItem(k, String(v)); if (keys.indexOf(k) < 0) { keys.push(k); save(); } },
      removeItem: function (k) { k = String(k); try { d.removeItem(k); } catch (e) {} var i = keys.indexOf(k); if (i >= 0) { keys.splice(i, 1); save(); } },
      clear: function () { keys.forEach(function (k) { try { d.removeItem(k); } catch (e) {} }); keys = []; save(); },
      key: function (i) { return keys[i] == null ? null : keys[i]; }, get length() { return keys.length; } };
  }
  function useStore(s, kind) {
    HLP.storage = kind;
    try { Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return s; } }); }
    catch (e) { log('could not replace localStorage', e); }
  }
  if (!realLS) useStore(memStore(), 'memory');

  // ---------------------------------------------------------------- sound
  var ctxs = [];
  function forced() { return HLP.muted || HLP.adPlaying || document.hidden; }
  function applyAudio() {
    ctxs.forEach(function (c) {
      try { if (forced()) { if (c.state === 'running') c.__s(); } else if (c.__want && c.state === 'suspended') c.__r(); } catch (e) {}
    });
  }
  HLP.applyAudio = applyAudio;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    var Tracked = function () {
      var c = new (Function.prototype.bind.apply(AC, [null].concat([].slice.call(arguments))))();
      c.__s = c.suspend.bind(c); c.__r = c.resume.bind(c); c.__want = true;
      c.suspend = function () { c.__want = false; return c.__s(); };
      c.resume = function () { c.__want = true; return forced() ? Promise.resolve() : c.__r(); };
      ctxs.push(c); if (forced()) c.__s().catch(function () {});
      return c;
    };
    Tracked.prototype = AC.prototype;
    window.AudioContext = Tracked; if (window.webkitAudioContext) window.webkitAudioContext = Tracked;
  }
  document.addEventListener('visibilitychange', function () { applyAudio(); poll(); });

  // ---------------------------------------------------------------- gameplay, ads
  var playing = false;
  HLP.gameplay = function (on) {
    on = !!on && !HLP.adPlaying && !HLP.adPending && !document.hidden;
    if (on === playing) return; playing = on; log('gameplay', on);
    try { if (HLP.sdk) HLP.sdk.game[on ? 'gameplayStart' : 'gameplayStop'](); } catch (e) {}
  };
  var check = null;
  function poll() { if (check) { var v = false; try { v = !!check(); } catch (e) {} HLP.gameplay(v); } }
  HLP.happytime = function () { try { if (HLP.sdk) HLP.sdk.game.happytime(); } catch (e) {} };
  HLP.canAd = function () { return !!(HLP.sdk && HLP.sdk.ad); };
  // One ad at a time. From the request until the ad is over (finished, failed, unfilled or timed out) the game is
  // "in an ad": gameplay is reported stopped and cannot restart, sound is off once the ad starts, and a
  // transparent layer takes every click, tap and key, so the player cannot act or ask for a second ad.
  // Each request has an id; callbacks that arrive after their request was closed (e.g. adStarted after the
  // 10 s no-answer limit) are ignored, so a late ad can never leave the game silent or locked.
  var current = null, reqId = 0, shield = null;
  function lock(on) {
    if (on && !shield) {
      shield = document.createElement('div');
      shield.setAttribute('aria-hidden', 'true');
      shield.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:transparent;cursor:wait';
      ['pointerdown', 'pointerup', 'click', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'wheel', 'contextmenu'].forEach(function (t) {
        shield.addEventListener(t, function (e) { e.preventDefault(); e.stopPropagation(); }, { passive: false });
      });
      document.body.appendChild(shield);
    } else if (!on && shield) { shield.remove(); shield = null; }
  }
  window.addEventListener('keydown', function (e) { if (current) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  HLP.adPending = false;
  HLP.ad = function (kind) {
    if (!HLP.canAd()) return Promise.resolve(false);
    if (current) return current.promise.then(function () { return false; }); // a second request while one is open gets nothing
    var id = ++reqId, was = playing, res;
    var promise = new Promise(function (r) { res = r; });
    current = { id: id, promise: promise };
    HLP.adPending = true; HLP.gameplay(false); lock(true);
    var t1 = null, t2 = null;
    var fin = function (ok) {
      if (!current || current.id !== id) return;          // closed already: ignore late callbacks
      current = null; clearTimeout(t1); clearTimeout(t2);
      HLP.adPending = false; HLP.adPlaying = false; lock(false); applyAudio();
      log('ad', kind, ok); res(ok); if (was) poll();
    };
    // no answer at all (blocked script, no callbacks): carry on after 10 s; a started ad gets 3 minutes
    t1 = setTimeout(function () { fin(false); }, 10000);
    try {
      HLP.sdk.ad.requestAd(kind, {
        adStarted: function () {
          if (!current || current.id !== id) return;
          clearTimeout(t1); t2 = setTimeout(function () { fin(false); }, 180000);
          HLP.adPlaying = true; applyAudio();
        },
        adFinished: function () { fin(true); },
        adError: function (e) { log('adError', e && e.code); fin(false); }
      });
    } catch (e) { fin(false); }
    return promise;
  };
  HLP.midgame = function () { return HLP.ad('midgame'); };
  // rewarded: the callback runs at most once, and only after a finished ad
  HLP.rewarded = function (give) { var given = false; return HLP.ad('rewarded').then(function (ok) { if (ok && !given) { given = true; give(); } return ok; }); };

  // a click on these controls first asks for a midgame ad, then goes ahead
  function adBefore(sel) {
    var passing = false;
    document.addEventListener('click', function (e) {
      if (passing || !HLP.canAd()) return;
      var el = e.target.closest && e.target.closest(sel); if (!el) return;
      e.preventDefault(); e.stopImmediatePropagation();
      HLP.midgame().then(function () {
        passing = true;
        try { if (el.tagName === 'A' && el.href) location.href = el.href; else el.click(); } finally { passing = false; }
      });
    }, true);
  }

  // ---------------------------------------------------------------- links and site services
  function css(t) { var s = document.createElement('style'); s.textContent = t; (document.head || document.documentElement).appendChild(s); }
  if (C.hide && C.hide.length) css(C.hide.join(',') + '{display:none!important}');
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    var h = a.getAttribute('href') || '';
    if (h.charAt(0) === '/' && h.charAt(1) !== '/') {
      // a link to the Homo Ludens site (the portal, another game)
      e.preventDefault();
      if (!CG && HLP.site) window.open(HLP.site + h, '_blank', 'noopener');
    } else if (/^https?:/i.test(h) && a.target !== '_blank') { a.target = '_blank'; a.rel = 'noopener'; }
  }, true);

  function notice(text) {
    var d = document.createElement('div');
    d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:99999;max-width:min(92vw,560px);padding:9px 14px;border-radius:6px;background:rgba(20,20,24,.92);color:#fff;font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer';
    d.textContent = text; d.onclick = function () { d.remove(); }; document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 9000);
  }
  var tr = function () { return /^tr/i.test(HLP.locale || navigator.language || ''); };

  // ---------------------------------------------------------------- start-up
  var cover = null;
  function showCover() {
    cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;background:#16161a;color:#d9d4c7;font:15px system-ui,sans-serif;letter-spacing:.04em';
    cover.textContent = 'Loading…'; document.body.appendChild(cover);
  }
  function runDeferred() {
    var list = [].slice.call(document.querySelectorAll('script[type="text/hl-deferred"]'));
    return list.reduce(function (p, old) {
      return p.then(function () {
        return new Promise(function (res) {
          var s = document.createElement('script');
          [].forEach.call(old.attributes, function (at) { if (at.name !== 'type' && at.name !== 'data-src') s.setAttribute(at.name, at.value); });
          if (old.dataset.src) { s.src = old.dataset.src; s.onload = s.onerror = function () { res(); }; }
          else s.text = old.textContent;
          old.parentNode.replaceChild(s, old);
          if (!old.dataset.src) res();
        });
      });
    }, Promise.resolve());
  }
  // The SDK file is loaded here (not with a blocking <script> tag), so a slow or failing download cannot hang the
  // page: loading and init() share one time limit (C.timeout, 8 s), after which the game starts without the SDK.
  function loadSDK(url) {
    return new Promise(function (res) {
      if (window.CrazyGames && window.CrazyGames.SDK) return res(true);
      var s = document.createElement('script'); s.src = url; s.async = true;
      s.onload = function () { res(!!(window.CrazyGames && window.CrazyGames.SDK)); };
      s.onerror = function () { log('SDK script failed'); res(false); };
      document.head.appendChild(s);
    });
  }
  function initSDK() {
    return new Promise(function (res) {
      if (!CG) return res(null);
      var over = false, end = function (v) { if (!over) { over = true; res(v); } };
      setTimeout(function () { log('SDK load/init timed out'); end(null); }, C.timeout || 8000);
      loadSDK(C.sdk).then(function (ok) {
        var S = ok && window.CrazyGames && window.CrazyGames.SDK; if (!S) return end(null);
        return Promise.resolve().then(function () { return S.init(); }).then(function () {
          HLP.env = S.environment;
          end(S.environment === 'crazygames' || S.environment === 'local' ? S : null);
        }, function (e) { log('SDK init failed', e); end(null); });
      });
    });
  }
  HLP.ready = new Promise(function (done) {
    var go = function () {
      showCover();
      initSDK().then(function (sdk) {
        HLP.sdk = sdk;
        if (sdk) {
          try { if (sdk.data) useStore(sdkStore(sdk.data), 'crazygames'); } catch (e) { log('data', e); }
          try { HLP.muted = !!sdk.game.settings.muteAudio; sdk.game.addSettingsChangeListener(function (s) { HLP.muted = !!(s && s.muteAudio); applyAudio(); }); } catch (e) {}
          try { var si = sdk.user && sdk.user.systemInfo; if (si) { HLP.locale = si.locale || si.language || ''; HLP.device = (si.device && si.device.type) || ''; } } catch (e) {}
          try { sdk.game.loadingStart(); } catch (e) {}
        }
        // a per-game hook may return a promise (e.g. Borderlines refreshing its daily list), capped at 4 s
        var b = null; if (C.before) { try { b = C.before(HLP); } catch (e) { log('before', e); } }
        return Promise.race([Promise.resolve(b).catch(function () {}), new Promise(function (r) { setTimeout(r, 4000); })]).then(runDeferred);
      }).then(function () {
        if (cover) cover.remove();
        try { if (HLP.sdk) HLP.sdk.game.loadingStop(); } catch (e) {}
        (C.adBefore || []).forEach(adBefore);
        if (typeof C.playing === 'function') { check = C.playing; setInterval(poll, 400); poll(); }
        window.addEventListener('blur', poll); window.addEventListener('focus', poll);
        if (HLP.storage === 'memory') notice(tr() ? 'Bu tarayıcı oyunun kayıt tutmasına izin vermiyor: sayfayı kapatınca ilerleme kaybolur.' : 'This browser does not let the game save, so your progress will be lost when you close the page.');
        if (C.after) { try { C.after(HLP); } catch (e) { log('after', e); } }
        done(HLP);
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  });
})();
