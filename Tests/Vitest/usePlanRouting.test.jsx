import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePlan } from '../../src/shared/hooks/usePlan';
import { useAuth } from '../../src/shared/context/AuthContext';

vi.mock('../../src/shared/context/AuthContext', () => ({ useAuth: vi.fn() }));

describe('usePlan().hasEvacuationRoutesAccess', () => {
  it.each([
    [{ plan: 'pro', status: 'active' }, true],
    [{ plan: 'team', status: 'trialing' }, true],
    [{ plan: 'pro', status: 'past_due' }, true],
    [{ plan: 'pro', status: 'canceled' }, false],
    [{ plan: 'plus', status: 'active' }, false],
    [null, false],
  ])('%j → %s', (subscription, expected) => {
    useAuth.mockReturnValue({ subscription, isReporter: true });
    const { result } = renderHook(() => usePlan());
    expect(result.current.hasEvacuationRoutesAccess).toBe(expected);
  });
});
