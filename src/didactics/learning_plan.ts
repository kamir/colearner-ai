import { callLlm } from '../llm/provider.js';
import { updateState } from './progress.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface PlanStep {
  id: string;
  topic: string;
  status: string;
}

export async function generateLearningPlan(
  goals: string[],
  repoSummary: string,
  statePath: string
): Promise<PlanStep[]> {
  const prompt = [
    'Generate a 5-step onboarding learning plan.',
    'Focus on the minimum skills needed to work in the repo.',
    'Return JSON: [{"id":"step-1","topic":"...","status":"next"}]',
    `Goals: ${goals.join(', ') || 'none'}`,
    `Repo summary: ${repoSummary}`,
  ].join('\n');
  const text = await callLlm(prompt, { systemPrompt: 'You are a curriculum planner.' });
  const plan = parseJsonArray(text);
  const normalized = plan.length > 0 ? plan : fallbackPlan(goals);
  const enhanced = appendFirstContributionStep(normalized);
  updateState(statePath, {
    learner: { level: 'intermediate', goals },
    plan: enhanced,
    progress: { completed: [], confidence: {} },
  });
  return enhanced;
}

function parseJsonArray(text: string): PlanStep[] {
  try {
    return JSON.parse(text) as PlanStep[];
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      return JSON.parse(match[0]) as PlanStep[];
    } catch {
      return [];
    }
  }
}

function fallbackPlan(goals: string[]): PlanStep[] {
  const base = goals.length > 0 ? goals : ['repo overview', 'core workflows', 'dependency map', 'safe refactors', 'tests'];
  return base.slice(0, 5).map((topic, idx) => ({
    id: `step-${idx + 1}`,
    topic,
    status: idx === 0 ? 'next' : 'pending',
  }));
}

function appendFirstContributionStep(plan: PlanStep[]): PlanStep[] {
  const hasContribution = plan.some((step) => step.topic.toLowerCase().includes('contribution'));
  if (hasContribution) {
    return plan;
  }
  const helpSources = detectHelpSources(process.cwd());
  const helpText = helpSources.length > 0 ? helpSources.join(', ') : 'README/CONTRIBUTING or repo maintainers';
  const contributionStep: PlanStep = {
    id: 'step-first-pr',
    topic: [
      'first contribution',
      'pick one safe task',
      'open one PR-sized exercise',
      'definition of done',
      `where to ask for help: ${helpText}`,
    ].join(' | '),
    status: 'pending',
  };
  return [...plan, contributionStep];
}

function detectHelpSources(root: string): string[] {
  const candidates = [
    'CONTRIBUTING.md',
    'README.md',
    'README.txt',
    'CODE_OF_CONDUCT.md',
    join('.github', 'PULL_REQUEST_TEMPLATE.md'),
    join('.github', 'ISSUE_TEMPLATE', 'bug_report.md'),
    join('.github', 'ISSUE_TEMPLATE', 'config.yml'),
  ];
  const sources: string[] = [];
  for (const rel of candidates) {
    const path = join(root, rel);
    if (!existsSync(path)) {
      continue;
    }
    try {
      const text = readFileSync(path, 'utf-8');
      const hints = extractContactHints(text);
      if (hints.length > 0) {
        sources.push(`${rel}: ${hints.join('/')}`);
      } else {
        sources.push(rel);
      }
    } catch {
      sources.push(rel);
    }
  }
  return sources;
}

function extractContactHints(text: string): string[] {
  const hints: string[] = [];
  const lower = text.toLowerCase();
  if (lower.includes('slack')) hints.push('slack');
  if (lower.includes('discord')) hints.push('discord');
  if (lower.includes('matrix')) hints.push('matrix');
  if (lower.includes('gitter')) hints.push('gitter');
  if (lower.includes('zulip')) hints.push('zulip');
  if (lower.includes('teams')) hints.push('teams');
  if (lower.includes('mailto:') || lower.includes('email')) hints.push('email');
  return Array.from(new Set(hints));
}
