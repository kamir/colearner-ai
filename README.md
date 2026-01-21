# colearner-ai
![colearner logo](docs/logo.png)

## 🧠 CoLearner — Learn Any Codebase, Faster

CoLearner is an AI onboarding agent that learns your repository and teaches you how to work in it.

Instead of generic explanations, CoLearner:
- Reads your code
- Maps it to learning goals
- Explains how things actually work
- Guides you through safe, hands-on practice

Think of it as a senior engineer who knows the repo and explains it at your pace.

## ✨ What CoLearner Does

🔍 Understands your codebase  
Builds a mental model of structure, dependencies, and intent.

🧭 Creates a personal learning path  
Learn only what you need — in the right order.

📘 Explains real code  
Not tutorials. Not abstractions. Your actual implementation.

🧪 Generates safe exercises  
Practice without breaking production.

🧠 Tracks your learning  
Progress stored locally in `.colearner/learning.json`.

🧩 First contribution focus  
Ends with a safe task, PR-sized exercise, definition of done, and where to ask for help.

## ⚡ Why Developers Love It

No vendor lock-in  
No dashboards  
No hallucinated explanations  
No black-box “AI magic”

Just:
You, your code, and a guide that understands both.

## 🚀 Quick Start
```bash
cd extensions/colearner
npm install
npm run dev
```

Then:
```text
colearner-ai learn onboarding
colearner-ai explain auth flow
colearner-ai practice data ingestion
```

A Claude Code agent that builds the skills you need to work in a repo. It investigates the codebase, maps it to learning objectives, and delivers a personal learning path for onboarding.

## Quick Start (2‑minute path)
```bash
cd extensions/colearner
npm install
npm run dev -- init
npm run dev -- learn "ship first PR"
```

Published install (same flow):
```bash
npx colearner-ai init
npx colearner-ai learn "ship first PR"
```

Optional (for LLM-powered responses):
```bash
export OPENAI_API_KEY="your-key"
# or
export ANTHROPIC_API_KEY="your-key"
```
Optional overrides:
- `OPENAI_API_KEY` (optional)
- `ANTHROPIC_API_KEY` (optional)
- `COLEARNER_MODEL` (optional)

No keys? CoLearner still works in heuristic mode using repo structure and docs.

First success (creates a learning plan):
```text
Repo map complete -> learning plan created
```
Outputs:
- `.colearner/learning.json`
- `.colearner/plan.md`

## CLI Commands
- `init`: initialize `.colearner/learning.json`.
- `learn <goal1, goal2>`: create a learning plan.
- `explain <topic>`: explain in 3 levels (basic → advanced).
- `practice <topic>`: generate a safe exercise.
- `assess <exercise>|<response>`: evaluate your response.
- `refactor <topic>`: propose a refactor and teach the why/how.
- `progress`: show your learning state.
- `lifecycle <stage>`: record a session stage.
- `history`: show lifecycle history.
- `doctor`: verify environment, repo scan, repo size, monorepo hints, env vars, and broker availability.

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

## Safety Posture
- Hard step limits per command (`COLEARNER_MAX_ITERATIONS`).
- Bounded reads per file and per run (`COLEARNER_MAX_FILE_BYTES`, `COLEARNER_MAX_RUN_BYTES`).
- Allowlisted file extensions (`COLEARNER_ALLOWED_EXTENSIONS`).
- Scope enforcement via `COLEARNER_SCOPE_ROOT`.
- No script execution by default.

## What I Will Not Do
- Execute project scripts or binaries.
- Read or write files outside `.colearner/` or the scope root.
- Make network calls unless LLM/Kafka mode is configured.
