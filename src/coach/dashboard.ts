import { FileBus } from '../kafka/file_bus.js';
import type { EventEnvelope } from '../events.js';

export interface Dashboard {
  students: Record<string, {
    sessions: Set<string>;
    completed: string[];
    confidence: Record<string, number>;
    blockers: string[];
    lastEventTs?: string;
  }>;
  summary: {
    totalStudents: number;
    avgConfidence: number;
    totalBlockers: number;
  };
}

export async function buildDashboard(
  root: string = '.colearner/kafka'
): Promise<Dashboard> {
  const bus = new FileBus(root);
  const topics = ['colearner.progress.v1', 'colearner.feedback.v1', 'colearner.assignments.v1'];
  const allEvents: EventEnvelope[] = [];
  for (const topic of topics) {
    const res = await bus.readNew(topic, { offset: 0 });
    allEvents.push(...res.events);
  }

  const students: Dashboard['students'] = {};
  for (const event of allEvents) {
    const studentId =
      event.payload && typeof event.payload === 'object' && typeof event.payload.student_id === 'string'
        ? (event.payload.student_id as string)
        : `${event.actor}:${event.session_id}`;
    const key = studentId;
    if (!students[key]) {
      students[key] = { sessions: new Set([event.session_id]), completed: [], confidence: {}, blockers: [] };
    }
    const entry = students[key];
    entry.sessions.add(event.session_id);
    entry.lastEventTs = event.ts;
    if (event.event_type === 'progress_update') {
      const completed = Array.isArray(event.payload.completed) ? (event.payload.completed as string[]) : [];
      entry.completed = Array.from(new Set([...entry.completed, ...completed]));
      const confidence =
        event.payload.confidence && typeof event.payload.confidence === 'object'
          ? (event.payload.confidence as Record<string, number>)
          : {};
      entry.confidence = { ...entry.confidence, ...confidence };
    }
    if (event.event_type === 'assessment_feedback') {
      const mistakes = Array.isArray(event.payload.mistakes) ? (event.payload.mistakes as string[]) : [];
      entry.blockers = Array.from(new Set([...entry.blockers, ...mistakes.filter(Boolean)]));
    }
  }

  const confidenceValues = Object.values(students).flatMap((s) => Object.values(s.confidence));
  const avgConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
      : 0;
  const totalBlockers = Object.values(students).reduce((sum, s) => sum + s.blockers.length, 0);
  return {
    students,
    summary: {
      totalStudents: Object.keys(students).length,
      avgConfidence: Number(avgConfidence.toFixed(2)),
      totalBlockers,
    },
  };
}

export function formatDashboard(dashboard: Dashboard): string {
  const lines: string[] = [];
  lines.push(`summary: students=${dashboard.summary.totalStudents} avg_confidence=${dashboard.summary.avgConfidence} blockers=${dashboard.summary.totalBlockers}`);
  for (const [student, data] of Object.entries(dashboard.students)) {
    lines.push(`student: ${student}`);
    lines.push(`  sessions: ${Array.from(data.sessions).join(', ')}`);
    lines.push(`  completed: ${data.completed.join(', ') || 'none'}`);
    lines.push(`  confidence: ${Object.keys(data.confidence).length > 0 ? JSON.stringify(data.confidence) : '{}'}`);
    lines.push(`  blockers: ${data.blockers.join(', ') || 'none'}`);
    lines.push(`  last: ${data.lastEventTs ?? 'unknown'}`);
  }
  if (lines.length === 0) {
    return 'No student data found.';
  }
  return lines.join('\n');
}
