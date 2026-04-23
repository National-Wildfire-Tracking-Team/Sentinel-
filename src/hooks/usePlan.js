/**
 * usePlan.js
 * Exposes the current user's subscription plan and per-plan feature limits.
 *
 * Plans:
 *   free  – default; limited saved locations, no advanced features
 *   pro   – individual paid; extended limits + priority alerts
 *   team  – org/team paid; max limits + all features
 */

import { useAuth } from '../context/AuthContext';

/** Per-plan feature definitions */
export const PLANS = {
  free: {
    id: 'free',
    label: 'Free',
    savedLocationsLimit: 4,
    alertsEnabled: true,
    advancedLayers: false,
    apiAccess: false,
    priorityAlerts: false,
    teamMembers: 1,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    savedLocationsLimit: 25,
    alertsEnabled: true,
    advancedLayers: true,
    apiAccess: false,
    priorityAlerts: true,
    teamMembers: 1,
  },
  team: {
    id: 'team',
    label: 'Team',
    savedLocationsLimit: 100,
    alertsEnabled: true,
    advancedLayers: true,
    apiAccess: true,
    priorityAlerts: true,
    teamMembers: 10,
  },
};

export function usePlan() {
  const { subscription } = useAuth();

  const planId =
    subscription?.status === 'active' || subscription?.status === 'trialing'
      ? (subscription?.plan ?? 'free')
      : 'free';

  const plan = PLANS[planId] ?? PLANS.free;

  return {
    planId,
    plan,
    subscription,
    isPro: planId === 'pro',
    isTeam: planId === 'team',
    isPaid: planId === 'pro' || planId === 'team',
    isActive: subscription?.status === 'active' || subscription?.status === 'trialing' || planId === 'free',
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    currentPeriodEnd: subscription?.current_period_end ?? null,
  };
}
