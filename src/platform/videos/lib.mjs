// Frame-exact capture of a browser game: the page runs on a virtual clock (timers, Date, rAF, CSS and Web
// Animations) that only moves when we say so, and every frame is a CDP screenshot. Real time does not matter, so a
// slow machine still gives smooth 30 fps.
const ROOT = new URL('../../../', import.meta.url).pathname; // the repo
const { chromium } = await import(ROOT + 'node_modules/playwright/index.mjs');
const { serve } = await import(ROOT + 'tests/smoke/server.mjs');
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
const FONTS = process.env.FONTS || '/tmp/hl-video-fonts'; // made by fonts.sh

export const FPS = 30;

// injected before any page script
function shim() {
  const R = { st: setTimeout.bind(window), now: performance.now.bind(performance) };
  const mc = new MessageChannel(); const q = []; mc.port1.onmessage = () => q.shift()();
  const tick = () => new Promise(r => { q.push(r); mc.port2.postMessage(0); }); // a real macrotask: flushes microtasks + worker messages
  { let a = (window.__SEED || 1) >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  let vt = 0; const base = Date.now(), pbase = R.now();
  const timers = new Map(); let tid = 1, seq = 0; let rafs = []; let rid = 1;
  const add = (fn, ms, a, iv) => { const id = tid++; timers.set(id, { t: vt + Math.max(0, +ms || 0), fn, a, iv: iv ? Math.max(1, +ms || 0) : 0, s: seq++ }); return id; };
  window.setTimeout = (fn, ms, ...a) => add(fn, ms, a, false);
  window.setInterval = (fn, ms, ...a) => add(fn, ms, a, true);
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  window.requestAnimationFrame = fn => { const id = rid++; rafs.push([id, fn]); return id; };
  window.cancelAnimationFrame = id => { rafs = rafs.filter(x => x[0] !== id); };
  const OD = Date;
  class VDate extends OD { constructor(...a) { if (a.length) super(...a); else super(base + vt); } static now() { return base + vt; } }
  window.Date = VDate;
  performance.now = () => pbase + vt;
  const born = new WeakMap();
  const oAnim = Element.prototype.animate;
  Element.prototype.animate = function (...a) { const an = oAnim.apply(this, a); try { born.set(an, vt); an.pause(); an.currentTime = 0; } catch (e) {} return an; };
  function syncAnims() {
    for (const an of document.getAnimations()) {
      if (!born.has(an)) born.set(an, vt);
      const t = vt - born.get(an);
      try {
        const end = an.effect ? an.effect.getComputedTiming().endTime : Infinity;
        if (an.playState === 'finished') continue;
        if (Number.isFinite(end) && t >= end) { an.finish(); continue; }
        if (an.playState !== 'paused') an.pause();
        an.currentTime = t;
      } catch (e) {}
    }
  }
  const run = (fn, a) => { try { typeof fn === 'function' ? fn(...a) : (0, eval)(fn); } catch (e) { console.error(e); } };
  window.__vt = () => vt;
  window.__adv = async ms => {
    const target = vt + ms;
    for (let guard = 0; guard < 5000; guard++) {
      let best = null, bid = 0;
      for (const [id, x] of timers) if (x.t <= target && (!best || x.t < best.t || (x.t === best.t && x.s < best.s))) { best = x; bid = id; }
      if (!best) break;
      vt = Math.max(vt, best.t);
      if (best.iv) { best.t += best.iv; best.s = seq++; } else timers.delete(bid);
      run(best.fn, best.a);
      await tick();
    }
    vt = target;
    const cbs = rafs; rafs = [];
    for (const [, fn] of cbs) run(fn, [pbase + vt]);
    await tick();
    syncAnims();
    return [vt, scrollX, scrollY];
  };
  // pause CSS animations created before our first step, too
  document.addEventListener('DOMContentLoaded', () => syncAnims());
}

export async function launch({ width, height, scale, touch = false, init = () => {}, initArg, seed = 1 }) {
  const srv = await serve(ROOT + 'public');
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/tmp/chromium', args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, hasTouch: touch, isMobile: touch, reducedMotion: 'no-preference' });
  // block every external host, except that the Google Fonts the games ask for are served from a local copy
  // (fontsource packages of the same families), so the video shows the real typefaces
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => {
    const u = r.request().url();
    if (u.startsWith('https://fonts.googleapis.com/css')) return r.fulfill({ status: 200, contentType: 'text/css', body: readFileSync(FONTS + '/fonts.css') });
    const m = u.match(/^https:\/\/fonts\.gstatic\.com\/__f\/([\w.-]+\.woff2?)$/);
    if (m && existsSync(FONTS + '/files/' + m[1])) return r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(FONTS + '/files/' + m[1]) });
    return r.fulfill({ status: 204, body: '' });
  });
  // play as the CrazyGames build does (no passport toast, no share button, no links to the site)
  await ctx.addInitScript(s => { window.__SEED = s; window.HL_PLATFORM = { id: 'crazygames' }; }, seed);
  await ctx.addInitScript(shim);
  await ctx.addInitScript(init, initArg);
  // the site's floating feedback / Discord buttons and the caret never appear in the video
  await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style'); s.textContent = '.hlfb-btn,.hlfb-dc,.hlfb{display:none!important} *{caret-color:transparent!important;cursor:none!important} .vpress{transform:scale(.95)!important;filter:brightness(1.12) saturate(1.1)!important;transition:none!important} ::-webkit-scrollbar{display:none}';
    document.head.append(s);
  }));
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error' && !/204|Failed to load/.test(m.text())) console.log('console:', m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const rec = new Recorder(page, cdp, { x: 0, y: 0, width, height, scale });
  return { srv, browser, ctx, page, cdp, rec, close: async () => { await browser.close(); srv.close(); } };
}

export class Recorder {
  constructor(page, cdp, clip) { this.page = page; this.cdp = cdp; this.cl = clip; this.on = false; this.n = 0; this.dir = null; this.clips = []; }
  clip(dir) { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); this.dir = dir; this.n = 0; this.on = true; this.clips.push(dir); }
  stop() { this.on = false; }
  // the clip is in document coordinates: follow the page's scroll
  async at() { const [x, y] = await this.page.evaluate(() => [scrollX, scrollY]); return { ...this.cl, x, y }; }
  async shot(path) { const r = await this.cdp.send('Page.captureScreenshot', { format: 'png', clip: await this.at() }); writeFileSync(path, Buffer.from(r.data, 'base64')); }
  async frame() {
    const [, x, y] = await this.page.evaluate(ms => window.__adv(ms), 1000 / FPS);
    if (this.on) { const r = await this.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, clip: { ...this.cl, x, y }, optimizeForSpeed: true }); writeFileSync(`${this.dir}/${String(this.n++).padStart(5, '0')}.jpg`, Buffer.from(r.data, 'base64')); }
  }
  async wait(ms) { const n = Math.round(ms * FPS / 1000); for (let i = 0; i < n; i++) await this.frame(); }
  // a visible press on a control (no cursor in the video), then the real click
  async press(sel, hold = 140) {
    await this.page.evaluate(s => document.querySelector(s)?.classList.add('vpress'), sel);
    await this.wait(hold);
    await this.page.evaluate(s => { const e = document.querySelector(s); if (e) { e.classList.remove('vpress'); e.click(); } }, sel);
  }
  // advance without recording, in big steps
  async skip(ms, step = 100) { for (let t = 0; t < ms; t += step) await this.page.evaluate(s => window.__adv(s), step); }
  // run frames until fn(page) is truthy (recorded if on); returns false on timeout (virtual ms)
  async until(fn, arg, max = 20000, recordStep = true) {
    for (let t = 0; t < max; t += recordStep ? 1000 / FPS : 100) {
      if (await this.page.evaluate(fn, arg)) return true;
      if (recordStep) await this.frame(); else await this.page.evaluate(s => window.__adv(s), 100);
    }
    return false;
  }
}
