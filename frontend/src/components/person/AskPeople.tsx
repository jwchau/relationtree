import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Sparkles, X } from 'lucide-react';
import { useAsk } from '@/hooks/useAsk';
import { usePeopleSearch } from '@/hooks/usePeopleSearch';
import { PersonRoster } from '@/components/person/PersonRoster';
import { Note } from '@/components/kiln/Page';
import { Button } from '@/components/ui/button';
import type { Answer } from '@/lib/askEvents';

const SHOWN = 5;

/**
 * Ask a question about your people. Two things happen at once: the closest matches by meaning
 * show up straight away (semantic search), and the AI writes an answer above them by looking up
 * connections (graph Q&A), which takes a few seconds.
 */
export function AskPeople({ treeId }: { treeId: string }) {
  const [draft, setDraft] = useState('');
  const [question, setQuestion] = useState('');
  const search = usePeopleSearch(treeId, question);
  const { answer, ask, reset } = useAsk(treeId);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    // Asking the same question again should search again (e.g. after indexing caught up),
    // not just show the cached answer.
    if (next === question) void search.refetch();
    else setQuestion(next);
    void ask(next);
  }

  function clear() {
    setDraft('');
    setQuestion('');
    reset();
  }

  const results = search.data?.results.slice(0, SHOWN) ?? [];
  const pending = search.data?.pending ?? 0;

  return (
    <section className="space-y-3" aria-label="Ask about your people">
      <form
        onSubmit={handleSubmit}
        className="panel focus-within:shadow-[var(--elevation-3),var(--focus)] flex items-center gap-2 py-1.5 pr-1.5 pl-4 transition-shadow duration-200"
      >
        <Sparkles aria-hidden className="text-muted-foreground size-5 shrink-0" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about your people, e.g. who do I know in finance?"
          maxLength={500}
          aria-label="Ask about your people"
          className="placeholder:text-subtle h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        <Button type="submit" variant="secondary" disabled={!draft.trim() || search.isFetching}>
          Ask
        </Button>
      </form>

      {question && (
        <div className="panel space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="pt-2 font-semibold [overflow-wrap:anywhere]">&ldquo;{question}&rdquo;</h2>
            <Button variant="ghost" size="icon-sm" onClick={clear} aria-label="Clear">
              <X />
            </Button>
          </div>
          {answer && <AskAnswer answer={answer} />}
          {search.isPending && <Note>Searching...</Note>}
          {search.error && <Note tone="error">{search.error.message}</Note>}
          {search.data && results.length === 0 && <Note>No one to match against yet.</Note>}
          {results.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-muted-foreground text-[13px] leading-5 font-semibold">Closest matches</h3>
              <PersonRoster
                people={results.map(({ person }) => person)}
                showHeads={false}
                label="Closest matches"
              />
            </div>
          )}
          {pending > 0 && (
            <p className="text-muted-foreground text-[14px] leading-5">
              {pending} {pending === 1 ? 'person is' : 'people are'} still being indexed and may
              be missing from these results.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function AskAnswer({ answer }: { answer: Answer }) {
  return (
    <div className="bg-surface-2 space-y-3 rounded-[12px] p-4" aria-live="polite">
      {answer.progress && (
        <p className="text-muted-foreground flex items-center gap-2 text-[15px] leading-[22px]">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          {answer.progress}
        </p>
      )}
      {answer.text && <p className="max-w-[70ch] leading-relaxed">{answer.text}</p>}
      {answer.error && <Note tone="error">{answer.error}</Note>}
      {answer.people.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {answer.people.map((person) => (
            <Link
              key={person.id}
              to={`/people/${person.id}`}
              className="bg-ghost hover:bg-ghost-hover focus-ring inline-flex h-10 items-center rounded-[12px] px-4 font-nav text-[15px] font-medium transition-colors duration-200"
            >
              {person.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
