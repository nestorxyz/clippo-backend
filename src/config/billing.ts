// Billing / quota configuration and helper utilities
export const FREE_MONTHLY_LIMIT = 20;
export const PREMIUM_MONTHLY_LIMIT = 200; // temporary cap

// Lemon Squeezy variant IDs (constants, not env-based per user instruction)
export const LEMON_MONTHLY_VARIANT_ID = '607784';
export const LEMON_YEARLY_VARIANT_ID = '607792';

export const PREMIUM_STATUSES: string[] = ['active', 'on_trial'];
export const GRACE_PERIOD_HOURS = 24; // webhook delay tolerance

export interface PlanPeriod {
  start: string; // ISO
  end: string; // ISO
}

export interface UserPlan {
  plan: 'free' | 'premium';
  status: string | null; // subscription status or 'free'
  limit: number;
  period: PlanPeriod;
  used: number; // optional population downstream
  remaining: number; // optional population downstream
  subscriptionId?: string;
  variantId?: string | null;
  managePortalUrl?: string | null;
  renewsAt?: string; // raw renew date from Lemon (ISO)
  trialEndsAt?: string | null; // ISO if on trial
}

export function getCalendarMonthPeriodUtc(date = new Date()): PlanPeriod {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  return { start: periodStart.toISOString(), end: periodEnd.toISOString() };
}

export function getPreviousIntervalStart(
  variantId: string | null | undefined,
  renewsAt: string
): string {
  // For premium users we base period on subscription cycle, not calendar month.
  // We only store next renews_at, so derive start by subtracting interval length.
  const end = new Date(renewsAt);
  let start: Date;
  if (variantId === LEMON_YEARLY_VARIANT_ID) {
    start = new Date(
      Date.UTC(
        end.getUTCFullYear() - 1,
        end.getUTCMonth(),
        end.getUTCDate(),
        end.getUTCHours(),
        end.getUTCMinutes(),
        end.getUTCSeconds(),
        end.getUTCMilliseconds()
      )
    );
  } else {
    // default monthly
    start = new Date(
      Date.UTC(
        end.getUTCFullYear(),
        end.getUTCMonth() - 1,
        end.getUTCDate(),
        end.getUTCHours(),
        end.getUTCMinutes(),
        end.getUTCSeconds(),
        end.getUTCMilliseconds()
      )
    );
  }
  return start.toISOString();
}
