// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Tree } from '@/api/client';
import { CurrentTreeContext } from '@/hooks/useCurrentTree';
import type { PersonSummary } from '@/hooks/usePersonList';
import { PersonRoster } from './PersonRoster';

const tree = {
  id: 'ash',
  name: 'Ash family',
  role: 'owner',
  member_count: 1,
  category_hues: { FAMILY: 'rose', FRIEND: 'teal', COWORKER: 'blue', ACQUAINTANCE: 'green', OTHER: 'none' },
} as Tree;

function person(name: string, relationship_category: PersonSummary['relationship_category']) {
  return { id: name, name, relationship_category, context: '', photo_url: null, is_me: false, last_contacted_date: null } as PersonSummary;
}

describe('PersonRoster hues', () => {
  it("colours each row by the tree's hue for its category, and leaves the rest plain", () => {
    render(
      <CurrentTreeContext.Provider value={{ tree, trees: [tree], loading: false, error: null, select: vi.fn() }}>
        <MemoryRouter>
          <PersonRoster
            label="People"
            people={[person('Fay', 'FRIEND'), person('Ollie', 'OTHER'), person('Nia', null)]}
          />
        </MemoryRouter>
      </CurrentTreeContext.Provider>,
    );
    const row = (name: string) => screen.getByRole('link', { name: new RegExp(name) }).closest('li');
    expect(row('Fay')).toHaveAttribute('data-hue', 'teal');
    expect(row('Ollie')).not.toHaveAttribute('data-hue');
    expect(row('Nia')).not.toHaveAttribute('data-hue');
  });
});
