/**
 * ParallaxHero.jsx
 * Full-bleed hero photo that drifts against the page scroll.
 *
 * Why not `background-attachment: fixed`: that anchors the image to the
 * viewport, so which slice of the photo lands inside the bar depends on the
 * window height and the scroll position — you can't keep a specific subject
 * centred. It's also broken on iOS Safari. Instead the image sits in an
 * over-tall element that we translate on scroll, which keeps `focal` centred
 * in the bar at every viewport size and works everywhere.
 *
 * `focal` is the vertical point of the source image to hold in the middle of
 * the bar, as a background-position Y value (e.g. '58%' for a subject sitting
 * a little below the image's centre). `focalX` does the same horizontally,
 * which matters on narrow viewports where a wide photo is cropped hard and an
 * off-centre subject would otherwise fall outside the bar entirely.
 */

import { useEffect, useRef } from 'react';

// Extra image height above and below the bar, as a fraction of bar height.
// Must exceed drift so the drift never exposes an edge.
const OVERHANG = 0.42;
// Maximum drift away from centre, as a fraction of bar height. The shorter the
// bar, the more of the photo travels through it, so this is deliberately large.
const DRIFT = 0.3;

export default function ParallaxHero({
  image,
  focal = '50%',
  focalX = 'center',
  className = '',
  overlayClassName = 'bg-gradient-to-b from-sentinel-900/70 via-sentinel-900/50 to-sentinel-900/80',
  // Shallower depth pulls the crop back towards the bar, which matters when the
  // subject sits near an edge of the photo and would otherwise drift out of view.
  overhang = OVERHANG,
  drift = DRIFT,
  children,
}) {
  const barRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    const bar = barRef.current;
    const image = imageRef.current;
    if (!bar || !image) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;

    const update = () => {
      raf = 0;
      if (motion.matches) {
        image.style.transform = '';
        return;
      }
      const rect = bar.getBoundingClientRect();
      const span = window.innerHeight + rect.height;
      if (span <= 0) return;
      // 0 as the bar enters the viewport from below, 1 as it leaves the top.
      const progress = (window.innerHeight - rect.top) / span;
      const clamped = Math.min(Math.max(progress, 0), 1);
      const shift = (clamped - 0.5) * 2 * drift * rect.height;
      image.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    motion.addEventListener('change', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      motion.removeEventListener('change', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [drift]);

  return (
    <section ref={barRef} className={`relative overflow-hidden bg-sentinel-900 ${className}`}>
      <div
        ref={imageRef}
        aria-hidden="true"
        className="absolute inset-x-0 bg-cover bg-no-repeat will-change-transform"
        style={{
          top: `${-overhang * 100}%`,
          height: `${100 + overhang * 200}%`,
          backgroundImage: `url(${image})`,
          backgroundPosition: `${focalX} ${focal}`,
        }}
      />
      {/* Scrim — keeps headings legible over bright sky and smoke. */}
      <div aria-hidden="true" className={`absolute inset-0 ${overlayClassName}`} />
      <div className="relative">{children}</div>
    </section>
  );
}
