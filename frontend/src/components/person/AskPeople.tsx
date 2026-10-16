import { useState, type FormEvent } from 'react';
import { Sparkles, X } from 'lucide-react';
import { usePeopleSearch } from '@/hooks/usePeopleSearch';
import { PersonCard } from '@/components/person/PersonCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const SHOWN = 5;

/** Ask a question about your people; shows the closest matches by meaning, best first. */
export function AskPeople() {
  const [draft, setDraft] = useState('');
  const [question, setQuestion] = useState('');
  const search = usePeopleSearch(question);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    // Asking the same question again should search again (e.g. after indexing caught up),
    // not just show the cached answer.
    if (next === question) void search.refetch();
    else setQuestion(next);
  }

  function clear() {
    setDraft('');
    setQuestion('');
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
            <h2 className="text-sm font-medium">Best matches for "{question}"</h2>
            <Button variant="ghost" size="icon" className="size-7" onClick={clear} aria-label="Clear">
              <X className="size-4" />
            </Button>
          </div>
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
