import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useAsk } from '@/hooks/useAsk';
import { usePeopleSearch } from '@/hooks/usePeopleSearch';
import { PersonCard } from '@/components/person/PersonCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { Answer } from '@/lib/askEvents';

const SHOWN = 5;

/**
 * Ask a question about your people. Two things happen at once: the closest matches by meaning
 * show up straight away (semantic search), and the AI writes an answer above them by looking up
 * connections (graph Q&A), which takes a few seconds.
 */
export function AskPeople() {
  const [draft, setDraft] = useState('');
  const [question, setQuestion] = useState('');
  const search = usePeopleSearch(question);
  const { answer, ask, reset } = useAsk();

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
    <section className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about your people, e.g. who do I know in finance?"
          maxLength={500}
          aria-label="Ask about your people"
        />
        <Button type="submit" variant="outline" disabled={!draft.trim() || search.isFetching}>
          <Sparkles />
          Ask
        </Button>
      </form>

      {question && (
        <div className="space-y-3 rounded-md border p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">"{question}"</h2>
            <Button variant="ghost" size="icon" className="size-7" onClick={clear} aria-label="Clear">
              <X className="size-4" />
            </Button>
          </div>
          {answer && <AskAnswer answer={answer} />}
          {search.isPending && <p className="text-muted-foreground text-sm">Searching...</p>}
          {search.error && (
            <p role="alert" className="text-destructive text-sm">
              {search.error.message}
            </p>
          )}
          {search.data && results.length === 0 && (
            <p className="text-muted-foreground text-sm">No one to match against yet.</p>
          )}
          {results.length > 0 && (
            <h3 className="text-muted-foreground text-xs font-medium">Closest matches</h3>
          )}
          {results.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(({ person }) => (
                <PersonCard key={person.id} person={person} />
              ))}
            </div>
          )}
          {pending > 0 && (
            <p className="text-muted-foreground text-xs">
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
    <div className="bg-muted/40 space-y-2 rounded-md p-3" aria-live="polite">
      {answer.progress && (
        <p className="text-muted-foreground animate-pulse text-sm">{answer.progress}</p>
      )}
      {answer.text && <p className="text-sm leading-relaxed">{answer.text}</p>}
      {answer.error && (
        <p role="alert" className="text-destructive text-sm">
          {answer.error}
        </p>
      )}
      {answer.people.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {answer.people.map((person) => (
            <Link key={person.id} to={`/people/${person.id}`}>
              <Badge variant="outline" className="hover:bg-accent">
                {person.name}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
