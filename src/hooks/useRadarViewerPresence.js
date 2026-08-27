/**
 * useRadarViewerPresence.js
 * Tracks how many browser tabs currently have a given NEXRAD site open, via a
 * Supabase Realtime presence channel keyed by site id. No table/row is
 * written — presence state lives only in the Realtime server for as long as
 * a channel member is connected, so the count reflects live viewers only.
 */

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';

const VIEWER_ID_KEY = 'sentinel_radar_viewer_id';

function getViewerId() {
  try {
    let id = sessionStorage.getItem(VIEWER_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(VIEWER_ID_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage unavailable (e.g. private mode) — fall back to a
    // per-mount id; this tab just won't survive a reload as "the same" viewer.
    return crypto.randomUUID();
  }
}

export function useRadarViewerPresence(siteId, enabled) {
  const [viewerCount, setViewerCount] = useState(1);

  useEffect(() => {
    if (!enabled || !siteId || !isSupabaseConfigured) {
      setViewerCount(1);
      return undefined;
    }

    const viewerId = getViewerId();
    const channel = supabase.channel(`radar-viewers:${siteId}`, {
      config: { presence: { key: viewerId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setViewerCount(Math.max(1, Object.keys(state).length));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({ online_at: new Date().toISOString() });
          } catch {
            // Best-effort — a failed track just means this tab won't count itself.
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [siteId, enabled]);

  return viewerCount;
}
