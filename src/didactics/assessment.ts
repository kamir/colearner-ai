import { callLlm } from '../llm/provider.js';

export async function assessExercise(
  exercise: string,
  response: string
): Promise<string> {
  const prompt = [
    'Evaluate the user response for correctness and clarity.',
    `Exercise:\n${exercise}`,
    `User response:\n${response}`,
    'Provide: grade, mistakes, next step tied to onboarding readiness.',
  ].join('\n');
  return callLlm(prompt, { systemPrompt: 'You are a strict but helpful reviewer.' });
}
