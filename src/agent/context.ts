import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ToolContext, ToolSummary } from './types.js';

export class ContextManager {
  private readonly contextDir: string;

  constructor(contextDir: string = '.colearner/context') {
    this.contextDir = contextDir;
    if (!existsSync(this.contextDir)) {
      mkdirSync(this.contextDir, { recursive: true });
    }
  }

  private filenameFor(toolName: string, args: Record<string, unknown>): string {
    const argsStr = JSON.stringify(args, Object.keys(args).sort());
    const hash = createHash('md5').update(argsStr).digest('hex').slice(0, 8);
    return `${toolName}_${hash}.json`;
  }

  saveAndSummarize(toolName: string, args: Record<string, unknown>, result: string): ToolSummary {
    const filename = this.filenameFor(toolName, args);
    const filepath = join(this.contextDir, filename);
    const payload: ToolContext = {
      toolName,
      args,
      result,
      timestamp: new Date().toISOString(),
    };
    writeFileSync(filepath, JSON.stringify(payload, null, 2));
    return {
      id: filepath,
      toolName,
      args,
      summary: `${toolName}(${Object.keys(args).join(', ') || 'no-args'})`,
    };
  }

  loadContexts(ids: string[]): ToolContext[] {
    const contexts: ToolContext[] = [];
    for (const id of ids) {
      if (!existsSync(id)) {
        continue;
      }
      try {
        const data = readFileSync(id, 'utf-8');
        contexts.push(JSON.parse(data) as ToolContext);
      } catch {
        continue;
      }
    }
    return contexts;
  }
}
