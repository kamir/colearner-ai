# Architecture

This module mirrors Dexter's proven structure for agentic loops and adapts it to codebase co-learning.

## Components
- Agent: ReAct-style loop that decides when to call tools and when to answer.
- ContextManager: persists full tool results to disk and yields compact summaries.
- Scratchpad: append-only record of decisions and tool summaries.
- ToolRouter: meta-tool that chooses the right codebase tool(s).
- EventStream: emits uniform events for CLI rendering.
- LLMProvider: multi-provider wrapper with retry and fast-model summaries.

## Dataflow
1) User query enters Agent.
2) Agent calls LLM with system + iteration prompts.
3) LLM tool calls routed to codebase tools.
4) Tool results saved to disk; summaries returned to loop.
5) Agent iterates until sufficient context.
6) Final answer uses full results reloaded from disk.

## Guardrails
- Max iterations (default 8–12).
- Tool availability checks.
- AbortSignal for user cancellation.

## Storage Layout
- `.colearner/context/` for tool outputs.
- Optional `.colearner/history.jsonl` for conversation snapshots.

## CLI Rendering
Events are rendered in a Claude Code-like stream:
- thinking
- tool_start
- tool_end
- tool_error
- answer_start
- answer_chunk
- done
