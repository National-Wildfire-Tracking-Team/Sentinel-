import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlan } from '../../src/shared/hooks/usePlan';
import { useAuth } from '../../src/shared/context/AuthContext';

vi.mock('../../src/shared/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('usePlan', () => {
  beforeEach(() => {
    useAuth.mockReset();
  });

  it('keeps paid access while Stripe retries a past-due subscription', () => {
    useAuth.mockReturnValue({
      subscription: { plan: 'pro', status: 'past_due' },
      isReporter: false,
    });

    const { result } = renderHook(() => usePlan());

    expect(result.current.planId).toBe('pro');
    expect(result.current.isPaid).toBe(true);
    expect(result.current.hasProInfrastructureAccess).toBe(true);
  });

  it('removes paid access after the subscription is canceled', () => {
    useAuth.mockReturnValue({
      subscription: { plan: 'pro', status: 'canceled' },
      isReporter: false,
    });

    const { result } = renderHook(() => usePlan());

    expect(result.current.planId).toBe('free');
    expect(result.current.isPaid).toBe(false);
  });
});
