import { describe, expect, it } from 'vitest';
import { connectionPage, CONNECTIONS_PAGE_SIZE } from './connectionPages';
import type { ConnectionWithPerson } from '@/hooks/useConnections';

function conn(name: string): ConnectionWithPerson {
  return {
    connectionId: `c-${name}`,
    relationshipType: 'FRIEND',
    displayLabel: 'Friend',
  parentKind: null,
  ended: false,
    otherPerson: { id: name, name, photo_url: null } as ConnectionWithPerson['otherPerson'],
  };
}

const names = (cs: ConnectionWithPerson[]) => cs.map((c) => c.otherPerson.name);

describe('connectionPage', () => {
  it('sorts by name, ignoring case', () => {
    const page = connectionPage([conn('bob'), conn('Carol'), conn('alice')], 0);
    expect(names(page.items)).toEqual(['alice', 'bob', 'Carol']);
  });

  it('returns one page of CONNECTIONS_PAGE_SIZE and the total page count', () => {
    const all = Array.from({ length: CONNECTIONS_PAGE_SIZE * 2 + 1 }, (_, i) => conn(`p${String(i).padStart(2, '0')}`));
    const first = connectionPage(all, 0);
    expect(first.items).toHaveLength(CONNECTIONS_PAGE_SIZE);
    expect(first.pageCount).toBe(3);
    expect(first.start).toBe(1);
    expect(first.end).toBe(CONNECTIONS_PAGE_SIZE);

    const last = connectionPage(all, 2);
    expect(names(last.items)).toEqual([`p${CONNECTIONS_PAGE_SIZE * 2}`]);
    expect(last.start).toBe(CONNECTIONS_PAGE_SIZE * 2 + 1);
    expect(last.end).toBe(CONNECTIONS_PAGE_SIZE * 2 + 1);
  });

  it('clamps a page past the end to the last page (e.g. after removing its only item)', () => {
    const all = Array.from({ length: CONNECTIONS_PAGE_SIZE }, (_, i) => conn(`p${i}`));
    const page = connectionPage(all, 1);
    expect(page.page).toBe(0);
    expect(page.items).toHaveLength(CONNECTIONS_PAGE_SIZE);
  });

  it('has one empty page for no connections', () => {
    expect(connectionPage([], 0)).toMatchObject({ page: 0, pageCount: 1, items: [] });
  });
});
