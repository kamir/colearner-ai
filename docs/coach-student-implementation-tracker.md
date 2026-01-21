# Coach/Student Implementation Tracker

| Phase | Scope | Design | Implementation | Notes |
|---|---|---|---|---|
| Phase 1 | Event protocol + Kafka MVP | Complete | Partial | Priority: replace FileBus with KafkaBus |
| Phase 2 | Coach/Student roles | Complete | Complete | role filtering, student_id, session scope, acks |
| Phase 3 | Lifecycle + history | Complete | Complete | lifecycle events + session-filtered history |
| Phase 4 | Evidence verification | Complete | Complete | hash/snippet + auto-response |
| Phase 5 | Multi-student coaching | Complete | Complete | student_id aggregation + summary |

## Phase 1 Checklist (Priority)
- [x] KafkaBus using kafkajs + AAFW config
- [x] Config loader (agent.yaml or env)
- [x] Bus interface + swap FileBus
- [x] Event schema validation (local)
