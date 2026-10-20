import type { ConnectionWithPerson } from '@/hooks/useConnections';

export const CONNECTIONS_PAGE_SIZE = 8;

export interface ConnectionPage {
  items: ConnectionWithPerson[];
  /** The page actually shown (0-based), clamped to the last page. */
  page: number;
  pageCount: number;
  /** 1-based positions of the first and last item shown, for "1–8 of 20". */
  start: number;
  end: number;
}

/** Connections sorted by the other person's name, cut to one page. */
export function connectionPage(connections: ConnectionWithPerson[], page: number): ConnectionPage {
  const sorted = [...connections].sort((a, b) =>
    a.otherPerson.name.localeCompare(b.otherPerson.name, undefined, { sensitivity: 'base' }),
  );
  const pageCount = Math.max(1, Math.ceil(sorted.length / CONNECTIONS_PAGE_SIZE));
  const shown = Math.min(Math.max(page, 0), pageCount - 1);
  const items = sorted.slice(shown * CONNECTIONS_PAGE_SIZE, (shown + 1) * CONNECTIONS_PAGE_SIZE);
  const start = items.length > 0 ? shown * CONNECTIONS_PAGE_SIZE + 1 : 0;
  return { items, page: shown, pageCount, start, end: shown * CONNECTIONS_PAGE_SIZE + items.length };
}
