import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentTree } from '@/hooks/useCurrentTree';
import { useCreatePerson } from '@/hooks/usePerson';
import { PersonForm } from '@/components/person/PersonForm';
import { toPersonInput } from '@/lib/personInput';
import type { PersonFormValues } from '@/lib/validation';

export default function PersonCreatePage() {
  const navigate = useNavigate();
  const { tree } = useCurrentTree();
  const createPerson = useCreatePerson(tree?.id);

  async function handleSubmit(values: PersonFormValues) {
    try {
      const person = await createPerson.mutateAsync(toPersonInput(values));
      toast.success(`${person.name} added`);
      navigate(`/people/${person.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create person');
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to people
      </Link>
      <h1 className="text-2xl font-semibold">Add person</h1>
      {tree && <p className="text-muted-foreground text-sm">Adding to {tree.name}</p>}
      <PersonForm
        onSubmit={handleSubmit}
        submitLabel="Add person"
        isSubmitting={createPerson.isPending}
      />
    </div>
  );
}
