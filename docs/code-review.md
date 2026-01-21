# Code Review (Production Readiness)

This document records the latest code-level review and findings.

## Scope Reviewed
- `src/cli.ts`
- `src/kafka/kafka_bus.ts`
- `src/events.ts`
- `src/tools/file_read.ts`
- `src/coach/dashboard.ts`

## Findings

**High**
- Kafka read loop is still best‑effort; `readNew` uses a short timed run to collect messages and does not use committed offsets. This can lead to duplicate reads and missed ordering guarantees under load. (`src/kafka/kafka_bus.ts`)
- No transport security configuration (TLS/SASL) is exposed for Kafka. This is required for production. (`src/config.ts`, `src/kafka/kafka_bus.ts`)

**Medium**
- Evidence auto‑response is gated by scope, but scope defaults to `process.cwd()`; if the CLI is started outside the repo, scope may be too broad. (`src/utils/scope.ts`, `src/cli.ts`)
- Ack events are now separate types, but downstream consumers do not filter them explicitly. This can clutter dashboards unless filtered. (`src/coach/dashboard.ts`)

**Low**
- File-based bus still exists for local testing and may be mistaken for production use. Consider gating it behind an explicit dev flag. (`src/kafka/file_bus.ts`)

## Fixes Implemented During Review
- Local event payload validation added for each `event_type`.
- Async bus integration fixed in CLI.
- Ack events now use dedicated `event_type` values.
- Scope enforcement added for evidence and `file_read`.

## Remaining Work Before Release
- Add TLS/SASL config to KafkaBus.
- Implement durable consumer offsets or a polling strategy that avoids duplicate reads.
- Add explicit dev/prod switch for FileBus.
