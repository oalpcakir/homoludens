// Homo Ludens Worker: serves the static site from ./public and handles three small APIs.
//
//   /api/feedback            feedback and bug reports → Discord
//   /api/newsletter/*        double opt-in email list (sign up, confirm, unsubscribe)
//   /api/admin/*             your own tools: Borderlines stats, subscriber count, preview and send the new-game email
//   /borderlines/s/<score>   share link: a page with that score's preview image, which forwards players to the game
//
// Secrets (Settings → Variables and Secrets, type Secret — not under Builds):
//   DISCORD_WEBHOOK_URL   Discord channel webhook (feedback)
//   TURNSTILE_SECRET      Turnstile secret key (feedback and sign-up)
//   RESEND_API_KEY        Resend API key (sending email)
//   NEWSLETTER_SECRET     any long random string; signs confirm and unsubscribe links
//   ADMIN_TOKEN           any long random string; you type it on /admin/ to send emails
//   NEWSLETTER_FROM       e.g. "Homo Ludens <news@homoludens.games>" (a verified Resend domain)
//   ADMIN_EMAIL           your own address, for test sends
//   POSTHOG_API_KEY       PostHog personal API key with "Query: Read" scope (Borderlines stats on /admin/)
//   POSTHOG_PROJECT_ID    optional; the PostHog project number (default 652087, the Homo Ludens project)
// Bindings (wrangler.jsonc): ASSETS, FEEDBACK_LIMIT (rate limit), SUBSCRIBERS (KV namespace).

const KINDS = { idea: 'Idea', bug: 'Bug', history: 'Historical mistake', other: 'Other' };
const GAMES = { portal: 'Portal', borderlines: 'Borderlines', retourvloot: 'Retourvloot', cupoftea: 'A Cup of Tea', polder: 'Polder', kantar: 'Kantar' };
const COLORS = { idea: 0x2c6a47, bug: 0x962f2a, history: 0x9a6a14, other: 0x26457d };
const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,24}$/i;
const PENDING_TTL = 7 * 24 * 3600;      // unconfirmed sign-ups disappear after a week
const RESEND_COOLDOWN = 24 * 3600 * 1000; // at most one confirmation email per address per day

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === '/api/feedback') return request.method === 'POST' ? await feedback(request, env, url) : json({ ok: false, error: 'method' }, 405);
      if (p === '/api/newsletter/status') return json({ ok: true, enabled: newsletterEnabled(env) });
      if (p === '/api/newsletter/subscribe') return request.method === 'POST' ? await subscribe(request, env, url) : json({ ok: false, error: 'method' }, 405);
      if (p === '/api/newsletter/confirm') return await confirm(request, env, url);
      if (p === '/api/newsletter/unsubscribe') return await unsubscribe(request, env, url);
      if (p.startsWith('/api/admin/')) return await admin(request, env, url);
      if (p.startsWith('/api/')) return json({ ok: false, error: 'not-found' }, 404);
      if (p.startsWith('/borderlines/s/')) return shareCard(url);
    } catch (e) {
      return json({ ok: false, error: 'server' }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---------------------------------------------------------------- shared checks
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
async function readJson(request, url) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return { error: json({ ok: false, error: 'origin' }, 403) };
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) return { error: json({ ok: false, error: 'type' }, 415) };
  const raw = await request.text();
  if (raw.length > 8000) return { error: json({ ok: false, error: 'size' }, 413) };
  try { return { data: JSON.parse(raw) }; } catch (e) { return { error: json({ ok: false, error: 'json' }, 400) }; }
}
const ipOf = request => request.headers.get('CF-Connecting-IP') || 'unknown';
async function rateOk(env, key) {
  if (!env.FEEDBACK_LIMIT) return true;
  const { success } = await env.FEEDBACK_LIMIT.limit({ key });
  return success;
}
async function turnstileOk(env, token, ip, host) {
  if (!env.TURNSTILE_SECRET) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', String(token || ''));
  form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const j = await r.json();
  if (!j.success) return false;
  // A token solved on another site with the same key must not pass. (Cloudflare's test secrets report a dummy hostname.)
  const testSecret = /^[123]x0{10,}/.test(env.TURNSTILE_SECRET);
  return testSecret || !host || !j.hostname || j.hostname === host;
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------------------------------------------------------- feedback → Discord
async function feedback(request, env, url) {
  const { data: d, error } = await readJson(request, url);
  if (error) return error;
  if (d.website) return json({ ok: true }); // honeypot
  const message = String(d.message || '').trim().slice(0, 2000);
  if (message.length < 5) return json({ ok: false, error: 'short' }, 400);
  const kind = KINDS[d.kind] ? d.kind : 'other';
  const game = GAMES[d.game] ? d.game : 'portal';
  const email = String(d.email || '').trim().slice(0, 120);
  const page = String(d.page || '').slice(0, 120);
  const context = String(d.context || '').slice(0, 300);
  const ip = ipOf(request);
  if (!(await rateOk(env, 'fb:' + ip))) return json({ ok: false, error: 'rate' }, 429);
  if (!env.TURNSTILE_SECRET || !env.DISCORD_WEBHOOK_URL) return json({ ok: false, error: 'not-configured' }, 503);
  if (!(await turnstileOk(env, d.token, ip, url.hostname))) return json({ ok: false, error: 'captcha' }, 403);
  const fields = [
    { name: 'Page', value: page || '/', inline: true },
    { name: 'From', value: (request.cf && request.cf.country) || '?', inline: true },
  ];
  if (email) fields.push({ name: 'Reply to', value: email, inline: false });
  if (context) fields.push({ name: 'Context', value: context, inline: false });
  const res = await fetch(env.DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Homo Ludens',
      allowed_mentions: { parse: [] },
      embeds: [{ title: `${GAMES[game]} · ${KINDS[kind]}`, description: message, color: COLORS[kind], fields, timestamp: new Date().toISOString() }],
    }),
  });
  if (!res.ok) return json({ ok: false, error: 'deliver' }, 502);
  return json({ ok: true });
}

// ---------------------------------------------------------------- KV helpers
// KV list() returns at most 1000 keys per call; always follow the cursor.
async function listAll(env, prefix, each) {
  let cursor;
  do {
    const l = await env.SUBSCRIBERS.list({ prefix, cursor });
    for (const k of l.keys) each(k);
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
}
async function putRetry(env, key, value, opts) {
  for (let i = 0; i < 3; i++) {
    try { await env.SUBSCRIBERS.put(key, value, opts); return true; } catch (e) { if (i === 2) return false; await new Promise(r => setTimeout(r, 300 * (i + 1))); }
  }
}
async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- newsletter
function newsletterEnabled(env) {
  return !!(env.SUBSCRIBERS && env.RESEND_API_KEY && env.NEWSLETTER_SECRET && env.NEWSLETTER_FROM && env.TURNSTILE_SECRET);
}
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encEmail = e => btoa(unescape(encodeURIComponent(e))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function decEmail(s) {
  try { s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); } catch (e) { return ''; }
}
async function sign(env, action, email) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.NEWSLETTER_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(action + ':' + email)));
}
function sameString(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function verifyLink(env, action, e, t) {
  const email = decEmail(e);
  if (!email || !EMAIL_RE.test(email)) return null;
  return sameString(await sign(env, action, email), t) ? email : null;
}
async function linkFor(env, origin, action, email) {
  return `${origin}/api/newsletter/${action}?e=${encEmail(email)}&t=${await sign(env, action, email)}`;
}
async function sendEmail(env, msg) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.NEWSLETTER_FROM, ...msg }),
  });
  return r.ok;
}
// The idempotency key makes Resend send a given batch only once within 24 hours, even if the request is repeated
// (a double click, two tabs, a retry after a timeout). Returns 'ok', 'busy' (same batch already in flight) or 'fail'.
async function sendBatch(env, msgs, idempotencyKey) {
  const headers = { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const r = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST', headers,
    body: JSON.stringify(msgs.map(m => ({ from: env.NEWSLETTER_FROM, ...m }))),
  });
  if (r.ok) return 'ok';
  return r.status === 409 ? 'busy' : 'fail';
}

async function subscribe(request, env, url) {
  const { data: d, error } = await readJson(request, url);
  if (error) return error;
  if (d.website) return json({ ok: true }); // honeypot
  if (!newsletterEnabled(env)) return json({ ok: false, error: 'not-configured' }, 503);
  const ip = ipOf(request);
  if (!(await rateOk(env, 'nl:' + ip))) return json({ ok: false, error: 'rate' }, 429);
  const email = String(d.email || '').trim().toLowerCase();
  if (email.length > 120 || !EMAIL_RE.test(email)) return json({ ok: false, error: 'email' }, 400);
  if (!(await turnstileOk(env, d.token, ip, url.hostname))) return json({ ok: false, error: 'captcha' }, 403);

  // Same answer whether or not the address is already on the list, so the form can't be used to look people up.
  const key = 'sub:' + email;
  const cur = await env.SUBSCRIBERS.get(key, 'json');
  if (cur && cur.status === 'confirmed') return json({ ok: true });
  if (cur && cur.status === 'pending' && Date.now() - (cur.sentAt || 0) < RESEND_COOLDOWN) return json({ ok: true });

  const rec = { email, status: 'pending', created: (cur && cur.created) || Date.now(), sentAt: Date.now() };
  await env.SUBSCRIBERS.put(key, JSON.stringify(rec), { expirationTtl: PENDING_TTL, metadata: { s: 'p' } });
  const link = await linkFor(env, url.origin, 'confirm', email);
  const ok = await sendEmail(env, {
    to: [email],
    subject: 'Confirm your Homo Ludens emails',
    html: emailShell(`<h1 style="font-family:Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">One click to confirm</h1>
      <p>Someone, hopefully you, asked to get an email from Homo Ludens when a new history game comes out.</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#1f2b4a;color:#f7f6f2;text-decoration:none;padding:12px 18px;border-radius:2px;display:inline-block">Yes, send me new games</a></p>
      <p style="color:#5b6478;font-size:13px">If this wasn't you, ignore this email. Nothing happens unless you click, and the request expires in a week.</p>`, url.origin),
    text: `Someone, hopefully you, asked to get an email from Homo Ludens when a new history game comes out.\n\nConfirm: ${link}\n\nIf this wasn't you, ignore this email. Nothing happens unless you click.`,
  });
  if (!ok) return json({ ok: false, error: 'deliver' }, 502);
  return json({ ok: true });
}

// Links in emails open a page with a button. Mail scanners follow links, but they don't press buttons.
async function confirm(request, env, url) {
  if (!newsletterEnabled(env)) return page('Not available', '<p>Email sign-up is not switched on yet.</p>', 503);
  const q = request.method === 'POST' ? Object.fromEntries(new URLSearchParams(await request.text())) : Object.fromEntries(url.searchParams);
  const email = await verifyLink(env, 'confirm', q.e, q.t);
  if (!email) return page('Link not valid', '<p>This confirmation link is not valid. Try signing up again on <a href="/">the homepage</a>.</p>', 400);
  if (request.method !== 'POST') {
    return page('Confirm your email', `<p>Get one email from Homo Ludens each time a new game comes out, sent to <b>${esc(email)}</b>.</p>
      <form method="post"><input type="hidden" name="e" value="${esc(q.e)}"><input type="hidden" name="t" value="${esc(q.t)}"><button type="submit">Confirm</button></form>`);
  }
  const key = 'sub:' + email;
  const cur = await env.SUBSCRIBERS.get(key, 'json');
  if (!cur) return page('Link expired', '<p>This request has expired. Please <a href="/">sign up again</a>.</p>', 410);
  if (cur.status !== 'confirmed') {
    await env.SUBSCRIBERS.put(key, JSON.stringify({ ...cur, status: 'confirmed', confirmedAt: Date.now() }), { metadata: { s: 'c' } });
  }
  return page('You’re on the list', `<p>Thank you. The next time a new game comes out, you’ll hear about it at <b>${esc(email)}</b>. Every email has a one-click unsubscribe link.</p><p><a href="/">Back to the games</a></p>`);
}

async function unsubscribe(request, env, url) {
  if (!env.SUBSCRIBERS || !env.NEWSLETTER_SECRET) return page('Not available', '<p>Email is not switched on.</p>', 503);
  const body = request.method === 'POST' ? await request.text() : '';
  const form = Object.fromEntries(new URLSearchParams(body));
  const e = form.e || url.searchParams.get('e'), t = form.t || url.searchParams.get('t');
  const email = await verifyLink(env, 'unsubscribe', e, t);
  if (!email) return page('Link not valid', '<p>This unsubscribe link is not valid. Reply to any email from us and we’ll remove you by hand.</p>', 400);
  if (request.method === 'POST') {
    await env.SUBSCRIBERS.delete('sub:' + email);
    // forget every trace of the address, including which emails it was sent (sent:<game>:<email>)
    let games = null;
    try { games = await loadGames(env, url.origin); } catch (e) {}
    if (games) {
      await Promise.all(games.map(g => env.SUBSCRIBERS.delete(`sent:${g.id}:${email}`)));
    } else { // games.json unreadable: fall back to scanning
      const del = [];
      await listAll(env, 'sent:', k => { if (k.name.endsWith(':' + email)) del.push(k.name); });
      for (const k of del) await env.SUBSCRIBERS.delete(k);
    }
    if (body.includes('List-Unsubscribe=One-Click')) return new Response('', { status: 200 }); // mail client one-click
    return page('Unsubscribed', `<p><b>${esc(email)}</b> has been removed. You won’t get any more emails from Homo Ludens.</p><p><a href="/">Back to the games</a></p>`);
  }
  return page('Unsubscribe', `<p>Stop new-game emails to <b>${esc(email)}</b>?</p>
    <form method="post"><input type="hidden" name="e" value="${esc(e)}"><input type="hidden" name="t" value="${esc(t)}"><button type="submit">Unsubscribe</button></form>`);
}

function page(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Homo Ludens</title>
<style>body{margin:0;background:#f7f6f2;color:#1f2b4a;font:17px/1.55 Georgia,serif}main{max-width:520px;margin:12vh auto;padding:0 20px}h1{font-weight:400;font-size:34px;margin:0 0 14px}a{color:#1f2b4a}
button{font:500 15px system-ui,sans-serif;background:#1f2b4a;color:#f7f6f2;border:0;border-radius:2px;padding:12px 18px;cursor:pointer;margin-top:8px}.k{font:500 11px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#5b6478}</style></head>
<body><main><div class="k">Homo Ludens</div><h1>${esc(title)}</h1>${body}</main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

function emailShell(inner, origin, footer = '') {
  return `<!doctype html><html><body style="margin:0;background:#f1efe9;padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#f7f6f2;border:1px solid #dcdad2">
<tr><td style="padding:28px 28px 8px;font:500 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#5b6478">Homo Ludens · small games about the past</td></tr>
<tr><td style="padding:8px 28px 28px;font:16px/1.55 Helvetica,Arial,sans-serif;color:#1f2b4a">${inner}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #dcdad2;font:12px/1.5 Helvetica,Arial,sans-serif;color:#6b7386">${footer || `<a href="${origin}" style="color:#6b7386">${origin.replace(/^https?:\/\//, '')}</a>`}</td></tr>
</table></td></tr></table></body></html>`;
}

async function loadGames(env, origin) {
  const r = await env.ASSETS.fetch(new Request(origin + '/games.json'));
  if (!r.ok) throw new Error('games.json');
  return r.json();
}
function announcement(games, id, origin, unsubLink) {
  const g = games.find(x => x.id === id);
  if (!g) return null;
  const others = games.filter(x => x.id !== id);
  const abs = u => (u.startsWith('http') ? u : origin + u);
  const subject = `New from Homo Ludens: ${g.title}`;
  const html = emailShell(`
    <div style="font:500 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#9a6a14;margin-bottom:8px">No. ${g.no} · new game</div>
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:34px;line-height:1.1;margin:0 0 16px">${esc(g.title)}</h1>
    <a href="${abs(g.url)}"><img src="${abs(g.image)}" width="504" alt="${esc(g.title)}" style="display:block;width:100%;max-width:504px;height:auto;border:1px solid #dcdad2;margin-bottom:16px"></a>
    <p style="margin:0 0 20px">${esc(g.announce || g.short)}</p>
    <p style="margin:0 0 28px"><a href="${abs(g.url)}" style="background:#1f2b4a;color:#f7f6f2;text-decoration:none;padding:12px 18px;border-radius:2px;display:inline-block">Play ${esc(g.title)}</a></p>
    ${others.length ? `<div style="border-top:1px solid #dcdad2;padding-top:18px"><div style="font:500 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#5b6478;margin-bottom:10px">Also at Homo Ludens</div>
    ${others.map(o => `<p style="margin:0 0 12px"><a href="${abs(o.url)}" style="color:#1f2b4a;font-weight:bold">${esc(o.title)}</a> · ${esc(o.short)}</p>`).join('')}</div>` : ''}`,
    origin,
    `You get this because you signed up for new-game emails at ${origin.replace(/^https?:\/\//, '')}. One email per new game, nothing else.<br><a href="${unsubLink}" style="color:#6b7386">Unsubscribe</a>`);
  const text = `New from Homo Ludens: ${g.title}\n\n${g.announce || g.short}\n\nPlay: ${abs(g.url)}\n\n` +
    (others.length ? `Also at Homo Ludens:\n${others.map(o => `- ${o.title}: ${o.short} ${abs(o.url)}`).join('\n')}\n\n` : '') +
    `Unsubscribe: ${unsubLink}`;
  return { subject, html, text };
}

// ---------------------------------------------------------------- admin
async function admin(request, env, url) {
  if (!env.ADMIN_TOKEN) return json({ ok: false, error: 'not-configured' }, 503);
  const auth = request.headers.get('Authorization') || '';
  // Only wrong tokens count against the rate limit (3 a minute), so the stats tabs can load freely.
  if (!sameString(auth, 'Bearer ' + env.ADMIN_TOKEN)) {
    if (!(await rateOk(env, 'adm:' + ipOf(request)))) return json({ ok: false, error: 'rate' }, 429);
    return json({ ok: false, error: 'auth' }, 401);
  }
  if (url.pathname === '/api/admin/borderlines') return await borderlinesStats(env, url);
  const gm = url.pathname.match(/^\/api\/admin\/games\/([a-z]+)$/);
  if (gm && GAME_SQL[gm[1]]) return await runStats(env, url, gm[1], GAME_SQL[gm[1]]);
  if (!newsletterEnabled(env)) return json({ ok: false, error: 'newsletter-not-configured' }, 503);
  const games = await loadGames(env, url.origin);

  if (url.pathname === '/api/admin/stats') {
    let confirmed = 0, pending = 0;
    await listAll(env, 'sub:', k => { (k.metadata && k.metadata.s === 'c') ? confirmed++ : pending++; });
    const sent = {};
    for (const g of games) { let n = 0; await listAll(env, `sent:${g.id}:`, () => n++); sent[g.id] = n; }
    return json({ ok: true, confirmed, pending, sent, games: games.map(g => ({ id: g.id, title: g.title })) });
  }
  if (url.pathname === '/api/admin/preview') {
    const m = announcement(games, url.searchParams.get('game'), url.origin, url.origin + '/api/newsletter/unsubscribe?preview');
    if (!m) return json({ ok: false, error: 'game' }, 404);
    return new Response(m.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (url.pathname === '/api/admin/announce' && request.method === 'POST') {
    const { data: d, error } = await readJson(request, url);
    if (error) return error;
    const id = String(d.game || '');
    if (!games.find(g => g.id === id)) return json({ ok: false, error: 'game' }, 404);
    if (d.mode === 'test') {
      if (!env.ADMIN_EMAIL) return json({ ok: false, error: 'no-admin-email' }, 400);
      const unsub = await linkFor(env, url.origin, 'unsubscribe', env.ADMIN_EMAIL);
      const m = announcement(games, id, url.origin, unsub);
      const ok = await sendEmail(env, { to: [env.ADMIN_EMAIL], subject: '[Test] ' + m.subject, html: m.html, text: m.text });
      return json({ ok, sent: ok ? 1 : 0 });
    }
    if (d.mode !== 'all' || d.confirm !== id) return json({ ok: false, error: 'confirm' }, 400);
    // Send to confirmed subscribers who haven't had this game's email yet, up to `max` per run
    // (Resend's free plan allows 100 emails a day; press Send again the next day to continue).
    const max = Math.min(Math.max(1, Number(d.max) || 95), 500);
    // One send at a time. KV is not a perfect lock (it is eventually consistent), so the Resend idempotency key
    // below is the real guard against a batch going out twice; the lock just stops a second click early.
    const LOCK = 'lock:announce';
    const held = await env.SUBSCRIBERS.get(LOCK);
    if (held && Number(held) > Date.now()) return json({ ok: false, error: 'busy' }, 409);
    await env.SUBSCRIBERS.put(LOCK, String(Date.now() + 110 * 1000), { expirationTtl: 120 });
    try {
      const todo = [];
      await listAll(env, 'sub:', k => { if (k.metadata && k.metadata.s === 'c') todo.push(k.name.slice(4)); });
      const already = new Set();
      await listAll(env, `sent:${id}:`, k => already.add(k.name.slice(`sent:${id}:`.length)));
      const queue = todo.filter(e => !already.has(e)).sort();
      const now = queue.slice(0, max);
      let sent = 0;
      for (let i = 0; i < now.length; i += 100) {
        const chunk = now.slice(i, i + 100);
        // Mark first, send second: if the Worker dies in between, someone misses one email (visible in the admin
        // count) instead of somebody getting it twice. A failed send rolls the marks back.
        const marked = [];
        for (const email of chunk) if (await putRetry(env, `sent:${id}:${email}`, String(Date.now()))) marked.push(email);
        if (!marked.length) return json({ ok: false, error: 'storage', sent, remaining: queue.length - sent }, 503);
        const msgs = [];
        for (const email of marked) {
          const unsub = await linkFor(env, url.origin, 'unsubscribe', email);
          const m = announcement(games, id, url.origin, unsub);
          msgs.push({ to: [email], subject: m.subject, html: m.html, text: m.text, headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
        }
        const key = `announce-${id}-${(await sha256hex(marked.join('\n'))).slice(0, 40)}`;
        const res = await sendBatch(env, msgs, key);
        if (res !== 'ok') {
          // 'busy' means another request is sending this very batch: keep the marks. Only a real failure rolls back.
          if (res === 'fail') await Promise.all(marked.map(e => env.SUBSCRIBERS.delete(`sent:${id}:${e}`).catch(() => {})));
          return json({ ok: false, error: res === 'busy' ? 'busy' : 'deliver', sent, remaining: queue.length - sent }, res === 'busy' ? 409 : 502);
        }
        sent += marked.length;
      }
      return json({ ok: true, sent, remaining: queue.length - sent });
    } finally {
      await env.SUBSCRIBERS.delete(LOCK).catch(() => {});
    }
  }
  return json({ ok: false, error: 'not-found' }, 404);
}

// ---------------------------------------------------------------- Borderlines stats (admin only)
// Daily players and scores, read from PostHog (same pattern for the other games below). Counts are per anonymous player id; a player's first
// completion of a day counts. (HogQL returns only 100 rows unless a LIMIT is given, hence LIMIT 5000.) Results are cached for 5 minutes (?fresh=1 skips the cache).
const BL_SINCE = "toDateTime('2026-09-20 00:00:00')";
const BL_PID = 'coalesce(toString(properties.pid), distinct_id)';
const BL_SQL = {
  // one row per (daily number, mode): players who finished, their scores
  done: `SELECT d, mode, count() AS players, round(avg(t), 1) AS avg, quantile(0.5)(t) AS median, max(t) AS best,
      round(avg(h), 2) AS hints, countIf(nw = 0) AS newbies
    FROM (SELECT toInt(properties.day) AS d, toString(properties.mode) AS mode, ${BL_PID} AS p,
        argMin(toFloat(properties.total), timestamp) AS t, argMin(toFloat(properties.hints), timestamp) AS h,
        argMin(toInt(properties.daysSinceFirst), timestamp) AS nw
      FROM events WHERE event = 'game_complete' AND properties.mode IN ('daily', 'archive') AND timestamp >= ${BL_SINCE}
      GROUP BY d, mode, p)
    GROUP BY d, mode`,
  started: `SELECT toInt(properties.day) AS d, toString(properties.mode) AS mode, uniq(${BL_PID}) AS players
    FROM events WHERE event = 'game_start' AND properties.mode IN ('daily', 'archive') AND timestamp >= ${BL_SINCE}
    GROUP BY d, mode`,
  // visitors by the player's own calendar day (= that day's daily number)
  opened: `SELECT toInt(properties.dayIdx) AS d, uniq(${BL_PID}) AS players, uniqIf(${BL_PID}, toInt(properties.daysSinceFirst) = 0) AS firstTime
    FROM events WHERE event = 'app_open' AND timestamp >= ${BL_SINCE} GROUP BY d`,
  // score spread of on-the-day players, in 50-point buckets (0–49 … 450–500)
  hist: `SELECT d, least(intDiv(toInt(t), 50), 9) AS b, count() AS n
    FROM (SELECT toInt(properties.day) AS d, ${BL_PID} AS p, argMin(toFloat(properties.total), timestamp) AS t
      FROM events WHERE event = 'game_complete' AND properties.mode = 'daily' AND timestamp >= ${BL_SINCE} GROUP BY d, p)
    GROUP BY d, b`,
  // each realm of each daily (on the day and from the archive)
  realms: `SELECT toString(properties.qid) AS q, uniq(${BL_PID}) AS players, round(avg(toFloat(properties.score)), 1) AS avg,
      quantile(0.5)(toFloat(properties.score)) AS median, round(avg(toFloat(properties.coverage)), 2) AS coverage,
      round(avg(toFloat(properties.precision)), 2) AS precision, round(avg(toFloat(properties.ms)) / 1000) AS seconds,
      countIf(toFloat(properties.hintPenalty) > 0) AS hinted, count() AS rounds
    FROM events WHERE event = 'round_submit' AND properties.mode IN ('daily', 'archive') AND timestamp >= ${BL_SINCE}
    GROUP BY q`,
  total: `SELECT uniq(${BL_PID}) AS players FROM events WHERE event = 'game_complete' AND properties.mode IN ('daily', 'archive') AND timestamp >= ${BL_SINCE}`,
};
async function phQuery(env, name, sql) {
  const host = env.POSTHOG_HOST || 'https://us.posthog.com';
  const r = await fetch(`${host}/api/projects/${env.POSTHOG_PROJECT_ID || '652087'}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.POSTHOG_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql + ' LIMIT 5000' }, name: 'admin-borderlines-' + name }),
  });
  const text = await r.text();
  if (!r.ok) { const e = new Error('posthog'); e.detail = `${name}: HTTP ${r.status} ${text.slice(0, 300)}`; throw e; }
  const j = JSON.parse(text);
  return (j.results || []).map(row => Object.fromEntries(j.columns.map((c, i) => [c, row[i]])));
}
async function runStats(env, url, name, sqls) {
  if (!env.POSTHOG_API_KEY) return json({ ok: false, error: 'posthog-not-configured' }, 503);
  const cache = caches.default;
  const key = new Request(url.origin + '/__cache/admin-stats/' + name);
  if (url.searchParams.get('fresh') !== '1') {
    const hit = await cache.match(key);
    if (hit) return new Response(hit.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  let out;
  try {
    const names = Object.keys(sqls);
    const res = await Promise.all(names.map(n => phQuery(env, n, sqls[n])));
    out = Object.fromEntries(names.map((n, i) => [n, res[i]]));
  } catch (e) {
    return json({ ok: false, error: 'posthog', detail: e.detail || String(e.message) }, 502);
  }
  const body = JSON.stringify({ ok: true, at: Date.now(), ...out });
  await cache.put(key, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' } }));
  return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
const borderlinesStats = (env, url) => runStats(env, url, 'borderlines', BL_SQL);

// ---------------------------------------------------------------- site and other games (admin only)
// Last 90 days. Every game shares the site-wide player id, so distinct_id is one browser.
// Careful: a column alias must not be called `event` (it would shadow the event name in WHERE).
const R90 = 'timestamp >= now() - INTERVAL 90 DAY';
const GAME_SQL = {
  overview: {
    daily: `SELECT toString(toDate(toTimeZone(timestamp, 'Europe/Amsterdam'))) AS date,
        uniqIf(distinct_id, event = '$pageview') AS visitors,
        uniqIf(distinct_id, event = '$pageview' AND properties.$pathname = '/') AS portal,
        uniqIf(distinct_id, event = 'game_start' AND properties.mode IN ('daily', 'archive', 'practice')) AS borderlines,
        uniqIf(distinct_id, event IN ('game_start', 'game_resume') AND properties.game = 'retourvloot') AS retourvloot,
        uniqIf(distinct_id, event = 'tea_scene_start') AS cupoftea,
        uniqIf(distinct_id, event IN ('polder_level_start', 'polder_resume')) AS polder,
        uniqIf(distinct_id, event IN ('kantar_game_start', 'kantar_resume')) AS kantar,
        countIf(event = 'newsletter_signup') AS signups
      FROM events WHERE ${R90} GROUP BY date ORDER BY date DESC`,
    sources: `SELECT coalesce(nullIf(toString(properties.$referring_domain), ''), '$direct') AS source, uniq(distinct_id) AS visitors
      FROM events WHERE event = '$pageview' AND ${R90} AND NOT (coalesce(toString(properties.$referring_domain), '') LIKE '%workers.dev')
      GROUP BY source ORDER BY visitors DESC`,
    countries: `SELECT coalesce(toString(properties.$geoip_country_code), '?') AS country, uniq(distinct_id) AS visitors
      FROM events WHERE event = '$pageview' AND ${R90} GROUP BY country ORDER BY visitors DESC`,
    clicks: `SELECT toString(properties.game) AS game, count() AS clicks, uniq(distinct_id) AS players
      FROM events WHERE event = 'portal_play' AND ${R90} GROUP BY game ORDER BY clicks DESC`,
  },
  // one row per visitor (browser id): where they came from and what they did
  visitors: {
    people: `SELECT distinct_id AS id, min(timestamp) AS first, max(timestamp) AS last,
        argMinIf(coalesce(nullIf(toString(properties.$referring_domain), ''), '$direct'), timestamp, event = '$pageview') AS source,
        argMinIf(toString(properties.utm_source), timestamp, event = '$pageview') AS utm,
        argMinIf(toString(properties.$pathname), timestamp, event = '$pageview') AS landing,
        argMin(toString(properties.$geoip_country_code), timestamp) AS country,
        argMin(toString(properties.$device_type), timestamp) AS device,
        uniq(toDate(toTimeZone(timestamp, 'Europe/Amsterdam'))) AS days,
        uniq(toStartOfMinute(timestamp)) AS minutes,
        countIf(event = '$pageview') AS pageviews,
        countIf(event = 'portal_open') AS portalOpens, countIf(event = 'portal_play') AS portalClicks,
        countIf(event = 'game_start' AND properties.mode IN ('daily', 'archive', 'practice')) AS blStarts,
        countIf(event = 'game_complete' AND properties.mode IN ('daily', 'archive', 'practice')) AS blGames,
        countIf(event IN ('game_start', 'game_resume') AND properties.game = 'retourvloot') AS rvStarts,
        max(if(properties.game = 'retourvloot', toInt(properties.year), 0)) AS rvYear,
        countIf(event = 'tea_scene_start') AS teaStarts, countIf(event = 'tea_scene_done') AS teaDone,
        countIf(event IN ('polder_level_start', 'polder_resume')) AS pdStarts, countIf(event = 'polder_level_end') AS pdDone,
        countIf(event IN ('kantar_game_start', 'kantar_resume')) AS kaStarts, countIf(event = 'kantar_game_end') AS kaDone,
        countIf(event = 'kantar_game_end' AND properties.result = 'win') AS kaWins,
        countIf(event = 'newsletter_signup') AS signups, countIf(event LIKE 'share%' OR event = 'polder_share') AS shares
      FROM events WHERE ${R90} GROUP BY id ORDER BY first DESC`,
    spots: `SELECT toString(properties.game) AS game, coalesce(toString(properties.from), '?') AS spot, count() AS clicks, uniq(distinct_id) AS people
      FROM events WHERE event = 'portal_play' AND ${R90} GROUP BY game, spot ORDER BY clicks DESC`,
  },
  retourvloot: {
    funnel: `SELECT uniqIf(distinct_id, event = 'game_start') AS started, countIf(event = 'game_start' AND toString(properties.restart) = 'true') AS restarts,
        uniqIf(distinct_id, event = 'game_resume') AS resumed, uniqIf(distinct_id, event = 'tutorial_done') AS tutorialDone,
        uniqIf(distinct_id, event = 'tutorial_skip') AS tutorialSkip, uniqIf(distinct_id, event = 'first_ship') AS firstShip,
        uniqIf(distinct_id, event = 'game_end') AS ended
      FROM events WHERE properties.game = 'retourvloot' AND ${R90}`,
    reach: `SELECT intDiv(y, 10) * 10 AS decade, count() AS players
      FROM (SELECT distinct_id, max(toInt(properties.year)) AS y FROM events
        WHERE properties.game = 'retourvloot' AND properties.year IS NOT NULL AND ${R90} GROUP BY distinct_id)
      GROUP BY decade ORDER BY decade`,
    ends: `SELECT toString(properties.reason) AS reason, count() AS games, round(avg(toFloat(properties.year))) AS year,
        round(avg(toFloat(properties.dividends))) AS dividends, round(avg(toFloat(properties.voyages)), 1) AS voyages,
        round(avg(toFloat(properties.monopolies)), 1) AS monopolies, round(avg(toFloat(properties.cash))) AS cash, round(avg(toFloat(properties.debt))) AS debt
      FROM events WHERE event = 'game_end' AND properties.game = 'retourvloot' AND ${R90} GROUP BY reason`,
    choices: `SELECT toString(properties.event) AS card, toString(properties.label) AS label, count() AS n, round(avg(toFloat(properties.year))) AS year
      FROM events WHERE event = 'event_choice' AND properties.game = 'retourvloot' AND ${R90} GROUP BY card, label ORDER BY year, card, n DESC`,
    skips: `SELECT toString(properties.step) AS step, count() AS n
      FROM events WHERE event = 'tutorial_skip' AND properties.game = 'retourvloot' AND ${R90} GROUP BY step ORDER BY n DESC`,
  },
  cupoftea: {
    scenes: `SELECT toInt(properties.scene) AS scene, uniqIf(distinct_id, event = 'tea_scene_start') AS started,
        uniqIf(distinct_id, event = 'tea_scene_done') AS finished, round(avgIf(toFloat(properties.blots), event = 'tea_scene_done'), 1) AS blots,
        quantileIf(0.5)(toFloat(properties.blots), event = 'tea_scene_done') AS medianBlots
      FROM events WHERE event IN ('tea_scene_start', 'tea_scene_done') AND ${R90} GROUP BY scene ORDER BY scene`,
    players: `SELECT uniq(distinct_id) AS players, uniqIf(distinct_id, s = 3) AS allThree
      FROM (SELECT distinct_id, uniq(toInt(properties.scene)) AS s FROM events WHERE event = 'tea_scene_done' AND ${R90} GROUP BY distinct_id)`,
  },
  polder: {
    levels: `SELECT toString(properties.level) AS level, uniqIf(distinct_id, event = 'polder_level_start') AS starters,
        uniqIf(distinct_id, event = 'polder_level_end') AS finishers, round(avgIf(toFloat(properties.stars), event = 'polder_level_end'), 2) AS stars,
        countIf(event = 'polder_level_end' AND toInt(properties.stars) >= 3) AS threeStar, countIf(event = 'polder_level_end') AS ends,
        countIf(event = 'polder_level_start' AND properties.diff = 'hard') AS hardStarts, countIf(event = 'polder_level_start') AS starts,
        countIf(event = 'polder_quit') AS quits, round(avgIf(toFloat(properties.breaches), event = 'polder_level_end'), 1) AS breaches,
        round(avgIf(toFloat(properties.fields), event = 'polder_level_end'), 1) AS fields
      FROM events WHERE event IN ('polder_level_start', 'polder_level_end', 'polder_quit') AND ${R90} GROUP BY level`,
    goals: `SELECT toString(properties.level) AS level, toString(properties.goal) AS goal,
        countIf(toString(properties.ok) IN ('true', '1')) AS ok, countIf(toString(properties.ok) NOT IN ('true', '1')) AS missed
      FROM events WHERE event = 'polder_goal' AND ${R90} GROUP BY level, goal ORDER BY level, goal`,
    achievements: `SELECT toString(properties.id) AS id, uniq(distinct_id) AS players
      FROM events WHERE event = 'polder_achievement' AND ${R90} GROUP BY id ORDER BY players DESC`,
    upgrades: `SELECT toString(properties.key) AS upgrade, count() AS n, uniq(distinct_id) AS players
      FROM events WHERE event = 'polder_upgrade' AND ${R90} GROUP BY upgrade ORDER BY n DESC`,
    storms: `SELECT toString(properties.level) AS level, count() AS storms, round(avg(toFloat(properties.breaches)), 2) AS breaches
      FROM events WHERE event = 'polder_storm' AND ${R90} GROUP BY level`,
  },
  // Kantar: kantar_game_start {mode: classic|narh, diff: usta|other, teacher, first: you|rival},
  // kantar_game_end {+ result: win|loss|draw, you, rival, uc, cut (seal used by the player)}, kantar_resume, kantar_stats_open.
  kantar: {
    funnel: `SELECT uniqIf(distinct_id, event = 'kantar_game_start') AS players, countIf(event = 'kantar_game_start') AS starts,
        uniqIf(distinct_id, event = 'kantar_game_end') AS finishers, countIf(event = 'kantar_game_end') AS ends,
        countIf(event = 'kantar_resume') AS resumes, uniqIf(distinct_id, event = 'kantar_stats_open') AS statsOpen,
        countIf(event = 'kantar_game_end' AND properties.result = 'win') AS wins,
        countIf(event = 'kantar_game_end' AND properties.result = 'loss') AS losses,
        countIf(event = 'kantar_game_end' AND properties.result = 'draw') AS draws
      FROM events WHERE event IN ('kantar_game_start', 'kantar_game_end', 'kantar_resume', 'kantar_stats_open') AND ${R90}`,
    // one row per setting combination; win rates show whether Apprentice/Master and the teacher feel right
    setups: `SELECT toString(properties.mode) AS mode, if(toString(properties.diff) = 'usta', 'master', 'apprentice') AS level,
        if(toString(properties.teacher) IN ('true', '1'), 1, 0) AS teacher,
        uniq(distinct_id) AS players, count() AS games,
        countIf(properties.result = 'win') AS wins, countIf(properties.result = 'loss') AS losses, countIf(properties.result = 'draw') AS draws,
        round(avg(toFloat(properties.you)), 1) AS you, round(avg(toFloat(properties.rival)), 1) AS rival
      FROM events WHERE event = 'kantar_game_end' AND ${R90} GROUP BY mode, level, teacher ORDER BY games DESC`,
    // first divider advantage against the bot balance numbers (Classic 47/53, Narh 49/46)
    first: `SELECT toString(properties.mode) AS mode, toString(properties.first) AS first, count() AS games,
        countIf(properties.result = 'win') AS wins, countIf(properties.result = 'draw') AS draws
      FROM events WHERE event = 'kantar_game_end' AND ${R90} GROUP BY mode, first ORDER BY mode, first`,
    seals: `SELECT countIf(toString(properties.uc) IN ('true', '1')) AS uc, countIf(toString(properties.uc) IN ('true', '1') AND properties.result = 'win') AS ucWins,
        countIf(toString(properties.cut) IN ('true', '1')) AS cut, countIf(toString(properties.cut) IN ('true', '1') AND properties.result = 'win') AS cutWins,
        countIf(toString(properties.uc) NOT IN ('true', '1') AND toString(properties.cut) NOT IN ('true', '1')) AS neither,
        countIf(toString(properties.uc) NOT IN ('true', '1') AND toString(properties.cut) NOT IN ('true', '1') AND properties.result = 'win') AS neitherWins,
        count() AS games
      FROM events WHERE event = 'kantar_game_end' AND ${R90}`,
    // how many games each player finished: the replay curve
    depth: `SELECT multiIf(n = 0, '0', n = 1, '1', n = 2, '2', n <= 4, '3–4', n <= 9, '5–9', '10+') AS games, count() AS players
      FROM (SELECT distinct_id, countIf(event = 'kantar_game_end') AS n FROM events
        WHERE event IN ('kantar_game_start', 'kantar_game_end') AND ${R90} GROUP BY distinct_id)
      GROUP BY games ORDER BY min(n)`,
    lang: `SELECT coalesce(nullIf(toString(properties.lang), ''), '?') AS lang, uniq(distinct_id) AS players, countIf(event = 'kantar_game_end') AS games
      FROM events WHERE event IN ('kantar_game_start', 'kantar_game_end') AND ${R90} GROUP BY lang ORDER BY players DESC`,
    daily: `SELECT toString(toDate(toTimeZone(timestamp, 'Europe/Amsterdam'))) AS date,
        uniqIf(distinct_id, event IN ('kantar_game_start', 'kantar_resume')) AS players,
        countIf(event = 'kantar_game_start') AS starts, countIf(event = 'kantar_game_end') AS ends
      FROM events WHERE event IN ('kantar_game_start', 'kantar_game_end', 'kantar_resume') AND ${R90} GROUP BY date ORDER BY date DESC`,
  },
};

// ---------------------------------------------------------------- Borderlines share links
// /borderlines/s/247?d=12 → link previews show public/borderlines/og/247.png; people are sent on to the game.
const RANKS = [[90, 'Master Cartographer'], [80, 'Royal Geographer'], [70, 'Imperial Surveyor'], [60, 'Border Commissioner'], [50, 'Frontier Scout'], [40, 'Map Apprentice'], [25, 'Lost Envoy'], [0, 'Here Be Dragons']];
function shareCard(url) {
  const m = url.pathname.match(/^\/borderlines\/s\/(\d{1,3})\/?$/);
  const total = m ? Number(m[1]) : NaN;
  if (!(total >= 0 && total <= 500)) return Response.redirect(url.origin + '/borderlines/', 302);
  const d = Number(url.searchParams.get('d'));
  const day = Number.isInteger(d) && d > 0 && d < 100000 ? d : 0;
  const rank = RANKS.find(([min]) => total / 5 >= min)[1];
  const title = `Borderlines ${day ? '#' + day : 'Practice'} · ${total}/500`;
  const desc = `${rank}. You get a year and a realm: paint the land it ruled. Can you beat it?`;
  const img = `${url.origin}/borderlines/og/${total}.png`;
  const game = `${url.origin}/borderlines/`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title><meta name="description" content="${desc}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Homo Ludens">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}">
<meta property="og:url" content="${url.origin}${url.pathname}${day ? '?d=' + day : ''}">
<meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0;url=${game}"><script>location.replace(${JSON.stringify(game)})</script>
</head><body><a href="${game}">Play Borderlines</a></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
}
