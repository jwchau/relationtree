import { describe, expect, it } from 'vitest';
import { clampTransform, FIT_PADDING, fitTransform, MAX_ZOOM, MIN_ZOOM, MIN_VISIBLE, PAN_MARGIN, panToShow, type Bounds, type Transform } from './camera';

const toScreen = (t: Transform, x: number, y: number) => [x * t.k + t.x, y * t.k + t.y];

describe('fitTransform', () => {
  it.each([
    ['a wide frame on a tall phone', { x: -100, y: 0, width: 1000, height: 500 }, { width: 400, height: 800 }],
    ['a tall frame on a wide desktop', { x: 0, y: -50, width: 300, height: 600 }, { width: 1200, height: 700 }],
  ])('centres %s and scales it to fit inside the padding', (_, bounds: Bounds, viewport) => {
    const t = fitTransform(viewport, bounds);

    const [left, top] = toScreen(t, bounds.x, bounds.y);
    const [right, bottom] = toScreen(t, bounds.x + bounds.width, bounds.y + bounds.height);
    // Centred on both axes.
    expect(left + right).toBeCloseTo(viewport.width);
    expect(top + bottom).toBeCloseTo(viewport.height);
    // Touching the padding on the tighter axis, inside it on the other.
    const slackX = left - FIT_PADDING;
    const slackY = top - FIT_PADDING;
    expect(Math.min(slackX, slackY)).toBeCloseTo(0);
    expect(Math.max(slackX, slackY)).toBeGreaterThan(0);
  });
});

describe('clampTransform', () => {
  const viewport = { width: 400, height: 800 };
  const bounds = { x: 0, y: 0, width: 1000, height: 500 };
  const fit = fitTransform(viewport, bounds);

  it('leaves a transform that is in range alone', () => {
    const t = { x: fit.x + 30, y: fit.y - 50, k: fit.k * 3 };
    expect(clampTransform(t, viewport, bounds)).toEqual(t);
  });

  const FAR = 100_000;
  it.each([
    ['left', { dx: -FAR, dy: 0 }, (r: number[]) => r[2], MIN_VISIBLE],
    ['right', { dx: FAR, dy: 0 }, (r: number[]) => r[0], viewport.width - MIN_VISIBLE],
    ['top', { dx: 0, dy: -FAR }, (r: number[]) => r[3], MIN_VISIBLE],
    ['bottom', { dx: 0, dy: FAR }, (r: number[]) => r[1], viewport.height - MIN_VISIBLE],
  ])('keeps MIN_VISIBLE px of the frame on screen when it is dragged off the %s', (_, d, edge, expected) => {
    const t = clampTransform({ x: fit.x + d.dx, y: fit.y + d.dy, k: fit.k }, viewport, bounds);
    const [left, top] = toScreen(t, bounds.x, bounds.y);
    const [right, bottom] = toScreen(t, bounds.x + bounds.width, bounds.y + bounds.height);
    expect(edge([left, top, right, bottom])).toBeCloseTo(expected);
    expect(t.k).toBe(fit.k);
  });

  it.each([
    ['in', 100, MAX_ZOOM],
    ['out', 0.01, MIN_ZOOM],
  ])('stops zooming %s at the limit, keeping the middle of the screen still', (_, factor, limit) => {
    const middle = { x: viewport.width / 2, y: viewport.height / 2 };
    const worldAt = (t: Transform) => [(middle.x - t.x) / t.k, (middle.y - t.y) / t.k];
    const k = fit.k * factor;
    const tooFar = {
      k,
      x: middle.x - (middle.x - fit.x) * factor,
      y: middle.y - (middle.y - fit.y) * factor,
    };

    const t = clampTransform(tooFar, viewport, bounds);

    expect(t.k).toBeCloseTo(fit.k * limit);
    const [wx, wy] = worldAt(t);
    const [fx, fy] = worldAt(fit);
    expect(wx).toBeCloseTo(fx);
    expect(wy).toBeCloseTo(fy);
  });

  it('uses the zoom range it is given, for deep zoom past the root frame', () => {
    const range: [number, number] = [fit.k / 2, fit.k * 1000];
    const deep = { k: fit.k * 500, x: fit.x, y: fit.y };
    expect(clampTransform(deep, viewport, bounds, range).k).toBe(fit.k * 500);
  });
});

describe('panToShow', () => {
  const viewport = { width: 400, height: 800 };
  const box = (left: number, top: number, width = 100, height = 100) => ({ left, top, right: left + width, bottom: top + height });

  it("doesn't move for something already on screen", () => {
    expect(panToShow(box(100, 300), viewport)).toEqual({ dx: 0, dy: 0 });
  });

  it('brings something past an edge just inside the margin', () => {
    expect(panToShow(box(350, 300), viewport)).toEqual({ dx: -(450 - (400 - PAN_MARGIN)), dy: 0 });
    expect(panToShow(box(-60, 300), viewport)).toEqual({ dx: 60 + PAN_MARGIN, dy: 0 });
    expect(panToShow(box(100, 760), viewport)).toEqual({ dx: 0, dy: -(860 - (800 - PAN_MARGIN)) });
    expect(panToShow(box(100, -30), viewport)).toEqual({ dx: 0, dy: 30 + PAN_MARGIN });
  });

  it('lines up the top left of something bigger than the view', () => {
    expect(panToShow(box(-50, 300, 600, 100), viewport)).toEqual({ dx: 50 + PAN_MARGIN, dy: 0 });
  });
});
