/**
 * @module billing-service/services/stripeService
 *
 * Core Stripe webhook handling logic – extracted from the monolith's
 * src/app/api/webhooks/stripe/route.ts.
 */

import Stripe from 'stripe';
import { config } from '../config/index.js';
import { getSupabaseClient } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';
import {
  publishSubscriptionCreated,
  publishSubscriptionCancelled,
  publishPaymentSucceeded,
  publishPaymentFailed,
} from '../events/billingPublisher.js';

const stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2024-06-20' });

export { stripe };

/**
 * Verify the Stripe webhook signature and return the parsed event.
 * Throws if the signature is invalid.
 */
export function constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    config.stripe.webhookSecret,
  );
}

/**
 * Resolve the Supabase user ID for a given Stripe customer ID.
 * Returns null if no matching user is found.
 */
async function getUserIdByCustomer(customerId: string): Promise<string | null> {
  const { data } = await getSupabaseClient()
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();
  return data?.user_id ?? null;
}

/**
 * Handle a verified Stripe webhook event.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  logger.info('Handling Stripe event', { type: event.type, id: event.id });

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const userId = await getUserIdByCustomer(customerId);

      const plan = sub.status === 'active' ? 'pro' : 'free';
      const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

      // Upsert subscription record
      await getSupabaseClient()
        .from('subscriptions')
        .upsert({
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          plan,
          current_period_end: periodEnd,
          status: sub.status,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'stripe_subscription_id' });

      if (userId && plan === 'pro') {
        await publishSubscriptionCreated(userId, customerId, sub.id, periodEnd);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const userId = await getUserIdByCustomer(customerId);

      await getSupabaseClient()
        .from('subscriptions')
        .update({ plan: 'free', status: 'canceled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', sub.id);

      if (userId) {
        await publishSubscriptionCancelled(userId, sub.id, new Date().toISOString());
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : (invoice.customer as Stripe.Customer)?.id ?? '';
      const userId = await getUserIdByCustomer(customerId);

      if (userId) {
        await publishPaymentSucceeded(
          userId,
          invoice.id,
          invoice.amount_paid,
          invoice.currency,
        );
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : (invoice.customer as Stripe.Customer)?.id ?? '';
      const userId = await getUserIdByCustomer(customerId);

      if (userId) {
        await publishPaymentFailed(
          userId,
          invoice.id,
          invoice.last_finalization_error?.message ?? 'Unknown error',
        );
      }
      break;
    }

    default:
      logger.debug('Unhandled Stripe event type', { type: event.type });
  }
}
