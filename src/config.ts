import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
}

export function loadKafkaConfig(): KafkaConfig {
  const brokersEnv = process.env.COLEARNER_BROKERS;
  if (brokersEnv) {
    return { brokers: brokersEnv.split(',').map((b) => b.trim()), clientId: 'colearner' };
  }

  const home = process.env.AAFW_HOME || join(process.cwd(), '..', 'aafw-home');
  const cfgPath = join(home, 'CFG', 'agent.yaml');
  if (existsSync(cfgPath)) {
    try {
      const data = readFileSync(cfgPath, 'utf-8');
      const cfg = yaml.load(data) as { kafka?: { brokers?: string[] } };
      const brokers = cfg.kafka?.brokers ?? [];
      if (brokers.length > 0) {
        return { brokers, clientId: 'colearner' };
      }
    } catch {
      // fallthrough
    }
  }

  return { brokers: ['127.0.0.1:39092'], clientId: 'colearner' };
}
