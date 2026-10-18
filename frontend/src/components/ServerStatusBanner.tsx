import { useQueryClient } from '@tanstack/react-query';
import { useServerStatus } from '@/api/serverStatus';
import { Button } from '@/components/ui/button';

export function ServerStatusBanner() {
  const status = useServerStatus();
  const queryClient = useQueryClient();

  if (status === 'online') return null;

  return (
    <div
      role="status"
      className="bg-muted flex flex-wrap items-center justify-center gap-3 border-b px-4 py-2 text-sm"
    >
      <span>The RelationTree server is offline right now. Try again later.</span>
      <Button variant="outline" size="sm" onClick={() => queryClient.refetchQueries()}>
        Retry
      </Button>
    </div>
  );
}
