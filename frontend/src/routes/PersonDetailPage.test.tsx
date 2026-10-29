// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Person, Tree, TreeGraph } from '@/api/client';
import { CurrentTreeContext } from '@/hooks/useCurrentTree';
import { tree } from '@/lib/map/testTree';
import { FixedSizeObserver } from '@/test/resizeObserver';
import PersonDetailPage from './PersonDetailPage';

const graph = tree(['Robin', 'Alan', 'Beth', 'Sam'], [
  ['Alan', 'PARENT', 'Robin'],
  ['Beth', 'PARENT', 'Robin'],
  ['Robin', 'SPOUSE', 'Sam'],
]);
const robin: Person = {
  id: 'Robin',
  tree_id: 'ash',
  name: 'Robin',
  relationship_category: null,
  context: '',
  phone: '',
  email: '',
  address: '',
  birthday: null,
  photo_url: null,
  notes: '',
  last_contacted_date: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  is_me: false,
};
const ashTree: Tree = { id: 'ash', name: 'Ash family', role: 'owner', member_count: 1 } as Tree;

const graphState = vi.hoisted(() => ({
  current: { graph: null as TreeGraph | null, loading: false, error: null as string | null },
  treeIds: [] as (string | undefined)[],
}));

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
vi.mock('@/hooks/usePerson', () => ({
  usePerson: () => ({ person: robin, loading: false, error: null }),
  useUpdatePerson: () => mutation,
  useDeletePerson: () => mutation,
  useSetMe: () => mutation,
  useCreatePerson: () => mutation,
  useUploadPhoto: () => mutation,
  useRemovePhoto: () => mutation,
}));
vi.mock('@/hooks/useConnections', () => ({
  useConnections: () => ({ connections: [], loading: false, error: null }),
  useCreateConnection: () => mutation,
  useDeleteConnection: () => mutation,
}));
vi.mock('@/hooks/usePersonList', () => ({
  peopleQueryKey: ['people'],
  usePersonList: () => ({ people: [], loading: false, error: null }),
}));
vi.mock('@/hooks/useSummary', () => ({
  useSummary: () => ({ text: '', status: 'idle', error: null, generate: vi.fn() }),
}));
vi.mock('@/hooks/useTreeGraph', () => ({
  useTreeGraph: (treeId: string | undefined) => {
    graphState.treeIds.push(treeId);
    return graphState.current;
  },
}));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FixedSizeObserver);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  graphState.current = { graph, loading: false, error: null };
  graphState.treeIds = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname + location.search}</output>;
}

function renderPage(url = '/people/Robin') {
  render(
    <CurrentTreeContext.Provider
      value={{ tree: ashTree, trees: [ashTree], loading: false, error: null, select: vi.fn() }}
    >
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/people/:personId" element={<PersonDetailPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </CurrentTreeContext.Provider>,
  );
}

const mapSection = () => screen.getByRole('region', { name: 'Map' });

describe('PersonDetailPage map', () => {
  it("shows the person's tree on a map centred on them", () => {
    renderPage();
    const map = within(mapSection()).getByLabelText('Family map');
    expect(within(map).getByRole('group', { name: 'Family of Robin' })).toBeInTheDocument();
    expect(graphState.treeIds).toContain('ash');
  });

  it('links to the full map centred on them', () => {
    renderPage();
    expect(within(mapSection()).getByRole('link', { name: 'Open full map' })).toHaveAttribute(
      'href',
      '/map?root=Robin',
    );
  });

  it('shows a placeholder while the tree loads', () => {
    graphState.current = { graph: null, loading: true, error: null };
    renderPage();
    expect(within(mapSection()).getByLabelText('Loading the map')).toHaveAttribute('aria-busy', 'true');
  });

  it("says why when the tree can't load", () => {
    graphState.current = { graph: null, loading: false, error: 'Server unavailable' };
    renderPage();
    expect(within(mapSection()).getByText('Server unavailable')).toBeInTheDocument();
  });

  it('leaves plain scrolling to the page', () => {
    renderPage();
    const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    act(() => {
      within(mapSection()).getByLabelText('Family map').dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(within(mapSection()).getByRole('status')).toHaveTextContent('scroll to zoom the map');
  });

  it("keeps the map's focus out of the page's URL", () => {
    renderPage();
    expect(screen.getByLabelText('location')).toHaveTextContent(/^\/people\/Robin$/);
  });
});

describe('PersonDetailPage ?connect=1', () => {
  it('opens Add connection on arrival, once, and clears the param', () => {
    renderPage('/people/Robin?connect=1');
    expect(screen.getByRole('dialog', { name: 'Add connection' })).toBeInTheDocument();
    expect(screen.getByLabelText('location')).toHaveTextContent(/^\/people\/Robin$/);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('leaves the dialog closed without it', () => {
    renderPage();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('PersonDetailPage details form', () => {
  it("shows no category when the person doesn't have one", () => {
    renderPage();
    const category = screen.getByRole('combobox', { name: 'Category' });
    expect(category).toHaveTextContent('No category');
    expect(category).not.toHaveTextContent('Friend');
  });
});
