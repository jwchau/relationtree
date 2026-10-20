import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useDeleteConnection, type ConnectionWithPerson } from '@/hooks/useConnections';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Note } from '@/components/kiln/Page';
import { PersonAvatar } from '@/components/person/PersonAvatar';

export interface ConnectionListProps {
  connections: ConnectionWithPerson[];
  loading: boolean;
  error: string | null;
  canEdit: boolean;
}

export function ConnectionList({ connections, loading, error, canEdit }: ConnectionListProps) {
  const deleteConnection = useDeleteConnection();

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

  return (
    <ul className="panel px-1.5 py-1.5 sm:px-2" aria-label="Connections">
      {connections.map((c) => (
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
  );
}
