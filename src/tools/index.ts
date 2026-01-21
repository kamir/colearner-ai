import type { Tool } from '../agent/types.js';
import { repoScan } from './repo_scan.js';
import { fileRead } from './file_read.js';
import { symbolIndex } from './symbol_index.js';
import { dependencyGraph } from './dependency_graph.js';
import { callGraph } from './call_graph.js';
import { testMap } from './test_map.js';
import { repoDependencyGraph } from './repo_dependency_graph.js';
import { repoTestMap } from './repo_test_map.js';
import { docSummary } from './doc_summary.js';
import { diffSuggest } from './diff_suggest.js';

export const tools: Tool[] = [
  repoScan,
  fileRead,
  symbolIndex,
  dependencyGraph,
  callGraph,
  testMap,
  repoDependencyGraph,
  repoTestMap,
  docSummary,
  diffSuggest,
];

export const toolDescriptions = tools.map((tool) => ({
  name: tool.name,
  description: tool.description,
}));

export function toolByName(name: string): Tool | undefined {
  return tools.find((tool) => tool.name === name);
}
