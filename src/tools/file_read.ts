import { readFileSync, statSync } from 'fs';
import type { Tool } from '../agent/types.js';
import { isPathAllowed, scopeRoot } from '../utils/scope.js';
import { getMaxFileBytes, getMaxRunBytes, isPathExtensionAllowed } from '../utils/safety.js';

let runBytes = 0;

export function resetReadBudget(): void {
  runBytes = 0;
}

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
    if (!isPathExtensionAllowed(path)) {
      throw new Error('path extension not allowed');
    }
    const maxFileBytes = getMaxFileBytes();
    const maxRunBytes = getMaxRunBytes();
    const size = statSync(path).size;
    if (size > maxFileBytes) {
      throw new Error(`file too large (${size} bytes > ${maxFileBytes} bytes)`);
    }
    if (runBytes + size > maxRunBytes) {
      throw new Error(`run read budget exceeded (${runBytes + size} bytes > ${maxRunBytes} bytes)`);
    }
    const data = readFileSync(path, 'utf-8');
    runBytes += size;
    return {
      path,
      start,
      end,
      slice: data.slice(start, end),
      size: data.length,
    };
  },
};
