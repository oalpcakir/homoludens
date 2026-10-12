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
const GAMES = { portal: 'Portal', borderlines: 'Borderlines', retourvloot: 'Retourvloot', cupoftea: 'A Cup of Tea', polder: 'Polder' };
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
async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', String(token || ''));
  form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const j = await r.json();
  return !!j.success;
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
  if (!(await turnstileOk(env, d.token, ip))) return json({ ok: false, error: 'captcha' }, 403);
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
async function sendBatch(env, msgs) {
  const r = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(msgs.map(m => ({ from: env.NEWSLETTER_FROM, ...m }))),
  });
  return r.ok;
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
  if (!(await turnstileOk(env, d.token, ip))) return json({ ok: false, error: 'captcha' }, 403);

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
    // forget every trace of the address, including which emails it was sent
    let cursor;
    do {
      const l = await env.SUBSCRIBERS.list({ prefix: 'sent:', cursor });
      for (const k of l.keys) if (k.name.endsWith(':' + email)) await env.SUBSCRIBERS.delete(k.name);
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
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
  if (!(await rateOk(env, 'adm:' + ipOf(request)))) return json({ ok: false, error: 'rate' }, 429);
  if (!sameString(auth, 'Bearer ' + env.ADMIN_TOKEN)) return json({ ok: false, error: 'auth' }, 401);
  if (url.pathname === '/api/admin/borderlines') return await borderlinesStats(env, url);
  if (!newsletterEnabled(env)) return json({ ok: false, error: 'newsletter-not-configured' }, 503);
  const games = await loadGames(env, url.origin);

  if (url.pathname === '/api/admin/stats') {
    let confirmed = 0, pending = 0, cursor;
    do {
      const l = await env.SUBSCRIBERS.list({ prefix: 'sub:', cursor });
      for (const k of l.keys) (k.metadata && k.metadata.s === 'c') ? confirmed++ : pending++;
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
    const sent = {};
    for (const g of games) sent[g.id] = (await env.SUBSCRIBERS.list({ prefix: `sent:${g.id}:` })).keys.length;
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
    const todo = []; let cursor;
    do {
      const l = await env.SUBSCRIBERS.list({ prefix: 'sub:', cursor });
      for (const k of l.keys) if (k.metadata && k.metadata.s === 'c') todo.push(k.name.slice(4));
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
    const already = new Set();
    cursor = undefined;
    do {
      const l = await env.SUBSCRIBERS.list({ prefix: `sent:${id}:`, cursor });
      for (const k of l.keys) already.add(k.name.slice(`sent:${id}:`.length));
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
    const queue = todo.filter(e => !already.has(e));
    const now = queue.slice(0, max);
    let sent = 0;
    for (let i = 0; i < now.length; i += 100) {
      const chunk = now.slice(i, i + 100);
      const msgs = [];
      for (const email of chunk) {
        const unsub = await linkFor(env, url.origin, 'unsubscribe', email);
        const m = announcement(games, id, url.origin, unsub);
        msgs.push({ to: [email], subject: m.subject, html: m.html, text: m.text, headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
      }
      if (!(await sendBatch(env, msgs))) return json({ ok: false, error: 'deliver', sent, remaining: queue.length - sent }, 502);
      for (const email of chunk) await env.SUBSCRIBERS.put(`sent:${id}:${email}`, String(Date.now()));
      sent += chunk.length;
    }
    return json({ ok: true, sent, remaining: queue.length - sent });
  }
  return json({ ok: false, error: 'not-found' }, 404);
}

// ---------------------------------------------------------------- Borderlines stats (admin only)
// Daily players and scores, read from PostHog. Counts are per anonymous player id; a player's first
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
async function borderlinesStats(env, url) {
  if (!env.POSTHOG_API_KEY) return json({ ok: false, error: 'posthog-not-configured' }, 503);
  const cache = caches.default;
  const key = new Request(url.origin + '/__cache/admin-borderlines');
  if (url.searchParams.get('fresh') !== '1') {
    const hit = await cache.match(key);
    if (hit) return new Response(hit.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  let out;
  try {
    const names = Object.keys(BL_SQL);
    const res = await Promise.all(names.map(n => phQuery(env, n, BL_SQL[n])));
    out = Object.fromEntries(names.map((n, i) => [n, res[i]]));
  } catch (e) {
    return json({ ok: false, error: 'posthog', detail: e.detail || String(e.message) }, 502);
  }
  const body = JSON.stringify({ ok: true, at: Date.now(), ...out });
  await cache.put(key, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' } }));
  return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

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
