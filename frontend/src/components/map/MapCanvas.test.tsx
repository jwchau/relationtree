// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tree } from '@/lib/map/testTree';
import { FixedSizeObserver } from '@/test/resizeObserver';
import { MapCanvas } from './MapCanvas';

const graph = tree(['Robin', 'Alan', 'Beth', 'Sam'], [
  ['Alan', 'PARENT', 'Robin'],
  ['Beth', 'PARENT', 'Robin'],
  ['Robin', 'SPOUSE', 'Sam'],
]);
const people = new Map(graph.people.map((p) => [p.id, p]));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FixedSizeObserver);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderMap(props: Partial<Parameters<typeof MapCanvas>[0]> = {}) {
  render(
    <MemoryRouter>
      <MapCanvas graph={graph} rootId="Robin" people={people} className="h-96" {...props} />
    </MemoryRouter>,
  );
  return screen.getByLabelText('Family map');
}

/** Fires a wheel event and says whether the map took it (d3-zoom cancels what it handles). */
function wheel(target: Element, init: WheelEventInit = {}) {
  const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

describe('MapCanvas embedded in a page', () => {
  it('leaves a plain wheel to the page and says how to zoom', () => {
    const map = renderMap({ embedded: true });
    expect(wheel(map)).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('Use Ctrl + scroll to zoom the map');
  });

  it('says ⌘ on a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const map = renderMap({ embedded: true });
    wheel(map);
    expect(screen.getByRole('status')).toHaveTextContent('Use ⌘ + scroll to zoom the map');
  });

  it('zooms on ctrl + wheel without a hint', () => {
    const map = renderMap({ embedded: true });
    expect(wheel(map, { ctrlKey: true })).toBe(true);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('suggests two fingers when one finger swipes across it', () => {
    const map = renderMap({ embedded: true });
    fireEvent.touchMove(map, { touches: [{ identifier: 1, clientX: 10, clientY: 10 }] });
    expect(screen.getByRole('status')).toHaveTextContent('Use two fingers to move the map');
  });

  it('takes the hint down after a moment', () => {
    vi.useFakeTimers();
    const map = renderMap({ embedded: true });
    wheel(map);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    vi.useRealTimers();
  });

  it('lets the page scroll past it on touch', () => {
    expect(renderMap({ embedded: true })).toHaveClass('touch-pan-x', 'touch-pan-y');
  });
});

describe('MapCanvas on its own page', () => {
  it('zooms on a plain wheel, with no hint', () => {
    const map = renderMap();
    expect(wheel(map)).toBe(true);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('takes every touch', () => {
    expect(renderMap()).toHaveClass('touch-none');
  });
});
