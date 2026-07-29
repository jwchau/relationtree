import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { client } from '@/amplify-client';
import { usePerson } from '@/hooks/usePerson';
import { PersonForm } from '@/components/person/PersonForm';
import type { PersonFormValues } from '@/lib/validation';
import { Button } from '@/components/ui/button';
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

function toPersonInput(values: PersonFormValues) {
  return {
    name: values.name,
    relationshipCategory: values.relationshipCategory,
    context: values.context || undefined,
    phone: values.phone || undefined,
    email: values.email || undefined,
    address: values.address || undefined,
    birthday: values.birthday || undefined,
    notes: values.notes || undefined,
    lastContactedDate: values.lastContactedDate || undefined,
  };
}

export default function PersonDetailPage() {
  const { personId } = useParams<{ personId: string }>();
  const navigate = useNavigate();
  const { person, loading, error, refresh } = usePerson(personId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSubmit(values: PersonFormValues) {
    if (!personId) return;
    setIsSubmitting(true);
    try {
      // `as any`: works around an upstream Amplify Gen 2 typing bug, see
      // PersonCreatePage.tsx for details (aws-amplify/amplify-js#13695).
      const { errors } = await client.models.Person.update({
        id: personId,
        ...toPersonInput(values),
      } as any);
      if (errors) {
        toast.error(errors.map((e) => e.message).join(', '));
        return;
      }
      toast.success('Saved');
      refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!personId) return;
    setIsDeleting(true);
    try {
      const { errors } = await client.models.Person.delete({ id: personId });
      if (errors) {
        toast.error(errors.map((e) => e.message).join(', '));
        return;
      }
      toast.success('Person deleted');
      navigate('/');
    } finally {
      setIsDeleting(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-destructive">{error}</p>;
  if (!person) return <p className="text-muted-foreground">Person not found.</p>;

  return (
    <div className="max-w-xl space-y-6">
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to people
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{person.name}</h1>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isDeleting}>
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {person.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes {person.name} and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <PersonForm
        defaultValues={{
          name: person.name,
          relationshipCategory: person.relationshipCategory ?? 'FRIEND',
          context: person.context ?? '',
          phone: person.phone ?? '',
          email: person.email ?? '',
          address: person.address ?? '',
          birthday: person.birthday ?? '',
          notes: person.notes ?? '',
          lastContactedDate: person.lastContactedDate ?? '',
        }}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
