import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';

export type SummaryStatus = 'idle' | 'waiting' | 'streaming' | 'done' | 'error';

/**
 * Streams an AI catch-up for one person. Not a TanStack query: it's user-triggered, costs GPU
 * time, and arrives a chunk at a time. Leaving the page (or regenerating) aborts the request,
 * which makes the server stop generation.
 */
export function useSummary(personId: string) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<SummaryStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);
  // A different person's page starts fresh.
  useEffect(() => {
    controller.current?.abort();
    setText('');
    setStatus('idle');
    setError(null);
  }, [personId]);

  const generate = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setText('');
    setError(null);
    setStatus('waiting');

    try {
      const { data, error: apiError, response } = await api.POST('/api/people/{person_id}/summary', {
        params: { path: { person_id: personId } },
        parseAs: 'stream',
        signal: abort.signal,
      });
      if (!response.ok || !data) {
        const detail = (apiError as { detail?: unknown } | undefined)?.detail;
        throw new Error(typeof detail === 'string' ? detail : `Request failed (${response.status})`);
      }

      const reader = data.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        setStatus('streaming');
        setText((previous) => previous + value);
      }
      setStatus('done');
    } catch (err) {
      if (abort.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to generate a summary');
      setStatus('error');
    }
  }, [personId]);

  return { text, status, error, generate };
}
