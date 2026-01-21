import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { EventEnvelope } from '../events.js';
import type { Bus, TopicCursor } from './bus.js';

export class FileBus implements Bus {
  private readonly root: string;

  constructor(root: string = '.colearner/kafka') {
    this.root = root;
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }
  }

  async publish(topic: string, event: EventEnvelope): Promise<void> {
    const path = join(this.root, `${topic}.jsonl`);
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const line = JSON.stringify(event);
    writeFileSync(path, line + '\n', { flag: 'a' });
  }

  async readNew(topic: string, cursor: TopicCursor): Promise<{ events: EventEnvelope[]; cursor: TopicCursor }> {
    const path = join(this.root, `${topic}.jsonl`);
    if (!existsSync(path)) {
      return { events: [], cursor };
    }
    const data = readFileSync(path, 'utf-8');
    const lines = data.split('\n').filter(Boolean);
    const start = Math.max(0, cursor.offset);
    const slice = lines.slice(start);
    const events = slice.map((line) => JSON.parse(line) as EventEnvelope);
    return { events, cursor: { offset: lines.length } };
  }
}
