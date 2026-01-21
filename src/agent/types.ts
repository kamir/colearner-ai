export type AgentEvent =
  | ThinkingEvent
  | ToolStartEvent
  | ToolEndEvent
  | ToolErrorEvent
  | AnswerStartEvent
  | AnswerChunkEvent
  | DoneEvent;

export interface ThinkingEvent {
  type: 'thinking';
  message: string;
}

export interface ToolStartEvent {
  type: 'tool_start';
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolEndEvent {
  type: 'tool_end';
  tool: string;
  args: Record<string, unknown>;
  result: string;
  durationMs: number;
}

export interface ToolErrorEvent {
  type: 'tool_error';
  tool: string;
  error: string;
}

export interface AnswerStartEvent {
  type: 'answer_start';
}

export interface AnswerChunkEvent {
  type: 'answer_chunk';
  text: string;
}

export interface DoneEvent {
  type: 'done';
  answer: string;
  iterations: number;
}

export interface ToolSummary {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
}

export interface ToolContext {
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  timestamp: string;
}

export interface Tool {
  name: string;
  description: string;
  run(args: Record<string, unknown>): Promise<unknown>;
}

export interface AgentConfig {
  maxIterations?: number;
  signal?: AbortSignal;
}
