import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  initialState,
  transition,
  execute,
  allModules,
  modules,
  includesWifiPassword,
  effectiveResult,
  summary,
} from '../src/flow-machine.js';

const toPlan = (scenario = 'normal') => {
  let state = initialState(scenario);
  state = transition(state, 'IMPORT_DIRECT');
  return transition(state, 'CHECK');
};

const runPlan = (state) => {
  state = transition(state, 'CONFIRM');
  return transition(state, 'EXECUTE');
};

test('welcome offers a direct Mac import route', () => {
  const state = transition(initialState(), 'IMPORT_DIRECT');
  assert.equal(state.screen, 'import');
});

test('safe defaults preselect common choices but not sensitive or costly choices', () => {
  const { selected } = initialState();
  assert.equal(selected.keyboard, true);
  assert.equal(selected.external, true);
  assert.equal(selected.pointer, true);
  assert.equal(selected.software, true);
  assert.equal(selected.guide, true);
  assert.equal(selected.wifi, false);
  assert.equal(selected.developer, false);
  assert.equal(selected.homebrew, false);
});

test('cannot execute before forced plan confirmation', () => {
  const state = toPlan();
  assert.equal(execute(state).screen, 'plan');
  assert.equal(transition(state, 'EXECUTE').screen, 'plan');
});

test('cannot confirm from import or with an empty plan', () => {
  const imported = transition(initialState(), 'IMPORT_DIRECT');
  assert.equal(transition(imported, 'CONFIRM').screen, 'import');

  let empty = toPlan();
  for (const item of allModules(empty)) empty = transition(empty, 'PLAN_TOGGLE', item.id);
  assert.equal(modules(empty).length, 0);
  assert.equal(transition(empty, 'CONFIRM').screen, 'plan');
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
  let state = toPlan();
  state = transition(state, 'CONFIRM');
  assert.equal(state.planConfirmed, true);
  assert.equal(state.screen, 'permission');
  state = transition(state, 'EXECUTE');
  assert.equal(state.screen, 'complete');
});

test('plan groups selected results into user-facing modules', () => {
  assert.deepEqual(
    modules(initialState()).map((item) => item.id),
    ['habits', 'software', 'system', 'wifi', 'guide'],
  );
});

test('Windows choices remove optional guide and habit actions', () => {
  const state = initialState();
  state.selected.keyboard = false;
  state.selected.external = false;
  state.selected.pointer = false;
  state.selected.guide = false;
  assert.deepEqual(modules(state).map((item) => item.id), ['software', 'system', 'wifi']);
});

test('Mac plan cancellation changes execution and downstream module set', () => {
  let state = toPlan();
  state = transition(state, 'PLAN_TOGGLE', 'software');
  state = transition(state, 'PLAN_TOGGLE', 'guide');
  assert.deepEqual(modules(state).map((item) => item.id), ['habits', 'system', 'wifi']);
  state = runPlan(state);
  assert.equal('software' in state.results, false);
  assert.equal('guide' in state.results, false);
});

test('Homebrew stays off until the developer module and separate plan choice are selected', () => {
  let state = initialState();
  state.screen = 'questions';
  state = transition(state, 'TOGGLE', 'developer');
  assert.equal(state.selected.developer, true);
  assert.equal(state.selected.homebrew, false);
  state.screen = 'plan';
  state = transition(state, 'HOMEBREW_TOGGLE');
  assert.equal(state.selected.homebrew, true);
  assert.match(modules(state).find((item) => item.id === 'developer').change, /Homebrew/);
});

test('UAC refusal never includes a Wi-Fi secret and explicitly degrades only Wi-Fi', () => {
  let state = initialState('uacDenied');
  state.screen = 'questions';
  state = transition(state, 'TOGGLE', 'wifi');
  assert.equal(state.selected.wifi, true);
  assert.equal(includesWifiPassword(state), false);
  assert.match(modules(state).find((item) => item.id === 'wifi').change, /只迁移网络名称/);
  state.screen = 'plan';
  state = runPlan(state);
  assert.equal(state.results.wifi, 'skipped_permission');
  assert.equal(state.results.system, 'applied_verified');
  assert.equal(summary(state.results), 'actions');
});

test('Mac permission refusal isolates its dependent module', () => {
  const state = runPlan(toPlan('permissionDenied'));
  assert.equal(state.results.habits, 'skipped_permission');
  assert.equal(state.results.system, 'applied_verified');
  assert.equal(summary(state.results), 'actions');
});

test('offline software is retryable without changing successful modules', () => {
  let state = runPlan(toPlan('offline'));
  assert.equal(state.results.software, 'manual_action_required');
  assert.equal(state.results.system, 'applied_verified');
  state = transition(state, 'RETRY');
  assert.equal(state.results.software, 'applied_verified');
  assert.equal(state.results.system, 'applied_verified');
  assert.equal(summary(state.results), 'all');
});

test('failure and third-party refusal never report all success', () => {
  for (const scenario of ['moduleFailure', 'toolDeclined', 'manual']) {
    const state = runPlan(toPlan(scenario));
    assert.notEqual(summary(state.results), 'all');
    assert.equal(state.results.wifi, 'applied_verified');
  }
});

test('third-party refusal cannot be turned into success through generic retry', () => {
  const state = runPlan(toPlan('toolDeclined'));
  const retried = transition(state, 'RETRY');
  assert.equal(retried.results.habits, 'manual_action_required');
  assert.equal(summary(retried.results), 'actions');
});

test('corrupt package cannot enter plan or retain an old confirmation', () => {
  const state = transition({ ...initialState('corrupt'), screen: 'import', planConfirmed: true }, 'CHECK');
  assert.equal(state.screen, 'import');
  assert.equal(state.importError, true);
  assert.equal(state.planConfirmed, false);
});

test('returning to import clears stale plan-only choices and outcomes', () => {
  let state = toPlan();
  state = transition(state, 'PLAN_TOGGLE', 'software');
  state.selected.developer = true;
  state = transition(state, 'HOMEBREW_TOGGLE');
  state.planConfirmed = true;
  state.results = { system: 'applied_verified' };
  state = transition(state, 'IMPORT');
  assert.equal(state.screen, 'import');
  assert.equal(state.selected.homebrew, false);
  assert.deepEqual(state.planRemoved, []);
  assert.equal(state.planConfirmed, false);
  assert.deepEqual(state.results, {});
});

test('module restore and restore-all only include recoverable applied modules', () => {
  let state = runPlan(toPlan());
  state = transition(state, 'RECOVERY');
  state = transition(state, 'RESTORE', 'software');
  assert.deepEqual(state.restored, []);
  state = transition(state, 'RESTORE', 'habits');
  assert.deepEqual(state.restored, ['habits']);
  assert.equal(effectiveResult(state, 'habits'), 'rolled_back_verified');
  state = transition(state, 'RESTORE_ALL');
  assert.deepEqual(state.restored, ['habits', 'system', 'wifi']);
  assert.equal(state.restored.includes('software'), false);
  assert.equal(state.restored.includes('guide'), false);
});

test('changing selections invalidates prior plan and results', () => {
  let state = runPlan(toPlan());
  state.screen = 'questions';
  state = transition(state, 'TOGGLE', 'guide');
  assert.equal(state.planConfirmed, false);
  assert.deepEqual(state.results, {});
  assert.deepEqual(state.restored, []);
});

test('prototype source has no external request or native command bridge', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const forbidden of [
    'fetch(',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'sendBeacon',
    '__TAURI__',
    'child_process',
    'PowerShell',
  ]) {
    assert.equal(source.includes(forbidden), false, `found forbidden runtime surface: ${forbidden}`);
  }
});

test('accepted compact copy does not reintroduce rejected controls', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const rejected of ['查看排除原因', '查看细节', '已选择（演示）', '未选择（演示）']) {
    assert.equal(source.includes(rejected), false, `found rejected copy: ${rejected}`);
  }
});
