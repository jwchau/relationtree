import type { Person, PersonInput } from '@/api/client';
import type { PersonFormValues } from '@/lib/validation';

/** Form values (camelCase, '' for empty) → API body (snake_case, null for empty dates). */
export function toPersonInput(values: PersonFormValues): PersonInput {
  return {
    name: values.name,
    relationship_category: values.relationshipCategory,
    context: values.context ?? '',
    phone: values.phone ?? '',
    email: values.email ?? '',
    address: values.address ?? '',
    birthday: values.birthday || null,
    notes: values.notes ?? '',
    last_contacted_date: values.lastContactedDate || null,
  };
}

export function toFormValues(person: Person): PersonFormValues {
  return {
    name: person.name,
    relationshipCategory: person.relationship_category,
    context: person.context,
    phone: person.phone,
    email: person.email,
    address: person.address,
    birthday: person.birthday ?? '',
    notes: person.notes,
    lastContactedDate: person.last_contacted_date ?? '',
  };
}
