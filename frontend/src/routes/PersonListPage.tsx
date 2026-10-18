import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  const { people, loading, error } = usePersonList();
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
        <Button asChild>
          <Link to="/people/new">Add person</Link>
        </Button>
      </div>

      <AskPeople />

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

      {!loading && !error && people.length === 0 && (
        <p className="text-muted-foreground">
          No one here yet. Add your first person to get started.
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
