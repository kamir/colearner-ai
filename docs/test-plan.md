# Co-Learner Test Plan

This test plan validates the end-to-end coach/student flow, didactics features, and Kafka integration.

## Prerequisites
- Node 18+
- `npm install` in `extensions/colearner`
- Optional Kafka: set `COLEARNER_BUS=kafka` and `AAFW_HOME=../aafw-home`

## Test Matrix

### 1) Core Didactics (Single Instance)
**Goal:** Verify learn/explain/practice/assess/progress.
1. Start CLI.
2. `learn repo overview, dependency map`
3. `explain dependency graph`
4. `practice module boundaries`
5. `assess <exercise>|<response>`
6. `progress`

**Expected:** plan created, explanations returned, exercises generated, assessment produced, progress shown.

### 2) Coach/Student Role Routing (FileBus)
**Goal:** Verify role filtering + student_id + session scoping.
1. Terminal A: `role coach`, `student s-001`, `session onboarding-01`
2. Terminal B: `role student`, `student s-001`, `session onboarding-01`
3. Coach: `assign dependency graph|Map modules|npm test`
4. Student: `sync`, then `submit ex-1|Mapped modules`
5. Coach: `sync`, then `feedback pass|ok|next|0.1`
6. Student: `sync`, then `progress`

**Expected:** assignments arrive only to student; progress updates to coach; student progress updated.

### 3) Lifecycle + History
**Goal:** Verify lifecycle and history filtering.
1. `lifecycle init`, `lifecycle plan`, `lifecycle practice`, `lifecycle review`
2. `history` (shows current session only)
3. `history onboarding-01` (shows specific session)

**Expected:** lifecycle.jsonl updated, history filtered.

### 4) Evidence Verification
**Goal:** Verify evidence request/response.
1. Coach: `request-evidence src/main.ts|Check routing`
2. Student: `sync` (auto-snapshot)
3. Coach: `sync` (see evidence_snapshot with hash + snippet)

**Expected:** snapshot includes `hash` + `snippet`.

### 5) Coach Dashboard (Multi-Student)
**Goal:** Verify aggregation and summary.
1. Create two students (s-001, s-002) with progress updates.
2. Coach: `coach dashboard`

**Expected:** summary shows 2 students, avg confidence, blockers.

### 6) Kafka Mode (Optional)
**Goal:** Verify Kafka transport.
1. Run with `COLEARNER_BUS=kafka`.
2. Repeat tests #2–#5.

**Expected:** behavior matches FileBus.

### 7) Optional Automated Tests
- Run `npm test` to execute local sanity checks.
- Kafka test requires `COLEARNER_TEST_KAFKA=1`.
- LLM test requires `COLEARNER_TEST_LLM=1` and API keys.

## Pass/Fail
- Pass if all expected behaviors are observed.
- Fail if events are misrouted, progress not updated, or errors prevent flow.
