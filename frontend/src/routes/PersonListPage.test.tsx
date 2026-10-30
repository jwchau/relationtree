// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Person, Tree } from '@/api/client';
import { CurrentTreeContext } from '@/hooks/useCurrentTree';
import PersonListPage from './PersonListPage';

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    tree_id: 'ash',
    name: id,
    relationship_category: null,
    context: '',
    phone: '',
    email: '',
    address: '',
    birthday: null,
    photo_url: null,
    photo_original_url: null,
    notes: '',
    last_contacted_date: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    is_me: false,
    ...overrides,
  };
}

const ashTree: Tree = { id: 'ash', name: 'Ash family', role: 'viewer', member_count: 1 } as Tree;
const listState = vi.hoisted(() => ({ people: [] as Person[] }));

vi.mock('@/hooks/usePersonList', () => ({
  usePersonList: () => ({ people: listState.people, loading: false, error: null }),
}));
// The question box has its own hooks and tests; it isn't part of the list.
vi.mock('@/components/person/AskPeople', () => ({ AskPeople: () => null }));

beforeEach(() => {
  localStorage.clear();
  // Radix Select needs these, which jsdom doesn't have.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <CurrentTreeContext.Provider
      value={{ tree: ashTree, trees: [ashTree], loading: false, error: null, select: vi.fn() }}
    >
      <MemoryRouter>
        <PersonListPage />
      </MemoryRouter>
    </CurrentTreeContext.Provider>,
  );
}

function rosterNames() {
  return screen.getAllByRole('link').map((link) => link.textContent);
}

function chooseSort(label: string) {
  const trigger = screen.getByRole('combobox', { name: 'Sort' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: label }));
}

describe('PersonListPage sorting', () => {
  it('sorts by name A–Z when no sort has been picked', () => {
    listState.people = [
      person('Carol', { last_contacted_date: '2026-01-01' }),
      person('Alice', { last_contacted_date: '2026-06-01' }),
      person('Bob', { last_contacted_date: '2026-03-01' }),
    ];
    renderPage();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Name A–Z');
    expect(rosterNames()).toEqual([
      expect.stringContaining('Alice'),
      expect.stringContaining('Bob'),
      expect.stringContaining('Carol'),
    ]);
  });

  it('reorders the roster when you pick another sort', () => {
    listState.people = [
      person('Carol', { last_contacted_date: '2026-01-01' }),
      person('Alice', { last_contacted_date: '2026-06-01' }),
      person('Bob', { last_contacted_date: '2026-03-01' }),
    ];
    renderPage();

    chooseSort('Longest since contact');

    expect(rosterNames()).toEqual([
      expect.stringContaining('Carol'),
      expect.stringContaining('Bob'),
      expect.stringContaining('Alice'),
    ]);
  });

  it('goes back to page 1 when the sort changes', () => {
    listState.people = Array.from({ length: 12 }, (_, i) => person(`Person ${i + 1}`));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('navigation', { name: 'People pages' })).toHaveTextContent('Page 2 of 2');

    chooseSort('Name Z–A');

    expect(screen.getByRole('navigation', { name: 'People pages' })).toHaveTextContent('Page 1 of 2');
  });

  it('remembers the sort you picked the next time the page opens', () => {
    listState.people = [person('Alice'), person('Bob')];
    const { unmount } = renderPage();
    chooseSort('Name Z–A');
    unmount();

    renderPage();

    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Name Z–A');
    expect(rosterNames()).toEqual([expect.stringContaining('Bob'), expect.stringContaining('Alice')]);
  });

  it('uses the default sort when the remembered one is unknown', () => {
    localStorage.setItem('relationtree.personSort', 'shoe-size');
    listState.people = [person('Bob')];
    renderPage();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Name A–Z');
  });
});
