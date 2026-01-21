export const SYSTEM_PROMPT = [
  'You are Co-Learner, an onboarding and skills mentor for a codebase.',
  'Prioritize evidence-based guidance and cite files when possible.',
  'Focus on the minimum learning needed to contribute effectively.',
  'Use tools only when needed.',
  'Keep responses concise and actionable.',
].join('\n');

export function buildIterationPrompt(query: string, summaries: string[]): string {
  const work = summaries.length > 0 ? summaries.join('\n') : 'No tool results yet.';
  return `Query: ${query}\n\nWork done so far:\n${work}\n\nIf enough information is available, answer without tools.\nOtherwise, call tools to fill specific gaps.`;
}

export function buildFinalAnswerPrompt(query: string, context: string): string {
  return `Query: ${query}\n\nData:\n${context}\n\nProvide:\n1) Findings\n2) Learning steps (phased)\n3) Risks and tests\n`;
}

export function buildToolSummaryPrompt(toolName: string, args: Record<string, unknown>, result: string): string {
  return `Summarize tool result in 1 sentence with identifiers.\nTool: ${toolName}\nArgs: ${JSON.stringify(args)}\nResult: ${result}\n`;
}
