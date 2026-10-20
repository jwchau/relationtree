import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useApplyExtract, useExtract } from '@/hooks/useExtract';
import { usePersonList } from '@/hooks/usePersonList';
import {
  buildApplyRequest,
  describeConnection,
  initialReview,
  type PersonReview,
  type Review,
} from '@/lib/extract';
import { RELATIONSHIP_CATEGORIES, categoryLabel } from '@/lib/relationshipTypes';
import type { Person } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const MAX_NOTE = 2000;
const NEW = 'new';

/**
 * Paste a note ("Met Jordan at Alex's wedding…"); the AI proposes people and connections,
 * matched to people already in the tree. Nothing is saved until the user reviews and confirms.
 */
export function AddFromNoteDialog({ treeId }: { treeId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const extract = useExtract(treeId);
  const applyExtract = useApplyExtract(treeId);
  const { people } = usePersonList(treeId);
  const navigate = useNavigate();

  function reset() {
    setNote('');
    setReview(null);
    extract.reset();
  }

  function read() {
    extract.mutate(note.trim(), {
      onSuccess: (proposal) => setReview(initialReview(proposal)),
    });
  }

  function save() {
    if (!review) return;
    applyExtract.mutate(buildApplyRequest(review), {
      onSuccess: (applied) => {
        const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
        const parts = [
          applied.created.length && `${applied.created.length} added`,
          applied.updated.length && `${applied.updated.length} updated`,
          applied.connections_added && plural(applied.connections_added, 'connection'),
        ].filter(Boolean);
        // The toaster sits outside the router, so its button goes through navigate().
        const [first] = applied.created;
        toast.success(parts.length ? `Saved: ${parts.join(', ')}` : 'Nothing new to save', {
          duration: first ? 8000 : undefined,
          action: first && {
            label: `Open ${first.name}`,
            onClick: () => navigate(`/people/${first.id}`),
          },
        });
        setOpen(false);
        reset();
      },
      onError: (err) => toast.error(err.message),
    });
  }

  function updatePerson(ref: string, change: Partial<PersonReview>) {
    setReview((r) =>
      r && { ...r, people: r.people.map((p) => (p.ref === ref ? { ...p, ...change } : p)) },
    );
  }

  const kept = review?.people.filter((p) => p.include) ?? [];
  const keptRefs = new Set(kept.map((p) => p.ref));
  const names = new Map(review?.people.map((p) => [p.ref, displayName(p, people)]));
  const linksToSave =
    review?.connections.filter((c) => c.include && keptRefs.has(c.a) && keptRefs.has(c.b)) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="band">
          <FileText />
          Add from a note
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from a note</DialogTitle>
          <DialogDescription>
            Write what happened in your own words. The AI suggests people and connections; you
            check them before anything is saved.
          </DialogDescription>
        </DialogHeader>

        {!review ? (
          <div className="space-y-3">
            <Textarea
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={MAX_NOTE}
              placeholder="Met Jordan at Alex's wedding. He's Alex's college roommate and works at Stripe."
              aria-label="Note"
              autoFocus
            />
            {extract.error && (
              <p role="alert" className="text-accent-text text-[14.7px] leading-[21px] font-medium">
                {extract.error.message}
              </p>
            )}
            <DialogFooter>
              <Button onClick={read} disabled={!note.trim() || extract.isPending}>
                {extract.isPending && <Loader2 className="animate-spin" />}
                {extract.isPending ? 'Reading…' : 'Read note'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="display-face text-[18px] leading-6">People</h3>
              {review.people.length === 0 && (
                <p className="text-muted-foreground text-[15px]">No one found in that note.</p>
              )}
              {review.people.map((p) => (
                <PersonRow
                  key={p.ref}
                  person={p}
                  people={people}
                  onChange={(change) => updatePerson(p.ref, change)}
                />
              ))}
            </section>

            {review.connections.length > 0 && (
              <section className="space-y-2">
                <h3 className="display-face text-[18px] leading-6">Connections</h3>
                {review.connections.map((c, i) => {
                  const dropped = !keptRefs.has(c.a) || !keptRefs.has(c.b);
                  return (
                    <label
                      key={`${c.a}-${c.b}-${c.type}`}
                      className="bg-surface-2 hover:bg-ghost-hover flex min-h-12 cursor-pointer items-center gap-3 rounded-[12px] px-4 py-2 text-[15px] transition-colors duration-200 has-disabled:cursor-not-allowed has-disabled:opacity-50"
                    >
                      <input
                        type="checkbox"
                        className="size-5 shrink-0"
                        checked={c.include && !dropped}
                        disabled={dropped}
                        onChange={(e) =>
                          setReview(
                            (r) =>
                              r && {
                                ...r,
                                connections: r.connections.map((x, j) =>
                                  j === i ? { ...x, include: e.target.checked } : x,
                                ),
                              },
                          )
                        }
                      />
                      {describeConnection(names.get(c.a) ?? '?', names.get(c.b) ?? '?', c.type)}
                    </label>
                  );
                })}
              </section>
            )}

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setReview(null)}>
                Back to the note
              </Button>
              <Button
                onClick={save}
                disabled={kept.length === 0 || applyExtract.isPending}
              >
                {applyExtract.isPending ? 'Saving…' : saveLabel(kept, linksToSave.length)}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function displayName(p: PersonReview, people: Person[]) {
  if (p.matchId === null) return p.name.trim() || 'New person';
  return people.find((x) => x.id === p.matchId)?.name ?? p.name;
}

function saveLabel(kept: PersonReview[], links: number) {
  const added = kept.filter((p) => p.matchId === null).length;
  const parts = [
    added && `${added} ${added === 1 ? 'person' : 'people'}`,
    links && `${links} ${links === 1 ? 'connection' : 'connections'}`,
  ].filter(Boolean);
  return parts.length ? `Add ${parts.join(' and ')}` : 'Save notes';
}

function PersonRow({
  person,
  people,
  onChange,
}: {
  person: PersonReview;
  people: Person[];
  onChange: (change: Partial<PersonReview>) => void;
}) {
  const isNew = person.matchId === null;
  const id = `extract-${person.ref}`;

  return (
    <div
      className="bg-surface-2 space-y-3 rounded-[12px] p-3 data-[skipped=true]:opacity-50 sm:p-4"
      data-skipped={!person.include}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          className="size-5 shrink-0"
          checked={person.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          aria-label={`Include ${person.name}`}
        />
        {isNew ? (
          <Input
            value={person.name}
            onChange={(e) => onChange({ name: e.target.value })}
            aria-label="Name"
            className="h-10 w-48 font-semibold"
            disabled={!person.include}
          />
        ) : (
          <span className="font-semibold">{displayName(person, people)}</span>
        )}
        <Badge variant={isNew ? 'outline' : 'secondary'}>{isNew ? 'New' : 'Already here'}</Badge>
        <Select
          value={person.matchId ?? NEW}
          onValueChange={(v) => onChange({ matchId: v === NEW ? null : v })}
          disabled={!person.include}
        >
          <SelectTrigger size="sm" className="w-44" aria-label={`Who ${person.name} is`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NEW}>Add as someone new</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isNew && (
          <Select
            value={person.category ?? undefined}
            onValueChange={(v) => onChange({ category: v as PersonReview['category'] })}
            disabled={!person.include}
          >
            <SelectTrigger size="sm" className="w-36" aria-label="Category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {RELATIONSHIP_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {categoryLabel(cat)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {person.text && (
        <div className="flex items-start gap-3 sm:pl-8">
          <input
            id={id}
            type="checkbox"
            className="mt-0.5 size-5 shrink-0"
            checked={person.includeText}
            onChange={(e) => onChange({ includeText: e.target.checked })}
            disabled={!person.include}
          />
          <div className="flex-1 space-y-1">
            <Label htmlFor={id} className="text-muted-foreground">
              {isNew ? 'Save as how you know them' : 'Add to their notes, dated today'}
            </Label>
            <Input
              value={person.text}
              onChange={(e) => onChange({ text: e.target.value })}
              aria-label={`What the note says about ${person.name}`}
              className="h-10"
              disabled={!person.include || !person.includeText}
            />
          </div>
        </div>
      )}
    </div>
  );
}
