/**
 * @module notification-service/consumers/eventConsumer
 *
 * Redis Streams consumer that reacts to domain events and dispatches
 * in-app notifications via SSE to connected users.
 *
 * Supported events and their notification payloads:
 *   ai.task.queued     → "Processing…"  spinner
 *   ai.task.completed  → "Done!" toast
 *   ai.task.failed     → "Failed" error toast
 *   resume.created     → info toast
 *   job.created        → info toast
 *   billing.*          → billing updates
 */

import { createClient } from 'redis';
import { pushToUser } from '../channels/sse.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

const STREAM_KEY = config.redis.streamKey;
const GROUP_NAME = config.redis.groupName;
const CONSUMER_NAME = `notification-service-${process.pid}`;
const BATCH_SIZE = 20;
const BLOCK_MS = 5_000;

interface DomainEventData {
  type: string;
  data: Record<string, unknown>;
}

function buildNotification(event: DomainEventData): {
  title: string;
  body: string;
  level: 'info' | 'success' | 'error' | 'warning';
} | null {
  switch (event.type) {
    case 'ai.task.queued':
      return { title: 'AI Processing', body: 'Your request is being processed…', level: 'info' };

    case 'ai.task.completed':
      return { title: 'Done!', body: 'Your AI task completed successfully.', level: 'success' };

    case 'ai.task.failed':
      return {
        title: 'AI Task Failed',
        body: (event.data['error'] as string) ?? 'Something went wrong.',
        level: 'error',
      };

    case 'resume.created':
      return { title: 'Resume Created', body: 'Your new resume is ready.', level: 'success' };

    case 'job.created':
      return { title: 'Job Added', body: 'A new job has been saved.', level: 'info' };

    case 'billing.subscription.created':
      return { title: 'Subscription Active', body: 'Welcome to Pro!', level: 'success' };

    case 'billing.subscription.cancelled':
      return {
        title: 'Subscription Cancelled',
        body: 'Your subscription has been cancelled.',
        level: 'warning',
      };

    case 'billing.payment.failed':
      return {
        title: 'Payment Failed',
        body: 'We could not process your payment.',
        level: 'error',
      };

    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any = null;
let running = false;

export async function startEventConsumer(): Promise<void> {
  const redisUrl = config.redis.url;
  if (!redisUrl) {
    logger.warn('REDIS_URL not set – event consumer disabled');
    return;
  }

  redisClient = createClient({ url: redisUrl });
  redisClient.on('error', (err: Error) => {
    logger.error('Redis consumer error', { error: err.message });
  });
  await redisClient.connect();

  // Create consumer group if needed
  try {
    await redisClient.xGroupCreate(STREAM_KEY, GROUP_NAME, '$', { MKSTREAM: true });
  } catch (err: unknown) {
    if (!(err as Error).message?.includes('BUSYGROUP')) throw err;
  }

  running = true;
  logger.info('Notification event consumer started', {
    stream: STREAM_KEY,
    group: GROUP_NAME,
    consumer: CONSUMER_NAME,
  });

  while (running) {
    try {
      const messages = await redisClient.xReadGroup(
        GROUP_NAME,
        CONSUMER_NAME,
        [{ key: STREAM_KEY, id: '>' }],
        { COUNT: BATCH_SIZE, BLOCK: BLOCK_MS },
      );

      if (!messages) continue;

      for (const stream of messages) {
        for (const { id: msgId, message } of stream.messages) {
          try {
            const event = JSON.parse(message['payload'] ?? '{}') as DomainEventData & {
              data: Record<string, unknown>;
            };

            const userId = (event.data['userId'] as string | undefined);
            if (userId) {
              const notification = buildNotification(event);
              if (notification) {
                pushToUser(userId, 'notification', {
                  ...notification,
                  eventType: event.type,
                  timestamp: new Date().toISOString(),
                });
              }
            }

            await redisClient.xAck(STREAM_KEY, GROUP_NAME, msgId);
          } catch (err) {
            logger.error('Failed to process notification event', {
              msgId,
              error: (err as Error).message,
            });
          }
        }
      }
    } catch (err: unknown) {
      const msg = (err as Error).message ?? '';
      if (!running || msg.includes('Connection is closed')) break;
      logger.error('Event consumer poll error', { error: msg });
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
}

export async function stopEventConsumer(): Promise<void> {
  running = false;
  await redisClient?.quit();
}
