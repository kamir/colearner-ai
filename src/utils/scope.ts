import { resolve } from 'path';

export function scopeRoot(): string {
  const env = process.env.COLEARNER_SCOPE_ROOT;
  return resolve(env || process.cwd());
}

export function isPathAllowed(path: string, root: string = scopeRoot()): boolean {
  const absPath = resolve(path);
  const absRoot = resolve(root);
  return absPath === absRoot || absPath.startsWith(absRoot + '/');
}
