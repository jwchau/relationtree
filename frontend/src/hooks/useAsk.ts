import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';
import {
  applyAskEvent,
  createLineSplitter,
  initialAnswer,
  type Answer,
  type AskEvent,
} from '@/lib/askEvents';

/**
 * Streams the AI's answer to a question (graph Q&A). Like useSummary, not a TanStack query:
 * it's user-triggered, costs GPU time and arrives in pieces. Asking again or leaving the page
 * aborts the request, which stops generation on the server.
 */
export function useAsk() {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const ask = useCallback(async (question: string) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setAnswer({ ...initialAnswer, progress: 'Thinking…' });

    try {
      const { data, error, response } = await api.POST('/api/ask', {
        body: { question },
        parseAs: 'stream',
        signal: abort.signal,
      });
      if (!response.ok || !data) {
        const detail = (error as { detail?: unknown } | undefined)?.detail;
        throw new Error(typeof detail === 'string' ? detail : `Request failed (${response.status})`);
      }

      const split = createLineSplitter();
      const reader = data.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const events = split(value).map((line) => JSON.parse(line) as AskEvent);
        setAnswer((previous) => events.reduce<Answer>(applyAskEvent, previous ?? initialAnswer));
      }
      setAnswer((previous) => (previous ? { ...previous, progress: null, done: true } : previous));
    } catch (err) {
      if (abort.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Failed to get an answer';
      setAnswer((previous) => applyAskEvent(previous ?? initialAnswer, { error: message }));
    }
  }, []);

  const reset = useCallback(() => {
    controller.current?.abort();
    setAnswer(null);
  }, []);

  return { answer, ask, reset };
}
