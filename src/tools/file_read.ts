import { readFileSync } from 'fs';
import type { Tool } from '../agent/types.js';
import { isPathAllowed, scopeRoot } from '../utils/scope.js';

export const fileRead: Tool = {
  name: 'file_read',
  description: 'Read a bounded slice of a file (path, start, end).',
  async run(args: Record<string, unknown>): Promise<unknown> {
    const path = typeof args.path === 'string' ? args.path : '';
    const start = typeof args.start === 'number' ? args.start : 0;
    const end = typeof args.end === 'number' ? args.end : 4000;
    if (!path) {
      throw new Error('path is required');
    }
    if (!isPathAllowed(path)) {
      throw new Error(`path outside scope root: ${scopeRoot()}`);
    }
    const data = readFileSync(path, 'utf-8');
    return {
      path,
      start,
      end,
      slice: data.slice(start, end),
      size: data.length,
    };
  },
};
