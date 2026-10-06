/**
 * The saved-location limit is enforced in the database
 * (public.saved_location_limit, used by the insert trigger and by
 * notification-sync's eligibility check) and shown in the app from
 * PLANS[*].savedLocationsLimit. These tests keep the two in step and guard
 * the security-relevant parts of the migration.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { PLANS } from '../../src/shared/hooks/usePlan';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, '../../supabase/migrations');

function latestMigrationDefining(fn) {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find((f) => readFileSync(join(MIGRATIONS, f), 'utf8').includes(`function public.${fn}(`));
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

describe('saved-location plan limits', () => {
  const sql = latestMigrationDefining('saved_location_limit');
  const body = sql.slice(sql.indexOf('function public.saved_location_limit('));
  const caseBlock = body.slice(0, body.indexOf('end;'));

  const dbLimit = (plan) => {
    const m = new RegExp(`when '${plan}' then (\\d+)`).exec(caseBlock);
    return m ? Number(m[1]) : Number(/else (\d+)/.exec(caseBlock)[1]);
  };

  it.each(Object.keys(PLANS))('database limit for %s matches PLANS', (plan) => {
    const app = PLANS[plan].savedLocationsLimit;
    const db = dbLimit(plan);
    if (Number.isFinite(app)) expect(db).toBe(app);
    else expect(db).toBeGreaterThanOrEqual(999999);
  });

  it('defaults unknown plans to the free limit of 4', () => {
    expect(Number(/else (\d+)/.exec(caseBlock)[1])).toBe(PLANS.free.savedLocationsLimit);
    expect(PLANS.free.savedLocationsLimit).toBe(4);
  });

  it('enforces the limit with the shared function, not a second copy', () => {
    const trigger = latestMigrationDefining('enforce_saved_location_limit');
    const fn = trigger.slice(trigger.indexOf('function public.enforce_saved_location_limit('));
    expect(fn.slice(0, fn.indexOf('$$;'))).toContain('public.saved_location_limit(');
  });
});

describe('notification migration security', () => {
  const sql = latestMigrationDefining('get_monitored_saved_locations');

  it.each(['get_monitored_saved_locations()', 'user_plan_for(uuid)'])(
    '%s is callable only by service_role',
    (signature) => {
      expect(sql).toContain(`revoke execute on function public.${signature} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    },
  );

  it('de-duplicates per user, saved location, kind, and event', () => {
    expect(sql).toMatch(/unique index[^;]*notification_log\(user_id, saved_location_id, kind, subject_key\)/);
    const clients = readFileSync(join(HERE, '../../supabase/functions/_shared/notificationSyncClients.js'), 'utf8');
    expect(clients).toContain("'user_id,saved_location_id,kind,subject_key'");
  });
});
