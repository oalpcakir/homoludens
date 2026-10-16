/* A stand-in for https://sdk.crazygames.com/crazygames-sdk-v3.js in the package tests (no network in CI).
   It follows the documented v3 surface only: SDK.init(), environment, game.{gameplayStart, gameplayStop,
   loadingStart, loadingStop, happytime, settings, addSettingsChangeListener}, ad.requestAd(kind, callbacks),
   data.{getItem, setItem, removeItem, clear}, user.systemInfo.
   Behaviour is set with localStorage "mockcg:cfg" = {initMs, initFail, initHang, ad: "finish"|"unfilled"|"silent", mute, locale}.
   Every call is recorded in window.__cg.log; saved data lives in localStorage under "mockcg:data:". */
(function () {
  var cfg = {}; try { cfg = JSON.parse(localStorage.getItem('mockcg:cfg') || '{}'); } catch (e) {}
  var log = [], L = function (x) { log.push(x); };
  var ls = window.localStorage;
  var listeners = [];
  var settings = { muteAudio: !!cfg.mute, disableChat: false };
  var SDK = {
    environment: 'uninitialized',
    init: function () {
      L('init');
      if (cfg.initHang) return new Promise(function () {});
      return new Promise(function (res, rej) {
        setTimeout(function () { if (cfg.initFail) { L('init:fail'); rej(new Error('mock init failure')); } else { SDK.environment = 'local'; L('init:done'); res(); } }, cfg.initMs || 50);
      });
    },
    game: {
      settings: settings,
      gameplayStart: function () { L('gameplayStart'); }, gameplayStop: function () { L('gameplayStop'); },
      loadingStart: function () { L('loadingStart'); }, loadingStop: function () { L('loadingStop'); },
      happytime: function () { L('happytime'); },
      addSettingsChangeListener: function (f) { listeners.push(f); }, removeSettingsChangeListener: function () {}
    },
    ad: {
      requestAd: function (kind, cb) {
        L('requestAd:' + kind);
        var mode = cfg.ad || 'finish';
        if (mode === 'silent') return;
        setTimeout(function () {
          if (mode === 'unfilled') { L('adError'); cb.adError && cb.adError({ code: 'unfilled', message: 'No ad available' }); return; }
          L('adStarted'); cb.adStarted && cb.adStarted();
          window.__cg.audioDuringAd = (window.__cg.ctxStates || function () { return []; })();
          setTimeout(function () { L('adFinished'); cb.adFinished && cb.adFinished(); }, 300);
        }, 100);
      },
      hasAdblock: function () { return Promise.resolve(false); }
    },
    data: {
      getItem: function (k) { return ls.getItem('mockcg:data:' + k); },
      setItem: function (k, v) { L('data.set:' + k); ls.setItem('mockcg:data:' + k, String(v)); },
      removeItem: function (k) { L('data.remove:' + k); ls.removeItem('mockcg:data:' + k); },
      clear: function () { L('data.clear'); }
    },
    user: { systemInfo: { countryCode: 'NL', locale: cfg.locale || 'en-US', device: { type: 'desktop' } }, isUserAccountAvailable: false }
  };
  window.CrazyGames = { SDK: SDK };
  window.__cg = { log: log, setMute: function (m) { settings.muteAudio = m; listeners.forEach(function (f) { f(settings); }); } };
})();
