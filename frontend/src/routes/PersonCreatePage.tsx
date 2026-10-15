import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { client } from '@/amplify-client';
import { PersonForm } from '@/components/person/PersonForm';
import type { PersonFormValues } from '@/lib/validation';

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

export default function PersonCreatePage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(values: PersonFormValues) {
    setIsSubmitting(true);
    try {
      // `as any`: works around an upstream Amplify Gen 2 typing bug where
      // client.models.X.create()'s inferred input type collapses to a bogus
      // `{ [x: string]: string[] }` shape (aws-amplify/amplify-js#13695).
      // toPersonInput()'s return type is what's actually enforced here.
      const { data, errors } = await client.models.Person.create(toPersonInput(values) as any);
      if (errors || !data) {
        toast.error(errors?.map((e) => e.message).join(', ') ?? 'Failed to create person');
        return;
      }
      toast.success(`${data.name} added`);
      navigate(`/people/${data.id}`);
    } finally {
      setIsSubmitting(false);
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
      <PersonForm onSubmit={handleSubmit} submitLabel="Add person" isSubmitting={isSubmitting} />
    </div>
  );
}
