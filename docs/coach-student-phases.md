# Coach/Student Kafka Integration: Phase Designs

This document provides detailed design notes for each phase and tracks implementation progress.

## Phase 1: Event Protocol + MVP Integration

**Scope**
- Define event schemas and envelope.
- Add Kafka publish/subscribe in CLI.
- Persist coach feedback into `.colearner/learning.json`.

**Components**
- `colearner/events.ts`: envelope + schema validation.
- `colearner/kafka.ts`: producer/consumer wrapper.
- CLI flags: `--role coach|student`, `--session <id>`.

**Events**
- `learning_plan`
- `exercise_assigned`
- `assessment_feedback`
- `progress_update`

**Acceptance**
- Coach sends assignment → student receives.
- Student progress update → coach receives.

**Status**
- Design: Complete
- Implementation: Not started

---

## Phase 2: Coach/Student Roles

**Scope**
- Coach mode: assign + feedback.
- Student mode: receive + submit.

**Components**
- CLI commands:
  - Coach: `assign`, `feedback`
  - Student: `submit`, `ack`
- Local message queue for offline delivery.

**Acceptance**
- Coach can assign task and receive response.
- Student can submit response via Kafka.

**Status**
- Design: Complete
- Implementation: Not started

---

## Phase 3: Lifecycle + History (ALCM)

**Scope**
- Session lifecycle logging (init → done).
- Replayable history.

**Components**
- Lifecycle events appended to `lifecycle.jsonl`.
- `history` command for session replay.

**Acceptance**
- Session history reconstructable from events.

**Status**
- Design: Complete
- Implementation: Not started

---

## Phase 4: Evidence Verification

**Scope**
- Evidence snapshots for assignments.
- Coach requests additional evidence.

**Components**
- `evidence_snapshot` payload: file path + hash + snippet.
- `evidence_request` event.

**Acceptance**
- Coach can request evidence and receive a snapshot.

**Status**
- Design: Complete
- Implementation: Not started

---

## Phase 5: Multi‑Student Coaching

**Scope**
- Coach dashboard aggregations.
- Cohort metrics.

**Components**
- Aggregator: subscribe to progress events, produce summary.
- CLI view: `coach dashboard`.

**Acceptance**
- Coach can view multiple students and identify blockers.

**Status**
- Design: Complete
- Implementation: Not started

