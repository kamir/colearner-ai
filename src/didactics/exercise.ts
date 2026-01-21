import { callLlm } from '../llm/provider.js';

export async function generateExercise(
  topic: string,
  evidence: string
): Promise<string> {
  const prompt = [
    `Topic: ${topic}`,
    'Create one safe onboarding exercise with expected diff plan and tests.',
    'Ensure the task is small and immediately useful for working in the repo.',
    `Evidence:\n${evidence}`,
  ].join('\n');
  return callLlm(prompt, { systemPrompt: 'You are a practical tutor.' });
}
