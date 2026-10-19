import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentTree } from '@/hooks/useCurrentTree';
import { usePersonList } from '@/hooks/usePersonList';
import { AskPeople } from '@/components/person/AskPeople';
import { PersonCard } from '@/components/person/PersonCard';
import { filterAndSortPeople, type CategoryFilter } from '@/lib/personListFilters';
import { RELATIONSHIP_CATEGORIES, categoryLabel } from '@/lib/relationshipTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function PersonListPage() {
  const { tree, canEdit, loading: treesLoading, error: treesError } = useCurrentTree();
  const { people, loading: peopleLoading, error: peopleError } = usePersonList(tree?.id);
  const loading = treesLoading || (tree !== null && peopleLoading);
  const error = treesError ?? peopleError;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('ALL');

  const visiblePeople = useMemo(
    () => filterAndSortPeople(people, { search, category }),
    [people, search, category],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">People</h1>
        {canEdit && (
          <Button asChild>
            <Link to="/people/new">Add person</Link>
          </Button>
        )}
      </div>

      {!loading && !error && !tree && (
        <p className="text-muted-foreground">
          You aren&apos;t in any tree. Create one from the tree menu at the top.
        </p>
      )}

      {/* Keyed by tree: switching trees starts a fresh question. */}
      {tree && <AskPeople key={tree.id} treeId={tree.id} />}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Filter by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={category} onValueChange={(v) => setCategory(v as CategoryFilter)}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {RELATIONSHIP_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {categoryLabel(cat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="text-muted-foreground">Loading...</p>}
      {error && <p className="text-destructive">{error}</p>}

      {!loading && !error && tree && people.length === 0 && (
        <p className="text-muted-foreground">
          {canEdit
            ? 'No one here yet. Add your first person to get started.'
            : 'No one in this tree yet.'}
        </p>
      )}

      {!loading && !error && people.length > 0 && visiblePeople.length === 0 && (
        <p className="text-muted-foreground">No one matches your search/filter.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visiblePeople.map((person) => (
          <PersonCard key={person.id} person={person} />
        ))}
      </div>
    </div>
  );
}
