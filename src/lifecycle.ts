import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { dirname } from 'path';

export interface LifecycleEvent {
  ts: string;
  session_id: string;
  stage: 'init' | 'plan' | 'practice' | 'review' | 'done' | 'note' | 'insight';
  note?: string;
}

const DEFAULT_PATH = '.colearner/lifecycle.jsonl';

export function appendLifecycle(event: LifecycleEvent, path: string = DEFAULT_PATH): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const line = JSON.stringify(event);
  writeFileSync(path, line + '\n', { flag: 'a' });
}

export function readLifecycle(path: string = DEFAULT_PATH): LifecycleEvent[] {
  if (!existsSync(path)) {
    return [];
  }
  const data = readFileSync(path, 'utf-8');
  return data
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LifecycleEvent);
}
