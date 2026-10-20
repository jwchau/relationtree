import { useQueryClient } from '@tanstack/react-query';
import { useServerStatus } from '@/api/serverStatus';
import { Button } from '@/components/ui/button';

export function ServerStatusBanner() {
  const status = useServerStatus();
  const queryClient = useQueryClient();

  if (status === 'online') return null;

  return (
    <div role="status" className="ink border-b border-band-divider">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-2 px-[var(--gutter)] py-2 text-[14.7px] leading-[21px] font-medium">
        <span
          aria-hidden
          className="bg-band-accent size-2 shrink-0 rounded-full shadow-[0_0_0_3px_rgba(234,149,87,0.3)]"
        />
        <span>The RelationTree server is offline right now. Try again later.</span>
        <Button variant="band" size="xs" className="ml-auto" onClick={() => queryClient.refetchQueries()}>
          Retry
        </Button>
      </div>
    </div>
  );
}
