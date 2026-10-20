import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useDeletePerson, usePerson, useSetMe, useUpdatePerson } from '@/hooks/usePerson';
import { useConnections } from '@/hooks/useConnections';
import { useCurrentTree, useTreePermissions } from '@/hooks/useCurrentTree';
import { PersonForm } from '@/components/person/PersonForm';
import { CatchUpCard } from '@/components/person/CatchUpCard';
import { PhotoUploader } from '@/components/person/PhotoUploader';
import { ConnectionList } from '@/components/connection/ConnectionList';
import { AddConnectionDialog } from '@/components/connection/AddConnectionDialog';
import { EgoGraph } from '@/components/graph/EgoGraph';
import { toFormValues, toPersonInput } from '@/lib/personInput';
import { lastTalked } from '@/lib/people';
import { categoryLabel } from '@/lib/relationshipTypes';
import { Note, PageBand, PageBody, SectionHead } from '@/components/kiln/Page';
import { PersonAvatar } from '@/components/person/PersonAvatar';
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
  const { tree: currentTree, select: selectTree } = useCurrentTree();
  const { canEdit } = useTreePermissions(person?.tree_id);

  // Opening someone from another tree (e.g. a shared link) switches to that tree, so the
  // header, list and Ask all match the person on screen.
  const personTreeId = person?.tree_id;
  useEffect(() => {
    if (personTreeId && currentTree && personTreeId !== currentTree.id) selectTree(personTreeId);
  }, [personTreeId, currentTree, selectTree]);

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

  const back = { to: '/', label: 'Back to people' };
  if (loading || error || !person) {
    return (
      <>
        <PageBand back={back} title={loading ? 'Loading...' : 'Person not found'} />
        <PageBody>
          {error ? <Note tone="error">{error}</Note> : !loading && <Note>Person not found.</Note>}
        </PageBody>
      </>
    );
  }

  const talked = lastTalked(person.last_contacted_date);

  return (
    <>
      <PageBand
        back={back}
        leading={
          <PersonAvatar
            name={person.name}
            photoUrl={person.photo_url}
            className="size-16 text-xl shadow-[0_0_0_2px_var(--band-divider)]"
          />
        }
        title={person.name}
        meta={
          <>
            {/* On ink, amber stays the on-ink amber in both themes. */}
            {person.is_me && <Badge className="bg-[rgba(223,174,78,0.1)] text-amber">You</Badge>}
            {person.relationship_category && (
              <span>{categoryLabel(person.relationship_category)}</span>
            )}
            {person.relationship_category && <span aria-hidden>·</span>}
            <span>
              Last contacted: <span className="text-band-text">{talked.label}</span>
            </span>
          </>
        }
        actions={
          <>
            <Button
              variant="band"
              onClick={() => setMe.mutate(!person.is_me)}
              disabled={setMe.isPending}
              title="Lets Ask understand questions like “how am I connected to…?”"
            >
              <UserCheck />
              {person.is_me ? 'Not me' : 'This is me'}
            </Button>
            {canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="band" disabled={deletePerson.isPending}>
                  <Trash2 />
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
            )}
          </>
        }
      />

      {/* Phone order: catch up, details, connections, graph. From 1024px details take the
          right-hand column and the rest stack on the left. */}
      <PageBody className="grid grid-cols-1 gap-[var(--section-gap)] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-8">
        <div className="lg:col-start-1">
          <CatchUpCard personId={person.id} personName={person.name} />
        </div>

        <section className="lg:col-start-2 lg:row-span-3 lg:row-start-1" aria-labelledby="details-head">
          <SectionHead id="details-head" title="Details" />
          <div className="panel space-y-6 p-5">
            <PhotoUploader person={person} readOnly={!canEdit} />
            <PersonForm
              defaultValues={toFormValues(person)}
              onSubmit={handleSubmit}
              submitLabel="Save changes"
              isSubmitting={updatePerson.isPending}
              readOnly={!canEdit}
            />
          </div>
        </section>

        <section className="lg:col-start-1" aria-labelledby="connections-head">
          <SectionHead id="connections-head" title="Connections">
            {canEdit && (
              <AddConnectionDialog
                personId={person.id}
                personName={person.name}
                treeId={person.tree_id}
              />
            )}
          </SectionHead>
          <ConnectionList
            connections={connections}
            loading={connectionsLoading}
            error={connectionsError}
            canEdit={canEdit}
          />
        </section>

        <section className="lg:col-start-1" aria-labelledby="graph-head">
          <SectionHead id="graph-head" title="Graph" />
          <EgoGraph
            centerId={person.id}
            centerName={person.name}
            centerPhotoUrl={person.photo_url}
            connections={connections}
          />
        </section>
      </PageBody>
    </>
  );
}
