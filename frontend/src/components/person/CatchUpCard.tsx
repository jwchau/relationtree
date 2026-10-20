import { Loader2, Sparkles } from 'lucide-react';
import { useSummary } from '@/hooks/useSummary';
import { Button } from '@/components/ui/button';
import { Note, SectionHead } from '@/components/kiln/Page';

export function CatchUpCard({ personId, personName }: { personId: string; personName: string }) {
  const { text, status, error, generate } = useSummary(personId);
  const busy = status === 'waiting' || status === 'streaming';

  return (
    <section aria-labelledby="catch-up-head">
      <SectionHead id="catch-up-head" title="Catch up">
        <Button variant="secondary" onClick={generate} disabled={busy} className="max-w-full">
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          <span className="truncate">
            {status === 'idle' ? `Catch me up on ${personName}` : busy ? 'Writing...' : 'Regenerate'}
          </span>
        </Button>
      </SectionHead>

      {status !== 'idle' && (
        <div className="panel animate-in fade-in-0 slide-in-from-top-1 space-y-3 p-5 duration-300 ease-[var(--ease)]">
          {status === 'waiting' && (
            <Note>
              Thinking... The first summary after the server starts can take a couple of minutes
              while the AI model loads.
            </Note>
          )}
          {text && (
            <p className="max-w-[70ch] text-[16.8px] leading-[26px] whitespace-pre-wrap">{text}</p>
          )}
          {status === 'error' && <Note tone="error">{error}</Note>}
        </div>
      )}
    </section>
  );
}
