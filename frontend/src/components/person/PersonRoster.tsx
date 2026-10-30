import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { categoryLabel } from '@/lib/relationshipTypes';
import { birthdayCell } from '@/lib/people';
import { useCategoryHue } from '@/hooks/useCurrentTree';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PersonAvatar } from '@/components/person/PersonAvatar';
import type { PersonSummary } from '@/hooks/usePersonList';

const COLUMNS = 'md:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem]';
const PAGE_SIZE = 10;

/**
 * People as one dense list: photo or initials, name, how you know them, category and when you
 * last talked. Each whole row opens the person. Longer lists page by PAGE_SIZE, with the pager
 * at the top so you can turn pages without scrolling down.
 */
export function PersonRoster({
  people,
  showHeads = true,
  label,
}: {
  people: PersonSummary[];
  showHeads?: boolean;
  label: string;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(people.length / PAGE_SIZE));
  // Clamped, so a list that shrank (filtered, someone deleted) never shows an empty page.
  const shown = Math.min(page, pageCount - 1);
  const pageItems = people.slice(shown * PAGE_SIZE, (shown + 1) * PAGE_SIZE);

  return (
    <div className="panel px-1.5 py-1.5 sm:px-2">
      {pageCount > 1 && (
        <nav
          aria-label={`${label} pages`}
          className="after:bg-hairline relative mb-1 flex items-center justify-between gap-2 pb-1.5 pl-3 after:absolute after:inset-x-3 after:bottom-0 after:h-px"
        >
          <span className="tabular text-[14px] leading-5 font-semibold" aria-live="polite">
            Page {shown + 1} <span className="text-muted-foreground font-medium">of {pageCount}</span>
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPage(shown - 1)}
              disabled={shown === 0}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPage(shown + 1)}
              disabled={shown === pageCount - 1}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </nav>
      )}
      {showHeads && (
        <div
          aria-hidden
          className={cn(
            'text-muted-foreground hidden gap-4 px-3 pt-1.5 pb-1 text-[13px] leading-5 font-semibold md:grid md:pl-[68px]',
            COLUMNS,
          )}
        >
          <span>Name</span>
          <span>Category</span>
          <span className="text-right">Birthday</span>
        </div>
      )}
      {/* When paged, a short last page keeps a full page's height (rows are min-h-14). */}
      <ul aria-label={label} style={pageCount > 1 ? { minHeight: `${PAGE_SIZE * 3.5}rem` } : undefined}>
        {pageItems.map((person) => (
          <PersonRow key={person.id} person={person} />
        ))}
      </ul>
    </div>
  );
}

function PersonRow({ person }: { person: PersonSummary }) {
  const birthday = person.birthday ? birthdayCell(person.birthday) : null;
  const hue = useCategoryHue()(person.relationship_category);
  return (
    <li
      data-hue={hue}
      className="before:bg-hairline relative before:absolute before:inset-x-3 before:top-0 before:h-px first:before:hidden">
      <Link
        to={`/people/${person.id}`}
        className="hover:bg-ghost-hover focus-ring relative flex min-h-14 items-center gap-3 rounded-[12px] px-3 py-1.5 transition-colors duration-200"
      >
        <PersonAvatar name={person.name} photoUrl={person.photo_url} />
        <div className={cn('grid min-w-0 flex-1 items-center gap-x-4 gap-y-0.5', 'grid-cols-[minmax(0,1fr)_auto]', COLUMNS)}>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold">{person.name}</span>
              {person.is_me && <Badge>You</Badge>}
            </div>
            {person.context && (
              <p className="text-muted-foreground truncate text-[14px] leading-5">{person.context}</p>
            )}
          </div>
          <div className="hidden md:block">
            {person.relationship_category && (
              <Badge variant="secondary">{categoryLabel(person.relationship_category)}</Badge>
            )}
          </div>
          <p className="text-muted-foreground tabular flex items-center justify-end gap-2 text-[14px] leading-5 font-medium whitespace-nowrap">
            {birthday && (
              <>
                {/* Coming up within two weeks. */}
                {birthday.soon && (
                  <span aria-hidden className="bg-accent-text size-1.5 shrink-0 rounded-full" />
                )}
                <span title={birthday.full}>
                  <span className="sr-only">Birthday: {birthday.full}</span>
                  <span aria-hidden>{birthday.label}</span>
                </span>
              </>
            )}
          </p>
        </div>
      </Link>
    </li>
  );
}

/** Placeholder rows while the list loads. */
export function PersonRosterSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="panel px-2 py-1.5" aria-busy="true" aria-label="Loading people">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-14 items-center gap-3 px-3 py-1.5">
          <div className="bg-surface-3 size-10 animate-pulse rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="bg-surface-3 h-3.5 w-40 max-w-[60%] animate-pulse rounded-[4px]" />
            <div className="bg-surface-2 h-3 w-64 max-w-[80%] animate-pulse rounded-[4px]" />
          </div>
        </div>
      ))}
    </div>
  );
}
