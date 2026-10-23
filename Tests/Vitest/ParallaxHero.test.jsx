import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ParallaxHero from '../../src/main/components/ParallaxHero';

describe('ParallaxHero', () => {
  beforeEach(() => {
    window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
  });

  afterEach(() => {
    delete window.matchMedia;
  });

  it('offers the AVIF photo with the JPEG as fallback', () => {
    const { container } = render(
      <ParallaxHero image="/hero.jpg" avif="/hero.avif" focal="70%" focalX="32%" overhang={0.28} />
    );

    const source = container.querySelector('picture > source');
    expect(source).toHaveAttribute('type', 'image/avif');
    expect(source).toHaveAttribute('srcset', '/hero.avif');

    const img = container.querySelector('picture > img');
    expect(img).toHaveAttribute('src', '/hero.jpg');
    // Decorative: the scrim and heading carry the meaning.
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('fetchpriority', 'high');
    // Same crop the CSS background used to give.
    expect(img).toHaveClass('object-cover');
    expect(img.style.objectPosition).toBe('32% 70%');
    expect(parseFloat(img.style.top)).toBeCloseTo(-28);
    expect(parseFloat(img.style.height)).toBeCloseTo(156);
  });

  it('serves the JPEG alone when no AVIF is given', () => {
    const { container } = render(<ParallaxHero image="/hero.jpg" />);

    expect(container.querySelector('source')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute('src', '/hero.jpg');
  });

  it('moves the photo, not the bar, on scroll', () => {
    const { container } = render(<ParallaxHero image="/hero.jpg" />);

    expect(container.querySelector('img').style.transform).toMatch(/^translate3d\(/);
  });
});
