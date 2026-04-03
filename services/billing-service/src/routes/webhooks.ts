/**
 * @module billing-service/routes/webhooks
 *
 * Stripe webhook handler.  The raw body is required for signature
 * verification, so JSON body parsing is NOT used on this router.
 */

import { Router, Request, Response } from 'express';
import { constructEvent, handleStripeEvent } from '../services/stripeService.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /webhooks/stripe
 * Receive and process Stripe webhook events.
 * Stripe sends the raw body with the Stripe-Signature header.
 */
router.post(
  '/stripe',
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (req: Request & { rawBody?: Buffer }, res: Response): Promise<void> => {
    const signature = req.headers['stripe-signature'] as string | undefined;

    if (!signature) {
      res.status(400).json({ error: 'Missing Stripe-Signature header' });
      return;
    }

    const rawBody = req.rawBody ?? Buffer.from('');
    let event;
    try {
      event = constructEvent(rawBody, signature);
    } catch (err) {
      logger.warn('Stripe webhook signature verification failed', {
        error: (err as Error).message,
      });
      res.status(400).json({ error: 'Webhook signature verification failed' });
      return;
    }

    try {
      await handleStripeEvent(event);
      res.json({ received: true });
    } catch (err) {
      logger.error('Failed to handle Stripe event', {
        eventType: event.type,
        error: (err as Error).message,
      });
      res.status(500).json({ error: 'Event handling failed' });
    }
  },
);

export default router;
