import type { Agent } from './agent/agent.js';
import type { Bus, TopicCursor } from './kafka/bus.js';
import { buildEvent, type EventEnvelope, validateEventFull } from './events.js';
import { applyPlan, applyProgress, loadState, saveState } from './didactics/progress.js';
import { appendLifecycle, readLifecycle, type LifecycleEvent } from './lifecycle.js';
import { generateLearningPlan } from './didactics/learning_plan.js';
import { explainWithExamples } from './didactics/explain.js';
import { generateExercise } from './didactics/exercise.js';
import { assessExercise } from './didactics/assessment.js';
import { proposeRefactor } from './didactics/refactor.js';
import { buildDashboard, formatDashboard } from './coach/dashboard.js';
import { isPathAllowed } from './utils/scope.js';
import { getMaxFileBytes, isPathExtensionAllowed } from './utils/safety.js';
import { repoScan } from './tools/repo_scan.js';
import { fileRead } from './tools/file_read.js';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, type Dirent } from 'fs';
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
  const sessionId = loadSessionId();
  return {
    bus,
    cursors: {
      'colearner.progress.v1': { offset: 0 },
      'colearner.assignments.v1': { offset: 0 },
      'colearner.feedback.v1': { offset: 0 },
      'colearner.events.v1': { offset: 0 },
    },
    role: 'student',
    sessionId,
    studentId: `student-${Math.floor(Math.random() * 10000)}`,
    statePath,
  };
}

type RepoEvidence = {
  text: string;
  files: string[];
  codeFiles: string[];
  testFiles: string[];
  keywords: string[];
};

async function buildRepoSummary(depth: number): Promise<string> {
  const scan = (await repoScan.run({ root: process.cwd(), depth })) as {
    entries?: Array<{ name?: string; type?: string }>;
  };
  const entries = Array.isArray(scan?.entries) ? scan.entries : [];
  const names = entries
    .map((entry) => `${entry.name ?? ''}${entry.type === 'dir' ? '/' : ''}`)
    .filter(Boolean);
  const sample = names.slice(0, 20).join(', ');
  return `Root entries (${entries.length}): ${sample}`;
}

function sessionFilePath(): string {
  return '.colearner/session.json';
}

function loadSessionId(): string {
  const path = sessionFilePath();
  if (!existsSync(path)) {
    const fresh = `session-${Date.now()}`;
    saveSessionId(fresh);
    return fresh;
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as { session_id?: string };
    if (parsed.session_id) return parsed.session_id;
  } catch {
    // ignore
  }
  const fresh = `session-${Date.now()}`;
  saveSessionId(fresh);
  return fresh;
}

function saveSessionId(sessionId: string): void {
  const path = sessionFilePath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify({ session_id: sessionId }, null, 2));
}

function startNewRound(name?: string): string {
  const stamp = timestampSlug();
  const suffix = name ? `-${name.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40)}` : '';
  const sessionId = `round-${stamp}${suffix}`;
  saveSessionId(sessionId);
  return sessionId;
}

function buildRepoEvidence(goals: string[], depth: number): RepoEvidence {
  const summary = [`Goals: ${goals.join(', ') || 'none'}`];
  const keyFiles = [
    'README.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'package.json',
    'go.mod',
    'pyproject.toml',
    'Cargo.toml',
    'Makefile',
  ];
  const configNames = new Set([
    'Makefile',
    'Dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
    '.env',
    '.env.example',
    'tsconfig.json',
    'package.json',
    'go.mod',
    'pyproject.toml',
    'Cargo.toml',
  ]);
  const keywords = goals
    .join(' ')
    .split(/[^a-zA-Z0-9]+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 3);
  const snippets: string[] = [];
  for (const file of keyFiles) {
    if (!existsSync(file)) continue;
    if (!isPathAllowed(file)) continue;
    if (!isPathExtensionAllowed(file) && file !== 'Makefile') continue;
    try {
      const data = readFileSync(file, 'utf-8');
      const head = data.split('\n').slice(0, 12).join('\n');
      snippets.push(`--- ${file} ---\n${head}`);
    } catch {
      continue;
    }
  }
  const evidenceFiles = collectEvidenceFiles(process.cwd(), depth, 120, keywords, configNames);
  for (const file of evidenceFiles) {
    if (!isPathAllowed(file)) continue;
    if (!isPathExtensionAllowed(file) && !configNames.has(file)) continue;
    try {
      const data = readFileSync(file, 'utf-8');
      const head = data.split('\n').slice(0, 20).join('\n');
      snippets.push(`--- ${file} ---\n${head}`);
    } catch {
      continue;
    }
  }
  if (snippets.length > 0) {
    summary.push('Key files:\n' + snippets.join('\n\n'));
  }
  if (evidenceFiles.length > 0) {
    summary.push(
      'Relevant files:\n' + evidenceFiles.slice(0, 25).map((file) => `- ${file}`).join('\n')
    );
  }
  summary.push(`Scan depth: ${depth}`);
  const { codeFiles, testFiles } = classifyEvidenceFiles(evidenceFiles);
  return {
    text: summary.join('\n'),
    files: evidenceFiles,
    codeFiles,
    testFiles,
    keywords,
  };
}

function collectEvidenceFiles(
  root: string,
  maxDepth: number,
  maxFiles: number,
  keywords: string[],
  configNames: Set<string>
): string[] {
  const results: string[] = [];
  const maxFileBytes = getMaxFileBytes();
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  const skipDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.colearner']);
  while (stack.length > 0 && results.length < maxFiles) {
    const current = stack.pop();
    if (!current) break;
    let entries: Dirent[];
    try {
      entries = readdirSync(current.dir, { withFileTypes: true }) as Dirent[];
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      const name = entry.name;
      if (name.startsWith('.')) {
        if (!configNames.has(name)) continue;
      }
      const full = join(current.dir, name);
      if (entry.isDirectory()) {
        if (skipDirs.has(name)) continue;
        if (current.depth + 1 <= maxDepth) {
          stack.push({ dir: full, depth: current.depth + 1 });
        }
        continue;
      }
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
      const isConfig = configNames.has(name);
      const isAllowed = isPathExtensionAllowed(full) || isConfig;
      if (!isAllowed) continue;
      try {
        const size = statSync(full).size;
        if (size > maxFileBytes) continue;
      } catch {
        continue;
      }
      const lowerName = name.toLowerCase();
      const matchesKeyword = keywords.length === 0 || keywords.some((word) => lowerName.includes(word));
      const contentMatch = keywords.length > 0 && fileContentMatches(full, keywords);
      const isDocsPath = full.includes(`${join(root, 'docs')}`) || full.includes(`${join(root, 'doc')}`);
      const isConfigPath =
        full.includes(`${join(root, 'config')}`) || full.includes(`${join(root, 'cfg')}`);
      if (matchesKeyword || contentMatch || isDocsPath || isConfigPath || isConfig) {
        results.push(full);
      }
    }
  }
  return results;
}

function classifyEvidenceFiles(files: string[]): { codeFiles: string[]; testFiles: string[] } {
  const codeFiles: string[] = [];
  const testFiles: string[] = [];
  for (const file of files) {
    const lower = file.toLowerCase();
    const isTest =
      lower.includes('/test/') ||
      lower.includes('/tests/') ||
      lower.includes('test_') ||
      lower.includes('_test') ||
      lower.includes('.spec.') ||
      lower.includes('.test.');
    if (isTest) {
      testFiles.push(file);
    } else {
      codeFiles.push(file);
    }
  }
  return { codeFiles, testFiles };
}

function enhancePlanWithLinks(
  plan: Array<{ id: string; topic: string; status: string }>,
  evidence: RepoEvidence
): Array<{ id: string; topic: string; status: string }> {
  if (plan.length === 0) return plan;
  const enhanced = plan.map((step) => {
    const topic = step.topic ?? '';
    const fileLinks = pickFileLinks(topic, evidence);
    const nextTopic = fileLinks.length > 0 ? `${topic} | Files: ${fileLinks.join(', ')}` : topic;
    return { ...step, topic: nextTopic };
  });
  const safeSuggestion = buildSafePrSuggestion(evidence.codeFiles, evidence.keywords);
  return enhanced.map((step) => {
    if (step.id !== 'step-first-pr') return step;
    const topic = step.topic ?? '';
    const nextTopic = safeSuggestion ? `${topic} | safe PR suggestion: ${safeSuggestion}` : topic;
    return { ...step, topic: nextTopic };
  });
}

function pickFileLinks(topic: string, evidence: RepoEvidence): string[] {
  const words = topic
    .split(/[^a-zA-Z0-9]+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 3);
  const rank = (file: string): number => {
    const lower = file.toLowerCase();
    if (evidence.testFiles.includes(file)) return 0;
    if (evidence.codeFiles.includes(file)) return 1;
    if (lower.includes('/docs') || lower.includes('/doc')) return 3;
    if (lower.includes('/config') || lower.includes('/cfg')) return 4;
    return 2;
  };
  const candidates = evidence.files.filter((file) => {
    const lower = file.toLowerCase();
    return words.some((word) => lower.includes(word));
  });
  const pool = candidates.length > 0 ? candidates : evidence.files;
  const picks = pool.sort((a, b) => rank(a) - rank(b)).slice(0, 3);
  return picks.map((file) => `\`${file}\``);
}

function buildSafePrSuggestion(files: string[], keywords: string[]): string {
  if (files.length === 0) return '';
  const moduleCounts = new Map<string, number>();
  for (const file of files) {
    const rel = file.startsWith(process.cwd()) ? file.slice(process.cwd().length + 1) : file;
    const parts = rel.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    const module = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
    moduleCounts.set(module, (moduleCounts.get(module) ?? 0) + 1);
  }
  const sorted = Array.from(moduleCounts.entries()).sort((a, b) => b[1] - a[1]);
  const topModule = sorted[0]?.[0] ?? 'core module';
  const keywordHint = keywords.length > 0 ? ` around "${keywords.join(', ')}"` : '';
  return `add or improve a small test or doc note in ${topModule}${keywordHint}`;
}

async function buildExplainEvidence(topic: string): Promise<string> {
  const targets = extractPathsFromTopic(topic);
  const snippets: string[] = [];
  if (targets.length > 0) {
    for (const target of targets) {
      if (!isPathAllowed(target)) {
        snippets.push(`--- ${target} ---\nPath outside scope root.`);
        continue;
      }
      if (!existsSync(target)) {
        snippets.push(`--- ${target} ---\nFile not found.`);
        continue;
      }
      try {
        const result = await fileRead.run({ path: target, start: 0, end: 2000 });
        const slice = (result as { slice?: string }).slice ?? '';
        snippets.push(`--- ${target} ---\n${slice}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        snippets.push(`--- ${target} ---\nError: ${message}`);
      }
    }
  }
  if (snippets.length === 0) {
    const keywords = topic
      .split(/[^a-zA-Z0-9]+/)
      .map((word) => word.trim().toLowerCase())
      .filter((word) => word.length > 3);
    const evidence = buildRepoEvidence(keywords, 2);
    const picks = evidence.files.slice(0, 3);
    for (const file of picks) {
      if (!existsSync(file)) continue;
      try {
        const result = await fileRead.run({ path: file, start: 0, end: 2000 });
        const slice = (result as { slice?: string }).slice ?? '';
        snippets.push(`--- ${file} ---\n${slice}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        snippets.push(`--- ${file} ---\nError: ${message}`);
      }
    }
  }
  return snippets.length > 0 ? snippets.join('\n\n') : 'No evidence loaded.';
}

function extractPathsFromTopic(topic: string): string[] {
  const candidates = topic.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean);
  const paths: string[] = [];
  for (const candidate of candidates) {
    if (candidate.includes('/') || candidate.includes('.')) {
      const cleaned = candidate.replace(/[()'"]/g, '');
      paths.push(cleaned);
    }
  }
  return Array.from(new Set(paths));
}

function completePlanStep(statePath: string, stepId: string): { ok: boolean; message: string } {
  const state = loadState(statePath);
  const idx = state.plan.findIndex((step) => step.id === stepId);
  if (idx === -1) {
    return { ok: false, message: `unknown step: ${stepId}` };
  }
  const completed = new Set(state.progress.completed);
  completed.add(stepId);
  const plan = state.plan.map((step, index) => {
    if (index === idx) {
      return { ...step, status: 'done' };
    }
    if (step.status === 'next' && index !== idx) {
      return { ...step, status: 'pending' };
    }
    return step;
  });
  const nextIndex = plan.findIndex((step) => step.status === 'pending');
  if (nextIndex !== -1) {
    plan[nextIndex] = { ...plan[nextIndex], status: 'next' };
  }
  saveState(statePath, {
    ...state,
    plan,
    progress: { ...state.progress, completed: Array.from(completed) },
  });
  return { ok: true, message: `completed ${stepId}` };
}

function nextPlanStep(statePath: string): { ok: boolean; step?: { id: string; topic: string; status: string } } {
  const state = loadState(statePath);
  let step = state.plan.find((item) => item.status === 'next');
  if (!step) {
    step = state.plan.find((item) => item.status === 'pending');
    if (step) {
      state.plan = state.plan.map((item) =>
        item.id === step?.id ? { ...item, status: 'next' } : item
      );
      saveState(statePath, state);
    }
  }
  if (!step) {
    return { ok: false };
  }
  return { ok: true, step };
}

function summarizeHistory(events: LifecycleEvent[]): Array<{
  session_id: string;
  first_ts: string;
  last_ts: string;
  stages: string[];
  notes: string[];
}> {
  const bySession = new Map<string, LifecycleEvent[]>();
  for (const evt of events) {
    const list = bySession.get(evt.session_id) ?? [];
    list.push(evt);
    bySession.set(evt.session_id, list);
  }
  const summaries: Array<{
    session_id: string;
    first_ts: string;
    last_ts: string;
    stages: string[];
    notes: string[];
  }> = [];
  for (const [sessionId, list] of bySession.entries()) {
    const sorted = list.slice().sort((a, b) => a.ts.localeCompare(b.ts));
    const stages = Array.from(new Set(sorted.map((evt) => evt.stage)));
    const notes = sorted
      .map((evt) => evt.note)
      .filter((note): note is string => typeof note === 'string' && note.length > 0);
    summaries.push({
      session_id: sessionId,
      first_ts: sorted[0]?.ts ?? '',
      last_ts: sorted[sorted.length - 1]?.ts ?? '',
      stages,
      notes,
    });
  }
  return summaries.sort((a, b) => a.first_ts.localeCompare(b.first_ts));
}

function fileContentMatches(path: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  try {
    const data = readFileSync(path, 'utf-8');
    const lower = data.toLowerCase();
    return keywords.some((word) => lower.includes(word));
  } catch {
    return false;
  }
}

function parseLearnArgs(query: string): { goals: string[]; scan: boolean } {
  const rest = query.replace(/^learn\s*/, '');
  const tokens = rest.split(' ').map((token) => token.trim()).filter(Boolean);
  const scanIndex = tokens.indexOf('--scan');
  const scan = scanIndex !== -1;
  const cleaned = scan ? tokens.filter((token) => token !== '--scan') : tokens;
  const goalText = cleaned.join(' ').trim();
  const goals = goalText
    ? goalText.split(',').map((goal) => goal.trim()).filter(Boolean)
    : [];
  return { goals, scan };
}

function safeExecVersion(command: string): string {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'not found';
  }
}

function parseBoolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function ensureLearningBranch(): string | null {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
  let branch = '';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
  if (!branch || branch === 'HEAD') {
    return 'git is in a detached HEAD state; create a branch before learning.';
  }
  const isProtected = branch === 'main' || branch === 'master';
  const isColearnerBranch = branch.startsWith('colearner/');
  if (!isProtected || isColearnerBranch) {
    return null;
  }
  const autoBranch = parseBoolEnv(process.env.COLEARNER_AUTO_BRANCH, true);
  if (!autoBranch) {
    return `please create a branch first: git checkout -b colearner/onboarding-${timestampSlug()}`;
  }
  const target = `colearner/onboarding-${timestampSlug()}`;
  try {
    execSync(`git checkout -b ${target}`, { stdio: ['ignore', 'pipe', 'pipe'] });
    return `switched to ${target}`;
  } catch {
    return `failed to create branch; try: git checkout -b ${target}`;
  }
}

function timestampSlug(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes()
  )}${pad(now.getSeconds())}`;
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

  if (query.startsWith('learn')) {
    const { goals, scan } = parseLearnArgs(query);
    const branchStatus = ensureLearningBranch();
    if (branchStatus) {
      if (branchStatus.startsWith('switched to')) {
        write(`branch_guard: ${branchStatus}`);
      } else {
        write(`branch_guard: ${branchStatus}`);
        return out;
      }
    }
    const depth = scan ? 2 : 1;
    const repoSummary = await buildRepoSummary(depth);
    const evidenceData = scan
      ? buildRepoEvidence(goals, depth)
      : { text: repoSummary, files: [], codeFiles: [], testFiles: [], keywords: [] };
    const state = loadState(ctx.statePath);
    const plan = await generateLearningPlan(goals, evidenceData.text, ctx.statePath, state.learner.level);
    const enriched = scan ? enhancePlanWithLinks(plan, evidenceData) : plan;
    const planPath = writePlanMarkdown(ctx.statePath, goals, evidenceData.text, enriched);
    write('Repo map complete -> learning plan created');
    write(`plan_path: ${planPath}`);
    write(JSON.stringify(enriched, null, 2));
    appendLifecycle({ ts: new Date().toISOString(), session_id: ctx.sessionId, stage: 'plan' });
    const event = buildEvent(ctx.role, ctx.sessionId, 'learning_plan', { goals, plan, student_id: ctx.studentId });
    await publish(ctx, 'colearner.progress.v1', event);
    return out;
  }
  if (query.startsWith('explain ')) {
    const topic = query.replace(/^explain\s+/, '').trim();
    const evidence = await buildExplainEvidence(topic);
    const result = await explainWithExamples(topic, evidence);
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
  if (query.startsWith('level ')) {
    const next = query.replace(/^level\s+/, '').trim().toLowerCase();
    if (next !== 'junior' && next !== 'mid' && next !== 'senior') {
      write('level must be one of: junior, mid, senior');
      return out;
    }
    const state = loadState(ctx.statePath);
    saveState(ctx.statePath, { ...state, learner: { ...state.learner, level: next } });
    write(`level set to ${next}`);
    return out;
  }
  if (query.startsWith('student ')) {
    ctx.studentId = query.replace(/^student\s+/, '').trim() || ctx.studentId;
    write(`student set to ${ctx.studentId}`);
    return out;
  }
  if (query.startsWith('session ')) {
    ctx.sessionId = query.replace(/^session\s+/, '').trim() || ctx.sessionId;
    saveSessionId(ctx.sessionId);
    write(`session set to ${ctx.sessionId}`);
    return out;
  }
  if (query.startsWith('round')) {
    const name = query.replace(/^round\s*/, '').trim();
    ctx.sessionId = startNewRound(name || undefined);
    const evt: LifecycleEvent = {
      ts: new Date().toISOString(),
      session_id: ctx.sessionId,
      stage: 'init',
      note: name ? `round: ${name}` : 'round: new',
    };
    appendLifecycle(evt);
    const event = buildEvent(ctx.role, ctx.sessionId, 'lifecycle', { stage: 'init', note: evt.note, student_id: ctx.studentId });
    await publish(ctx, 'colearner.events.v1', event);
    write(`round started: ${ctx.sessionId}`);
    return out;
  }
  if (query.startsWith('lifecycle ')) {
    const stage = query.replace(/^lifecycle\s+/, '').trim();
    if (
      stage === 'init' ||
      stage === 'plan' ||
      stage === 'practice' ||
      stage === 'review' ||
      stage === 'done' ||
      stage === 'note' ||
      stage === 'insight'
    ) {
      const lifecycleStage = stage as LifecycleEvent['stage'];
      const evt: LifecycleEvent = { ts: new Date().toISOString(), session_id: ctx.sessionId, stage: lifecycleStage };
      appendLifecycle(evt);
      const event = buildEvent(ctx.role, ctx.sessionId, 'lifecycle', { stage: lifecycleStage, student_id: ctx.studentId });
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
    if (id === 'all') {
      const events = readLifecycle();
      write(JSON.stringify(events, null, 2));
      return out;
    }
    if (id === 'summary' || id === '--summary') {
      const summary = summarizeHistory(readLifecycle());
      write(JSON.stringify(summary, null, 2));
      return out;
    }
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
  if (query.startsWith('complete ')) {
    const id = query.replace(/^complete\s+/, '').trim();
    const result = completePlanStep(ctx.statePath, id);
    write(result.message);
    if (result.ok) {
      const next = nextPlanStep(ctx.statePath);
      if (next.ok && next.step) {
        write(`next: ${next.step.id} ${next.step.topic}`);
      }
    }
    return out;
  }
  if (query === 'next') {
    const next = nextPlanStep(ctx.statePath);
    if (!next.ok || !next.step) {
      write('no next step found');
      return out;
    }
    const explainPaths = extractPathsFromTopic(next.step.topic);
    const explainTarget = explainPaths.length > 0 ? explainPaths.join(' ') : next.step.topic;
    write(`next: ${next.step.id} ${next.step.topic}`);
    write(`try: colearner-ai explain "${explainTarget}"`);
    write(`try: colearner-ai practice "${next.step.topic}"`);
    write(`try: colearner-ai complete ${next.step.id}`);
    write('try: colearner-ai progress');
    write('try: colearner-ai history');
    return out;
  }
  if (query.startsWith('comment ')) {
    const note = query.replace(/^comment\s+/, '').trim();
    if (!note) {
      write('comment: missing text');
      return out;
    }
    const evt: LifecycleEvent = { ts: new Date().toISOString(), session_id: ctx.sessionId, stage: 'note', note };
    appendLifecycle(evt);
    const event = buildEvent(ctx.role, ctx.sessionId, 'lifecycle', { stage: 'note', note, student_id: ctx.studentId });
    await publish(ctx, 'colearner.events.v1', event);
    write('comment saved');
    return out;
  }
  if (query.startsWith('insight ')) {
    const note = query.replace(/^insight\s+/, '').trim();
    if (!note) {
      write('insight: missing text');
      return out;
    }
    const evt: LifecycleEvent = { ts: new Date().toISOString(), session_id: ctx.sessionId, stage: 'insight', note };
    appendLifecycle(evt);
    const event = buildEvent(ctx.role, ctx.sessionId, 'lifecycle', { stage: 'insight', note, student_id: ctx.studentId });
    await publish(ctx, 'colearner.events.v1', event);
    write('insight saved');
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
