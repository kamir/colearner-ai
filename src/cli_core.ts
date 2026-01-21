import type { Agent } from './agent/agent.js';
import type { Bus, TopicCursor } from './kafka/bus.js';
import { buildEvent, type EventEnvelope, validateEventFull } from './events.js';
import { applyPlan, applyProgress, loadState, saveState } from './didactics/progress.js';
import { appendLifecycle, readLifecycle } from './lifecycle.js';
import { generateLearningPlan } from './didactics/learning_plan.js';
import { explainWithExamples } from './didactics/explain.js';
import { generateExercise } from './didactics/exercise.js';
import { assessExercise } from './didactics/assessment.js';
import { proposeRefactor } from './didactics/refactor.js';
import { buildDashboard, formatDashboard } from './coach/dashboard.js';
import { isPathAllowed } from './utils/scope.js';
import { repoScan } from './tools/repo_scan.js';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

export interface CliContext {
  bus: Bus;
  cursors: Record<string, TopicCursor>;
  role: 'coach' | 'student';
  sessionId: string;
  studentId: string;
  statePath: string;
}

export function createContext(bus: Bus, statePath: string): CliContext {
  return {
    bus,
    cursors: {
      'colearner.progress.v1': { offset: 0 },
      'colearner.assignments.v1': { offset: 0 },
      'colearner.feedback.v1': { offset: 0 },
      'colearner.events.v1': { offset: 0 },
    },
    role: 'student',
    sessionId: `session-${Date.now()}`,
    studentId: `student-${Math.floor(Math.random() * 10000)}`,
    statePath,
  };
}

async function buildRepoSummary(): Promise<string> {
  const scan = (await repoScan.run({ root: process.cwd(), depth: 1 })) as {
    entries?: Array<{ name?: string; type?: string }>;
  };
  const entries = Array.isArray(scan?.entries) ? scan.entries : [];
  const names = entries
    .map((entry) => `${entry.name ?? ''}${entry.type === 'dir' ? '/' : ''}`)
    .filter(Boolean);
  const sample = names.slice(0, 20).join(', ');
  return `Root entries (${entries.length}): ${sample}`;
}

function safeExecVersion(command: string): string {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'not found';
  }
}

function detectMonorepo(root: string): string[] {
  const findings: string[] = [];
  if (existsSync(join(root, 'pnpm-workspace.yaml'))) {
    findings.push('pnpm-workspace.yaml');
  }
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { workspaces?: unknown };
      if (pkg.workspaces) {
        findings.push('package.json workspaces');
      }
    } catch {
      // ignore parse errors
    }
  }
  if (existsSync(join(root, 'lerna.json'))) {
    findings.push('lerna.json');
  }
  if (existsSync(join(root, 'packages'))) {
    findings.push('packages/ directory');
  }
  return findings;
}

function shallowRepoSize(root: string): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      const full = join(root, entry.name);
      try {
        const stat = statSync(full);
        bytes += stat.size;
        files += 1;
      } catch {
        // ignore
      }
    }
  }
  return { bytes, files };
}

function formatBytes(bytes: number): string {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

function writePlanMarkdown(
  statePath: string,
  goals: string[],
  repoSummary: string,
  plan: Array<{ id: string; topic: string; status: string }>
): string {
  const dir = dirname(statePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = join(dir, 'plan.md');
  const lines = [
    '# Learning Plan',
    '',
    `Goals: ${goals.join(', ') || 'none'}`,
    '',
    `Repo summary: ${repoSummary}`,
    '',
    'Steps:',
    ...plan.map((step, idx) => `${idx + 1}. [ ] ${step.topic} (${step.status})`),
    '',
  ];
  writeFileSync(path, lines.join('\n'));
  return path;
}

async function publish(ctx: CliContext, topic: string, event: EventEnvelope): Promise<void> {
  if (!validateEventFull(event)) {
    return;
  }
  await ctx.bus.publish(topic, event);
  await ctx.bus.publish('colearner.events.v1', event);
}

function handleIncoming(ctx: CliContext, event: EventEnvelope): void {
  if (event.payload && typeof event.payload === 'object') {
    if (ctx.role === 'coach' && event.actor === 'coach') {
      return;
    }
    if (ctx.role === 'student' && event.actor === 'student') {
      return;
    }
    if (typeof event.payload.student_id === 'string' && event.payload.student_id !== ctx.studentId) {
      return;
    }
  }
  if (event.event_type === 'evidence_request' && ctx.role === 'student') {
    const path = typeof event.payload.path === 'string' ? event.payload.path : '';
    const note = typeof event.payload.reason === 'string' ? event.payload.reason : '';
    if (path && isPathAllowed(path)) {
      const req = buildEvent('student', ctx.sessionId, 'evidence_snapshot', {
        path,
        note,
        student_id: ctx.studentId,
      });
      void publish(ctx, 'colearner.progress.v1', req);
    }
  }
  if (event.event_type === 'learning_plan') {
    if (Array.isArray(event.payload.plan)) {
      applyPlan(ctx.statePath, event.payload.plan as Array<{ id: string; topic: string; status: string }>);
    }
  }
  if (event.event_type === 'progress_update') {
    const completed = Array.isArray(event.payload.completed) ? (event.payload.completed as string[]) : [];
    const confidence =
      event.payload.confidence && typeof event.payload.confidence === 'object'
        ? (event.payload.confidence as Record<string, number>)
        : {};
    applyProgress(ctx.statePath, completed, confidence);
  }
  if (event.event_type === 'assessment_feedback') {
    const confidenceDelta =
      typeof event.payload.confidence_delta === 'number' ? event.payload.confidence_delta : 0;
    if (confidenceDelta !== 0) {
      const state = loadState(ctx.statePath);
      const updated: Record<string, number> = {};
      for (const key of Object.keys(state.progress.confidence)) {
        updated[key] = Math.min(1, Math.max(0, state.progress.confidence[key] + confidenceDelta));
      }
      applyProgress(ctx.statePath, [], updated);
    }
  }
}

export async function handleCommand(
  ctx: CliContext,
  query: string,
  agent?: Agent
): Promise<string[]> {
  const out: string[] = [];
  const write = (line: string) => out.push(line);

  if (query === 'init') {
    const state = loadState(ctx.statePath);
    saveState(ctx.statePath, state);
    write(`initialized: ${ctx.statePath}`);
    return out;
  }

  if (query.startsWith('learn ')) {
    const goals = query.replace(/^learn\s+/, '').split(',').map((g) => g.trim()).filter(Boolean);
    const repoSummary = await buildRepoSummary();
    const plan = await generateLearningPlan(goals, repoSummary, ctx.statePath);
    const planPath = writePlanMarkdown(ctx.statePath, goals, repoSummary, plan);
    write('Repo map complete -> learning plan created');
    write(`plan_path: ${planPath}`);
    write(JSON.stringify(plan, null, 2));
    appendLifecycle({ ts: new Date().toISOString(), session_id: ctx.sessionId, stage: 'plan' });
    const event = buildEvent(ctx.role, ctx.sessionId, 'learning_plan', { goals, plan, student_id: ctx.studentId });
    await publish(ctx, 'colearner.progress.v1', event);
    return out;
  }
  if (query.startsWith('explain ')) {
    const topic = query.replace(/^explain\s+/, '').trim();
    const result = await explainWithExamples(topic, 'No evidence loaded.');
    write(result);
    return out;
  }
  if (query.startsWith('practice ')) {
    const topic = query.replace(/^practice\s+/, '').trim();
    const exercise = await generateExercise(topic, 'No evidence loaded.');
    write(exercise);
    appendLifecycle({ ts: new Date().toISOString(), session_id: ctx.sessionId, stage: 'practice' });
    return out;
  }
  if (query.startsWith('assign ')) {
    const [topic, exercise, tests] = query.replace(/^assign\s+/, '').split('|').map((part) => part.trim());
    const event = buildEvent(ctx.role, ctx.sessionId, 'exercise_assigned', {
      topic: topic || '',
      exercise: exercise || '',
      tests: tests ? tests.split(',').map((t) => t.trim()) : [],
      student_id: ctx.studentId,
    });
    await publish(ctx, 'colearner.assignments.v1', event);
    const ack = buildEvent(ctx.role, ctx.sessionId, 'exercise_assigned_ack', { status: 'sent', student_id: ctx.studentId });
    await publish(ctx, 'colearner.events.v1', ack);
    write('assignment sent');
    return out;
  }
  if (query.startsWith('submit ')) {
    const [exerciseId, response] = query.replace(/^submit\s+/, '').split('|').map((part) => part.trim());
    const event = buildEvent(ctx.role, ctx.sessionId, 'exercise_submission', {
      exercise_id: exerciseId || '',
      response: response || '',
      student_id: ctx.studentId,
    });
    await publish(ctx, 'colearner.progress.v1', event);
    const ack = buildEvent(ctx.role, ctx.sessionId, 'exercise_submission_ack', { status: 'sent', student_id: ctx.studentId });
    await publish(ctx, 'colearner.events.v1', ack);
    write('submission sent');
    return out;
  }
  if (query.startsWith('evidence ')) {
    const [path, note] = query.replace(/^evidence\s+/, '').split('|').map((part) => part.trim());
    const event = buildEvent(ctx.role, ctx.sessionId, 'evidence_snapshot', {
      path: path || '',
      note: note || '',
      student_id: ctx.studentId,
    });
    await publish(ctx, 'colearner.progress.v1', event);
    write('evidence snapshot sent');
    return out;
  }
  if (query.startsWith('request-evidence ')) {
    const [path, reason] = query.replace(/^request-evidence\s+/, '').split('|').map((part) => part.trim());
    const event = buildEvent(ctx.role, ctx.sessionId, 'evidence_request', {
      path: path || '',
      reason: reason || '',
      student_id: ctx.studentId,
    });
    await publish(ctx, 'colearner.assignments.v1', event);
    write('evidence request sent');
    return out;
  }
  if (query.startsWith('feedback ')) {
    const [grade, mistakes, nextStep, delta] = query.replace(/^feedback\s+/, '').split('|').map((part) => part.trim());
    const event = buildEvent(ctx.role, ctx.sessionId, 'assessment_feedback', {
      grade: grade || 'revise',
      mistakes: mistakes ? mistakes.split(',').map((m) => m.trim()) : [],
      next_step: nextStep || '',
      confidence_delta: delta ? Number(delta) : 0,
      student_id: ctx.studentId,
    });
    await publish(ctx, 'colearner.feedback.v1', event);
    const ack = buildEvent(ctx.role, ctx.sessionId, 'assessment_feedback_ack', { status: 'sent', student_id: ctx.studentId });
    await publish(ctx, 'colearner.events.v1', ack);
    write('feedback sent');
    return out;
  }
  if (query.startsWith('role ')) {
    const next = query.replace(/^role\s+/, '').trim();
    if (next === 'coach' || next === 'student') {
      ctx.role = next;
      write(`role set to ${ctx.role}`);
    }
    return out;
  }
  if (query.startsWith('student ')) {
    ctx.studentId = query.replace(/^student\s+/, '').trim() || ctx.studentId;
    write(`student set to ${ctx.studentId}`);
    return out;
  }
  if (query.startsWith('session ')) {
    ctx.sessionId = query.replace(/^session\s+/, '').trim() || ctx.sessionId;
    write(`session set to ${ctx.sessionId}`);
    return out;
  }
  if (query.startsWith('lifecycle ')) {
    const stage = query.replace(/^lifecycle\s+/, '').trim();
    if (stage === 'init' || stage === 'plan' || stage === 'practice' || stage === 'review' || stage === 'done') {
      const evt = { ts: new Date().toISOString(), session_id: ctx.sessionId, stage };
      appendLifecycle(evt);
      const event = buildEvent(ctx.role, ctx.sessionId, 'lifecycle', { stage, student_id: ctx.studentId });
      await publish(ctx, 'colearner.events.v1', event);
      write(`lifecycle: ${stage}`);
    }
    return out;
  }
  if (query === 'history') {
    const events = readLifecycle().filter((evt) => evt.session_id === ctx.sessionId);
    write(JSON.stringify(events, null, 2));
    return out;
  }
  if (query.startsWith('history ')) {
    const id = query.replace(/^history\s+/, '').trim();
    const events = readLifecycle().filter((evt) => evt.session_id === id);
    write(JSON.stringify(events, null, 2));
    return out;
  }
  if (query === 'coach dashboard') {
    const dashboard = await buildDashboard();
    write(formatDashboard(dashboard));
    return out;
  }
  if (query === 'sync') {
    const topics = ctx.role === 'coach'
      ? ['colearner.progress.v1', 'colearner.assignments.v1', 'colearner.feedback.v1']
      : ['colearner.assignments.v1', 'colearner.feedback.v1', 'colearner.progress.v1'];
    for (const topic of topics) {
      const res = await ctx.bus.readNew(topic, ctx.cursors[topic]);
      ctx.cursors[topic] = res.cursor;
      for (const event of res.events) {
        if (event.session_id !== ctx.sessionId) {
          continue;
        }
        if (!validateEventFull(event)) {
          continue;
        }
        handleIncoming(ctx, event);
        write(`[${topic}] ${event.event_type} ${JSON.stringify(event.payload)}`);
      }
    }
    return out;
  }
  if (query.startsWith('refactor ')) {
    const topic = query.replace(/^refactor\s+/, '').trim();
    const proposal = await proposeRefactor(topic, 'No evidence loaded.');
    write(proposal);
    return out;
  }
  if (query.startsWith('assess ')) {
    const rest = query.replace(/^assess\s+/, '').trim();
    const [exercise, response] = rest.split('|').map((part) => part.trim());
    const result = await assessExercise(exercise || '', response || '');
    write(result);
    appendLifecycle({ ts: new Date().toISOString(), session_id: ctx.sessionId, stage: 'review' });
    return out;
  }
  if (query === 'progress') {
    const state = loadState(ctx.statePath);
    write(JSON.stringify(state, null, 2));
    return out;
  }

  if (query === 'doctor') {
    write(`node: ${process.version}`);
    write(`bun: ${safeExecVersion('bun --version')}`);
    write(`pnpm: ${safeExecVersion('pnpm --version')}`);
    const scope = await import('./utils/scope.js');
    write(`scope_root: ${scope.scopeRoot()}`);
    const fs = await import('fs');
    write(`git_present: ${fs.existsSync('.git')}`);
    const repoScan = await import('./tools/repo_scan.js');
    const scan = await repoScan.repoScan.run({ root: process.cwd(), depth: 1 });
    write(`repo_scan: ${JSON.stringify(scan)}`);
    const shallow = shallowRepoSize(process.cwd());
    write(`repo_size_shallow: ${formatBytes(shallow.bytes)} (${shallow.files} files)`);
    if (shallow.bytes > 500 * 1024 * 1024) {
      write('repo_size_warning: shallow size exceeds 500 MB');
    }
    const monorepoFindings = detectMonorepo(process.cwd());
    write(`monorepo: ${monorepoFindings.length ? monorepoFindings.join(', ') : 'none'}`);
    const envChecks = [
      `OPENAI_API_KEY=${process.env.OPENAI_API_KEY ? 'set' : 'unset'}`,
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ? 'set' : 'unset'}`,
      `COLEARNER_MODEL=${process.env.COLEARNER_MODEL ? 'set' : 'unset'}`,
      `COLEARNER_BUS=${process.env.COLEARNER_BUS ?? 'file'}`,
      `COLEARNER_BROKERS=${process.env.COLEARNER_BROKERS ?? 'default'}`,
      `COLEARNER_SCOPE_ROOT=${process.env.COLEARNER_SCOPE_ROOT ?? 'unset'}`,
    ];
    write(`env: ${envChecks.join(', ')}`);
    const kafkaMode = process.env.COLEARNER_BUS === 'kafka';
    write(`kafka_mode: ${kafkaMode}`);
    if (kafkaMode) {
      try {
        const { Kafka } = await import('kafkajs');
        const { loadKafkaConfig } = await import('./config.js');
        const cfg = loadKafkaConfig();
        const client = new Kafka({ clientId: cfg.clientId, brokers: cfg.brokers });
        const admin = client.admin();
        await admin.connect();
        await admin.listTopics();
        await admin.disconnect();
        write('broker: reachable');
      } catch (err) {
        write(`broker: error ${(err as Error).message}`);
      }
    }
    return out;
  }

  if (agent) {
    for await (const event of agent.run(query)) {
      if (event.type === 'thinking') {
        write(`[thinking] ${event.message}`);
      } else if (event.type === 'tool_start') {
        write(`[tool_start] ${event.tool} ${JSON.stringify(event.args)}`);
      } else if (event.type === 'tool_end') {
        write(`[tool_end] ${event.tool} (${event.durationMs}ms)`);
      } else if (event.type === 'tool_error') {
        write(`[tool_error] ${event.tool}: ${event.error}`);
      } else if (event.type === 'answer_start') {
        write('answer:');
      } else if (event.type === 'answer_chunk') {
        write(event.text);
      }
    }
  }

  return out;
}
