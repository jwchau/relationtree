import { Sparkles } from 'lucide-react';
import { useSummary } from '@/hooks/useSummary';
import { Button } from '@/components/ui/button';

export function CatchUpCard({ personId, personName }: { personId: string; personName: string }) {
  const { text, status, error, generate } = useSummary(personId);
  const busy = status === 'waiting' || status === 'streaming';

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Catch up</h2>
        <Button variant="outline" size="sm" onClick={generate} disabled={busy}>
          <Sparkles />
          {status === 'idle' ? `Catch me up on ${personName}` : busy ? 'Writing...' : 'Regenerate'}
        </Button>
      </div>

      {status === 'waiting' && (
        <p className="text-muted-foreground text-sm">
          Thinking... The first summary after the server starts can take a couple of minutes
          while the AI model loads.
        </p>
      )}
      {text && <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>}
      {status === 'error' && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
