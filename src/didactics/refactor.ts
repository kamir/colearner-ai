import { callLlm } from '../llm/provider.js';

export async function proposeRefactor(
  topic: string,
  evidence: string
): Promise<string> {
  const prompt = [
    `Topic: ${topic}`,
    'Propose a refactor and explain the why and how.',
    'Include teaching notes so the reader learns from the change.',
    'Return: proposal, rationale, step-by-step plan, tests.',
    `Evidence:\n${evidence}`,
  ].join('\n');
  return callLlm(prompt, { systemPrompt: 'You are a refactoring mentor.' });
}
