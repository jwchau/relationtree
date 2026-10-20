import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useCurrentTree } from '@/hooks/useCurrentTree';
import { useCreatePerson } from '@/hooks/usePerson';
import { PersonForm } from '@/components/person/PersonForm';
import { PageBand, PageBody } from '@/components/kiln/Page';
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
    <>
      <PageBand
        back={{ to: '/', label: 'Back to people' }}
        title="Add person"
        meta={tree && <span>Adding to {tree.name}</span>}
      />
      <PageBody>
        <div className="panel max-w-[640px] p-5 sm:p-6">
          <PersonForm
            onSubmit={handleSubmit}
            submitLabel="Add person"
            isSubmitting={createPerson.isPending}
          />
        </div>
      </PageBody>
    </>
  );
}
