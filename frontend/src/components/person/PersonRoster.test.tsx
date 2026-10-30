// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Person } from '@/api/client';
import { PersonRoster } from './PersonRoster';

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
    <MemoryRouter>
      <PersonRoster people={people} label="People" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 29, 12));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('PersonRoster', () => {
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
