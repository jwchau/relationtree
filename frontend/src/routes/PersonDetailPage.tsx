import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useDeletePerson, usePerson, useSetMe, useUpdatePerson } from '@/hooks/usePerson';
import { useConnections } from '@/hooks/useConnections';
import { PersonForm } from '@/components/person/PersonForm';
import { CatchUpCard } from '@/components/person/CatchUpCard';
import { PhotoUploader } from '@/components/person/PhotoUploader';
import { ConnectionList } from '@/components/connection/ConnectionList';
import { AddConnectionDialog } from '@/components/connection/AddConnectionDialog';
import { EgoGraph } from '@/components/graph/EgoGraph';
import { toFormValues, toPersonInput } from '@/lib/personInput';
import type { PersonFormValues } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function PersonDetailPage() {
  const { personId = '' } = useParams<{ personId: string }>();
  const navigate = useNavigate();
  const { person, loading, error } = usePerson(personId);
  const { connections, loading: connectionsLoading, error: connectionsError } =
    useConnections(personId);
  const updatePerson = useUpdatePerson(personId);
  const deletePerson = useDeletePerson(personId);
  const setMe = useSetMe(personId);

  async function handleSubmit(values: PersonFormValues) {
    try {
      await updatePerson.mutateAsync(toPersonInput(values));
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  async function handleDelete() {
    try {
      // The API cascades: deleting a person also deletes their connections.
      await deletePerson.mutateAsync();
      toast.success('Person deleted');
      navigate('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-destructive">{error}</p>;
  if (!person) return <p className="text-muted-foreground">Person not found.</p>;

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to people
      </Link>
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          {person.name}
          {person.is_me && <Badge>You</Badge>}
        </h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setMe.mutate(!person.is_me)}
            disabled={setMe.isPending}
            title="Lets Ask understand questions like “how am I connected to…?”"
          >
            <UserCheck />
            {person.is_me ? 'Not me' : 'This is me'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deletePerson.isPending}>
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {person.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {connections.length > 0
                    ? `This permanently removes ${person.name} and their ${connections.length} connection${connections.length === 1 ? '' : 's'}. This cannot be undone.`
                    : `This permanently removes ${person.name} and cannot be undone.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="max-w-xl space-y-6">
          <PhotoUploader person={person} />
          <PersonForm
            defaultValues={toFormValues(person)}
            onSubmit={handleSubmit}
            submitLabel="Save changes"
            isSubmitting={updatePerson.isPending}
          />
        </div>

        <div className="space-y-6">
          <CatchUpCard personId={person.id} personName={person.name} />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Connections</h2>
              <AddConnectionDialog personId={person.id} personName={person.name} />
            </div>
            <ConnectionList
              connections={connections}
              loading={connectionsLoading}
              error={connectionsError}
            />
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Graph</h2>
            <EgoGraph
              centerId={person.id}
              centerName={person.name}
              centerPhotoUrl={person.photo_url}
              connections={connections}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
