import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { Tool } from '../agent/types.js';

function scanDir(root: string, depth: number): Record<string, unknown> {
  const result: Record<string, unknown> = {
    root,
    entries: [],
  };
  if (depth <= 0) {
    return result;
  }
  const entries = readdirSync(root, { withFileTypes: true });
  const summary = entries.map((entry) => {
    const full = join(root, entry.name);
    const isDir = entry.isDirectory();
    return {
      name: entry.name,
      type: isDir ? 'dir' : 'file',
      size: isDir ? undefined : statSync(full).size,
    };
  });
  result.entries = summary;
  return result;
}

export const repoScan: Tool = {
  name: 'repo_scan',
  description: 'Scan a repo and return a shallow directory map.',
  async run(args: Record<string, unknown>): Promise<unknown> {
    const root = typeof args.root === 'string' ? args.root : process.cwd();
    const depth = typeof args.depth === 'number' ? args.depth : 1;
    return scanDir(root, depth);
  },
};
