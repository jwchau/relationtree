// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tree } from '@/api/client';
import { CurrentTreeContext } from '@/hooks/useCurrentTree';
import { tree } from '@/lib/map/testTree';
import { FixedSizeObserver } from '@/test/resizeObserver';
import MapPage from './MapPage';

const graph = tree(['Robin', 'Alan', 'Beth', 'Sam', 'Gus'], [
  ['Alan', 'PARENT', 'Robin'],
  ['Beth', 'PARENT', 'Robin'],
  ['Robin', 'SPOUSE', 'Sam'],
  ['Gus', 'PARENT', 'Alan'],
]);
const ashTree = { id: 'ash', name: 'Ash family', role: 'owner', member_count: 1 } as Tree;

vi.mock('@/hooks/useTreeGraph', () => ({
  useTreeGraph: () => ({ graph, loading: false, error: null }),
}));
vi.mock('@/hooks/usePerson', () => ({
  useSetMe: () => ({ mutate: vi.fn(), isPending: false }),
}));

let reducedMotion = false;
beforeEach(() => {
  reducedMotion = false;
  vi.stubGlobal('ResizeObserver', FixedSizeObserver);
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderMapPage(url: string) {
  const router = createMemoryRouter([{ path: '/map', element: <MapPage /> }], { initialEntries: [url] });
  render(
    <CurrentTreeContext.Provider
      value={{ tree: ashTree, trees: [ashTree], loading: false, error: null, select: vi.fn() }}
    >
      <RouterProvider router={router} />
    </CurrentTreeContext.Provider>,
  );
  const url_ = () => router.state.location.pathname + router.state.location.search;
  return { router, url: url_ };
}

/** The canvas you can use: during a cross-fade the leaving one is inert. */
const liveMap = () => screen.getAllByLabelText('Family map').find((svg) => !svg.closest('[inert]'))!;

describe('MapPage Make centre', () => {
  it('rebuilds the map around the person and puts them in the URL', () => {
    reducedMotion = true;
    const { url } = renderMapPage('/map?root=Robin');
    fireEvent.click(screen.getByRole('link', { name: 'Make Beth the centre' }));
    expect(url()).toBe('/map?root=Beth');
    expect(within(liveMap()).getByRole('group', { name: 'Family of Beth' })).toBeInTheDocument();
  });

  it('goes back to the previous root and its focus', async () => {
    reducedMotion = true;
    const { router, url } = renderMapPage('/map?root=Robin&focus=Alan');
    expect(within(liveMap().parentElement!).getByRole('navigation')).toHaveTextContent('Alan');
    fireEvent.click(screen.getByRole('link', { name: 'Make Gus the centre' }));
    expect(url()).toBe('/map?root=Gus');
    await act(() => router.navigate(-1));
    expect(url()).toBe('/map?root=Robin&focus=Alan');
    const crumbs = within(liveMap().parentElement!).getByRole('navigation', { name: 'Frames above this one' });
    expect(within(crumbs).getByText('Alan')).toHaveAttribute('aria-current', 'location');
  });

  it('cross-fades: the old map stays, inert, under the new one until the fade ends', () => {
    vi.useFakeTimers();
    renderMapPage('/map?root=Robin');
    fireEvent.click(screen.getByRole('link', { name: 'Make Beth the centre' }));
    const maps = screen.getAllByLabelText('Family map');
    expect(maps).toHaveLength(2);
    expect(within(maps[0]).getByRole('group', { name: 'Family of Robin' }).closest('[inert]')).not.toBeNull();
    expect(within(liveMap()).getByRole('group', { name: 'Family of Beth' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getAllByLabelText('Family map')).toHaveLength(1);
  });
});
