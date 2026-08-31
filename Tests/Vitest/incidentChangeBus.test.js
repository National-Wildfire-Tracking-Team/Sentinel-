import { describe, it, expect, vi } from 'vitest';
import {
  subscribeToIncidentChanges,
  publishIncidentChange,
} from '../../src/app/utils/incidentChangeBus';

describe('incidentChangeBus', () => {
  it('calls subscriber when change is published', () => {
    const callback = vi.fn();
    subscribeToIncidentChanges('fire-1', callback);

    publishIncidentChange('fire-1', { acres: 500 });
    expect(callback).toHaveBeenCalledWith({ acres: 500 });
  });

  it('does not call subscriber for different incident', () => {
    const callback = vi.fn();
    subscribeToIncidentChanges('fire-1', callback);

    publishIncidentChange('fire-2', { acres: 500 });
    expect(callback).not.toHaveBeenCalled();
  });

  it('supports multiple subscribers', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    subscribeToIncidentChanges('fire-1', cb1);
    subscribeToIncidentChanges('fire-1', cb2);

    publishIncidentChange('fire-1', { status: 'contained' });
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it('unsubscribe removes the subscriber', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToIncidentChanges('fire-1', callback);

    unsubscribe();
    publishIncidentChange('fire-1', { acres: 500 });
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not throw when publishing to non-existent incident', () => {
    expect(() => {
      publishIncidentChange('non-existent', {});
    }).not.toThrow();
  });
});
