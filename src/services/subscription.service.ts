import { supabaseAdmin } from '../config/supabase.js';
import {
  GRACE_PERIOD_HOURS,
  PREMIUM_MONTHLY_LIMIT,
  FREE_MONTHLY_LIMIT,
  PREMIUM_STATUSES,
  getCalendarMonthPeriodUtc,
  getPreviousIntervalStart,
  UserPlan,
} from '../config/billing.js';

interface RawSubscriptionRow {
  id: string;
  user_id: string;
  lemon_subscription_id: string;
  product_id: string | null;
  variant_id: string | null;
  status: string;
  trial_ends_at: string | null;
  renews_at: string; // upcoming renewal
  ends_at: string | null;
  customer_portal_url: string | null;
}

export class SubscriptionService {
  async getActiveSubscription(
    userId: string
  ): Promise<RawSubscriptionRow | null> {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select(
        'id,user_id,lemon_subscription_id,product_id,variant_id,status,trial_ends_at,renews_at,ends_at,customer_portal_url'
      )
      .eq('user_id', userId)
      .order('renews_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('getActiveSubscription error', error);
      return null;
    }
    if (!data) return null;
    // Determine if still within grace
    const now = new Date();
    const endsAt = data.ends_at ? new Date(data.ends_at) : null;
    const inGrace = endsAt
      ? (now.getTime() - endsAt.getTime()) / 1000 / 3600 < GRACE_PERIOD_HOURS
      : true;
    const status = data.status;
    const premiumEligible =
      (PREMIUM_STATUSES.includes(status) || status === 'cancelled') && inGrace;
    if (!premiumEligible) return null;
    return data as RawSubscriptionRow;
  }

  async getUserPlan(userId: string): Promise<UserPlan> {
    const sub = await this.getActiveSubscription(userId);
    if (!sub) {
      const period = getCalendarMonthPeriodUtc();
      return {
        plan: 'free',
        status: 'free',
        limit: FREE_MONTHLY_LIMIT,
        period,
        used: 0,
        remaining: FREE_MONTHLY_LIMIT,
      };
    }
    const periodEnd = sub.renews_at; // upcoming renew
    const periodStart = getPreviousIntervalStart(sub.variant_id, sub.renews_at);
    const limit = PREMIUM_MONTHLY_LIMIT; // unified temporary cap
    return {
      plan: 'premium',
      status: sub.status,
      limit,
      period: { start: periodStart, end: periodEnd },
      used: 0,
      remaining: limit,
      subscriptionId: sub.lemon_subscription_id,
      variantId: sub.variant_id,
      managePortalUrl: sub.customer_portal_url,
      renewsAt: sub.renews_at,
      trialEndsAt: sub.trial_ends_at,
    };
  }

  async getUsageCount(
    userId: string,
    periodStartIso: string,
    periodEndIso: string
  ): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from('links')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', periodStartIso)
      .lt('created_at', periodEndIso);
    if (error) {
      console.error('getUsageCount error', error);
      return 0;
    }
    return count || 0;
  }

  async getEnrichedPlan(userId: string): Promise<UserPlan> {
    const base = await this.getUserPlan(userId);
    const used = await this.getUsageCount(
      userId,
      base.period.start,
      base.period.end
    );
    return { ...base, used, remaining: Math.max(base.limit - used, 0) };
  }
}

export const subscriptionService = new SubscriptionService();
