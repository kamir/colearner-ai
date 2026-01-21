import type { EventEnvelope } from '../events.js';

export interface TopicCursor {
  offset: number;
}

export interface Bus {
  publish(topic: string, event: EventEnvelope): Promise<void>;
  readNew(topic: string, cursor: TopicCursor): Promise<{ events: EventEnvelope[]; cursor: TopicCursor }>;
}
