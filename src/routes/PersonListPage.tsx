import { Link } from 'react-router-dom';
import { usePersonList } from '@/hooks/usePersonList';
import { categoryLabel } from '@/lib/relationshipTypes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function PersonListPage() {
  const { people, loading, error } = usePersonList();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">People</h1>
        <Button asChild>
          <Link to="/people/new">Add person</Link>
        </Button>
      </div>

      {loading && <p className="text-muted-foreground">Loading...</p>}
      {error && <p className="text-destructive">{error}</p>}

      {!loading && !error && people.length === 0 && (
        <p className="text-muted-foreground">
          No one here yet. Add your first person to get started.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((person) => (
          <Link key={person.id} to={`/people/${person.id}`}>
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{person.name}</span>
                  {person.relationshipCategory && (
                    <Badge variant="secondary">
                      {categoryLabel(person.relationshipCategory)}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              {person.context && (
                <CardContent>
                  <p className="text-muted-foreground text-sm">{person.context}</p>
                </CardContent>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
