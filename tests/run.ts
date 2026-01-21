import assert from 'assert';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildEvent, validateEventFull } from '../src/events.js';
import { FileBus } from '../src/kafka/file_bus.js';
import { KafkaBus } from '../src/kafka/kafka_bus.js';
import { applyPlan, applyProgress, loadState } from '../src/didactics/progress.js';
import { appendLifecycle, readLifecycle } from '../src/lifecycle.js';
import { buildDashboard } from '../src/coach/dashboard.js';
import { callLlm } from '../src/llm/provider.js';
import { createContext, handleCommand } from '../src/cli_core.js';

async function withTempDir(run: (dir: string) => Promise<void> | void) {
  const dir = mkdtempSync(join(tmpdir(), 'colearner-test-'));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function step(msg: string) {
  console.log(`step: ${msg}`);
}

function skip(msg: string) {
  console.log(`skip: ${msg}`);
}

step('event validation');
await withTempDir(async (dir) => {
  const event = buildEvent('student', 's-1', 'learning_plan', { plan: [] });
  assert.ok(validateEventFull(event), 'event validation should pass');
});

step('file bus round-trip');
await withTempDir(async (dir) => {
  const bus = new FileBus(dir);
  const event = buildEvent('coach', 's-1', 'exercise_assigned', { topic: 'x', exercise: 'y' });
  bus.publish('colearner.assignments.v1', event);
  const res = await bus.readNew('colearner.assignments.v1', { offset: 0 });
  assert.equal(res.events.length, 1, 'should read published event');
});

step('learning state persistence');
await withTempDir(async (dir) => {
  const statePath = join(dir, 'learning.json');
  applyPlan(statePath, [{ id: 'step-1', topic: 'overview', status: 'next' }]);
  applyProgress(statePath, ['step-1'], { overview: 0.8 });
  const state = loadState(statePath);
  assert.equal(state.plan.length, 1, 'plan stored');
  assert.equal(state.progress.completed[0], 'step-1', 'progress stored');
});

step('lifecycle log');
await withTempDir(async (dir) => {
  const lifecyclePath = join(dir, 'lifecycle.jsonl');
  appendLifecycle({ ts: new Date().toISOString(), session_id: 's-1', stage: 'init' }, lifecyclePath);
  const events = readLifecycle(lifecyclePath);
  assert.equal(events.length, 1, 'lifecycle event stored');
});

step('dashboard aggregation');
await withTempDir(async (dir) => {
  const bus = new FileBus(dir);
  bus.publish('colearner.progress.v1', buildEvent('student', 's-1', 'progress_update', {
    student_id: 's-001',
    completed: ['step-1'],
    confidence: { overview: 0.6 },
  }));
  const dashboard = await buildDashboard(dir);
  assert.equal(dashboard.summary.totalStudents, 1, 'dashboard has one student');
});

step('cli core progress command');
await withTempDir(async (dir) => {
  const dot = join(dir, '.colearner');
  mkdirSync(dot, { recursive: true });
  writeFileSync(join(dot, 'learning.json'), JSON.stringify({ plan: [], progress: { completed: [], confidence: {} } }));
  const ctx = createContext(new FileBus(dir), join(dot, 'learning.json'));
  const lines = await handleCommand(ctx, 'progress');
  assert.ok(lines.join('\n').includes('"progress"'), 'cli progress should print state');
});

if (process.env.COLEARNER_TEST_KAFKA === '1') {
  step('kafka bus round-trip');
  const bus = new KafkaBus();
  const topic = 'colearner.test.1';
  const event = buildEvent('student', 's-1', 'progress_update', {
    student_id: 's-001',
    completed: ['step-1'],
  });
  await bus.publish(topic, event);
  const res = await bus.readNew(topic, { offset: 0 });
  assert.ok(res.events.length >= 1, 'kafka read should return events');
} else {
  skip('kafka test disabled (set COLEARNER_TEST_KAFKA=1)');
}

if (process.env.COLEARNER_TEST_LLM === '1') {
  step('llm response');
  const text = await callLlm('Say "ok" only.');
  assert.ok(String(text).toLowerCase().includes('ok'), 'llm response should include ok');
} else {
  skip('llm test disabled (set COLEARNER_TEST_LLM=1)');
}

console.log('ok');
