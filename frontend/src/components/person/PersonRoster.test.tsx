// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Person, Tree } from '@/api/client';
import { CurrentTreeContext } from '@/hooks/useCurrentTree';
import { PersonRoster } from './PersonRoster';

const tree = {
  id: 'ash',
  name: 'Ash family',
  role: 'owner',
  member_count: 1,
  category_hues: { FAMILY: 'rose', FRIEND: 'teal', COWORKER: 'blue', ACQUAINTANCE: 'green', OTHER: 'none' },
} as Tree;

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

function renderRoster(people: Person[]) {
  render(
    <CurrentTreeContext.Provider value={{ tree, trees: [tree], loading: false, error: null, select: vi.fn() }}>
      <MemoryRouter>
        <PersonRoster people={people} label="People" />
      </MemoryRouter>
    </CurrentTreeContext.Provider>,
  );
}

describe('PersonRoster hues', () => {
  it("colours each row by the tree's hue for its category, and leaves the rest plain", () => {
    renderRoster([
      person('Fay', { relationship_category: 'FRIEND' }),
      person('Ollie', { relationship_category: 'OTHER' }),
      person('Nia'),
    ]);
    const row = (name: string) => screen.getByRole('link', { name: new RegExp(name) }).closest('li');
    expect(row('Fay')).toHaveAttribute('data-hue', 'teal');
    expect(row('Ollie')).not.toHaveAttribute('data-hue');
    expect(row('Nia')).not.toHaveAttribute('data-hue');
  });
});

describe('PersonRoster birthdays', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 29, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows each person's birthday as month and day, with the full date", () => {
    renderRoster([person('Robin', { birthday: '1982-03-04' })]);
    const row = screen.getByRole('link', { name: /Robin/ });
    expect(row).toHaveTextContent('Mar 4');
    expect(row).toHaveAccessibleName(/Birthday: March 4, 1982/);
    expect(screen.getByTitle('March 4, 1982')).toHaveTextContent('Mar 4');
  });

  it('leaves the birthday empty for someone without one', () => {
    renderRoster([person('Robin')]);
    expect(screen.getByRole('link', { name: /Robin/ })).not.toHaveAccessibleName(/Birthday/);
  });

  it('no longer shows when you last contacted someone', () => {
    renderRoster([person('Robin', { last_contacted_date: '2026-10-01' }), person('Sam')]);
    expect(screen.queryByText(/Last contacted/)).not.toBeInTheDocument();
    expect(screen.queryByText('Never')).not.toBeInTheDocument();
    expect(screen.queryByText(/weeks? ago/)).not.toBeInTheDocument();
  });
});
