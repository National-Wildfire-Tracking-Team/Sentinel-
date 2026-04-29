/**
 * usePlan.js
 * Exposes the current user's subscription plan and per-plan feature limits.
 *
 * Plans:
 *   free  – permanent free tier; core situational awareness
 *   pro   – Sentinel Pro ($9.99/mo); field intelligence + infrastructure layers
 *   team  – org/team tier; max limits + API + multi-seat
 */

import { useAuth } from '../context/AuthContext';

/** Per-plan feature capability flags */
export const PLANS = {
  free: {
    id: 'free',
    label: 'Free',
    price: 0,
    savedLocationsLimit: 4,
    alertsEnabled: true,
    basicAlerts: true,
    advancedLayers: false,
    infrastructureLayers: false,
    evacuationRoutes: false,
    federalLandLayers: false,
    camerasAircraft: true,
    apiAccess: false,
    priorityAlerts: false,
    teamMembers: 1,
  },
  pro: {
    id: 'pro',
    label: 'Sentinel Pro',
    price: 9.99,
    savedLocationsLimit: 25,
    alertsEnabled: true,
    basicAlerts: true,
    advancedLayers: true,
    infrastructureLayers: true,   // highways, railroads, powerlines, pipelines (live)
    evacuationRoutes: true,
    federalLandLayers: false,     // coming soon
    camerasAircraft: true,
    apiAccess: false,
    priorityAlerts: true,
    teamMembers: 1,
  },
  team: {
    id: 'team',
    label: 'Team',
    price: 29,
    savedLocationsLimit: 100,
    alertsEnabled: true,
    basicAlerts: true,
    advancedLayers: true,
    infrastructureLayers: true,
    evacuationRoutes: true,
    federalLandLayers: true,
    camerasAircraft: true,
    apiAccess: true,
    priorityAlerts: true,
    teamMembers: 10,
  },
};

export function usePlan() {
  const { subscription, isReporter } = useAuth();

  const planId =
    subscription?.status === 'active' || subscription?.status === 'trialing'
      ? (subscription?.plan ?? 'free')
      : 'free';

  const plan = PLANS[planId] ?? PLANS.free;

  const isPaidPlan = planId === 'pro' || planId === 'team';
  /** Pro-equivalent data access for field reporters (no subscription required). */
  const hasProInfrastructureAccess = isPaidPlan || Boolean(isReporter);

  return {
    planId,
    plan,
    subscription,
    isPro: planId === 'pro',
    isTeam: planId === 'team',
    isPaid: isPaidPlan,
    hasProInfrastructureAccess,
    isActive: subscription?.status === 'active' || subscription?.status === 'trialing' || planId === 'free',
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    currentPeriodEnd: subscription?.current_period_end ?? null,
  };
}
