import { basename, extname } from 'path';

const DEFAULT_MAX_ITERATIONS = 12;
const DEFAULT_MAX_FILE_BYTES = 256 * 1024;
const DEFAULT_MAX_RUN_BYTES = 1024 * 1024;
const DEFAULT_ALLOWED_EXTENSIONS = [
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.go',
  '.py',
  '.java',
  '.rs',
  '.sql',
  '.proto',
  '.graphql',
  '.css',
  '.scss',
  '.html',
  '.xml',
  '.sh',
  '.bash',
  '.zsh',
];
const DEFAULT_ALLOWED_BASENAMES = new Set([
  'Makefile',
  'Dockerfile',
  'LICENSE',
  'README',
  'README.md',
  'README.txt',
]);

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getMaxIterations(): number {
  return parseNumberEnv(process.env.COLEARNER_MAX_ITERATIONS, DEFAULT_MAX_ITERATIONS);
}

export function getMaxFileBytes(): number {
  return parseNumberEnv(process.env.COLEARNER_MAX_FILE_BYTES, DEFAULT_MAX_FILE_BYTES);
}

export function getMaxRunBytes(): number {
  return parseNumberEnv(process.env.COLEARNER_MAX_RUN_BYTES, DEFAULT_MAX_RUN_BYTES);
}

export function getAllowedExtensions(): string[] {
  const raw = process.env.COLEARNER_ALLOWED_EXTENSIONS;
  if (!raw) return DEFAULT_ALLOWED_EXTENSIONS;
  const list = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ALLOWED_EXTENSIONS;
}

export function isPathExtensionAllowed(path: string): boolean {
  const allowed = getAllowedExtensions();
  if (allowed.includes('*')) {
    return true;
  }
  const ext = extname(path).toLowerCase();
  if (!ext) {
    return DEFAULT_ALLOWED_BASENAMES.has(basename(path));
  }
  return allowed.includes(ext);
}
