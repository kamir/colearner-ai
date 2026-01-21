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

async function runOnce(args: string[]): Promise<void> {
  const query = args.join(' ').trim();
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

    const lines = await handleCommand(ctx, query, agent);
    for (const line of lines) {
      console.log(line);
    }
    rl.prompt();
  }

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
