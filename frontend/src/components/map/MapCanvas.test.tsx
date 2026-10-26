// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tree } from '@/lib/map/testTree';
import { FixedSizeObserver, observedSize } from '@/test/resizeObserver';
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
  observedSize();
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

describe('MapCanvas cards', () => {
  it('offer to make someone else the centre', () => {
    renderMap();
    expect(screen.getByRole('link', { name: 'Make Alan the centre' })).toHaveAttribute('href', '/map?root=Alan');
  });

  it("don't offer it on the root's own card", () => {
    renderMap();
    expect(screen.getByRole('link', { name: 'Open Robin' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Make Robin the centre' })).not.toBeInTheDocument();
  });
});

describe('MapCanvas chips', () => {
  // Alan's frame draws his parent Gus; his wife Beth and son Robin are drawn in Robin's
  // frame, so here they're chips.
  const withGus = tree(['Robin', 'Alan', 'Beth', 'Sam', 'Gus'], [
    ['Alan', 'SPOUSE', 'Beth'],
    ['Alan', 'PARENT', 'Robin'],
    ['Beth', 'PARENT', 'Robin'],
    ['Robin', 'SPOUSE', 'Sam'],
    ['Gus', 'PARENT', 'Alan'],
  ]);
  const everyone = new Map(withGus.people.map((p) => [p.id, p]));
  const renderAtAlan = (onFocusChange = vi.fn()) => {
    render(
      <MemoryRouter>
        <MapCanvas
          graph={withGus}
          rootId="Robin"
          people={everyone}
          initialFocus="Alan"
          onFocusChange={onFocusChange}
          className="h-96"
        />
      </MemoryRouter>,
    );
    return onFocusChange;
  };

  it('shows people drawn in another frame as buttons that say where they are', () => {
    renderAtAlan();
    expect(screen.getByRole('button', { name: "Beth, spouse, drawn in Robin's family" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Robin, child, at the centre of the map' })).toBeInTheDocument();
  });

  it('says at card size where the person is drawn', () => {
    observedSize({ width: 1600, height: 1000 }); // big enough for cards in Alan's frame
    renderAtAlan();
    const chip = screen.getByRole('button', { name: "Beth, spouse, drawn in Robin's family" });
    expect(within(chip).getByText("In Robin's family")).toBeInTheDocument();
    const root = screen.getByRole('button', { name: 'Robin, child, at the centre of the map' });
    expect(within(root).getByText('At the centre')).toBeInTheDocument();
  });

  it('has no Open or Centre links of its own', () => {
    renderAtAlan();
    const chip = screen.getByRole('button', { name: "Beth, spouse, drawn in Robin's family" });
    expect(within(chip).queryAllByRole('link')).toEqual([]);
  });

  it('takes the camera to where the person is drawn when clicked', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const onFocusChange = renderAtAlan();
    expect(onFocusChange).toHaveBeenLastCalledWith(['Robin', 'Alan']);
    fireEvent.click(screen.getByRole('button', { name: "Beth, spouse, drawn in Robin's family" }));
    expect(onFocusChange).toHaveBeenLastCalledWith(['Robin']);
  });

  it('does the same on Enter', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const onFocusChange = renderAtAlan();
    fireEvent.keyDown(screen.getByRole('button', { name: "Beth, spouse, drawn in Robin's family" }), { key: 'Enter' });
    expect(onFocusChange).toHaveBeenLastCalledWith(['Robin']);
  });
});
