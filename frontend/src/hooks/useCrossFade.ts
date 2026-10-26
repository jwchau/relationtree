import { useEffect, useState } from 'react';

export interface Fading {
  key: string;
  leaving: boolean;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** What to draw while one keyed view replaces another: the old key, leaving, under the new
 * one for `ms`, then the new one alone. With reduced motion the swap is instant. */
export function useCrossFade(key: string, ms: number): Fading[] {
  const [current, setCurrent] = useState(key);
  const [leaving, setLeaving] = useState<string | null>(null);
  // Adjusting state while rendering, so the first render with the new key already has both.
  if (key !== current) {
    setCurrent(key);
    setLeaving(prefersReducedMotion() ? null : current);
  }

  useEffect(() => {
    if (leaving === null) return;
    const timer = setTimeout(() => setLeaving(null), ms);
    return () => clearTimeout(timer);
  }, [leaving, ms]);

  return leaving === null
    ? [{ key, leaving: false }]
    : [
        { key: leaving, leaving: true },
        { key, leaving: false },
      ];
}
