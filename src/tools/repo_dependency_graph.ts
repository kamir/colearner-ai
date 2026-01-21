import { readdirSync, readFileSync, statSync, type Dirent } from 'fs';
import { join } from 'path';
import type { Tool } from '../agent/types.js';

const importRe = /\bimport\s+[^'"]*['"]([^'"]+)['"]/g;
const requireRe = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
const pyImportRe = /^\s*(from\s+([A-Za-z0-9_\.]+)\s+import|import\s+([A-Za-z0-9_\.]+))/gm;
const goImportRe = /^\s*import\s+(?:(?:\w+)\s+)?"([^"]+)"/gm;

function listFiles(root: string, exts: Set<string>, maxFiles: number): string[] {
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
      } else {
        const ext = entry.name.includes('.') ? entry.name.slice(entry.name.lastIndexOf('.')) : '';
        if (exts.has(ext)) {
          out.push(full);
          if (out.length >= maxFiles) break;
        }
      }
    }
  }
  return out;
}

function extractDeps(path: string): string[] {
  let data: string;
  try {
    data = readFileSync(path, 'utf-8');
  } catch {
    return [];
  }
  const deps = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(data))) deps.add(match[1]);
  while ((match = requireRe.exec(data))) deps.add(match[1]);
  while ((match = pyImportRe.exec(data))) deps.add(match[2] || match[3]);
  while ((match = goImportRe.exec(data))) deps.add(match[1]);
  return Array.from(deps).filter(Boolean);
}

export const repoDependencyGraph: Tool = {
  name: 'repo_dependency_graph',
  description: 'Scan repo files and return a best-effort dependency graph.',
  async run(args: Record<string, unknown>): Promise<unknown> {
    const root = typeof args.root === 'string' ? args.root : process.cwd();
    const maxFiles = typeof args.maxFiles === 'number' ? args.maxFiles : 200;
    const extensions = Array.isArray(args.extensions)
      ? new Set(args.extensions.map(String))
      : new Set(['.ts', '.tsx', '.js', '.jsx', '.go', '.py']);
    const files = listFiles(root, extensions, maxFiles);
    const edges: Array<{ from: string; to: string }> = [];
    for (const file of files) {
      const deps = extractDeps(file);
      for (const dep of deps) {
        edges.push({ from: file, to: dep });
      }
    }
    return {
      root,
      filesScanned: files.length,
      edges,
    };
  },
};
