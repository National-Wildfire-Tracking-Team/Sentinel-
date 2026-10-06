import { useSyncExternalStore } from 'react';
import { isHour12, subscribeTimeFormat } from '../utils/formatUtils';

/**
 * Re-renders the caller when the 12/24-hour Time Format preference changes.
 * Call it in any component that shows a clock time.
 * @returns {boolean} true for the 12-hour clock
 */
export function useTimeFormat() {
  return useSyncExternalStore(subscribeTimeFormat, isHour12);
}
