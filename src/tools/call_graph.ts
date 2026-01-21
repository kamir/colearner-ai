import { readFileSync } from 'fs';
import type { Tool } from '../agent/types.js';

const callRe = /\b([A-Za-z0-9_]+)\s*\(/g;

export const callGraph: Tool = {
  name: 'call_graph',
  description: 'Best-effort function call extraction from a file.',
  async run(args: Record<string, unknown>): Promise<unknown> {
    const path = typeof args.path === 'string' ? args.path : '';
    if (!path) {
      throw new Error('path is required');
    }
    const data = readFileSync(path, 'utf-8');
    const calls = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = callRe.exec(data))) {
      calls.add(match[1]);
    }
    return { path, calls: Array.from(calls).sort() };
  },
};
