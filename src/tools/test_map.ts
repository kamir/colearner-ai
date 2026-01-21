import { readFileSync } from 'fs';
import type { Tool } from '../agent/types.js';

const testRe = /\b(describe|it|test)\s*\(/g;

export const testMap: Tool = {
  name: 'test_map',
  description: 'Detect basic test blocks in a file (Jest/Mocha style).',
  async run(args: Record<string, unknown>): Promise<unknown> {
    const path = typeof args.path === 'string' ? args.path : '';
    if (!path) {
      throw new Error('path is required');
    }
    const data = readFileSync(path, 'utf-8');
    let count = 0;
    while (testRe.exec(data)) {
      count++;
    }
    return { path, testBlocks: count };
  },
};
