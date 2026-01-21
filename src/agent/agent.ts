import { ContextManager } from './context.js';
import { Scratchpad } from '../utils/scratchpad.js';
import { buildFinalAnswerPrompt, buildIterationPrompt, SYSTEM_PROMPT } from './prompts.js';
import { toolByName, toolDescriptions } from '../tools/index.js';
import { callLlm, chooseTool } from '../llm/provider.js';
import type { AgentConfig, AgentEvent, ToolSummary } from './types.js';
import { getMaxIterations } from '../utils/safety.js';
import { resetReadBudget } from '../tools/file_read.js';

const DEFAULT_MAX_ITERATIONS = 12;

export class Agent {
  private readonly contextManager = new ContextManager();
  private readonly maxIterations: number;

  constructor(config: AgentConfig = {}) {
    this.maxIterations = config.maxIterations ?? getMaxIterations() ?? DEFAULT_MAX_ITERATIONS;
  }

  async *run(query: string): AsyncGenerator<AgentEvent> {
    resetReadBudget();
    const scratchpad = new Scratchpad();
    const summaries: ToolSummary[] = [];
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;
      const prompt = buildIterationPrompt(query, scratchpad.summaries());
      const decision = await this.route(query, prompt);

      if (!decision.tool) {
        const answer = await this.finalAnswer(query, summaries);
        yield { type: 'answer_start' };
        yield { type: 'answer_chunk', text: answer };
        yield { type: 'done', answer, iterations: iteration };
        return;
      }

      yield { type: 'thinking', message: `Using tool: ${decision.tool}` };
      yield { type: 'tool_start', tool: decision.tool, args: decision.args };

      const start = Date.now();
      try {
        const tool = toolByName(decision.tool);
        if (!tool) {
          throw new Error(`tool not found: ${decision.tool}`);
        }
        const result = await tool.run(decision.args);
        const resultText = JSON.stringify(result, null, 2);
        const summary = this.contextManager.saveAndSummarize(decision.tool, decision.args, resultText);
        summaries.push(summary);
        scratchpad.add(`${summary.summary}`);
        yield { type: 'tool_end', tool: decision.tool, args: decision.args, result: resultText, durationMs: Date.now() - start };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        yield { type: 'tool_error', tool: decision.tool, error: message };
        const answer = `Tool error: ${message}`;
        yield { type: 'answer_start' };
        yield { type: 'answer_chunk', text: answer };
        yield { type: 'done', answer, iterations: iteration };
        return;
      }
    }

    const answer = await this.finalAnswer(query, summaries);
    yield { type: 'answer_start' };
    yield { type: 'answer_chunk', text: answer };
    yield { type: 'done', answer, iterations: iteration };
  }

  private async route(query: string, prompt: string): Promise<{ tool?: string; args: Record<string, unknown> }> {
    void SYSTEM_PROMPT;
    void prompt;
    const llmChoice = await chooseTool(query, toolDescriptions);
    if (llmChoice.tool) {
      return llmChoice;
    }
    const normalized = query.toLowerCase();
    if (normalized.includes('map') || normalized.includes('structure') || normalized.includes('overview')) {
      return { tool: 'repo_scan', args: { depth: 1 } };
    }
    return { args: {} };
  }

  private async finalAnswer(query: string, summaries: ToolSummary[]): Promise<string> {
    const ids = summaries.map((summary) => summary.id);
    const contexts = this.contextManager.loadContexts(ids);
    const payload = contexts.length > 0 ? JSON.stringify(contexts, null, 2) : 'No tool data collected.';
    const prompt = buildFinalAnswerPrompt(query, payload);
    try {
      return await callLlm(prompt, { systemPrompt: SYSTEM_PROMPT });
    } catch {
      return [
        'Findings:',
        contexts.length > 0 ? '- Repo scan collected. See context payload.' : '- No repo data collected.',
        '',
        'Learning steps:',
        '1) Identify high-churn files and map stable interfaces.',
        '2) Understand module boundaries and data flow.',
        '3) Practice a small refactor with tests.',
        '',
        'Risks and tests:',
        '- Risk: hidden coupling across modules.',
        '- Add tests around public boundaries and critical data flows.',
      ].join('\n');
    }
  }
}
