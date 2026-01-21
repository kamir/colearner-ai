import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface LearningState {
  learner: {
    level: string;
    goals: string[];
  };
  plan: Array<{ id: string; topic: string; status: string }>;
  progress: {
    completed: string[];
    confidence: Record<string, number>;
  };
}

const DEFAULT_STATE: LearningState = {
  learner: { level: 'intermediate', goals: [] },
  plan: [],
  progress: { completed: [], confidence: {} },
};

export function loadState(path: string): LearningState {
  if (!existsSync(path)) {
    return DEFAULT_STATE;
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as LearningState;
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(path: string, state: LearningState): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function updateState(path: string, partial: Partial<LearningState>): LearningState {
  const current = loadState(path);
  const merged: LearningState = {
    learner: partial.learner ?? current.learner,
    plan: partial.plan ?? current.plan,
    progress: partial.progress ?? current.progress,
  };
  saveState(path, merged);
  return merged;
}

export function applyPlan(path: string, plan: LearningState['plan']): LearningState {
  return updateState(path, {
    plan,
    progress: { completed: [], confidence: {} },
  });
}

export function applyProgress(
  path: string,
  completed: string[],
  confidence: Record<string, number>
): LearningState {
  const current = loadState(path);
  const mergedCompleted = Array.from(new Set([...current.progress.completed, ...completed]));
  const mergedConfidence = { ...current.progress.confidence, ...confidence };
  return updateState(path, {
    progress: { completed: mergedCompleted, confidence: mergedConfidence },
  });
}
