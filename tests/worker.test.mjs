// Worker tests with mocked KV, Resend, Turnstile and Discord. Run: node --test tests/
// No network, no Cloudflare account needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'hlw-'));
writeFileSync(join(tmp, 'worker.mjs'), readFileSync(join(ROOT, 'worker.js'), 'utf8'));
const worker = (await import(pathToFileURL(join(tmp, 'worker.mjs')))).default;
const GAMES = JSON.parse(readFileSync(join(ROOT, 'public', 'games.json'), 'utf8'));
const ORIGIN = 'https://hl.test';

// KV with small pages so cursor handling is exercised
function makeKV(pageSize = 3) {
  const m = new Map();
  return {
    m,
    async get(k, type) { const v = m.get(k); if (!v) return null; return type === 'json' ? JSON.parse(v.value) : v.value; },
    async put(k, value, opts = {}) { m.set(k, { value: String(value), metadata: opts.metadata }); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '', cursor }) {
      const all = [...m.keys()].filter(k => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const keys = all.slice(start, start + pageSize).map(name => ({ name, metadata: m.get(name).metadata }));
      const done = start + pageSize >= all.length;
      return { keys, list_complete: done, cursor: done ? undefined : String(start + pageSize) };
    },
  };
}

function setup({ batchFails = 0, hostname = 'hl.test' } = {}) {
  const env = {
    SUBSCRIBERS: makeKV(), RESEND_API_KEY: 'r', NEWSLETTER_SECRET: 's'.repeat(32), NEWSLETTER_FROM: 'HL <n@hl.test>',
    TURNSTILE_SECRET: 'live-secret', ADMIN_TOKEN: 'tok', ADMIN_EMAIL: 'me@hl.test', DISCORD_WEBHOOK_URL: 'https://discord.test/hook',
    FEEDBACK_LIMIT: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async req => new URL(req.url).pathname === '/games.json' ? new Response(JSON.stringify(GAMES)) : new Response('nf', { status: 404 }) },
  };
  const log = { emails: [], batches: 0, discord: [] };
  const idem = new Map();
  let fails = batchFails;
  globalThis.fetch = async (u, init = {}) => {
    u = String(u);
    if (u.includes('turnstile')) return new Response(JSON.stringify({ success: true, hostname }));
    if (u.startsWith('https://discord.test')) { log.discord.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    if (u === 'https://api.resend.com/emails') { log.emails.push(JSON.parse(init.body)); return new Response('{}'); }
    if (u === 'https://api.resend.com/emails/batch') {
      const key = init.headers['Idempotency-Key'];
      if (fails > 0) { fails--; return new Response('{}', { status: 500 }); }
      if (key && idem.get(key) === 'busy') return new Response('{}', { status: 409 }); // same key still in flight
      if (key && idem.has(key)) return new Response(idem.get(key)); // Resend replays, sends nothing new
      if (key) idem.set(key, 'busy');
      await new Promise(r => setTimeout(r, 5));
      for (const m of JSON.parse(init.body)) log.emails.push(m);
      log.batches++;
      if (key) idem.set(key, '{}');
      return new Response('{}');
    }
    throw new Error('unexpected fetch ' + u);
  };
  return { env, log };
}

const call = (env, path, { method = 'GET', body, headers = {} } = {}) =>
  worker.fetch(new Request(ORIGIN + path, { method, body: body && JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers } }), env, {});
const admin = (env, path, body) => call(env, path, { method: body ? 'POST' : 'GET', body, headers: { Authorization: 'Bearer tok' } });

async function addConfirmed(env, n) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const e = `p${i}@x.test`; list.push(e);
    await env.SUBSCRIBERS.put('sub:' + e, JSON.stringify({ email: e, status: 'confirmed' }), { metadata: { s: 'c' } });
  }
  return list;
}
const recipients = log => log.emails.flatMap(m => m.to);

test('feedback is filed under the right game for every game in games.json', async () => {
  const { env, log } = setup();
  for (const g of [...GAMES, { id: 'nope', title: 'Portal' }]) {
    const r = await call(env, '/api/feedback', { method: 'POST', body: { message: 'hello there', kind: 'bug', game: g.id, token: 't' } });
    assert.equal(r.status, 200);
    assert.match(log.discord.at(-1).embeds[0].title, new RegExp('^' + g.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' · Bug$'));
  }
});

test('turnstile token from another hostname is rejected', async () => {
  const { env } = setup({ hostname: 'evil.test' });
  const r = await call(env, '/api/feedback', { method: 'POST', body: { message: 'hello there', game: 'polder', token: 't' } });
  assert.equal(r.status, 403);
});

test('sign-up, confirm and unsubscribe', async () => {
  const { env, log } = setup();
  let r = await call(env, '/api/newsletter/subscribe', { method: 'POST', body: { email: 'A@Example.test', token: 't' } });
  assert.equal(r.status, 200);
  assert.equal((await env.SUBSCRIBERS.get('sub:a@example.test', 'json')).status, 'pending');
  const link = log.emails[0].text.match(/Confirm: (\S+)/)[1].replace(ORIGIN, '');
  // a repeat sign-up within a day sends nothing and answers the same
  r = await call(env, '/api/newsletter/subscribe', { method: 'POST', body: { email: 'a@example.test', token: 't' } });
  assert.equal(r.status, 200); assert.equal(log.emails.length, 1);
  // GET only shows a button (mail scanners), POST confirms
  r = await worker.fetch(new Request(ORIGIN + link), env, {});
  assert.equal((await env.SUBSCRIBERS.get('sub:a@example.test', 'json')).status, 'pending');
  const q = new URL(ORIGIN + link).searchParams;
  r = await worker.fetch(new Request(ORIGIN + '/api/newsletter/confirm', { method: 'POST', body: new URLSearchParams({ e: q.get('e'), t: q.get('t') }) }), env, {});
  assert.equal(r.status, 200);
  assert.equal((await env.SUBSCRIBERS.get('sub:a@example.test', 'json')).status, 'confirmed');
  // tampered link
  r = await worker.fetch(new Request(ORIGIN + '/api/newsletter/confirm?e=' + q.get('e') + '&t=bad'), env, {});
  assert.equal(r.status, 400);
  // announce, then unsubscribe removes the address and its sent markers
  await admin(env, '/api/admin/announce', { game: 'polder', mode: 'all', confirm: 'polder' });
  assert.ok(env.SUBSCRIBERS.m.has('sent:polder:a@example.test'));
  const unsub = log.emails.at(-1).headers['List-Unsubscribe'].slice(1, -1);
  r = await worker.fetch(new Request(unsub, { method: 'POST', body: 'List-Unsubscribe=One-Click' }), env, {});
  assert.equal(r.status, 200);
  assert.equal([...env.SUBSCRIBERS.m.keys()].filter(k => k.includes('a@example.test')).length, 0);
});

test('admin rejects a wrong token', async () => {
  const { env } = setup();
  const r = await call(env, '/api/admin/stats', { headers: { Authorization: 'Bearer nope' } });
  assert.equal(r.status, 401);
});

test('stats count past one KV page', async () => {
  const { env } = setup();
  const list = await addConfirmed(env, 8);
  for (const e of list.slice(0, 7)) await env.SUBSCRIBERS.put('sent:borderlines:' + e, '1');
  const j = await (await admin(env, '/api/admin/stats')).json();
  assert.equal(j.confirmed, 8); assert.equal(j.sent.borderlines, 7);
});

test('announce sends each subscriber once, across runs and limits', async () => {
  const { env, log } = setup();
  const list = await addConfirmed(env, 7);
  let j = await (await admin(env, '/api/admin/announce', { game: 'cupoftea', mode: 'all', confirm: 'cupoftea', max: 4 })).json();
  assert.deepEqual([j.ok, j.sent, j.remaining], [true, 4, 3]);
  j = await (await admin(env, '/api/admin/announce', { game: 'cupoftea', mode: 'all', confirm: 'cupoftea' })).json();
  assert.deepEqual([j.sent, j.remaining], [3, 0]);
  j = await (await admin(env, '/api/admin/announce', { game: 'cupoftea', mode: 'all', confirm: 'cupoftea' })).json();
  assert.equal(j.sent, 0);
  assert.deepEqual(recipients(log).sort(), list.sort());
  assert.ok(!env.SUBSCRIBERS.m.has('lock:announce'), 'lock released');
});

test('two simultaneous sends do not email anyone twice', async () => {
  const { env, log } = setup();
  const list = await addConfirmed(env, 7);
  const body = { game: 'retourvloot', mode: 'all', confirm: 'retourvloot' };
  const rs = await Promise.all([admin(env, '/api/admin/announce', body), admin(env, '/api/admin/announce', body)]);
  const statuses = rs.map(r => r.status).sort();
  const got = recipients(log);
  assert.equal(new Set(got).size, got.length, 'no duplicates: ' + statuses);
  assert.deepEqual([...new Set(got)].sort(), list.sort());
  for (const e of list) assert.ok(env.SUBSCRIBERS.m.has('sent:retourvloot:' + e), 'marker kept for ' + e);
});

test('a failed batch is rolled back and can be retried', async () => {
  const { env, log } = setup({ batchFails: 1 });
  const list = await addConfirmed(env, 5);
  let r = await admin(env, '/api/admin/announce', { game: 'borderlines', mode: 'all', confirm: 'borderlines' });
  assert.equal(r.status, 502);
  assert.equal([...env.SUBSCRIBERS.m.keys()].filter(k => k.startsWith('sent:')).length, 0);
  const j = await (await admin(env, '/api/admin/announce', { game: 'borderlines', mode: 'all', confirm: 'borderlines' })).json();
  assert.equal(j.sent, 5);
  assert.deepEqual(recipients(log).sort(), list.sort());
});

test('announce needs the game id typed as confirmation', async () => {
  const { env, log } = setup();
  await addConfirmed(env, 2);
  const r = await admin(env, '/api/admin/announce', { game: 'polder', mode: 'all', confirm: 'yes' });
  assert.equal(r.status, 400); assert.equal(log.emails.length, 0);
});

test('preview renders for every game', async () => {
  const { env } = setup();
  for (const g of GAMES) {
    const r = await admin(env, '/api/admin/preview?game=' + g.id);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.ok(html.includes(g.title.replace(/'/g, '&#39;')) && html.includes(ORIGIN + g.image), g.id);
  }
});

test('admin has a stats endpoint for every game in games.json', async () => {
  const { env } = setup();
  env.POSTHOG_API_KEY = 'ph';
  const seen = [];
  const prev = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).includes('/query/')) { seen.push(JSON.parse(init.body).query.query); return new Response(JSON.stringify({ columns: [], results: [] })); }
    return prev(u, init);
  };
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  for (const g of GAMES) {
    const path = g.id === 'borderlines' ? '/api/admin/borderlines' : '/api/admin/games/' + g.id;
    const r = await admin(env, path);
    assert.equal(r.status, 200, g.id + ' has no admin stats');
    assert.equal((await r.json()).ok, true, g.id);
  }
  // the site-wide tables count every game too
  const before = seen.length;
  await admin(env, '/api/admin/games/overview');
  await admin(env, '/api/admin/games/visitors');
  const site = seen.slice(before).join('\n');
  for (const id of ['kantar_game_start', 'polder_level_start', 'tea_scene_start']) assert.ok(site.includes(id), 'overview/visitors miss ' + id);
});

test('Kantar and Polder share links: preview names the result, escapes input, forwards to the game', async () => {
  const { env } = setup();
  let r = await call(env, '/kantar/s/18-14?r=w&lv=m&m=n&l=en');
  let h = await r.text();
  assert.match(h, /<meta property="og:title" content="Kantar · I beat the Master 18–14">/);
  assert.match(h, /og-kantar\.jpg/); assert.match(h, /location\.replace\("https:\/\/hl\.test\/kantar\/"\)/);
  h = await (await call(env, '/kantar/s/12-15?r=l&lv=a&l=tr')).text();
  assert.match(h, /Çırak’ya 12–15 yenildim/);
  r = await call(env, '/kantar/s/<script>');
  assert.equal(r.status, 302);
  h = await (await call(env, '/polder/s/zeeland/3?n=5&f=42&h=1&x="><b>')).text();
  assert.match(h, /Polder · Zeeland \(Hard\) ★★★☆☆ · 42 fields/);
  assert.doesNotMatch(h, /"><b>/);
  assert.equal((await call(env, '/polder/s/atlantis/3')).status, 302);
});

// ---------------------------------------------------------------- Borderlines daily percentile
const blDay = (now = Date.now()) => Math.floor((now - Date.UTC(2026, 8, 27)) / 864e5) + 1;
const blPost = (env, body, headers) => call(env, '/api/borderlines/score', { method: 'POST', body, headers });

test('Borderlines score: without the STATS binding both endpoints answer 204', async () => {
  const { env } = setup();
  assert.equal(env.STATS, undefined);
  assert.equal((await blPost(env, { day: blDay(), total: 300, pid: 'abcdef12' })).status, 204);
  assert.equal((await call(env, '/api/borderlines/dist?day=' + blDay())).status, 204);
});

test('Borderlines score: builds a 101-bucket histogram, one submission per player per day', async () => {
  const { env } = setup();
  env.STATS = makeKV();
  const day = blDay();
  let r = await blPost(env, { day, total: 412, pid: 'player0001' });
  assert.equal(r.status, 200);
  let j = await r.json();
  assert.equal(j.n, 1); assert.equal(j.b.length, 101); assert.equal(j.b[82], 1); // 412 / 5 = 82.4 → bucket 82
  for (const [i, t] of [[2, 0], [3, 500], [4, 250], [5, 412]].entries()) await blPost(env, { day, total: t[1], pid: 'player000' + (i + 2) });
  // the same player again (another device would have another id): counted once, answers the histogram
  r = await blPost(env, { day, total: 100, pid: 'player0001' });
  j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.dup, true); assert.equal(j.n, 5);
  r = await call(env, '/api/borderlines/dist?day=' + day);
  j = await r.json();
  assert.equal(j.n, 5); assert.equal(j.b[0], 1); assert.equal(j.b[100], 1); assert.equal(j.b[50], 1); assert.equal(j.b[82], 2);
  assert.equal(j.b.reduce((a, b) => a + b, 0), 5);
  assert.match(r.headers.get('Cache-Control'), /max-age=60/);
  // an empty day answers zeros, not an error
  j = await (await call(env, '/api/borderlines/dist?day=' + (day - 3))).json();
  assert.equal(j.n, 0); assert.equal(j.b.length, 101);
});

test('Borderlines score: rejects bad input, other days, other origins and rate-limited callers', async () => {
  const { env } = setup();
  env.STATS = makeKV();
  const day = blDay();
  for (const body of [
    { day, total: 501, pid: 'abcdef12' }, { day, total: -1, pid: 'abcdef12' }, { day, total: 12.5, pid: 'abcdef12' },
    { day, total: '300x', pid: 'abcdef12' }, { day: day - 2, total: 300, pid: 'abcdef12' }, { day: day + 2, total: 300, pid: 'abcdef12' },
    { day: 'x', total: 300, pid: 'abcdef12' }, { day, total: 300, pid: 'a b' }, { day, total: 300 }, { day, total: 300, pid: 'x'.repeat(41) },
  ]) assert.equal((await blPost(env, body)).status, 400, JSON.stringify(body));
  assert.equal((await blPost(env, { day, total: 300, pid: 'abcdef12' }, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await call(env, '/api/borderlines/score')).status, 405);
  for (const q of ['', '?day=0', '?day=abc', '?day=' + (day + 2)]) assert.equal((await call(env, '/api/borderlines/dist' + q)).status, 400, q);
  // yesterday and tomorrow are fine (players' local dates)
  assert.equal((await blPost(env, { day: day - 1, total: 300, pid: 'abcdef12' })).status, 200);
  assert.equal((await blPost(env, { day: day + 1, total: 300, pid: 'abcdef12' })).status, 200);
  env.FEEDBACK_LIMIT = { limit: async ({ key }) => ({ success: !key.startsWith('bls:') }) };
  assert.equal((await blPost(env, { day, total: 300, pid: 'zzzzzz99' })).status, 429);
  assert.equal([...env.STATS.m.keys()].filter(k => k.startsWith('bl:h:')).length, 2, 'rejected calls wrote to KV');
});
