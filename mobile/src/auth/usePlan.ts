/**
 * Plan entitlements, the same rules as the web's src/shared/hooks/usePlan.js. A paid plan counts
 * only while the subscription is active, trialing or past_due; field reporters (and admins) also
 * get the infrastructure layers and fire behavior modeling.
 */
import { useAuth } from './AuthContext';

export type PlanId = 'free' | 'plus' | 'pro' | 'team';

export const PLAN_LABELS: Record<PlanId, string> = {
  free: 'Free',
  plus: 'Sentinel Plus',
  pro: 'Sentinel Pro',
  team: 'Team',
};

const PAID_STATUSES = ['active', 'trialing', 'past_due'];

export function usePlan() {
  const { subscription, role } = useAuth();
  const raw = PAID_STATUSES.includes(subscription.status) ? subscription.plan : 'free';
  const planId: PlanId = raw in PLAN_LABELS ? (raw as PlanId) : 'free';
  const isPaid = planId !== 'free';
  const isProOrAbove = planId === 'pro' || planId === 'team';
  const isReporter = role === 'reporter' || role === 'admin';
  return {
    planId,
    planLabel: PLAN_LABELS[planId],
    isPaid,
    hasProInfrastructureAccess: isProOrAbove || isReporter,
    hasFireBehaviorModelingAccess: isPaid || isReporter,
    hasEvacuationRoutesAccess: isProOrAbove,
    hasFireDangerAccess: isPaid,
  };
}
