# colearner-ai
A Claude Code agent that builds the skills you need to work in a repo. It investigates the codebase, maps it to learning objectives, and delivers a personal learning path for onboarding.

## What It Does
- Creates a personal learning path aligned to onboarding goals.
- Maps repo structure to concrete skills and objectives.
- Explains concepts with real code examples.
- Generates safe practice tasks and assesses your answers.
- Tracks learning progress in `.colearner/learning.json`.

## Quick Start
```bash
cd extensions/colearner
npm install
npm run dev
```

Optional (for LLM-powered responses):
```bash
export OPENAI_API_KEY="your-key"
# or
export ANTHROPIC_API_KEY="your-key"
```

## CLI Commands
- `learn <goal1, goal2>`: create a learning plan.
- `explain <topic>`: explain in 3 levels (basic → advanced).
- `practice <topic>`: generate a safe exercise.
- `assess <exercise>|<response>`: evaluate your response.
- `refactor <topic>`: propose a refactor and teach the why/how.
- `progress`: show your learning state.
- `lifecycle <stage>`: record a session stage.
- `history`: show lifecycle history.

## Tools (Current)
- `repo_scan`: shallow repo map.
- `file_read`: bounded file slice.
- `symbol_index`: simple symbol extraction.
- `dependency_graph`: import/require scan.
- `call_graph`: best-effort call extraction.
- `test_map`: test block detection.

## Architecture
Co-Learner uses a ReAct-style agent loop:
1) Decide → 2) Tool → 3) Summarize → 4) Iterate → 5) Answer.
Full results are stored to disk; summaries are used in the loop.

## Onboarding Goal
The primary goal is onboarding: learn only what you need to contribute effectively to this repo, guided by a tailored learning plan.

## Documentation
- `docs/user-manual.md`: end-user tutorial and guide.
- `docs/architecture.md`: modules and dataflow.
- `docs/agent-spec.md`: prompts, event schema, output contract.
- `docs/didactics-spec.md`: didactics roadmap.
- `docs/solution-proposal.md`: implementation plan.

## Status
Minimal working loop + didactics commands implemented.
