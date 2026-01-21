import { readFileSync } from 'fs';
import type { Tool } from '../agent/types.js';

const functionRe = /\bfunction\s+([A-Za-z0-9_]+)\s*\(/g;
const classRe = /\bclass\s+([A-Za-z0-9_]+)\b/g;
const exportRe = /\bexport\s+(?:default\s+)?(class|function|const|let|var)\s+([A-Za-z0-9_]+)/g;

export const symbolIndex: Tool = {
  name: 'symbol_index',
  description: 'Extract basic symbols from a file (functions, classes, exports).',
  async run(args: Record<string, unknown>): Promise<unknown> {
    const path = typeof args.path === 'string' ? args.path : '';
    if (!path) {
      throw new Error('path is required');
    }
    const data = readFileSync(path, 'utf-8');
    const symbols = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = functionRe.exec(data))) {
      symbols.add(`function:${match[1]}`);
    }
    while ((match = classRe.exec(data))) {
      symbols.add(`class:${match[1]}`);
    }
    while ((match = exportRe.exec(data))) {
      symbols.add(`export:${match[2]}`);
    }
    return {
      path,
      symbols: Array.from(symbols).sort(),
    };
  },
};
