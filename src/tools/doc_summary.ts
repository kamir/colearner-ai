import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Tool } from '../agent/types.js';

function listDocs(root: string, maxFiles: number): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0 && out.length < maxFiles) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (/\.(md|txt|rst)$/i.test(entry.name)) {
        out.push(full);
        if (out.length >= maxFiles) break;
      }
    }
  }
  return out;
}

export const docSummary: Tool = {
  name: 'doc_summary',
  description: 'Summarize documentation files by headings and lead text.',
  async run(args: Record<string, unknown>): Promise<unknown> {
    const root = typeof args.root === 'string' ? args.root : process.cwd();
    const maxFiles = typeof args.maxFiles === 'number' ? args.maxFiles : 50;
    const files = listDocs(root, maxFiles);
    const summaries = files.map((file) => {
      let data = '';
      try {
        data = readFileSync(file, 'utf-8');
      } catch {
        return { file, headings: [], lead: '' };
      }
      const headings = data
        .split('\n')
        .filter((line) => line.startsWith('#'))
        .slice(0, 10);
      const lead = data.split('\n').slice(0, 5).join('\n');
      return { file, headings, lead };
    });
    return { root, filesScanned: files.length, summaries };
  },
};
