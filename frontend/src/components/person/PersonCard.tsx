import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { usePhotoUrl } from '@/hooks/usePhotoUrl';
import { categoryLabel } from '@/lib/relationshipTypes';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PersonSummary } from '@/hooks/usePersonList';

export function PersonCard({ person }: { person: PersonSummary }) {
  const url = usePhotoUrl(person.photo_key);

  return (
    <Link to={`/people/${person.id}`}>
      <Card className="h-full transition-colors hover:bg-accent/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={url ?? undefined} alt={person.name} />
              <AvatarFallback>
                <User className="size-4" />
              </AvatarFallback>
            </Avatar>
            <span className="flex-1">{person.name}</span>
            {person.relationship_category && (
              <Badge variant="secondary">{categoryLabel(person.relationship_category)}</Badge>
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
  );
}
