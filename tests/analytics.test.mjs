// The shared analytics snippet: tags every event with game + version and sends the standard event names once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('..', import.meta.url).pathname;
const pageHead = path => {
  const html = readFileSync(ROOT + 'public' + path + 'index.html', 'utf8');
  const i = html.indexOf('<!-- Analytics: PostHog');
  return html.slice(html.indexOf('<script>', i) + 8, html.indexOf('</script>', i));
};

function run(path) {
  const calls = [], timers = [];
  let config = null, registered = null;
  const posthog = { __SV: 1, init: (k, c) => { config = c; }, register: p => { registered = JSON.parse(JSON.stringify(p)); }, capture: (n, p) => calls.push([n, JSON.parse(JSON.stringify(p))]) };
  const ls = new Map();
  const ctx = {
    window: { posthog }, posthog, document: {}, location: { pathname: path }, Math, Date, JSON, String,
    localStorage: { getItem: k => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v) },
    setTimeout: f => timers.push(f),
  };
  vm.runInNewContext(pageHead(path), ctx);
  const send = (event, properties) => { const ev = config.before_send({ event, properties }); timers.splice(0).forEach(f => f()); return ev; };
  return { calls, registered, send, config };
}

test('each game page registers its game id and version', () => {
  const games = JSON.parse(readFileSync(ROOT + 'public/games.json', 'utf8'));
  for (const g of games) {
    const r = run(g.url);
    assert.deepEqual(r.registered, { game: g.id, game_version: g.version });
    assert.equal(r.calls[0][0], 'game_opened');
  }
  assert.equal(run('/').registered.game, 'portal');
  assert.equal(run('/').calls.length, 0, 'portal sends no game_opened');
});

test('legacy events get one standard twin with legacy_event; others pass through untouched', () => {
  const r = run('/polder/'); r.calls.length = 0;
  const ev = { event: 'polder_level_start', properties: { level: 'friesland', $lib: 'web' } };
  assert.equal(r.send(ev.event, ev.properties).event, 'polder_level_start');
  assert.deepEqual(r.calls, [['game_started', { legacy_event: 'polder_level_start', level: 'friesland' }]]);
  r.calls.length = 0;
  r.send('polder_resume', { level: 'zeeland' });
  assert.deepEqual(r.calls, [['game_started', { legacy_event: 'polder_resume', level: 'zeeland', resume: true }]]);
  r.calls.length = 0;
  r.send('polder_book', {}); r.send('game_started', { legacy_event: 'polder_level_start' });
  assert.equal(r.calls.length, 0, 'unmapped and already-standard events are not doubled');
});

test('the same legacy name maps per game (game_start on Borderlines vs Retourvloot)', () => {
  for (const [path, legacy, std] of [['/borderlines/', 'game_complete', 'game_completed'], ['/retourvloot/', 'game_end', 'game_completed'], ['/cupoftea/', 'tea_scene_done', 'game_completed'], ['/', 'portal_play', 'next_game_clicked']]) {
    const r = run(path); r.calls.length = 0;
    r.send(legacy, {});
    assert.deepEqual(r.calls.map(c => c[0]), [std], path);
  }
});

test('game_completed says what it covers (completion_scope): a whole game, a Tea scene or a Polder region', () => {
  const cases = [['/borderlines/', 'game_complete', {}, 'game'], ['/retourvloot/', 'game_end', {}, 'game'], ['/kantar/', 'kantar_game_end', {}, 'game'],
    ['/cupoftea/', 'tea_scene_done', { scene: 1 }, 'scene'], ['/cupoftea/3/', 'tea_scene_done', { scene: 3 }, 'game'], ['/polder/', 'polder_level_end', { level: 'zeeland' }, 'level']];
  for (const [path, legacy, props, scope] of cases) {
    const r = run(path); r.calls.length = 0;
    r.send(legacy, props);
    assert.equal(r.calls[0][1].completion_scope, scope, path + ' ' + legacy);
  }
  const r = run('/polder/'); r.calls.length = 0; r.send('polder_level_start', {});
  assert.equal(r.calls[0][1].completion_scope, undefined, 'only on game_completed');
});
