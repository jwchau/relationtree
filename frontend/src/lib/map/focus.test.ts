import { describe, expect, it } from 'vitest';
import { fitTransform, MAX_ZOOM, MIN_ZOOM, zoomRange, type Transform } from './camera';
import {
  anchoredTransform,
  cameraForFocus,
  focusedFrame,
  focusFromParam,
  focusParam,
  focusZoomRange,
  framePath,
  frameToRoot,
} from './focus';
import { SLOT_H } from './frameLayout';
import { frameLayouts } from './frames';
import { assignOwnership } from './ownership';
import { tree, type Link } from './testTree';

// Root R, then its ancestors P1 (R's parent), P2 (P1's parent) ... P7. Each Pi also has a
// sibling Ui, so every Pi from P1 to P6 owns someone and has a frame: P5's frame is five
// levels below R's. R also has a childless sibling B, who has no frame of their own.
const chain = (() => {
  const names = ['R', 'B'];
  const links: Link[] = [['P1', 'PARENT', 'R'], ['P1', 'PARENT', 'B']];
  for (let i = 1; i <= 6; i++) {
    names.push(`P${i}`, `U${i}`);
    links.push([`P${i + 1}`, 'PARENT', `P${i}`], [`P${i + 1}`, 'PARENT', `U${i}`]);
  }
  names.push('P7');
  return tree(names, links);
})();
const ownership = assignOwnership(chain, 'R');
const layoutOf = frameLayouts(chain, 'R');

describe('framePath', () => {
  it('goes from the root out to the frame of the person asked for', () => {
    expect(framePath(ownership, layoutOf, 'R')).toEqual(['R']);
    expect(framePath(ownership, layoutOf, 'P3')).toEqual(['R', 'P1', 'P2', 'P3']);
  });

  it("ends at the owner's frame for someone with no frame of their own", () => {
    expect(framePath(ownership, layoutOf, 'B')).toEqual(['R']);
    expect(framePath(ownership, layoutOf, 'U2')).toEqual(['R', 'P1', 'P2']);
  });
});

/** The centre of a person's slot box in a frame's units. */
function slotCentre(frameId: string, personId: string): [number, number] {
  const slot = layoutOf(frameId)!.slots.find((s) => s.id === personId)!;
  return [slot.x, slot.y - 4 + SLOT_H / 2];
}

describe('frameToRoot', () => {
  it("maps a nested frame's centre onto the centre of its slot, through every level", () => {
    const m = frameToRoot(['R', 'P1', 'P2'], layoutOf);
    const b = layoutOf('P2')!.bounds;
    const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];

    // P2's frame sits centred in P2's slot in P1's frame, which sits centred in P1's slot.
    const inP1 = slotCentre('P1', 'P2');
    const p1 = frameToRoot(['R', 'P1'], layoutOf);
    const expected = [inP1[0] * p1.scale + p1.x, inP1[1] * p1.scale + p1.y];

    expect(x * m.scale + m.x).toBeCloseTo(expected[0], 9);
    expect(y * m.scale + m.y).toBeCloseTo(expected[1], 9);
    const [rx, ry] = slotCentre('R', 'P1');
    const pb = layoutOf('P1')!.bounds;
    expect((pb.x + pb.width / 2) * p1.scale + p1.x).toBeCloseTo(rx, 9);
    expect((pb.y + pb.height / 2) * p1.scale + p1.y).toBeCloseTo(ry, 9);
  });

  it('is the identity for the root frame', () => {
    expect(frameToRoot(['R'], layoutOf)).toEqual({ x: 0, y: 0, scale: 1 });
  });
});

const viewport = { width: 400, height: 800 };
const PATH_TO_P5 = ['R', 'P1', 'P2', 'P3', 'P4', 'P5'];

describe('anchoredTransform', () => {
  it('draws a frame five levels down with numbers near 1 while the root camera is far beyond', () => {
    const m = frameToRoot(PATH_TO_P5, layoutOf);
    const bounds = layoutOf('P5')!.bounds;
    const rootT = cameraForFocus(PATH_TO_P5, layoutOf, viewport);

    const anchored = anchoredTransform(rootT, m);

    const fit = fitTransform(viewport, bounds);
    expect(anchored.k).toBeCloseTo(fit.k, 6);
    expect(anchored.x).toBeCloseTo(fit.x, 6);
    expect(anchored.y).toBeCloseTo(fit.y, 6);
    expect(anchored.k).toBeGreaterThan(0.1);
    expect(anchored.k).toBeLessThan(10);
    // Five levels of nesting: the root camera is hundreds of times larger than what's drawn.
    expect(rootT.k / anchored.k).toBeGreaterThan(100);
  });
});

/** The root camera fitted on a person's frame. */
const fittedOn = (path: string[]) =>
  cameraForFocus(path, layoutOf, viewport);

/** The same camera zoomed by `factor` about the middle of the screen. */
const zoomedBy = (t: Transform, factor: number): Transform => {
  const [cx, cy] = [viewport.width / 2, viewport.height / 2];
  return { k: t.k * factor, x: cx - (cx - t.x) * factor, y: cy - (cy - t.y) * factor };
};

describe('focusedFrame', () => {
  it('is the root at fit', () => {
    expect(focusedFrame(fittedOn(['R']), viewport, 'R', layoutOf)).toEqual(['R']);
  });

  it('is the frame the camera is fitted on, three levels down', () => {
    const path = ['R', 'P1', 'P2', 'P3'];
    expect(focusedFrame(fittedOn(path), viewport, 'R', layoutOf)).toEqual(path);
  });

  it('moves out to the parent once the frame covers less than half the screen', () => {
    const t = zoomedBy(fittedOn(['R', 'P1', 'P2', 'P3']), 0.4);
    expect(focusedFrame(t, viewport, 'R', layoutOf)).toEqual(['R', 'P1', 'P2']);
  });

  it('round-trips every frame six generations out: fit on it, and it is the focus', () => {
    const full = ['R', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
    for (let depth = 1; depth <= full.length; depth++) {
      const path = full.slice(0, depth);
      const camera = fittedOn(path);
      expect(focusedFrame(camera, viewport, 'R', layoutOf)).toEqual(path);
      const anchored = anchoredTransform(camera, frameToRoot(path, layoutOf));
      expect(anchored.k).toBeCloseTo(fitTransform(viewport, layoutOf(path[depth - 1])!.bounds).k, 6);
    }
  });

  it('picks the frame under the middle of the screen when two open frames sit side by side', () => {
    // R's parents P and Q both have parents of their own, so both slots open into frames.
    const twoSides = tree(
      ['R', 'P', 'Q', 'PP', 'QQ'],
      [['P', 'PARENT', 'R'], ['Q', 'PARENT', 'R'], ['PP', 'PARENT', 'P'], ['QQ', 'PARENT', 'Q']],
    );
    const layouts = frameLayouts(twoSides, 'R');
    const camera = cameraForFocus(['R', 'Q'], layouts, viewport);
    expect(focusedFrame(camera, viewport, 'R', layouts)).toEqual(['R', 'Q']);
  });

  it.each([
    ['portrait', { width: 360, height: 640 }],
    ['landscape', { width: 640, height: 360 }],
  ])('opens and focuses the frame it was sent to on a %s phone', (_, phone) => {
    // Fitting alone leaves this frame's slot under the 360px it needs to open in landscape,
    // so the camera zooms in just far enough to open it.
    const path = ['R', 'P1', 'P2'];
    expect(focusedFrame(cameraForFocus(path, layoutOf, phone), phone, 'R', layoutOf)).toEqual(path);
  });

  it('opens and focuses the frame it was sent to at any screen size', () => {
    const failures: string[] = [];
    for (let w = 280; w <= 1400; w += 7) {
      for (const viewport of [{ width: w, height: Math.round(w * 1.8) }, { width: Math.round(w * 1.8), height: w }]) {
        for (const path of [['R', 'P1'], ['R', 'P1', 'P2'], PATH_TO_P5]) {
          const got = focusedFrame(cameraForFocus(path, layoutOf, viewport), viewport, 'R', layoutOf);
          if (got.join() !== path.join()) failures.push(`${viewport.width}x${viewport.height} ${path.at(-1)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("doesn't focus a frame whose slot is still drawn as a card", () => {
    // A plain fit on P2 on a landscape phone leaves P2's slot at 333px, under the 360px it
    // needs to open, so P2 shows as a card and the focus stays with P1.
    const phone = { width: 640, height: 360 };
    const m = frameToRoot(['R', 'P1', 'P2'], layoutOf);
    const fit = fitTransform(phone, layoutOf('P2')!.bounds);
    const k = fit.k / m.scale;
    const plainFit = { k, x: fit.x - m.x * k, y: fit.y - m.y * k };
    expect(focusedFrame(plainFit, phone, 'R', layoutOf)).toEqual(['R', 'P1']);
  });

  it('zooms in five levels and back out to exactly where it started', () => {
    // Zoom about the point on screen where P5's frame is, as a pinch over it would.
    const start = fittedOn(['R']);
    const target = frameToRoot(PATH_TO_P5, layoutOf);
    const b = layoutOf('P5')!.bounds;
    const world = [(b.x + b.width / 2) * target.scale + target.x, (b.y + b.height / 2) * target.scale + target.y];
    const zoomAbout = (t: Transform, factor: number): Transform => {
      const [sx, sy] = [world[0] * t.k + t.x, world[1] * t.k + t.y];
      return { k: t.k * factor, x: sx - (sx - t.x) * factor, y: sy - (sy - t.y) * factor };
    };

    let t = start;
    const depths: number[] = [];
    let steps = 0;
    while (focusedFrame(t, viewport, 'R', layoutOf).length < PATH_TO_P5.length && steps < 500) {
      t = zoomAbout(t, 1.1);
      steps++;
      depths.push(focusedFrame(t, viewport, 'R', layoutOf).length);
    }
    expect(focusedFrame(t, viewport, 'R', layoutOf)).toEqual(PATH_TO_P5);
    // The focus moved one level at a time, never skipping or going back.
    expect(depths).toEqual([...depths].sort((x, y) => x - y));
    expect(new Set(depths)).toEqual(new Set([1, 2, 3, 4, 5, 6]));

    for (let i = 0; i < steps; i++) t = zoomAbout(t, 1 / 1.1);
    expect(t.k).toBeCloseTo(start.k, 9);
    expect(t.x).toBeCloseTo(start.x, 6);
    expect(t.y).toBeCloseTo(start.y, 6);
    expect(focusedFrame(t, viewport, 'R', layoutOf)).toEqual(['R']);
  });
});

describe('the focus in the URL', () => {
  it('reads a focus into the path of frames to open', () => {
    expect(focusFromParam('P3', ownership, layoutOf)).toEqual(['R', 'P1', 'P2', 'P3']);
  });

  it("falls back to the owner's frame for someone with no frame, and to the root for anyone else", () => {
    expect(focusFromParam('U2', ownership, layoutOf)).toEqual(['R', 'P1', 'P2']);
    expect(focusFromParam('not-in-this-tree', ownership, layoutOf)).toEqual(['R']);
    expect(focusFromParam(null, ownership, layoutOf)).toEqual(['R']);
  });

  it('leaves the focus out of the URL at the root, and names the frame otherwise', () => {
    expect(focusParam(['R'])).toBeNull();
    expect(focusParam(['R', 'P1', 'P2'])).toBe('P2');
  });
});

describe('focusZoomRange', () => {
  it("lets you zoom to 16x the focused frame's fit, and out to half the root's", () => {
    const path = ['R', 'P1', 'P2', 'P3'];
    const [min, max] = focusZoomRange(path, layoutOf, viewport);
    const p3Fit = fitTransform(viewport, layoutOf('P3')!.bounds).k / frameToRoot(path, layoutOf).scale;
    expect(max).toBeCloseTo(p3Fit * MAX_ZOOM, 6);
    expect(min).toBeCloseTo(fitTransform(viewport, layoutOf('R')!.bounds).k * MIN_ZOOM, 9);
  });

  it('is the root frame\'s range at the root', () => {
    expect(focusZoomRange(['R'], layoutOf, viewport)).toEqual(zoomRange(viewport, layoutOf('R')!.bounds));
  });
});
