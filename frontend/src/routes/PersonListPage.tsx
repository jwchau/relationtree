import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, Search, UserPlus } from 'lucide-react';
import { useCurrentTree } from '@/hooks/useCurrentTree';
import { usePersonList } from '@/hooks/usePersonList';
import { AddFromNoteDialog } from '@/components/person/AddFromNoteDialog';
import { AskPeople } from '@/components/person/AskPeople';
import { PersonRoster, PersonRosterSkeleton } from '@/components/person/PersonRoster';
import { Note, PageBand, PageBody } from '@/components/kiln/Page';
import {
  DEFAULT_PERSON_SORT,
  PERSON_SORTS,
  filterAndSortPeople,
  type CategoryFilter,
  type PersonSort,
} from '@/lib/personListFilters';
import { readRememberedSort, rememberSort } from '@/lib/personSortStorage';
import { RELATIONSHIP_CATEGORIES, categoryLabel } from '@/lib/relationshipTypes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function PersonListPage() {
  const { tree, canEdit, loading: treesLoading, error: treesError } = useCurrentTree();
  const { people, loading: peopleLoading, error: peopleError } = usePersonList(tree?.id);
  const loading = treesLoading || (tree !== null && peopleLoading);
  const error = treesError ?? peopleError;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [sort, setSort] = useState<PersonSort>(() => readRememberedSort() ?? DEFAULT_PERSON_SORT);

  function changeSort(next: PersonSort) {
    setSort(next);
    rememberSort(next);
  }

  const visiblePeople = useMemo(
    () => filterAndSortPeople(people, { search, category, sort }),
    [people, search, category, sort],
  );

  const counts = useMemo(() => {
    const byCategory = new Map<CategoryFilter, number>([['ALL', people.length]]);
    for (const p of people) {
      if (p.relationship_category) {
        byCategory.set(p.relationship_category, (byCategory.get(p.relationship_category) ?? 0) + 1);
      }
    }
    return byCategory;
  }, [people]);

  const meta =
    tree &&
    (loading ? (
      tree.name
    ) : (
      <>
        <span>{tree.name}</span>
        <span aria-hidden>·</span>
        <span className="tabular">
          {people.length} {people.length === 1 ? 'person' : 'people'}
        </span>
      </>
    ));

  return (
    <>
      <PageBand
        glow
        title="People"
        meta={meta}
        actions={
          canEdit &&
          tree && (
            <>
              <AddFromNoteDialog treeId={tree.id} />
              <Button asChild>
                <Link to="/people/new">
                  <UserPlus />
                  Add person
                </Link>
              </Button>
            </>
          )
        }
      />

      <PageBody className="space-y-6">
        {!loading && !error && !tree && (
          <div className="panel p-5">
            <Note>You aren&apos;t in any tree. Create one from the tree menu at the top.</Note>
          </div>
        )}

        {/* Keyed by tree: switching trees starts a fresh question. */}
        {tree && <AskPeople key={tree.id} treeId={tree.id} />}

        {tree && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative lg:w-72 lg:shrink-0">
              <Search
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
              />
              <Input
                placeholder="Filter by name..."
                aria-label="Filter by name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div
              role="group"
              aria-label="Category"
              className="-mx-[var(--gutter)] flex gap-2 overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] lg:mx-0 lg:px-0"
            >
              {(['ALL', ...RELATIONSHIP_CATEGORIES] as CategoryFilter[]).map((cat) => {
                const selected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      'focus-ring inline-flex h-12 shrink-0 items-center gap-2 rounded-[12px] px-4 font-nav text-[15px] font-medium transition-colors duration-200',
                      selected ? 'bg-text text-surface' : 'bg-ghost text-text hover:bg-ghost-hover',
                    )}
                  >
                    {cat === 'ALL' ? 'All categories' : categoryLabel(cat)}
                    <span className={cn('tabular text-[13px]', selected ? 'opacity-70' : 'text-muted-foreground')}>
                      {counts.get(cat) ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
            <Select value={sort} onValueChange={(value) => changeSort(value as PersonSort)}>
              <SelectTrigger aria-label="Sort" className="w-full *:data-[slot=select-value]:flex-1 lg:ml-auto lg:w-fit lg:shrink-0">
                <ArrowUpDown aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERSON_SORTS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {loading && <PersonRosterSkeleton />}
        {error && <Note tone="error">{error}</Note>}

        {!loading && !error && tree && people.length === 0 && (
          <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
            <Note>
              {canEdit
                ? 'No one here yet. Add your first person to get started.'
                : 'No one in this tree yet.'}
            </Note>
          </div>
        )}

        {!loading && !error && people.length > 0 && visiblePeople.length === 0 && (
          <div className="panel p-5">
            <Note>No one matches your search/filter.</Note>
          </div>
        )}

        {!loading && visiblePeople.length > 0 && (
          // Keyed by the search, filter and sort so changing any of them starts again at page 1.
          <PersonRoster key={`${category}|${sort}|${search}`} people={visiblePeople} label="People" />
        )}
      </PageBody>
    </>
  );
}
