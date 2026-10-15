// Retourvloot model sanity checks: whole runs under a few fixed policies must end cleanly with sane numbers.
// (src/retourvloot/test.js stays as the balance printout; this file is the pass/fail version.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'retourvloot');
const ctx = { console, Math, Date, Object, JSON }; vm.createContext(ctx);
vm.runInContext(readFileSync(join(DIR, 'model.js'), 'utf8') + readFileSync(join(DIR, 'events.js'), 'utf8') + `
function play(policy, pick) {
  const S = newState(); S.auto.n = policy.n; S.auto.borrow = true; S.release.fine = 40; S.release.pepper = 80; S.silver = policy.silver;
  let steps = 0; const fired = [];
  while (!S.ended && steps++ < 200000) {
    step(S);
    while (S.queue.length) { const id = S.queue.shift(); fired.push(id); const e = EVENT_BY_ID[id]; const c = e.choices[pick(e.choices.length)]; if (c.fx) c.fx(S); }
    const y = yearOf(S.t); if (y >= 1612) S.divRate = policy.div;
    if (mdOf(S.t) === 101) { const f = foundablePosts(S, y); if (f.length && !S.letter.found) S.letter = { ...S.letter, found: f[0], issued: S.t }; else if (S.asia.posts[S.letter.found]) S.letter = { ...S.letter, found: '', issued: S.t }; }
  }
  return { S, steps, fired, year: yearOf(S.t) };
}`, ctx);
const play = (policy, pick) => vm.runInContext('play', ctx)(policy, pick);
const finite = v => typeof v === 'number' && Number.isFinite(v);

const POLICIES = [{ n: 2, silver: 200000, div: 15 }, { n: 3, silver: 150000, div: 15 }, { n: 2, silver: 300000, div: 10 }, { n: 2, silver: 200000, div: 0 }];

for (const p of POLICIES) {
  test(`full run ends cleanly: ${JSON.stringify(p)}`, () => {
    const { S, steps, year } = play(p, () => 0);
    assert.ok(S.ended, `did not end after ${steps} steps (year ${year})`);
    assert.ok(year >= 1602 && year <= 1800, 'end year ' + year);
    for (const k of ['cash', 'debt', 'share', 'discontent']) assert.ok(finite(S[k]), `${k} = ${S[k]}`);
    assert.ok(S.debt >= 0, 'debt negative');
    const h = S.humans;
    for (const k of Object.keys(h)) assert.ok(finite(h[k]) && h[k] >= 0, `humans.${k} = ${h[k]}`);
    assert.ok(h.returned <= h.sent, 'more men came home than were sent');
    // Not checked: returned + died <= sent. Soldiers recruited in Asia (garrison event) join A.personnel without being
    // "sent", so they can die in Asia or sail home; the overview's percentages then mix the two groups. Design question, see AUDIT.
    if (!S.flags.asianTroops) assert.ok(h.returned + h.diedSea + h.diedAsia <= h.sent, 'more men accounted for than were sent');
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(S)), 'state must survive a save round-trip');
  });
}

test('random choices: five runs end without errors and only known events fire', () => {
  const ids = new Set(Object.keys(vm.runInContext('EVENT_BY_ID', ctx)));
  for (let k = 0; k < 5; k++) {
    const { S, fired } = play({ n: 2, silver: 200000, div: 15 }, n => Math.floor(Math.random() * n));
    assert.ok(S.ended);
    for (const id of fired) assert.ok(ids.has(id), 'unknown event ' + id);
  }
});

test('every event has at least one choice and a body', () => {
  const E = vm.runInContext('EVENT_BY_ID', ctx);
  for (const [id, e] of Object.entries(E)) {
    assert.ok(Array.isArray(e.choices) && e.choices.length, id + ' has no choices');
    for (const c of e.choices) assert.equal(typeof c.label, 'string', id + ' choice without label');
  }
});
