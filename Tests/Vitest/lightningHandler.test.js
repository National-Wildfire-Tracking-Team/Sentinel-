// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  JOB_NAME, STALE_AFTER_SECONDS, bearerRole, createHandler, createJobLock,
} from '../../supabase/functions/lightning-builder/handler.mjs';

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
const SERVICE = `Bearer ${jwt({ role: 'service_role', iss: 'supabase' })}`;
const req = (authorization, method = 'POST') => new Request('http://x/lightning-builder', {
  method, headers: authorization ? { Authorization: authorization } : {},
});

const SUMMARY = {
  filesRead: 6, sourceBytes: 1200, sourceErrors: 0, flashes: 40, bytesWritten: 900, latestAgeSeconds: 55, satellites: {},
};

let deps, handle;
beforeEach(() => {
  deps = {
    build: vi.fn().mockResolvedValue(SUMMARY),
    claim: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
  };
  handle = createHandler(deps);
});

describe('bearerRole', () => {
  it('reads the role claim, and nothing from malformed tokens', () => {
    expect(bearerRole(SERVICE)).toBe('service_role');
    expect(bearerRole(`Bearer ${jwt({ role: 'authenticated', sub: 'u1' })}`)).toBe('authenticated');
    expect(bearerRole('Bearer not-a-jwt')).toBeNull();
    expect(bearerRole(`Bearer ${b64url({})}.%%%.x`)).toBeNull();
    expect(bearerRole(undefined)).toBeNull();
  });
});

describe('handler', () => {
  it('only the service role may trigger a build', async () => {
    for (const auth of [undefined, `Bearer ${jwt({ role: 'anon' })}`, `Bearer ${jwt({ role: 'authenticated', sub: 'u' })}`]) {
      expect((await handle(req(auth))).status).toBe(403);
    }
    expect((await handle(req(SERVICE, 'GET'))).status).toBe(405);
    expect(deps.build).not.toHaveBeenCalled();
  });

  it('claims the job, builds, releases, and logs one run line', async () => {
    const res = await handle(req(SERVICE));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, flashes: 40 });
    expect(deps.claim).toHaveBeenCalledWith(JOB_NAME, STALE_AFTER_SECONDS);
    expect(deps.release).toHaveBeenCalledWith(JOB_NAME, true);
    const [severity, message, fields] = deps.log.mock.calls.at(-1);
    expect([severity, message]).toEqual(['INFO', 'lightning_run']);
    expect(fields).toMatchObject({ lightning_flashes: 40, lightning_files_read: 6, lightning_build_errors: 0 });
  });

  it('skips while a previous run holds the claim', async () => {
    deps.claim.mockResolvedValue(false);
    const res = await handle(req(SERVICE));
    expect(await res.json()).toEqual({ ok: true, skipped: true });
    expect(deps.build).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();
  });

  it('a failed build releases with the error and answers 500', async () => {
    deps.build.mockRejectedValue(new Error('Storage write failed: HTTP 500'));
    const res = await handle(req(SERVICE));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'build_failed' });
    expect(deps.release).toHaveBeenCalledWith(JOB_NAME, false, 'Storage write failed: HTTP 500');
    expect(deps.log.mock.calls.at(-1).slice(0, 2)).toEqual(['ERROR', 'lightning_failed']);
  });

  it('a failed claim answers 500 without building', async () => {
    deps.claim.mockRejectedValue(new Error('try_claim_sync_job failed: HTTP 503'));
    expect((await handle(req(SERVICE))).status).toBe(500);
    expect(deps.build).not.toHaveBeenCalled();
  });
});

describe('job lock', () => {
  it('calls the claim/release RPCs as the service role', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('true'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const lock = createJobLock({ url: 'https://p.supabase.co', serviceKey: 'svc', fetchImpl });
    expect(await lock.claim(JOB_NAME, 120)).toBe(true);
    await lock.release(JOB_NAME, false, 'boom');
    const [[claimUrl, claimInit], [releaseUrl, releaseInit]] = fetchImpl.mock.calls;
    expect(claimUrl).toBe('https://p.supabase.co/rest/v1/rpc/try_claim_sync_job');
    expect(JSON.parse(claimInit.body)).toEqual({ p_job_name: JOB_NAME, p_stale_after_seconds: 120 });
    expect(claimInit.headers.Authorization).toBe('Bearer svc');
    expect(releaseUrl).toBe('https://p.supabase.co/rest/v1/rpc/release_sync_job');
    expect(JSON.parse(releaseInit.body)).toEqual({ p_job_name: JOB_NAME, p_success: false, p_error: 'boom' });
  });

  it('a refused claim is false; an RPC error throws', async () => {
    const no = createJobLock({ url: 'https://p', serviceKey: 's', fetchImpl: async () => new Response('false') });
    expect(await no.claim(JOB_NAME, 120)).toBe(false);
    const err = createJobLock({ url: 'https://p', serviceKey: 's', fetchImpl: async () => new Response('', { status: 503 }) });
    await expect(err.claim(JOB_NAME, 120)).rejects.toThrow(/HTTP 503/);
  });
});
