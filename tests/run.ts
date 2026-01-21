import assert from 'assert';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
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

step('stuck report includes evidence pack');
await withTempDir(async (dir) => {
  const dot = join(dir, '.colearner');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'overview.md'), '# Overview\nDetails\n');
  mkdirSync(dot, { recursive: true });
  writeFileSync(join(dot, 'learning.json'), JSON.stringify({
    learner: { level: 'junior', goals: ['overview'] },
    plan: [{ id: 'step-1', topic: 'docs/overview.md', status: 'next' }],
    progress: { completed: [], confidence: {} },
  }));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const ctx = createContext(new FileBus(dir), join(dot, 'learning.json'));
    const lines = await handleCommand(ctx, 'stuck confused');
    assert.ok(lines.join('\n').includes('stuck report published'), 'stuck should publish');
    const bus = new FileBus(dir);
    const res = await bus.readNew('colearner.coach.v1', { offset: 0 });
    assert.equal(res.events.length, 1, 'stuck report should be published');
    const payload = res.events[0].payload as { evidence_pack?: Array<{ path?: string; hash?: string; snippet?: string }> };
    assert.ok(Array.isArray(payload.evidence_pack), 'evidence pack should be present');
    assert.ok((payload.evidence_pack ?? []).length >= 1, 'evidence pack should include files');
  } finally {
    process.chdir(cwd);
  }
});

step('coach hint ack round-trip');
await withTempDir(async (dir) => {
  const dot = join(dir, '.colearner');
  mkdirSync(dot, { recursive: true });
  writeFileSync(join(dot, 'learning.json'), JSON.stringify({
    learner: { level: 'junior', goals: [] },
    plan: [{ id: 'step-1', topic: 'overview', status: 'next' }],
    progress: { completed: [], confidence: {} },
  }));
  const ctx = createContext(new FileBus(dir), join(dot, 'learning.json'));
  const lines = await handleCommand(ctx, 'hint-ack session-1|got it');
  assert.ok(lines.join('\n').includes('hint ack published'), 'hint ack should publish');
  const bus = new FileBus(dir);
  const res = await bus.readNew('colearner.coach.v1', { offset: 0 });
  assert.equal(res.events.length, 1, 'hint ack should be published');
  assert.equal(res.events[0].event_type, 'hint_ack', 'event type is hint_ack');
});

step('lesson record bundle');
await withTempDir(async (dir) => {
  const dot = join(dir, '.colearner');
  mkdirSync(dot, { recursive: true });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dot, 'learning.json'), JSON.stringify({
    learner: { level: 'junior', goals: ['overview'] },
    plan: [{ id: 'step-1', topic: 'docs/overview.md', status: 'next' }],
    progress: { completed: ['step-1'], confidence: {} },
  }));
  writeFileSync(join(dir, 'docs', 'overview.md'), '# Overview\nDetails\n', { flag: 'w' });
  const ctx = createContext(new FileBus(dir), join(dot, 'learning.json'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const lines = await handleCommand(ctx, 'lesson record');
    assert.ok(lines.join('\n').includes('lesson record created'), 'lesson record should be created');
    const base = join(dir, '.colearner', 'lesson-records', ctx.sessionId);
    assert.ok(existsSync(join(base, 'metadata.json')), 'metadata.json present');
    assert.ok(existsSync(join(base, 'summary.json')), 'summary.json present');
    assert.ok(existsSync(join(base, 'lesson.md')), 'lesson.md present');
    assert.ok(existsSync(join(base, 'lesson.html')), 'lesson.html present');
  } finally {
    process.chdir(cwd);
  }
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
