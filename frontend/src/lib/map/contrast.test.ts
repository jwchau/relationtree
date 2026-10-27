import { describe, expect, it } from 'vitest';
import css from '@/index.css?raw';
import canvasSource from '@/components/map/MapCanvas.tsx?raw';
import frameSource from '@/components/map/FamilyFrame.tsx?raw';

// FG-12: the map's marks against what they're drawn on, in both Kiln themes. WCAG AA asks
// 4.5:1 for text and 3:1 for graphics you need to read the map, focus rings included.

type Rgb = [number, number, number];

/** A theme's custom properties: dark is the first :root block, light overrides it. */
function tokens(theme: 'dark' | 'light'): Record<string, string> {
  const block = (source: string) =>
    Object.fromEntries([...source.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const dark = block(css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: light) {')));
  if (theme === 'dark') return dark;
  const lightStart = css.indexOf('@media (prefers-color-scheme: light) {');
  return { ...dark, ...block(css.slice(lightStart, css.indexOf('@media (min-width', lightStart))) };
}

const hex = (value: string): Rgb => {
  const h = value.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
};

const luminance = ([r, g, b]: Rgb) => {
  const channel = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The grounds the map draws on: the panel's gradient at both ends, and a card. */
function grounds(t: Record<string, string>): Rgb[] {
  const stops = [...t.panel.matchAll(/#[0-9a-f]{6}/gi)].map((m) => hex(m[0]));
  return [...stops, hex(t['surface-2'])];
}

describe.each(['dark', 'light'] as const)('map contrast, %s theme', (theme) => {
  const t = tokens(theme);
  const worst = (token: string) => Math.min(...grounds(t).map((g) => ratio(hex(t[token]), g)));

  it.each([
    ['names', 'text', 4.5],
    ['detail lines, band labels and dots', 'muted', 4.5],
    ['family lines and chip outlines', 'subtle', 3],
    ['focus rings', 'accent-text', 3],
  ])('draws %s (--%s) at %s:1 or better', (_, token, needed) => {
    expect(worst(token as string)).toBeGreaterThanOrEqual(needed as number);
  });
});

describe('map focus rings', () => {
  it('use --accent-text, not the 40% --ring, which is too faint on either theme', () => {
    for (const source of [canvasSource, frameSource]) {
      expect(source).not.toMatch(/(stroke|outline)-ring\b/);
    }
  });
});
