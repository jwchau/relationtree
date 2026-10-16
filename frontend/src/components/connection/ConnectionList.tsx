import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useDeleteConnection, type ConnectionWithPerson } from '@/hooks/useConnections';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface ConnectionListProps {
  connections: ConnectionWithPerson[];
  loading: boolean;
  error: string | null;
}

export function ConnectionList({ connections, loading, error }: ConnectionListProps) {
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

  if (loading) return <p className="text-muted-foreground text-sm">Loading connections...</p>;
  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (connections.length === 0) {
    return <p className="text-muted-foreground text-sm">No connections yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {connections.map((c) => (
        <li
          key={c.connectionId}
          className="flex items-center justify-between rounded-md border px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <Link to={`/people/${c.otherPerson.id}`} className="font-medium hover:underline">
              {c.otherPerson.name}
            </Link>
            <Badge variant="secondary">{c.displayLabel}</Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => handleRemove(c.connectionId)}
            aria-label={`Remove connection to ${c.otherPerson.name}`}
          >
            <X className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
