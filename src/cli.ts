#!/usr/bin/env node
import { Agent } from './agent/agent.js';
import { FileBus } from './kafka/file_bus.js';
import { KafkaBus } from './kafka/kafka_bus.js';
import type { TopicCursor, Bus } from './kafka/bus.js';
import { createContext, handleCommand } from './cli_core.js';

const agent = new Agent();
const statePath = '.colearner/learning.json';
const bus: Bus = process.env.COLEARNER_BUS === 'kafka' ? new KafkaBus() : new FileBus();
const ctx = createContext(bus, statePath);

const VERSION = '0.2.1';
const BANNER = `
═══════════════════════════════════════════════
║         Welcome to CoLearner AI             ║
═══════════════════════════════════════════════

 ██████╗  ██████╗ ██╗     ███████╗ █████╗ ██████╗ ███╗   ██╗███████╗██████╗
██╔════╝ ██╔═══██╗██║     ██╔════╝██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔══██╗
██║  ███╗██║   ██║██║     █████╗  ███████║██████╔╝██╔██╗ ██║█████╗  ██████╔╝
██║   ██║██║   ██║██║     ██╔══╝  ██╔══██║██╔══██╗██║╚██╗██║██╔══╝  ██╔══██╗
╚██████╔╝╚██████╔╝███████╗███████╗██║  ██║██║  ██║██║ ╚████║███████╗██║  ██║
 ╚═════╝  ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝
Version: ${VERSION}
`;

async function runOnce(args: string[]): Promise<void> {
  const query = args.join(' ').trim();
  if (query === 'help' || query === '--help' || query === '-h') {
    console.log(BANNER);
  }
  const menuEnabled = args.includes('--menu') || process.env.COLEARNER_MENU === '1';
  if (query.startsWith('next') && menuEnabled) {
    await runNextMenu();
    return;
  }
  const lines = await handleCommand(ctx, query, agent);
  for (const line of lines) {
    console.log(line);
  }
}

async function runRepl(): Promise<void> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'co-learner> ',
  });

  async function handleLine(line: string) {
    const query = line.trim();
    if (!query) {
      rl.prompt();
      return;
    }
    if (query === 'exit' || query === 'quit') {
      rl.close();
      return;
    }
    if (query.startsWith('next --menu') || query === 'next --menu') {
      await runNextMenu(rl);
      rl.prompt();
      return;
    }

    const lines = await handleCommand(ctx, query, agent);
    for (const line of lines) {
      console.log(line);
    }
    rl.prompt();
  }

  console.log(BANNER);
  rl.prompt();
  rl.on('line', (line) => {
    void handleLine(line);
  });
}

const args = process.argv.slice(2);
if (args.length > 0) {
  void runOnce(args);
} else {
  void runRepl();
}

async function runNextMenu(rl?: import('readline').Interface): Promise<void> {
  const lines = await handleCommand(ctx, 'next', agent);
  const options: string[] = [];
  for (const line of lines) {
    if (line.startsWith('try:')) {
      const cmd = line.replace(/^try:\s*/, '').trim();
      options.push(cmd);
    } else {
      console.log(line);
    }
  }
  if (options.length === 0) {
    return;
  }
  console.log('Choose an action:');
  options.forEach((cmd, idx) => {
    console.log(`${idx + 1}) ${cmd}`);
  });
  console.log('0) none');
  const prompt = 'Select 0-' + options.length + ': ';
  const answer = rl
    ? await new Promise<string>((resolve) => rl.question(prompt, resolve))
    : await askOnce(prompt);
  const choice = Number(answer.trim());
  if (!Number.isFinite(choice) || choice < 0 || choice > options.length) {
    console.log('Invalid selection.');
    return;
  }
  if (choice === 0) {
    console.log('Canceled.');
    return;
  }
  const selected = options[choice - 1];
  const query = selected.replace(/^colearner-ai\s+/, '');
  const followUp = await withSpinner(() => handleCommand(ctx, query, agent), 'Working');
  for (const line of followUp) {
    console.log(line);
  }
}

async function askOnce(prompt: string): Promise<string> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise<string>((resolve) => rl.question(prompt, resolve));
  rl.close();
  return answer;
}

async function withSpinner<T>(fn: () => Promise<T>, label: string): Promise<T> {
  if (!process.stdout.isTTY) {
    return fn();
  }
  const frames = ['|', '/', '-', '\\'];
  let idx = 0;
  const interval = setInterval(() => {
    const frame = frames[idx % frames.length];
    idx += 1;
    process.stdout.write(`\r${frame} ${label}...`);
  }, 120);
  try {
    const result = await fn();
    return result;
  } finally {
    clearInterval(interval);
    process.stdout.write('\r');
  }
}
