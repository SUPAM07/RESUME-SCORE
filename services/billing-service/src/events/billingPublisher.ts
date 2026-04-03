/**
 * @module billing-service/events/billingPublisher
 *
 * Writes billing domain events to the outbox table.
 */

import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';

async function writeToOutbox(eventType: string, data: object): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('outbox')
    .insert({
      id: randomUUID(),
      event_type: eventType,
      source: 'billing-service',
      payload: {
        id: randomUUID(),
        type: eventType,
        source: 'billing-service',
        version: '1.0',
        timestamp: new Date().toISOString(),
        data,
      },
    });

  if (error) {
    logger.error('Failed to write billing event to outbox', { eventType, error: error.message });
  }
}

export async function publishSubscriptionCreated(
  userId: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  periodEnd: string,
): Promise<void> {
  await writeToOutbox('billing.subscription.created', {
    userId, stripeCustomerId, stripeSubscriptionId, plan: 'pro', periodEnd,
  });
}

export async function publishSubscriptionCancelled(
  userId: string,
  stripeSubscriptionId: string,
  cancelledAt: string,
): Promise<void> {
  await writeToOutbox('billing.subscription.cancelled', {
    userId, stripeSubscriptionId, cancelledAt,
  });
}

export async function publishPaymentSucceeded(
  userId: string,
  stripeInvoiceId: string,
  amountCents: number,
  currency: string,
): Promise<void> {
  await writeToOutbox('billing.payment.succeeded', {
    userId, stripeInvoiceId, amountCents, currency,
  });
}

export async function publishPaymentFailed(
  userId: string,
  stripeInvoiceId: string,
  error: string,
): Promise<void> {
  await writeToOutbox('billing.payment.failed', { userId, stripeInvoiceId, error });
}
