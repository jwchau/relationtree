import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { useDeleteConnection, type ConnectionWithPerson } from '@/hooks/useConnections';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Note } from '@/components/kiln/Page';
import { PersonAvatar } from '@/components/person/PersonAvatar';
import { connectionPage, CONNECTIONS_PAGE_SIZE } from '@/lib/connectionPages';

export interface ConnectionListProps {
  connections: ConnectionWithPerson[];
  loading: boolean;
  error: string | null;
  canEdit: boolean;
}

export function ConnectionList({ connections, loading, error, canEdit }: ConnectionListProps) {
  const deleteConnection = useDeleteConnection();
  const [page, setPage] = useState(0);

  async function handleRemove(connectionId: string) {
    try {
      await deleteConnection.mutateAsync(connectionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove connection');
      return;
    }
    toast.success('Connection removed');
  }

  if (loading) return <Note className="panel p-5">Loading connections...</Note>;
  if (error) return <Note tone="error">{error}</Note>;
  if (connections.length === 0) {
    return <Note className="panel p-5">No connections yet.</Note>;
  }

  const { items, page: shown, pageCount, start, end } = connectionPage(connections, page);

  return (
    <div className="panel px-1.5 py-1.5 sm:px-2">
      {/* When paged, every page keeps a full page's height (rows are min-h-14) so the pager
          doesn't jump up on a short last page. */}
      <ul
        aria-label="Connections"
        style={pageCount > 1 ? { minHeight: `${CONNECTIONS_PAGE_SIZE * 3.5}rem` } : undefined}
      >
        {items.map((c) => (
          <li
            key={c.connectionId}
            className="before:bg-hairline relative flex items-center gap-1 before:absolute before:inset-x-3 before:top-0 before:h-px first:before:hidden"
          >
            <Link
              to={`/people/${c.otherPerson.id}`}
              className="hover:bg-ghost-hover focus-ring flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[12px] px-3 py-2 transition-colors duration-200"
            >
              <PersonAvatar name={c.otherPerson.name} photoUrl={c.otherPerson.photo_url} className="size-8" />
              <span className="truncate font-semibold">{c.otherPerson.name}</span>
              <Badge variant="secondary" className="ml-auto">
                {c.displayLabel}
              </Badge>
            </Link>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-text"
                onClick={() => handleRemove(c.connectionId)}
                aria-label={`Remove connection to ${c.otherPerson.name}`}
              >
                <X />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <nav
          aria-label="Connection pages"
          className="before:bg-hairline relative flex items-center justify-between gap-2 pt-1.5 pl-3 before:absolute before:inset-x-3 before:top-0 before:h-px"
        >
          <span className="text-muted-foreground text-[13px] leading-[18px] tabular-nums" aria-live="polite">
            {start === end ? start : `${start}–${end}`} of {connections.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPage(shown - 1)}
              disabled={shown === 0}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPage(shown + 1)}
              disabled={shown === pageCount - 1}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
