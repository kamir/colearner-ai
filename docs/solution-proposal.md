# Co-Learner Didactics: Solution Proposal

This proposal covers the full plan for items 1–5 (tools, evidence, persistence, pedagogy loop, CLI UX) and defines an execution path aligned to onboarding and skill-building.

## Scope
Build a didactics-grade colearner that turns a codebase into a personal onboarding path with evidence, exercises, and progress tracking, matching Dexter’s maturity in loop robustness and UX.

## 1) Didactics Tools (Implement)

### 1.1 learning_plan
**Purpose:** Generate a structured onboarding roadmap from goals + repo state.  
**Inputs:** goals, learner_level, repo_summary.  
**Outputs:** ordered steps with prerequisites, outcomes, and onboarding outcomes.  
**Storage:** `.colearner/learning.json`

### 1.2 explain_with_examples
**Purpose:** Teach a concept with repo-based evidence.  
**Inputs:** topic, repo_snippets, learner_level.  
**Outputs:** explanation at 3 levels (basic/intermediate/advanced) with file refs.

### 1.3 exercise_generator
**Purpose:** Create safe, bounded tasks.  
**Inputs:** topic, repo_snippets, scope constraints.  
**Outputs:** task, expected diff plan, tests to run.

### 1.4 assessment
**Purpose:** Evaluate user response and guide next step.  
**Inputs:** exercise, response, repo_state (optional).  
**Outputs:** grade, mistakes, guidance, next task.

### 1.5 progress_store
**Purpose:** Persist learner state + milestones.  
**Inputs:** updates to plan and confidence.  
**Outputs:** updated `.colearner/learning.json`.

## 2) Evidence Tools (Implement)

### 2.1 file_read
Read bounded file slices by path + range.

### 2.2 symbol_index
Extract symbols and references using tree-sitter or simple regex fallback.

### 2.3 dependency_graph
Generate module edges from imports and package manifests.

### 2.4 call_graph
Map function call edges (best-effort for main languages).

### 2.5 test_map
Map tests to modules via naming conventions + import analysis.

## 3) Persistence Model

**File:** `.colearner/learning.json`

Minimal schema:
```json
{
  "learner": { "level": "intermediate", "goals": ["understand structure"] },
  "plan": [
    {"id": "map-01", "topic": "repo overview", "status": "done"}
  ],
  "progress": {
    "completed": ["map-01"],
    "confidence": {"repo overview": 0.8}
  }
}
```

## 4) Pedagogy Loop Integration

### Loop Phases
1) **Goal Intake** → store onboarding goals and level.  
2) **Plan** → `learning_plan` generated as a personal onboarding path.  
3) **Explain** → `explain_with_examples`.  
4) **Exercise** → `exercise_generator`.  
5) **Assess** → `assessment` + update progress.  

### Exit Conditions
- User ends session or goal is satisfied.
- Confidence threshold reached for all plan steps.

## 5) CLI UX

### Modes
- `learn`: run onboarding plan → explain → exercise.
- `explain <topic>`: direct concept mode.
- `practice`: generate and assess exercises.
- `progress`: show plan + confidence.

### Event Stream
Use existing event schema with new “didactics” events:
- `plan_generated`
- `exercise_assigned`
- `assessment_complete`

## Architecture Changes

### New Modules
- `src/didactics/learning_plan.ts`
- `src/didactics/explain.ts`
- `src/didactics/exercise.ts`
- `src/didactics/assessment.ts`
- `src/didactics/progress.ts`
- `src/tools/file_read.ts`
- `src/tools/symbol_index.ts`
- `src/tools/dependency_graph.ts`
- `src/tools/call_graph.ts`
- `src/tools/test_map.ts`

### LLM Usage
- Use LLM for plan, explanation, exercise, and assessment.
- Use fast model for summaries.
- Avoid tool calls if evidence is sufficient.
- Optional keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `COLEARNER_MODEL`.
- No keys: heuristic mode using repo structure and docs.

## Milestones

**M1: Evidence Foundation**
- Implement `file_read`, `symbol_index`, `dependency_graph`.
- Add `test_map` and `call_graph` stubs.

**M2: Didactics Core**
- Implement `learning_plan`, `explain_with_examples`.
- Write onboarding plan to `.colearner/learning.json`.

**M3: Practice Loop**
- Implement `exercise_generator`, `assessment`.
- CLI “practice” mode.

**M4: UX + Progress**
- CLI `progress` view.
- Event stream extension.

## Risks and Mitigations
- **Language variety:** Start with JS/TS; add adapters for Go/Python.
- **Tool accuracy:** Mark outputs as “best effort,” prefer evidence links.
- **Token cost:** Keep evidence slices short; rely on summaries.

## Acceptance Criteria
- A new contributor can run `learn`, receive a 5-step onboarding path, complete one exercise, and see progress updated.
- Explanations include real file paths.
- Exercises reference tests or suggest new ones.
