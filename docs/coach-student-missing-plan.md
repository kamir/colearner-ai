# Coach/Student Missing Work Plan

This plan captures remaining work by phase and will be used to track completion.

## Phase 1: Event Protocol + Kafka MVP (Priority)
**Missing**
- Replace FileBus with Kafka transport (AAFW config).
- Schema validation beyond envelope.
- Error handling + retries.

**Tasks**
1) Add Kafka client wrapper (`kafka_bus.ts`) using franz-go and AAFW config.
2) Add config loader (agent.yaml or env).
3) Swap FileBus behind a `Bus` interface.
4) Add schema validation for event payloads.

## Phase 2: Coach/Student Roles
**Missing**
- Role-specific filtering and defaults.
- Ack events + retry.
- Session scoping for sync.

**Tasks**
1) Add `student_id` to all events.
2) Filter `sync` by `session_id` and role.
3) Add `ack` events.

## Phase 3: Lifecycle + History
**Missing**
- ALCM stream integration.
- Session history filtering + summary.

**Tasks**
1) Emit lifecycle to Kafka.
2) `history <session>` filter.

## Phase 4: Evidence Verification
**Missing**
- Evidence hash + snippet capture.
- Auto-respond to evidence requests.

**Tasks**
1) Add file hash + snippet in evidence snapshots.
2) Add auto-response handler for `evidence_request`.

## Phase 5: Multi-Student Coaching
**Missing**
- Aggregate by `student_id`.
- Cohort metrics + blockers.

**Tasks**
1) Extend dashboard aggregation.
2) Add summary output.
