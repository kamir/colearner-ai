export type Provider = 'openai' | 'anthropic';

export interface LlmOptions {
  model?: string;
  systemPrompt?: string;
}

export interface ToolChoice {
  tool?: string;
  args: Record<string, unknown>;
}

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

function resolveProvider(): Provider | null {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

export async function callLlm(prompt: string, options: LlmOptions = {}): Promise<string> {
  const provider = resolveProvider();
  if (!provider) {
    return 'LLM disabled. Set OPENAI_API_KEY or ANTHROPIC_API_KEY for richer output.';
  }
  if (provider === 'openai') {
    return callOpenAI(prompt, options);
  }
  return callAnthropic(prompt, options);
}

async function callOpenAI(prompt: string, options: LlmOptions): Promise<string> {
  const model = options.model ?? process.env.COLEARNER_MODEL ?? 'gpt-4.1';
  const systemPrompt = options.systemPrompt ?? 'You are a concise assistant.';
  const resp = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!resp.ok) {
    throw new Error(`OpenAI error: ${resp.status}`);
  }
  const json = await resp.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

async function callAnthropic(prompt: string, options: LlmOptions): Promise<string> {
  const model = options.model ?? process.env.COLEARNER_MODEL ?? 'claude-3-5-sonnet-20241022';
  const systemPrompt = options.systemPrompt ?? 'You are a concise assistant.';
  const resp = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!resp.ok) {
    throw new Error(`Anthropic error: ${resp.status}`);
  }
  const json = await resp.json() as {
    content?: Array<{ text?: string }>;
  };
  return json.content?.[0]?.text?.trim() ?? '';
}

export async function chooseTool(
  query: string,
  tools: Array<{ name: string; description: string }>
): Promise<ToolChoice> {
  const provider = resolveProvider();
  if (!provider) {
    return { args: {} };
  }
  const prompt = [
    'Select the best tool for the user query.',
    'Return strict JSON: {"tool": "<tool_name_or_null>", "args": {}}',
    'If no tool is needed, set tool to null.',
    '',
    `Query: ${query}`,
    'Tools:',
    tools.map((t) => `- ${t.name}: ${t.description}`).join('\n'),
  ].join('\n');
  const text = await callLlm(prompt, { systemPrompt: 'You are a tool router.' });
  const parsed = parseJson(text);
  if (!parsed || typeof parsed !== 'object') {
    return { args: {} };
  }
  const tool = typeof parsed.tool === 'string' ? parsed.tool : undefined;
  const args = parsed.args && typeof parsed.args === 'object' ? parsed.args as Record<string, unknown> : {};
  return { tool, args };
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
