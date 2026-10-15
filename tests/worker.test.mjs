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
