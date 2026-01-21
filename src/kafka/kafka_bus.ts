import { Kafka, Partitioners } from 'kafkajs';
import type { Bus, TopicCursor } from './bus.js';
import type { EventEnvelope } from '../events.js';
import { loadKafkaConfig } from '../config.js';

export class KafkaBus implements Bus {
  private kafka: Kafka;
  private producerPromise?: Promise<ReturnType<Kafka['producer']>>;
  private consumers: Map<string, ReturnType<Kafka['consumer']>> = new Map();
  private buffers: Map<string, EventEnvelope[]> = new Map();
  private offsets: Map<string, number> = new Map();
  private groupIdSuffix: string = `${process.pid}-${Math.floor(Math.random() * 1e6)}`;

  constructor() {
    const cfg = loadKafkaConfig();
    this.kafka = new Kafka({ clientId: cfg.clientId, brokers: cfg.brokers });
  }

  async publish(topic: string, event: EventEnvelope): Promise<void> {
    if (!this.producerPromise) {
      const producer = this.kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
      this.producerPromise = producer.connect().then(() => producer);
    }
    const producer = await this.producerPromise;
    await producer.send({
      topic,
      acks: 1,
      messages: [{ value: JSON.stringify(event) }],
    });
  }

  async readNew(topic: string, cursor: TopicCursor): Promise<{ events: EventEnvelope[]; cursor: TopicCursor }> {
    await this.ensureConsumer(topic);
    const buffer = this.buffers.get(topic) ?? [];
    const start = Math.max(0, cursor.offset);
    const deadline = Date.now() + 1000;
    while (buffer.length <= start && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const events = buffer.slice(start);
    const nextOffset = buffer.length;
    return { events, cursor: { offset: nextOffset } };
  }

  private async ensureConsumer(topic: string): Promise<void> {
    if (this.consumers.has(topic)) {
      return;
    }
    const consumer = this.kafka.consumer({ groupId: `colearner-read-${topic}-${this.groupIdSuffix}` });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    this.buffers.set(topic, []);
    this.offsets.set(topic, 0);
    void consumer.run({
      eachMessage: async ({ message }) => {
        const value = message.value?.toString() ?? '';
        if (!value) {
          return;
        }
        const buffer = this.buffers.get(topic);
        if (!buffer) {
          return;
        }
        buffer.push(JSON.parse(value) as EventEnvelope);
        this.offsets.set(topic, buffer.length);
      },
    });
    this.consumers.set(topic, consumer);
  }
}
