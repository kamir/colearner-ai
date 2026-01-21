import { readdirSync, readFileSync, type Dirent } from 'fs';
import { join } from 'path';
import type { Tool } from '../agent/types.js';

const jsTestRe = /\b(describe|it|test)\s*\(/g;
const goTestRe = /^\s*func\s+Test[A-Za-z0-9_]+\s*\(/gm;
const pyTestRe = /^\s*def\s+test_[A-Za-z0-9_]+\s*\(/gm;

function listFiles(root: string, maxFiles: number): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0 && out.length < maxFiles) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name.includes('test') || entry.name.includes('spec')) {
        out.push(full);
        if (out.length >= maxFiles) break;
      }
    }
  }
  return out;
}

function countMatches(re: RegExp, data: string): number {
  let count = 0;
  while (re.exec(data)) count++;
  return count;
}

export const repoTestMap: Tool = {
  name: 'repo_test_map',
  description: 'Scan for test files and estimate test blocks per file.',
  async run(args: Record<string, unknown>): Promise<unknown> {
    const root = typeof args.root === 'string' ? args.root : process.cwd();
    const maxFiles = typeof args.maxFiles === 'number' ? args.maxFiles : 200;
    const files = listFiles(root, maxFiles);
    const results = files.map((file) => {
      let data = '';
      try {
        data = readFileSync(file, 'utf-8');
      } catch {
        return { file, blocks: 0 };
      }
      const blocks =
        countMatches(jsTestRe, data) +
        countMatches(goTestRe, data) +
        countMatches(pyTestRe, data);
      return { file, blocks };
    });
    return { root, filesScanned: files.length, results };
  },
};
