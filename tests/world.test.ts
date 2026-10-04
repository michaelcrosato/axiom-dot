import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, generateObjects, applyAction, validateSave, serializeSave, parseSave, PUMP_POSITION, SETTLEMENT_POSITION } from '../src/world.ts';
import type { State } from '../src/world.ts';
function collect(state: State, kind: string): State {
  for (const item of generateObjects(state.seed).filter(o => o.kind === kind)) {
    state = applyAction(state, { type: 'move', x: item.x, z: item.z });
    state = applyAction(state, { type: 'collect', id: item.id });
  }
  return state;
}
test('generation is deterministic and only decoration changes with seed', () => {
  assert.deepEqual(generateObjects(42), generateObjects(42));
  assert.notDeepEqual(generateObjects(42), generateObjects(43));
  assert.deepEqual(generateObjects(42).filter(o => o.kind !== 'rock'), generateObjects(43).filter(o => o.kind !== 'rock'));
  assert.equal(new Set(generateObjects(42).map(o => o.id)).size, generateObjects(42).length);
  assert.throws(() => createState(NaN));
});
test('collect respects distance, resource conservation, and immutable transitions', () => {
  const original = createState(42);
  assert.equal(applyAction(original, { type: 'collect', id: 'scrap-1' }), original);
  const moved = applyAction(original, { type: 'move', x: -9, z: 8 });
  const next = applyAction(moved, { type: 'collect', id: 'scrap-1' });
  assert.equal(next.inventory.scrap, 1);
  assert.equal(original.inventory.scrap, 0);
  assert.equal(applyAction(next, { type: 'collect', id: 'scrap-1' }), next);
  assert.equal(validateSave(next), true);
});
test('pump repair consumes exact resources and cannot be paid twice', () => {
  let state = collect(collect(createState(7), 'scrap'), 'core');
  assert.equal(applyAction(state, { type: 'repair' }), state);
  state = applyAction(state, { type: 'move', ...PUMP_POSITION });
  const restored = applyAction(state, { type: 'repair' });
  assert.equal(restored.waterRestored, true);
  assert.deepEqual(restored.inventory, { scrap: 4, core: 0, water: 0 });
  assert.match(restored.events.at(-1)!, /Pump repaired/);
  assert.equal(applyAction(restored, { type: 'repair' }), restored);
  assert.equal(validateSave(restored), true);
});
test('canister delivery is an independent alternate solution', () => {
  let state = collect(createState(8), 'water');
  state = applyAction(state, { type: 'move', ...SETTLEMENT_POSITION });
  state = applyAction(state, { type: 'accept' });
  state = applyAction(state, { type: 'deliver' });
  assert.equal(state.waterRestored, true);
  assert.equal(state.jobAccepted, true);
  assert.equal(state.inventory.water, 0);
  assert.equal(validateSave(state), true);
  assert.match(state.events.at(-1)!, /reservoir/);
});
test('defeated sentries stay defeated after persistence and ticks', () => {
  let state = applyAction(createState(9), { type: 'move', x: 5, z: 12 });
  state = applyAction(state, { type: 'attack', id: 'sentry-1' });
  const restored = parseSave(serializeSave(state))!;
  assert.deepEqual(restored, state);
  assert.equal(applyAction(restored, { type: 'tick', dt: 1 }), restored);
  assert.equal(applyAction(restored, { type: 'attack', id: 'sentry-1' }), restored);
});
test('invalid, corrupt, duplicate, nonfinite, and incompatible saves are rejected', () => {
  const base = createState(1);
  for (const value of [null, [], {}, { ...base, schemaVersion: 99 }, { ...base, seed: -1 },
    { ...base, player: { ...base.player, x: Infinity } }, { ...base, player: { ...base.player, hp: 101 } },
    { ...base, defeated: ['sentry-1', 'sentry-1'] }, { ...base, collected: ['scrap-1', 'scrap-1'] },
    { ...base, inventory: { scrap: 1, core: 0, water: 0 } }, { ...base, waterRestored: true },
    { ...base, revision: -1 }, { ...base, events: Array(21).fill('event') }]) assert.equal(validateSave(value), false);
  assert.equal(parseSave('{broken'), null);
  assert.equal(parseSave('null'), null);
  assert.deepEqual(parseSave(serializeSave(base)), base);
});
test('movement and damage remain finite and bounded', () => {
  const state = createState(1);
  assert.equal(applyAction(state, { type: 'move', x: NaN, z: 0 }), state);
  assert.equal(applyAction(state, { type: 'move', x: 1000, z: -1000 }).player.x, 48);
  let near = applyAction(state, { type: 'move', x: 5, z: 12 });
  for (let n = 0; n < 100; n++) near = applyAction(near, { type: 'tick', dt: 1 });
  assert.equal(near.player.hp, 0);
  assert.equal(validateSave(near), true);
  assert.equal(near.events.length <= 20, true);
});
