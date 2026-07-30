import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, transition, execute, modules, summary } from '../src/flow-machine.js';

test('welcome offers a direct Mac import route', () => {
  const state = transition(initialState(), 'IMPORT_DIRECT');
  assert.equal(state.screen, 'import');
});

test('cannot execute before forced plan confirmation', () => {
  assert.equal(execute({ ...initialState(), screen: 'plan' }).screen, 'plan');
});

test('export confirmation is separate from package generation', () => {
  let state = initialState();
  for (const event of ['START', 'QUESTIONS', 'GO_EXPORT']) state = transition(state, event);
  assert.equal(state.screen, 'export');
  assert.equal(state.exported, false);
  state = transition(state, 'EXPORT');
  assert.equal(state.exported, true);
});

test('confirmed plan is the only route to execution', () => {
  let state = initialState();
  for (const event of ['START', 'QUESTIONS', 'GO_EXPORT', 'EXPORT', 'IMPORT', 'CHECK']) {
    state = transition(state, event);
  }
  assert.equal(state.screen, 'plan');
  state = transition(state, 'CONFIRM');
  assert.equal(state.planConfirmed, true);
  assert.equal(state.screen, 'permission');
});

test('plan groups scan results into user-facing modules', () => {
  assert.deepEqual(
    modules(initialState()).map((item) => item.id),
    ['habits', 'software', 'system', 'wifi', 'guide'],
  );
});

test('user choices remove optional plan modules and habit actions', () => {
  const state = initialState();
  state.selected.keyboard = false;
  state.selected.external = false;
  state.selected.pointer = false;
  state.selected.guide = false;
  assert.deepEqual(
    modules(state).map((item) => item.id),
    ['software', 'system', 'wifi'],
  );
});

test('permission refusal isolates its dependent module', () => {
  const state = transition(
    { ...initialState('permissionDenied'), screen: 'permission', planConfirmed: true },
    'EXECUTE',
  );
  assert.equal(state.results.habits, 'skipped_permission');
  assert.equal(state.results.system, 'applied_verified');
  assert.equal(summary(state.results), 'actions');
});

test('offline/failure/tool refusal never report all success', () => {
  for (const scenario of ['offline', 'moduleFailure', 'toolDeclined']) {
    const state = transition(
      { ...initialState(scenario), screen: 'permission', planConfirmed: true },
      'EXECUTE',
    );
    assert.notEqual(summary(state.results), 'all');
  }
});

test('corrupt package cannot enter plan', () => {
  const state = transition({ ...initialState('corrupt'), screen: 'import' }, 'CHECK');
  assert.equal(state.screen, 'import');
  assert.equal(state.importError, true);
});
