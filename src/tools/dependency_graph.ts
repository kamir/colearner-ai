import { readFileSync } from 'fs';
import type { Tool } from '../agent/types.js';

const importRe = /\bimport\s+[^'"]*['"]([^'"]+)['"]/g;
const requireRe = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

export const dependencyGraph: Tool = {
  name: 'dependency_graph',
  description: 'Extract import/require dependencies from a file.',
  async run(args: Record<string, unknown>): Promise<unknown> {
    const path = typeof args.path === 'string' ? args.path : '';
    if (!path) {
      throw new Error('path is required');
    }
    const data = readFileSync(path, 'utf-8');
    const deps = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(data))) {
      deps.add(match[1]);
    }
    while ((match = requireRe.exec(data))) {
      deps.add(match[1]);
    }
    return { path, dependencies: Array.from(deps).sort() };
  },
};
