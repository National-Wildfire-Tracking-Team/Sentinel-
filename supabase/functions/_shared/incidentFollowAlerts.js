/**
 * incidentFollowAlerts.js
 * Emails users who follow an incident ("Follow Incident" in the incident
 * panel) when it gets new timeline updates. Runs alongside the saved-location
 * pipeline in notification-sync (and scripts/notification-sync.mjs).
 *
 *   get_pending_follow_digests()   follows with unsent updates, outside the
 *                                  per-incident send interval, newest 10 each
 *   → claim_follow_notification()  notification_log dedup on the newest update
 *   → Resend email (one digest per user + incident)
 *   → mark_follow_notified()       advance the follow's watermark
 *
 * Like savedLocationAlerts.js, all I/O is injected through `deps`, so this is
 * runtime-neutral ESM for Deno, Node, and Vitest.
 */

import { escapeHtml, isRetryableDeliveryError } from './savedLocationAlerts.js';

/** Mirrors UPDATE_TYPE_LABELS in src/app/components/FireDetailPanel/incidentDetailModel.js. */
const UPDATE_TYPE_LABELS = {
  fire_growth: 'Fire Growth',
  threat: 'Threat',
  resource_request: 'Resource Request',
  evacuation: 'Evacuation',
  road_closure: 'Road Closure',
  location: 'Location Update',
  field_report: 'Field Report',
  incident_update: 'Incident Update',
};

const MAX_MESSAGE_CHARS = 500;

export function followSubjectKey(digest) {
  const newestId = digest.updates?.[0]?.id;
  return newestId ? `incident:${digest.incident_id}:update:${newestId}` : null;
}

function updateLabel(update) {
  if (update.update_type === 'incident_update' && update.source_type === 'reporter') return 'Field Report';
  return UPDATE_TYPE_LABELS[update.update_type] || 'Update';
}

function formatUtc(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  })} UTC`;
}

function truncate(text, max) {
  const s = String(text ?? '').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function followDigestEmail({ digest, appUrl }) {
  const name = digest.incident_name || 'An incident you follow';
  const count = Number(digest.update_count) || digest.updates.length;
  const shown = digest.updates.length;
  const link = `${appUrl}/?incident=${encodeURIComponent(digest.incident_id)}`;
  const newest = digest.updates[0];

  const subject = count === 1
    ? `${name}: ${updateLabel(newest)}`
    : `${name}: ${count} new updates`;

  const items = digest.updates.map((u) => `
      <li style="margin: 0 0 16px; padding: 0; list-style: none;">
        <div style="color: #64748b; font-size: 12px;">${escapeHtml(formatUtc(u.created_at))} · <strong style="color: #0f172a;">${escapeHtml(updateLabel(u))}</strong></div>
        <div style="color: #0f172a; font-size: 15px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(truncate(u.content, MAX_MESSAGE_CHARS))}</div>
        <div style="color: #64748b; font-size: 12px;">${escapeHtml(u.source_name || '')}${u.source_type === 'automated' ? ' · Automated feed' : ' · NWTT Reporter'}</div>
      </li>`).join('');

  return {
    subject,
    title: subject,
    html: `
    <div style="font-family: sans-serif; max-width: 520px;">
      <h2 style="color: #ea580c; margin-bottom: 4px;">${escapeHtml(name)}</h2>
      <p style="color: #475569; margin-top: 0;">${count === 1 ? 'New update' : `${count} new updates`} on an incident you follow.</p>
      <ul style="margin: 20px 0; padding: 0;">${items}</ul>
      ${count > shown ? `<p style="color: #475569;">Showing the latest ${shown} of ${count}.</p>` : ''}
      <p><a href="${escapeHtml(link)}" style="color: #ea580c;">Open the incident in Sentinel →</a></p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
        You're receiving this because you follow ${escapeHtml(name)} on Sentinel.
        To stop, open the incident and tap Following.
      </p>
    </div>
  `,
  };
}

/**
 * Run one follow-digest pass.
 *
 * deps:
 *   fetchFollowDigests()                  → rows from get_pending_follow_digests()
 *   claimFollowNotification(row)          → id, or null when already sent
 *   releaseNotification(id)               → delete a claim so the next run retries it
 *   markFollowNotified({ user_id, incident_id, through })
 *   sendEmail({ to, subject, html })      throws (err.status optional) on failure
 *   log(event, fields)                    structured logger; never pass emails here
 *   appUrl
 */
export async function runFollowNotifications(deps) {
  const {
    fetchFollowDigests, claimFollowNotification, releaseNotification, markFollowNotified, sendEmail,
    log = () => {}, appUrl = '',
  } = deps;

  const counts = { followDigests: 0, followSent: 0, followDuplicates: 0, followFailed: 0 };
  const digests = (await fetchFollowDigests()) || [];
  log('follow_digests_loaded', { digests: digests.length });

  for (const digest of digests) {
    const subjectKey = followSubjectKey(digest);
    if (!subjectKey || !digest.email) continue;
    counts.followDigests++;
    const ctx = { incidentId: digest.incident_id, subjectKey, updates: digest.update_count };
    const email = followDigestEmail({ digest, appUrl });
    const mark = () => Promise.resolve(markFollowNotified({
      user_id: digest.user_id, incident_id: digest.incident_id, through: digest.through,
    })).catch((err) => log('follow_mark_failed', { ...ctx, error: String(err?.message || err).slice(0, 200) }));

    let claimId;
    try {
      claimId = await claimFollowNotification({ user_id: digest.user_id, subject_key: subjectKey, title: email.title });
    } catch (err) {
      counts.followFailed++;
      log('follow_claim_failed', { ...ctx, error: String(err?.message || err).slice(0, 200) });
      continue;
    }
    if (!claimId) {
      // Sent by an earlier run that didn't get to advance the watermark.
      counts.followDuplicates++;
      log('follow_duplicate_suppressed', ctx);
      await mark();
      continue;
    }

    try {
      await sendEmail({ to: digest.email, subject: email.subject, html: email.html });
      counts.followSent++;
      log('follow_sent', ctx);
      await mark();
    } catch (err) {
      counts.followFailed++;
      const retry = isRetryableDeliveryError(err);
      log('follow_failed', { ...ctx, status: err?.status ?? null, retry, error: String(err?.message || err).slice(0, 200) });
      if (retry) {
        await Promise.resolve(releaseNotification(claimId)).catch((releaseErr) => {
          log('follow_release_failed', { ...ctx, error: String(releaseErr?.message || releaseErr) });
        });
      } else {
        // Undeliverable (e.g. invalid address): don't retry the same updates forever.
        await mark();
      }
    }
  }

  log('follow_summary', counts);
  return counts;
}
