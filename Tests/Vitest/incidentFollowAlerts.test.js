import { describe, expect, it, vi } from 'vitest';
import {
  followDigestEmail, followSubjectKey, runFollowNotifications,
} from '../../supabase/functions/_shared/incidentFollowAlerts.js';

const digest = (over = {}) => ({
  user_id: 'user-1',
  email: 'a@test.invalid',
  incident_id: 'inc-1',
  incident_name: 'Dagger Fire',
  through: '2026-10-05T22:12:00Z',
  update_count: 2,
  updates: [
    { id: 'u2', content: 'Evacuation order for RIV-E1042.', update_type: 'evacuation', source_type: 'reporter', source_name: 'jdoe', created_at: '2026-10-05T22:12:00Z' },
    { id: 'u1', content: 'Acres: 10 → 12', update_type: 'fire_growth', source_type: 'automated', source_name: 'CAL FIRE', created_at: '2026-10-05T22:00:00Z' },
  ],
  ...over,
});

function makeDeps(over = {}) {
  return {
    fetchFollowDigests: vi.fn(async () => [digest()]),
    claimFollowNotification: vi.fn(async () => 'log-1'),
    releaseNotification: vi.fn(async () => {}),
    markFollowNotified: vi.fn(async () => {}),
    sendEmail: vi.fn(async () => {}),
    appUrl: 'https://app.test',
    ...over,
  };
}

describe('followDigestEmail', () => {
  it('names the incident, lists updates, links to it, and escapes content', () => {
    const email = followDigestEmail({
      digest: digest({ updates: [{ ...digest().updates[0], content: '<script>x</script>' }], update_count: 1 }),
      appUrl: 'https://app.test',
    });
    expect(email.subject).toBe('Dagger Fire: Evacuation');
    expect(email.html).toContain('https://app.test/?incident=inc-1');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).not.toContain('<script>');
  });

  it('counts multiple updates and notes when only some are shown', () => {
    const email = followDigestEmail({ digest: digest({ update_count: 14 }), appUrl: '' });
    expect(email.subject).toBe('Dagger Fire: 14 new updates');
    expect(email.html).toContain('Showing the latest 2 of 14');
  });
});

describe('runFollowNotifications', () => {
  it('claims on the newest update, sends, then advances the watermark', async () => {
    const deps = makeDeps();
    const counts = await runFollowNotifications(deps);
    expect(followSubjectKey(digest())).toBe('incident:inc-1:update:u2');
    expect(deps.claimFollowNotification).toHaveBeenCalledWith(expect.objectContaining({ subject_key: 'incident:inc-1:update:u2' }));
    expect(deps.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@test.invalid' }));
    expect(deps.markFollowNotified).toHaveBeenCalledWith({ user_id: 'user-1', incident_id: 'inc-1', through: '2026-10-05T22:12:00Z' });
    expect(counts).toMatchObject({ followSent: 1, followFailed: 0 });
  });

  it('does not resend an already-claimed digest but still advances the watermark', async () => {
    const deps = makeDeps({ claimFollowNotification: vi.fn(async () => null) });
    const counts = await runFollowNotifications(deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.markFollowNotified).toHaveBeenCalled();
    expect(counts.followDuplicates).toBe(1);
  });

  it('releases the claim and keeps the watermark on retryable failures', async () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    const deps = makeDeps({ sendEmail: vi.fn(async () => { throw err; }) });
    await runFollowNotifications(deps);
    expect(deps.releaseNotification).toHaveBeenCalledWith('log-1');
    expect(deps.markFollowNotified).not.toHaveBeenCalled();
  });

  it('gives up on permanent failures so the same updates are not retried forever', async () => {
    const err = Object.assign(new Error('invalid recipient'), { status: 422 });
    const deps = makeDeps({ sendEmail: vi.fn(async () => { throw err; }) });
    await runFollowNotifications(deps);
    expect(deps.releaseNotification).not.toHaveBeenCalled();
    expect(deps.markFollowNotified).toHaveBeenCalled();
  });

  it('skips sending without a claim when the claim errors', async () => {
    const deps = makeDeps({ claimFollowNotification: vi.fn(async () => { throw new Error('db down'); }) });
    const counts = await runFollowNotifications(deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(counts.followFailed).toBe(1);
  });
});
