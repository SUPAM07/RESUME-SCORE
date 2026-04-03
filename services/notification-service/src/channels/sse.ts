/**
 * @module notification-service/channels/sse
 *
 * Server-Sent Events channel manager.
 * Maintains a registry of active SSE connections keyed by userId.
 * Multiple browser tabs / connections per user are supported.
 */

import type { Response } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export interface SseConnection {
  userId: string;
  res: Response;
  heartbeatTimer: ReturnType<typeof setInterval>;
}

// userId → Set of active connections
const connections = new Map<string, Set<SseConnection>>();

/**
 * Register a new SSE connection for the given user.
 * Configures the response headers for SSE and starts a heartbeat.
 */
export function addConnection(userId: string, res: Response): SseConnection {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
  res.flushHeaders();

  // Send an initial comment to confirm the stream is open
  res.write(': connected\n\n');

  const heartbeatTimer = setInterval(() => {
    res.write(': ping\n\n');
  }, config.sseHeartbeatMs);

  const conn: SseConnection = { userId, res, heartbeatTimer };

  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  connections.get(userId)!.add(conn);

  logger.debug('SSE connection added', {
    userId,
    totalForUser: connections.get(userId)!.size,
  });

  return conn;
}

/**
 * Remove a connection (called when the client disconnects).
 */
export function removeConnection(conn: SseConnection): void {
  clearInterval(conn.heartbeatTimer);
  const set = connections.get(conn.userId);
  if (set) {
    set.delete(conn);
    if (set.size === 0) connections.delete(conn.userId);
  }
  logger.debug('SSE connection removed', { userId: conn.userId });
}

/**
 * Push a notification event to all active connections for the given user.
 */
export function pushToUser(userId: string, eventName: string, data: object): void {
  const set = connections.get(userId);
  if (!set || set.size === 0) return;

  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const conn of set) {
    try {
      conn.res.write(payload);
    } catch (err) {
      logger.warn('Failed to write SSE payload', {
        userId,
        error: (err as Error).message,
      });
      removeConnection(conn);
    }
  }
}

/** Return the total number of active SSE connections across all users. */
export function totalConnections(): number {
  let count = 0;
  for (const set of connections.values()) count += set.size;
  return count;
}
