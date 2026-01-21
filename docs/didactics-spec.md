# Didactics Spec: Co-Learner as a Self‑Learning Expert

This document defines how the colearner agent evolves from a refactor assistant into a didactics‑grade self‑learning system.

## 1) Goals
- Build the skills needed to contribute to the repo, not just browse it.
- Map repo structure to clear learning objectives and personal paths.
- Ground explanations in real repo artifacts.
- Provide exercises, feedback, and progression tracking.
- Adapt to user level and onboarding goals.

## 2) Core Capabilities
- **Learning Plan**: multi‑step roadmap aligned to onboarding outcomes.
- **Scaffolded Explanations**: concept → example → exercise.
- **Concept Checks**: short quizzes and “teach‑back” prompts.
- **Practice Tasks**: safe, small refactors with expected outcomes.
- **Feedback Loop**: evaluate responses and adjust difficulty.
- **Progress Tracking**: stored milestones and coverage.

## 3) Architecture (New Layers)
- **Pedagogy Layer**: constructs learning goals and pacing.
- **Evidence Layer**: pulls concrete code examples.
- **Exercise Layer**: creates tasks and validates results.
- **Feedback Layer**: provides corrective guidance.

## 4) Data Model (Minimal)
```json
{
  "learner": {
    "level": "intermediate",
    "goals": ["understand repo structure", "safe refactoring"]
  },
  "plan": [
    {"id": "map-01", "topic": "repo overview", "status": "done"},
    {"id": "deps-01", "topic": "module dependencies", "status": "next"},
    {"id": "refactor-01", "topic": "extract interface", "status": "pending"}
  ],
  "progress": {
    "completed": ["map-01"],
    "confidence": {"repo overview": 0.8}
  }
}
```

## 5) New Tools (Didactics Focus)
- `learning_plan`: generate a roadmap from goals and repo state.
- `explain_with_examples`: select real code snippets and annotate.
- `exercise_generator`: create tasks (diff plan + tests).
- `assessment`: evaluate user responses and recommend next step.
- `refactor_proposal`: propose refactors and explain the why/how for learning.
- `progress_store`: persist learning state and milestones.

## 6) Prompt Skeletons

**Learning plan**
```
User goals: {goals}
Repo summary: {repo_summary}
Return a 5‑step plan with prerequisites and outcomes.
```

**Explain with example**
```
Topic: {topic}
Repo evidence: {snippets}
Explain in 3 levels: basic, intermediate, advanced.
```

**Exercise generator**
```
Topic: {topic}
Repo evidence: {snippets}
Create one safe exercise with expected diff and tests.
```

**Assessment**
```
Exercise: {exercise}
User response: {response}
Grade correctness, explain mistakes, suggest next step.
```

## 7) Output Contract
- Lead with 2–3 sentence summary.
- Provide numbered steps.
- Cite file paths when using evidence.
- End with “next exercise” or “next concept.”
- Emphasize onboarding readiness (what the learner can now do).

## 8) Milestones
1) Add `file_read`, `symbol_index`, `dependency_graph`.
2) Add `learning_plan` with persistence in `.colearner/learning.json`.
3) Add `explain_with_examples` using real snippets.
4) Add `exercise_generator` + `assessment` loop.
5) Add progress dashboard to CLI.
