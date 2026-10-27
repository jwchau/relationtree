// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DETAIL_THRESHOLDS } from '@/lib/map/detail';
import { SLOT_W } from '@/lib/map/frameLayout';
import { tree, type Link } from '@/lib/map/testTree';
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

  it('give Open and Centre a hit area at least 44 px each way, even at the smallest card size', () => {
    renderMap();
    // A card is drawn once its slot is DETAIL_THRESHOLDS[2] px wide on screen.
    const smallest = DETAIL_THRESHOLDS[2] / SLOT_W;
    const actions = screen.getAllByRole('link', { name: /^(Open|Make) / });
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      const sizes = Array.from(action.querySelectorAll('rect'), (r) => [
        Number(r.getAttribute('width')) * smallest,
        Number(r.getAttribute('height')) * smallest,
      ]);
      expect(sizes.some(([w, h]) => w >= 44 && h >= 44)).toBe(true);
    }
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

describe('MapCanvas cards for blended families', () => {
  it('say who is a step or adoptive parent or child, or a former partner', () => {
    observedSize({ width: 1600, height: 1000 }); // cards for the whole frame
    const blended = tree(['Robin', 'Alan', 'Beth', 'Sam', 'Kit'], [
      ['Alan', 'PARENT', 'Robin', { parent_kind: 'STEP' }],
      ['Beth', 'PARENT', 'Robin'],
      ['Robin', 'SPOUSE', 'Sam', { ended: true }],
      ['Robin', 'PARENT', 'Kit', { parent_kind: 'ADOPTIVE' }],
    ]);
    render(
      <MemoryRouter>
        <MapCanvas graph={blended} rootId="Robin" people={new Map(blended.people.map((p) => [p.id, p]))} />
      </MemoryRouter>,
    );
    const card = (name: string) => screen.getByRole('group', { name });
    expect(within(card('Alan, parent')).getByText('Step-parent')).toBeInTheDocument();
    expect(within(card('Beth, parent')).queryByText(/parent/)).not.toBeInTheDocument();
    expect(within(card('Sam, former partner')).getByText('Former partner')).toBeInTheDocument();
    expect(within(card('Kit, child')).getByText('Adopted child')).toBeInTheDocument();
    // The former couple's bar is the only dashed line in the frame.
    expect(document.querySelectorAll('line[stroke-dasharray]')).toHaveLength(1);
  });
});

describe('MapCanvas half-siblings', () => {
  it("labels a half-sibling, and shows their other parent as a chip", () => {
    observedSize({ width: 1600, height: 1000 }); // cards for the whole frame
    const graph = tree(
      ['Robin', 'Alan', 'Beth', 'Otto', 'Hana'],
      [
        ['Alan', 'PARENT', 'Robin'],
        ['Beth', 'PARENT', 'Robin'],
        ['Beth', 'PARENT', 'Hana'],
        ['Otto', 'PARENT', 'Hana'],
      ],
      { Alan: '1950-01-01', Beth: '1952-01-01', Hana: '1990-01-01' },
    );
    render(
      <MemoryRouter>
        <MapCanvas graph={graph} rootId="Robin" people={new Map(graph.people.map((p) => [p.id, p]))} />
      </MemoryRouter>,
    );
    expect(within(screen.getByRole('group', { name: 'Hana, sibling' })).getByText(/^Half-sibling/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Otto, parent's partner, drawn in Hana's family" })).toBeInTheDocument();
  });
});

describe('MapCanvas ended couples', () => {
  it('draws every ended couple dotted: the parents, a parent and their other partner, and a former partner', () => {
    const graph = tree(
      ['Robin', 'Alan', 'Beth', 'Otto', 'Hana', 'Lee', 'Sam'],
      [
        ['Alan', 'PARENT', 'Robin'],
        ['Beth', 'PARENT', 'Robin'],
        ['Alan', 'SPOUSE', 'Beth', { ended: true }],
        ['Beth', 'PARENT', 'Hana'],
        ['Otto', 'PARENT', 'Hana'],
        ['Beth', 'SPOUSE', 'Otto', { ended: true }],
        ['Robin', 'SPOUSE', 'Lee', { ended: true }],
        ['Robin', 'SPOUSE', 'Sam'],
      ],
      { Alan: '1950-01-01', Beth: '1952-01-01', Hana: '1990-01-01' },
    );
    render(
      <MemoryRouter>
        <MapCanvas graph={graph} rootId="Robin" people={new Map(graph.people.map((p) => [p.id, p]))} />
      </MemoryRouter>,
    );
    const root = screen.getByRole('group', { name: 'Family of Robin' });
    const dotted = root.querySelectorAll(':scope > g line[stroke-dasharray]');
    expect(dotted).toHaveLength(3);
    for (const line of Array.from(dotted)) expect(line).toHaveAttribute('stroke-linecap', 'round');
  });
});

describe('MapCanvas crowded bands', () => {
  const names = Array.from({ length: 60 }, (_, i) => `W${String(i).padStart(2, '0')}`);
  const crowded = tree(['Robin', ...names], names.map((w): Link => ['Robin', 'COWORKER', w]));
  const everyone = new Map(crowded.people.map((p) => [p.id, p]));
  const renderCrowded = (initialFocus: string | null = null, onFocusChange = vi.fn()) => {
    render(
      <MemoryRouter>
        <MapCanvas graph={crowded} rootId="Robin" people={everyone} initialFocus={initialFocus} onFocusChange={onFocusChange} />
      </MemoryRouter>,
    );
    return onFocusChange;
  };

  it('shows a "+N more" tile that takes the camera to the rest', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const onFocusChange = renderCrowded();
    fireEvent.click(screen.getByRole('button', { name: '37 more coworkers' }));
    expect(onFocusChange).toHaveBeenLastCalledWith(['Robin', 'Robin~coworkers']);
  });

  it('names the overflow frame in the breadcrumb and for screen readers', () => {
    renderCrowded('Robin~coworkers');
    expect(screen.getByRole('navigation', { name: 'Frames above this one' })).toHaveTextContent('Coworkers (37 more)');
    expect(screen.getByRole('group', { name: "Robin's coworkers" })).toBeInTheDocument();
  });
});

describe('MapCanvas card sizes while zooming', () => {
  it('caps each card directly, without a zoom variable on the whole canvas', () => {
    observedSize({ width: 1600, height: 1000 });
    const map = renderMap();
    const cards = () => Array.from(map.querySelectorAll<SVGGElement>('[data-card-scale]'));
    expect(cards().length).toBeGreaterThan(0);
    expect(map.style.getPropertyValue('--map-k')).toBe('');
    expect(cards().every((c) => /^scale\(/.test(c.style.transform))).toBe(true);
    // Zoom far in: the cards on screen are now wider than the cap, so they shrink.
    for (let i = 0; i < 6; i++) wheel(map, { ctrlKey: true, deltaY: -100 });
    const scales = cards().map((c) => Number(c.style.transform.match(/scale\((.*)\)/)?.[1]));
    expect(Math.min(...scales)).toBeLessThan(1);
  });
});

describe('MapCanvas by keyboard', () => {
  // Gus is Alan's parent, so Alan has a frame of his own; Sam and Beth don't.
  const family = tree(['Robin', 'Alan', 'Beth', 'Sam', 'Gus'], [
    ['Alan', 'PARENT', 'Robin'],
    ['Beth', 'PARENT', 'Robin'],
    ['Robin', 'SPOUSE', 'Sam'],
    ['Gus', 'PARENT', 'Alan'],
  ], { Alan: '1950-01-01', Beth: '1952-01-01' });
  const everyone = new Map(family.people.map((p) => [p.id, p]));
  const renderFamily = (initialFocus: string | null = null, onFocusChange = vi.fn()) => {
    render(
      <MemoryRouter>
        <MapCanvas
          graph={family}
          rootId="Robin"
          people={everyone}
          initialFocus={initialFocus}
          onFocusChange={onFocusChange}
          className="h-96"
        />
      </MemoryRouter>,
    );
    return onFocusChange;
  };
  /** What Tab reaches inside the map, in order, by accessible name. */
  const tabOrder = () => {
    const map = screen.getByLabelText('Family map');
    return [map, ...Array.from(map.querySelectorAll('[tabindex="0"]'))].map((el) => el.getAttribute('aria-label'));
  };

  it("lets Tab reach only the focused frame's people, in reading order", () => {
    // Cards at this size: someone with a frame of their own (Alan) has a button that zooms
    // in, then Open and Make centre; the rest have only their links.
    renderFamily();
    expect(tabOrder()).toEqual([
      'Family map',
      'Alan, parent',
      'Open Alan',
      'Make Alan the centre',
      'Open Beth',
      'Make Beth the centre',
      'Open Robin',
      'Open Sam',
      'Make Sam the centre',
    ]);
  });

  it('reads top to bottom, though the social bands above the family are laid out last', () => {
    const social = tree(['Robin', 'Sam', 'Kid', 'Fay', 'Wes', 'Al', 'Bo'], [
      ['Robin', 'SPOUSE', 'Sam'],
      ['Robin', 'PARENT', 'Kid'],
      ['Robin', 'FRIEND', 'Fay'],
      ['Robin', 'COWORKER', 'Wes'],
      ['Al', 'PARENT', 'Robin'],
      ['Bo', 'PARENT', 'Robin'],
    ]);
    render(
      <MemoryRouter>
        <MapCanvas graph={social} rootId="Robin" people={new Map(social.people.map((p) => [p.id, p]))} className="h-96" />
      </MemoryRouter>,
    );
    // The coworker band's top row is highest, then the friends', then the family's rows.
    const people = tabOrder()
      .slice(1)
      .map((label) => label!.replace(/^(Open|Make) /, '').replace(/( the centre|, .*)$/, ''));
    expect(people.filter((name, i) => name !== people[i - 1])).toEqual(['Wes', 'Fay', 'Al', 'Bo', 'Robin', 'Sam', 'Kid']);
  });

  it("moves Tab to the new frame's people when the focus moves", () => {
    renderFamily('Alan');
    expect(tabOrder()).toEqual([
      'Family map',
      'Gus, parent',
      'Alan, centre',
      'Robin, child, at the centre of the map',
    ]);
  });

  it.each(['Enter', ' '])("zooms into the frame of a card's person on %j", (key) => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const onFocusChange = renderFamily();
    expect(onFocusChange).toHaveBeenLastCalledWith(['Robin']);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Alan, parent' }), { key });
    expect(onFocusChange).toHaveBeenLastCalledWith(['Robin', 'Alan']);
  });

  it('zooms into the frame of someone drawn smaller than a card, and keeps a link for anyone with no frame', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    // Ed is Gus's parent, so Gus has a frame inside Alan's.
    const deeper = tree(['Robin', 'Alan', 'Gus', 'Ed'], [
      ['Alan', 'PARENT', 'Robin'],
      ['Gus', 'PARENT', 'Alan'],
      ['Ed', 'PARENT', 'Gus'],
    ]);
    const onFocusChange = vi.fn();
    render(
      <MemoryRouter>
        <MapCanvas
          graph={deeper}
          rootId="Robin"
          people={new Map(deeper.people.map((p) => [p.id, p]))}
          initialFocus="Alan"
          onFocusChange={onFocusChange}
          className="h-96"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Alan, centre' })).toHaveAttribute('href', '/people/Alan');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Gus, parent' }), { key: 'Enter' });
    expect(onFocusChange).toHaveBeenLastCalledWith(['Robin', 'Alan', 'Gus']);
  });

  it('zooms out to the parent frame on Escape, and leaves Escape alone at the root', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const onFocusChange = renderFamily('Alan');
    const map = screen.getByLabelText('Family map');
    expect(fireEvent.keyDown(map, { key: 'Escape' })).toBe(false); // handled
    expect(onFocusChange).toHaveBeenLastCalledWith(['Robin']);
    onFocusChange.mockClear();
    expect(fireEvent.keyDown(map, { key: 'Escape' })).toBe(true); // not handled
    expect(onFocusChange).not.toHaveBeenCalled();
  });

  /** The camera as the drawing's transform says it, relative to the anchored frame. */
  const camera = () => {
    const g = screen.getByLabelText('Family map').querySelector(':scope > g')!;
    const [x, y, k] = (g.getAttribute('transform')!.match(/-?\d[\d.]*(?:e-?\d+)?/g) ?? []).map(Number);
    return { x, y, k };
  };

  it('zooms in and out on + and -, about the middle, up to the limits', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    renderFamily();
    const map = screen.getByLabelText('Family map');
    const start = camera();
    fireEvent.keyDown(map, { key: '+' });
    expect(camera().k).toBeCloseTo(start.k * 1.5);
    fireEvent.keyDown(map, { key: '-' });
    expect(camera().k).toBeCloseTo(start.k);
    for (let i = 0; i < 30; i++) fireEvent.keyDown(map, { key: '-' });
    const zoomedOut = camera().k;
    fireEvent.keyDown(map, { key: '-' });
    expect(camera().k).toBe(zoomedOut);
    expect(zoomedOut).toBeGreaterThan(0);
  });

  it('pans by part of the view on the arrow keys', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    renderFamily();
    const map = screen.getByLabelText('Family map');
    fireEvent.keyDown(map, { key: '+' }); // room to pan
    const start = camera();
    fireEvent.keyDown(map, { key: 'ArrowRight' });
    // Looking further right moves the drawing left.
    expect(camera().x).toBeLessThan(start.x);
    fireEvent.keyDown(map, { key: 'ArrowLeft' });
    expect(camera().x).toBeCloseTo(start.x);
    fireEvent.keyDown(map, { key: 'ArrowDown' });
    expect(camera().y).toBeLessThan(start.y);
  });

  it("puts keyboard focus on the new frame's centre after Enter or Escape", () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    renderFamily();
    const alan = screen.getByRole('button', { name: 'Alan, parent' });
    alan.focus();
    fireEvent.keyDown(alan, { key: 'Enter' });
    expect(document.activeElement).toHaveAccessibleName('Alan, centre');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    // Robin's frame is at card size: his card's first stop.
    expect(document.activeElement).toHaveAccessibleName('Open Robin');
  });

  it("names a frame opened inside the focused one by its place there, and zooms into it", () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    observedSize({ width: 1600, height: 1000 });
    const onFocusChange = renderFamily();
    const map = screen.getByLabelText('Family map');
    for (let i = 0; i < 8 && !screen.queryByRole('group', { name: 'Family of Alan' }); i++) {
      fireEvent.keyDown(map, { key: '+' });
    }
    expect(screen.getByRole('group', { name: 'Family of Alan' })).toBeInTheDocument();
    expect(onFocusChange).toHaveBeenLastCalledWith(['Robin']);
    // Alan's own frame is open in his slot; Tab reaches him once, as Robin's parent.
    expect(tabOrder().filter((label) => label?.startsWith('Alan'))).toEqual(['Alan, parent']);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Alan, parent' }), { key: 'Enter' });
    expect(onFocusChange).toHaveBeenLastCalledWith(['Robin', 'Alan']);
  });

  it('tells screen reader users which keys move the map', () => {
    renderFamily();
    expect(screen.getByLabelText('Family map')).toHaveAccessibleDescription(
      'Tab moves through the people in view. Enter zooms into a person, Escape zooms out. Plus and minus zoom, and the arrow keys pan.',
    );
  });
});
