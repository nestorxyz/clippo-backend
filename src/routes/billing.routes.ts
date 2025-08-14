import { Router, Response } from 'express';
import { authenticateSupabaseToken } from '../middleware/auth.middleware.js';
import { AuthRequest } from '../types/index.js';
import { subscriptionService } from '../services/subscription.service.js';
import { supabaseAdmin } from '../config/supabase.js';
import fetch from 'node-fetch';

const router = Router();

router.get(
  '/plan',
  authenticateSupabaseToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
      }
      const plan = await subscriptionService.getEnrichedPlan(userId);
      return res.json({ success: true, data: plan, message: 'Plan retrieved' });
    } catch (err: any) {
      console.error('Get plan error', err);
      return res
        .status(500)
        .json({ success: false, error: 'SERVER_ERROR', message: err.message });
    }
  }
);

export default router;

// Additional route: fetch latest customer portal URL (unsigned) from DB
router.get(
  '/portal',
  authenticateSupabaseToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .select('customer_portal_url, lemon_subscription_id')
        .eq('user_id', userId)
        .order('renews_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      let url = data?.customer_portal_url || null;
      // Try to refresh a signed URL if possible
      try {
        const apiKey =
          process.env.LEMON_API_KEY || process.env.LEMONSQUEEZY_API_KEY;
        if (apiKey && data?.lemon_subscription_id) {
          const resp = await fetch(
            `https://api.lemonsqueezy.com/v1/subscriptions/${data.lemon_subscription_id}`,
            {
              headers: {
                Accept: 'application/vnd.api+json',
                'Content-Type': 'application/vnd.api+json',
                Authorization: `Bearer ${apiKey}`,
              },
            }
          );
          if (resp.ok) {
            const js = (await resp.json()) as any;
            const fresh = js?.data?.attributes?.urls?.customer_portal || null;
            if (fresh) url = fresh;
          }
        }
      } catch (e) {
        console.warn('Failed to refresh customer portal URL');
      }
      return res.json({ success: true, url });
    } catch (err: any) {
      console.error('Get portal url error', err);
      return res
        .status(500)
        .json({ success: false, error: 'SERVER_ERROR', message: err.message });
    }
  }
);
