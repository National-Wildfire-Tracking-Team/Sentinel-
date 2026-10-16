/**
 * usePlan.js
 * Exposes the current user's subscription plan and per-plan feature limits.
 *
 * Plans:
 *   free  – permanent free tier; core situational awareness
 *   plus  – Sentinel Plus ($7.99/mo or $69/yr); fire spread rings + 10 saved locations
 *   pro   – Sentinel Pro ($14.99/mo or $149/yr); unlimited locations, critical infrastructure,
 *           land ownership and Route to Safety
 *
 * Feature lists shown to users live in src/main/pages/PricingPage.jsx.
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
    fireBehaviorModeling: false,   // Plus+ only
    camerasAircraft: true,
    apiAccess: false,
    priorityAlerts: false,
    teamMembers: 1,
  },
  plus: {
    id: 'plus',
    label: 'Sentinel Plus',
    price: 7.99,
    savedLocationsLimit: 10,      // keep in sync with public.saved_location_limit()
    alertsEnabled: true,
    basicAlerts: true,
    advancedLayers: true,          // not enforced: smoke + satellite are free for everyone
    infrastructureLayers: false,   // power lines + gas pipelines are Pro-only
    evacuationRoutes: false,
    federalLandLayers: false,      // land ownership is Pro-only
    fireBehaviorModeling: true,    // basic spread projection rings (live)
    camerasAircraft: true,
    apiAccess: false,
    priorityAlerts: false,         // custom alert settings, not priority delivery
    teamMembers: 1,
  },
  pro: {
    id: 'pro',
    label: 'Sentinel Pro',
    price: 14.99,
    savedLocationsLimit: Infinity,
    alertsEnabled: true,
    basicAlerts: true,
    advancedLayers: true,
    infrastructureLayers: true,   // power lines, gas pipelines
    evacuationRoutes: true,
    federalLandLayers: true,      // CAL FIRE FRAP land ownership (live, CA only)
    fireBehaviorModeling: true,   // advanced fire progression + spread projections
    camerasAircraft: true,
    apiAccess: true,
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
    fireBehaviorModeling: true,
    camerasAircraft: true,
    apiAccess: true,
    priorityAlerts: true,
    teamMembers: 10,
  },
};

export function usePlan() {
  const { subscription, isReporter } = useAuth();
  const paidStatuses = ['active', 'trialing', 'past_due'];

  const planId =
    paidStatuses.includes(subscription?.status)
      ? (subscription?.plan ?? 'free')
      : 'free';

  const plan = PLANS[planId] ?? PLANS.free;

  const isPaidPlan = planId === 'plus' || planId === 'pro' || planId === 'team';
  const isProOrAbove = planId === 'pro' || planId === 'team';
  /** Critical infrastructure + land ownership layers — Pro plan and above, or field reporter status. */
  const hasProInfrastructureAccess = isProOrAbove || Boolean(isReporter);
  /** Fire behavior modeling (spread projection layer) — Plus plan and above, or field reporter status. */
  const hasFireBehaviorModelingAccess = isPaidPlan || Boolean(isReporter);
  /** Route to Safety (ORS routing to shelters) — Pro/Team only (PLANS.*.evacuationRoutes).
   *  Must match the server check in cloud/ors-routing/auth.mjs. */
  const hasEvacuationRoutesAccess = Boolean(plan.evacuationRoutes);

  return {
    planId,
    plan,
    subscription,
    isPlus: planId === 'plus',
    isPro: planId === 'pro',
    isTeam: planId === 'team',
    isPaid: isPaidPlan,
    hasProInfrastructureAccess,
    hasFireBehaviorModelingAccess,
    hasEvacuationRoutesAccess,
    isActive: paidStatuses.includes(subscription?.status) || planId === 'free',
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    currentPeriodEnd: subscription?.current_period_end ?? null,
  };
}
