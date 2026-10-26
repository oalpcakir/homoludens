/* Homo Ludens feedback button. Include with:
   <script src="/feedback.js" defer data-game="portal|borderlines|retourvloot|cupoftea|polder"></script>
   A page can set window.HL_FEEDBACK_CONTEXT = () => "short text" to attach game state. */
(function () {
  var SITE_KEY = '0x4AAAAAAFRMZwiuLLLgZLqX'; // Turnstile site key (public)
  var ENDPOINT = '/api/feedback';
  var me = document.currentScript;
  var GAME = (me && me.getAttribute('data-game')) || 'portal';
  var token = null, widgetId = null, tsLoading = false;

  var css = '\
.hlfb-btn{position:fixed;right:18px;bottom:18px;z-index:9000;font:500 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.02em;padding:10px 14px;border-radius:20px;border:1px solid rgba(31,43,74,.25);background:#1f2b4a;color:#f7f6f2;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18)}\
.hlfb-btn:hover{filter:brightness(1.15)}\
.hlfb-dc{position:fixed;right:118px;bottom:18px;z-index:9000;display:flex;align-items:center;gap:6px;font:500 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.02em;padding:9px 13px;border-radius:20px;background:#5865f2;color:#fff;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.18)}\
.hlfb-dc:hover{filter:brightness(1.1)}\
.hlfb-game.hlfb-btn,.hlfb-game.hlfb-dc{left:14px;right:auto;bottom:14px;width:36px;height:36px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0;gap:0;opacity:.62;background:rgba(31,43,74,.86);color:#f7f6f2;border:1px solid rgba(255,255,255,.22);box-shadow:0 2px 8px rgba(0,0,0,.22);transition:opacity .2s,transform .25s}\
.hlfb-game.hlfb-dc{left:56px}\
.hlfb-game:hover,.hlfb-game:focus-visible{opacity:1}\
.hlfb-game svg{width:17px;height:17px;fill:currentColor}\
.hlfb-away,.hlfb-game.hlfb-away{transform:translateY(70px);opacity:0;pointer-events:none}\
@media (max-width:699px){.hlfb-game.hlfb-dc{display:none!important}.hlfb-game.hlfb-btn{left:0;bottom:auto;top:58%;width:26px;height:44px;border-radius:0 10px 10px 0;border-left:0;opacity:.5}.hlfb-game.hlfb-btn svg{width:14px;height:14px}.hlfb-game.hlfb-away{transform:translateX(-30px)}}\
.hlfb-dc svg{width:16px;height:16px;fill:currentColor}\
.hlfb-btn:focus-visible,.hlfb-box :focus-visible{outline:2px solid #b07a1e;outline-offset:2px}\
.hlfb-ov{position:fixed;inset:0;z-index:9001;background:rgba(10,14,22,.5);display:flex;align-items:center;justify-content:center;padding:16px}\
.hlfb-ov[hidden]{display:none}\
.hlfb-box{background:#f7f6f2;color:#1f2b4a;width:100%;max-width:440px;border-radius:4px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:22px 22px 18px;font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}\
.hlfb-box h2{font:400 26px/1.1 Georgia,"Times New Roman",serif;margin:0 0 6px}\
.hlfb-box p{margin:0 0 14px;font-size:14px;color:#4a5468}\
.hlfb-kinds{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;border:0;padding:0}\
.hlfb-kinds label{font-size:13px;padding:5px 10px;border:1px solid rgba(31,43,74,.25);border-radius:14px;cursor:pointer}\
.hlfb-kinds input{position:absolute;opacity:0;pointer-events:none}\
.hlfb-kinds label:has(input:checked){background:#1f2b4a;color:#f7f6f2;border-color:#1f2b4a}\
.hlfb-box textarea,.hlfb-box input[type=email]{width:100%;box-sizing:border-box;font:inherit;color:inherit;background:#fff;border:1px solid rgba(31,43,74,.25);border-radius:3px;padding:8px 10px;margin-bottom:8px}\
.hlfb-box textarea{min-height:110px;resize:vertical}\
.hlfb-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}\
.hlfb-ts{min-height:65px;margin:4px 0 8px}\
.hlfb-st{font-size:13px;min-height:18px;color:#4a5468}\
.hlfb-st.err{color:#962f2a}.hlfb-st.ok{color:#2c6a47}\
.hlfb-act{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}\
.hlfb-act button{font:500 14px/1 system-ui,-apple-system,"Segoe UI",sans-serif;padding:10px 14px;border-radius:3px;cursor:pointer;border:1px solid #1f2b4a}\
.hlfb-send{background:#1f2b4a;color:#f7f6f2}.hlfb-send:disabled{opacity:.5;cursor:default}\
.hlfb-cancel{background:transparent;color:#1f2b4a}\
@media (prefers-color-scheme:dark){.hlfb-box{background:#171e2b;color:#e7e2d4}.hlfb-box p,.hlfb-st{color:#aab0bd}.hlfb-box textarea,.hlfb-box input[type=email]{background:#121721;border-color:rgba(231,226,212,.2)}.hlfb-kinds label{border-color:rgba(231,226,212,.25)}.hlfb-kinds label:has(input:checked){background:#e7e2d4;color:#121721;border-color:#e7e2d4}.hlfb-cancel{color:#e7e2d4;border-color:#e7e2d4}.hlfb-send{background:#e7e2d4;color:#121721;border-color:#e7e2d4}}';

  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  function init() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var btn = el('<button type="button" class="hlfb-btn" aria-haspopup="dialog">Feedback</button>');
    var ov = el('<div class="hlfb-ov" hidden><form class="hlfb-box" role="dialog" aria-modal="true" aria-labelledby="hlfb-t" novalidate>' +
      '<h2 id="hlfb-t">Send feedback</h2>' +
      '<p id="hlfb-intro">Ideas, bugs, a historical mistake? This goes straight to the person who makes these games.</p>' +
      '<p style="margin-top:-8px">Or chat with other players on the <a href="https://discord.gg/7PcDfAMdr5" target="_blank" rel="noopener">Homo Ludens Discord</a>.</p>' +
      '<fieldset class="hlfb-kinds"><legend class="hlfb-hp">Kind</legend>' +
      '<label><input type="radio" name="hlfb-kind" value="idea" checked>Idea</label>' +
      '<label><input type="radio" name="hlfb-kind" value="bug">Bug</label>' +
      '<label><input type="radio" name="hlfb-kind" value="history">Historical mistake</label>' +
      '<label><input type="radio" name="hlfb-kind" value="other">Other</label></fieldset>' +
      '<label class="hlfb-hp" for="hlfb-msg">Message</label>' +
      '<textarea id="hlfb-msg" maxlength="2000" required placeholder="What should be better?"></textarea>' +
      '<label class="hlfb-hp" for="hlfb-mail">Email (optional)</label>' +
      '<input type="email" id="hlfb-mail" maxlength="120" placeholder="Your email, only if you want a reply" autocomplete="email">' +
      '<div class="hlfb-hp" aria-hidden="true"><label>Website <input type="text" id="hlfb-web" tabindex="-1" autocomplete="off"></label></div>' +
      '<div class="hlfb-ts" id="hlfb-ts"></div>' +
      '<div class="hlfb-st" id="hlfb-st" role="status"></div>' +
      '<div class="hlfb-act"><button type="button" class="hlfb-cancel">Cancel</button><button type="submit" class="hlfb-send">Send</button></div>' +
      '</form></div>');
    var dc = el('<a class="hlfb-dc" href="https://discord.gg/7PcDfAMdr5" target="_blank" rel="noopener" aria-label="Join the Homo Ludens Discord"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1A19.7 19.7 0 0 0 6.1 21l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.6 19.6 0 0 0 6-3c.5-5.2-.9-9.7-3.6-13.6zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>Discord</a>');
    dc.addEventListener('click', function () { try { if (window.posthog && window.posthog.capture) window.posthog.capture('discord_click', { game: GAME, page: location.pathname }); } catch (e) {} });
    document.body.appendChild(dc); document.body.appendChild(btn); document.body.appendChild(ov);
    // In a game, the two pills shrink to small round icons in the bottom-left corner, so they never cover the game's own controls
    // (Borderlines' zoom buttons, Kantar's market, the tea receipt).
    if (GAME !== 'portal') {
      btn.classList.add('hlfb-game'); dc.classList.add('hlfb-game');
      btn.setAttribute('aria-label', 'Send feedback'); btn.title = 'Send feedback'; dc.title = 'Homo Ludens Discord';
      btn.innerHTML = '<span style="font-size:0">Feedback</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 6v2h10V9H7zm0 4v1.8h7V13H7z"/></svg>';
    }
    // on a phone, both pills slide away while scrolling down (portal and games), so they never sit on top of text
    var lastY = window.scrollY;
    window.addEventListener('scroll', function () {
      if (window.innerWidth >= 700) return;
      var y = window.scrollY, atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 40;
      var away = y > lastY + 4 && y > 80 && !atEnd;
      if (y < lastY - 4 || atEnd || y < 80) away = false;
      if (Math.abs(y - lastY) > 4) { btn.classList.toggle('hlfb-away', away); dc.classList.toggle('hlfb-away', away); lastY = y; }
    }, { passive: true });
    // on a phone, step aside while one of the game's own dialogs (aria-modal) is open, so they never cover its buttons
    setInterval(function () {
      var small = window.innerWidth < 700, open = false;
      if (small) [].forEach.call(document.querySelectorAll('[aria-modal="true"]'), function (d) { if (d !== ov && !d.closest('.hlfb-ov') && d.offsetParent !== null && getComputedStyle(d).visibility !== 'hidden') open = true; });
      dc.style.display = btn.style.display = open ? 'none' : '';
    }, 400);
    var form = ov.querySelector('form'), msg = ov.querySelector('#hlfb-msg'), status = ov.querySelector('#hlfb-st'), send = ov.querySelector('.hlfb-send');
    var lastFocus = null, extraContext = '';
    var title = ov.querySelector('#hlfb-t'), intro = ov.querySelector('#hlfb-intro');
    var DEF = { title: title.textContent, intro: intro.textContent, ph: msg.placeholder };

    function say(t, cls) { status.textContent = t; status.className = 'hlfb-st' + (cls ? ' ' + cls : ''); }
    function open(opts) {
      opts = opts || {};
      lastFocus = document.activeElement;
      if (opts.kind) { var r = ov.querySelector('input[value="' + opts.kind + '"]'); if (r) r.checked = true; }
      if (opts.message) msg.value = opts.message;
      title.textContent = opts.title || DEF.title;
      intro.textContent = opts.intro || DEF.intro;
      msg.placeholder = opts.placeholder || DEF.ph;
      extraContext = opts.context || '';
      say(''); ov.hidden = false; setTimeout(function () { msg.focus(); }, 30);
      loadTurnstile();
    }
    function close() { ov.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
    function loadTurnstile() {
      if (widgetId !== null) return;
      if (window.turnstile) return renderTs();
      if (tsLoading) return; tsLoading = true;
      window.__hlfbTs = renderTs;
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__hlfbTs';
      s.async = true; s.defer = true;
      s.onerror = function () { say('The spam check could not load. Please try again later.', 'err'); };
      document.head.appendChild(s);
    }
    function renderTs() {
      if (widgetId !== null || !window.turnstile) return;
      widgetId = window.turnstile.render('#hlfb-ts', {
        sitekey: SITE_KEY, theme: 'auto', size: 'flexible',
        callback: function (t) { token = t; },
        'expired-callback': function () { token = null; },
        'error-callback': function () { token = null; say('The spam check failed. Please reload the page.', 'err'); },
      });
    }

    btn.addEventListener('click', function () { open(); });
    ov.querySelector('.hlfb-cancel').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ov.hidden) close(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = msg.value.trim();
      if (text.length < 5) { say('Please write a little more.', 'err'); msg.focus(); return; }
      if (!token) { say('One moment: the spam check is still running.', 'err'); return; }
      var ctx = '';
      try { if (typeof window.HL_FEEDBACK_CONTEXT === 'function') ctx = String(window.HL_FEEDBACK_CONTEXT() || ''); } catch (err) {}
      if (extraContext) ctx = extraContext + (ctx ? ' · ' + ctx : '');
      send.disabled = true; say('Sending…');
      fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, kind: (ov.querySelector('input[name="hlfb-kind"]:checked') || {}).value || 'other',
          email: ov.querySelector('#hlfb-mail').value.trim(), website: ov.querySelector('#hlfb-web').value,
          game: GAME, page: location.pathname, context: ctx, token: token,
        }),
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); })
        .then(function (res) {
          send.disabled = false;
          token = null; if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
          if (res.j && res.j.ok) { try { document.dispatchEvent(new CustomEvent('hlfeedback:sent', { detail: { kind: (ov.querySelector('input[name="hlfb-kind"]:checked') || {}).value } })); } catch (err) {} say('Thank you. Your message was sent.', 'ok'); msg.value = ''; setTimeout(close, 1600); return; }
          if (res.status === 429) say('You have sent a few already. Please try again in a minute.', 'err');
          else if (res.j && res.j.error === 'captcha') say('The spam check did not pass. Please try again.', 'err');
          else say('Your message could not be sent. Please try again later. (' + ((res.j && res.j.error) || ('HTTP ' + res.status)) + ')', 'err');
        })
        .catch(function () { send.disabled = false; say('Your message could not be sent. Check your connection and try again.', 'err'); });
    });
    window.HomoLudensFeedback = { open: open };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
