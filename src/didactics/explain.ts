import { callLlm } from '../llm/provider.js';

export async function explainWithExamples(
  topic: string,
  evidence: string
): Promise<string> {
  const prompt = [
    `Topic: ${topic}`,
    'Explain in three levels: basic, intermediate, advanced.',
    'Cite evidence when relevant.',
    'Tie the explanation to the skills needed for onboarding.',
    `Evidence:\n${evidence}`,
  ].join('\n');
  return callLlm(prompt, { systemPrompt: 'You are a didactics expert.' });
}
