import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePlan } from '../../src/hooks/usePlan';

const { useAuth } = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('../../src/context/AuthContext', () => ({ useAuth }));

describe('usePlan infrastructure entitlements', () => {
  it('denies infrastructure layers for a free public user', () => {
    useAuth.mockReturnValue({
      subscription: { plan: 'free', status: 'active' },
      isReporter: false,
      isAdmin: false,
    });
    const { result } = renderHook(() => usePlan());
    expect(result.current.hasProInfrastructureAccess).toBe(false);
  });

  it('grants infrastructure layers to reporters without a paid plan', () => {
    useAuth.mockReturnValue({
      subscription: { plan: 'free', status: 'active' },
      isReporter: true,
      isAdmin: false,
    });
    const { result } = renderHook(() => usePlan());
    expect(result.current.hasProInfrastructureAccess).toBe(true);
  });

  it('grants infrastructure layers to admins without a paid plan', () => {
    useAuth.mockReturnValue({
      subscription: { plan: 'free', status: 'active' },
      isReporter: false,
      isAdmin: true,
    });
    const { result } = renderHook(() => usePlan());
    expect(result.current.hasProInfrastructureAccess).toBe(true);
  });

  it('grants infrastructure layers to a Pro subscriber', () => {
    useAuth.mockReturnValue({
      subscription: { plan: 'pro', status: 'active' },
      isReporter: false,
      isAdmin: false,
    });
    const { result } = renderHook(() => usePlan());
    expect(result.current.hasProInfrastructureAccess).toBe(true);
  });
});
