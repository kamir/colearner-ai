export type EventType =
  | 'learning_plan'
  | 'exercise_assigned'
  | 'exercise_assigned_ack'
  | 'exercise_submission'
  | 'exercise_submission_ack'
  | 'assessment_feedback'
  | 'assessment_feedback_ack'
  | 'progress_update'
  | 'session_started'
  | 'session_closed'
  | 'session_history'
  | 'stuck_reported'
  | 'coach_hint'
  | 'hint_ack'
  | 'evidence_snapshot'
  | 'evidence_request'
  | 'scope_policy'
  | 'lifecycle';

export interface EventEnvelope {
  ts: string;
  actor: 'coach' | 'student';
  session_id: string;
  event_type: EventType;
  payload: Record<string, unknown>;
}

export function buildEvent(
  actor: 'coach' | 'student',
  sessionId: string,
  eventType: EventType,
  payload: Record<string, unknown>
): EventEnvelope {
  return {
    ts: new Date().toISOString(),
    actor,
    session_id: sessionId,
    event_type: eventType,
    payload,
  };
}

export function validateEvent(event: EventEnvelope): boolean {
  return Boolean(event.ts && event.actor && event.session_id && event.event_type);
}

export function validatePayload(event: EventEnvelope): boolean {
  const payload = event.payload || {};
  switch (event.event_type) {
    case 'learning_plan':
      return Array.isArray(payload.plan);
    case 'exercise_assigned':
      return typeof payload.topic === 'string' && typeof payload.exercise === 'string';
    case 'exercise_assigned_ack':
      return typeof payload.status === 'string';
    case 'exercise_submission':
      return typeof payload.exercise_id === 'string';
    case 'exercise_submission_ack':
      return typeof payload.status === 'string';
    case 'assessment_feedback':
      return typeof payload.grade === 'string';
    case 'assessment_feedback_ack':
      return typeof payload.status === 'string';
    case 'progress_update':
      return Array.isArray(payload.completed) || typeof payload.confidence === 'object';
    case 'session_started':
      return typeof payload.session_id === 'string' || typeof payload.student_id === 'string';
    case 'session_closed':
      return typeof payload.session_id === 'string' || typeof payload.summary === 'object';
    case 'session_history':
      return typeof payload.session_id === 'string' || Array.isArray(payload.events);
    case 'stuck_reported':
      return typeof payload.session_id === 'string' && typeof payload.summary === 'string';
    case 'coach_hint':
      return typeof payload.session_id === 'string' && typeof payload.hint === 'string';
    case 'hint_ack':
      return typeof payload.session_id === 'string' && typeof payload.note === 'string';
    case 'evidence_snapshot':
      return typeof payload.path === 'string';
    case 'evidence_request':
      return typeof payload.path === 'string';
    case 'scope_policy':
      return typeof payload.scope === 'string';
    case 'lifecycle':
      return typeof payload.stage === 'string';
    default:
      return true;
  }
}

export function validateEventFull(event: EventEnvelope): boolean {
  return validateEvent(event) && validatePayload(event);
}
