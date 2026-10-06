import { useCallback, useEffect, useState } from 'react';

/**
 * Frame playback shared by the live map's time-stepped layers (MRMS radar,
 * satellite loops): a chosen frame or "live" (always the newest), play/pause
 * that steps through the window, holds on the newest frame, and loops.
 *
 * `frames` are `{ id, time }`, oldest first. Choosing a frame or pausing
 * stops playback; pausing returns to live.
 */
export function useFramePlayback(frames, { active = true, frameMs = 450, lastFrameHold = 3 } = {}) {
  const [frameChoice, setFrameChoice] = useState(null); // null = live (newest)
  const [playing, setPlaying] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => { if (!active) setPlaying(false); }, [active]);

  useEffect(() => {
    if (!playing || frames.length < 2) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), frameMs);
    return () => clearInterval(id);
  }, [playing, frames.length, frameMs]);
  const cycle = frames.length + lastFrameHold;
  const playIndex = playing && frames.length > 1 ? Math.min(tick % cycle, frames.length - 1) : null;

  const choiceIndex = frameChoice ? frames.findIndex((f) => f.id === frameChoice) : -1;
  const index = playIndex ?? (choiceIndex !== -1 ? choiceIndex : frames.length - 1);
  const frame = frames[index] ?? null;
  const live = playIndex == null && choiceIndex === -1;

  const setFrame = useCallback((id) => { setPlaying(false); setFrameChoice(id); }, []);
  const goLive = useCallback(() => { setPlaying(false); setFrameChoice(null); }, []);
  const togglePlaying = useCallback(() => {
    if (playing) setFrameChoice(null); // pausing returns to live
    else setTick(0);
    setPlaying(!playing);
  }, [playing]);
  /** One frame back or forward from the one shown (stops playback; clamps at the ends). */
  const step = useCallback((delta) => {
    if (!frames.length) return;
    const next = Math.min(frames.length - 1, Math.max(0, index + delta));
    setPlaying(false);
    setFrameChoice(next === frames.length - 1 ? null : frames[next].id);
  }, [frames, index]);

  /** Back to the newest frame without touching playback (e.g. a new product). */
  const clearChoice = useCallback(() => setFrameChoice(null), []);

  return { frame, index, live, playing, setFrame, goLive, togglePlaying, step, clearChoice };
}
