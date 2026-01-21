import { callLlm } from '../llm/provider.js';
import type { Tool } from '../agent/types.js';

export const diffSuggest: Tool = {
  name: 'diff_suggest',
  description: 'Suggest a refactor diff plan (no code changes).',
  async run(args: Record<string, unknown>): Promise<unknown> {
    const topic = typeof args.topic === 'string' ? args.topic : 'refactor';
    const evidence = typeof args.evidence === 'string' ? args.evidence : '';
    const constraints = typeof args.constraints === 'string' ? args.constraints : 'Keep changes small and safe.';
    const prompt = [
      `Topic: ${topic}`,
      `Constraints: ${constraints}`,
      'Provide a diff plan (files to touch, steps, and rationale).',
      `Evidence:\n${evidence}`,
    ].join('\n');
    const result = await callLlm(prompt, { systemPrompt: 'You are a refactoring planner.' });
    return { topic, plan: result };
  },
};
