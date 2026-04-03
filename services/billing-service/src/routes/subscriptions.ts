/**
 * @module billing-service/routes/subscriptions
 *
 * REST endpoints for querying subscription status.
 */

import { Router, Response, NextFunction, Request } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { getSupabaseClient } from '../utils/supabase.js';
import { stripe } from '../services/stripeService.js';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: { sub: string; email: string };
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing Authorization header' });
    return;
  }
  try {
    const claims = jwt.verify(header.slice(7), config.supabase.jwtSecret) as {
      sub: string;
      email: string;
    };
    req.user = claims;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/** GET /subscriptions/me – get the authenticated user's subscription */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.user!.sub)
      .single();

    if (error || !data) {
      res.json({ success: true, data: { plan: 'free' } });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/** POST /subscriptions/checkout – create a Stripe Checkout session */
router.post('/checkout', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { priceId, successUrl, cancelUrl } = req.body as {
      priceId: string;
      successUrl: string;
      cancelUrl: string;
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: req.user!.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId: req.user!.sub },
    });

    res.json({ success: true, data: { url: session.url } });
  } catch (err) {
    next(err);
  }
});

/** POST /subscriptions/portal – create a Stripe Customer Portal session */
router.post('/portal', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { returnUrl } = req.body as { returnUrl: string };

    const { data: sub } = await getSupabaseClient()
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', req.user!.sub)
      .single();

    if (!sub?.stripe_customer_id) {
      res.status(404).json({ success: false, error: 'No subscription found' });
      return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: returnUrl,
    });

    res.json({ success: true, data: { url: session.url } });
  } catch (err) {
    next(err);
  }
});

export default router;
