import { callLlm } from '../llm/provider.js';
import { updateState } from './progress.js';

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
  updateState(statePath, {
    learner: { level: 'intermediate', goals },
    plan: normalized,
    progress: { completed: [], confidence: {} },
  });
  return normalized;
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
