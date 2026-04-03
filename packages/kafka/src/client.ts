import { Kafka, Producer, Consumer, KafkaConfig, ProducerConfig, ConsumerConfig, EachMessagePayload } from 'kafkajs';
import { EventEnvelope } from './types.js';

export class KafkaProducer {
  private producer: Producer;
  private connected = false;

  constructor(kafka: Kafka, config?: ProducerConfig) {
    this.producer = kafka.producer({
      allowAutoTopicCreation: false,
      ...config,
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
  }

  async publish<T>(topic: string, event: EventEnvelope<T>): Promise<void> {
    await this.connect();
    await this.producer.send({
      topic,
      messages: [
        {
          key: event.aggregateId,
          value: JSON.stringify(event),
          headers: {
            eventType: event.eventType,
            version: String(event.version),
            correlationId: event.correlationId ?? '',
            traceId: event.traceId ?? '',
          },
        },
      ],
    });
  }

  async publishBatch<T>(topic: string, events: EventEnvelope<T>[]): Promise<void> {
    await this.connect();
    await this.producer.send({
      topic,
      messages: events.map((event) => ({
        key: event.aggregateId,
        value: JSON.stringify(event),
        headers: {
          eventType: event.eventType,
          version: String(event.version),
          correlationId: event.correlationId ?? '',
        },
      })),
    });
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }
}

export class KafkaConsumer {
  private consumer: Consumer;
  private connected = false;

  constructor(kafka: Kafka, groupId: string, config?: Omit<ConsumerConfig, 'groupId'>) {
    this.consumer = kafka.consumer({ groupId, ...config });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.consumer.connect();
      this.connected = true;
    }
  }

  async subscribe(topics: string[]): Promise<void> {
    await this.connect();
    await this.consumer.subscribe({ topics, fromBeginning: false });
  }

  async run<T>(
    handler: (event: EventEnvelope<T>, payload: EachMessagePayload) => Promise<void>,
  ): Promise<void> {
    await this.consumer.run({
      eachMessage: async (payload) => {
        const { message } = payload;
        if (!message.value) return;
        const event = JSON.parse(message.value.toString()) as EventEnvelope<T>;
        await handler(event, payload);
      },
    });
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.consumer.disconnect();
      this.connected = false;
    }
  }
}

export function createKafkaClient(config: KafkaConfig): Kafka {
  return new Kafka({
    ...config,
    retry: {
      initialRetryTime: 100,
      retries: 8,
    },
  });
}

export { EventEnvelope } from './types.js';
export * from './topics.js';
