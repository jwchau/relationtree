import { useCallback, useEffect, useState } from 'react';
import { client } from '@/amplify-client';
import type { Schema } from '../../amplify/data/resource';

export type Person = Schema['Person']['type'];

export function usePerson(personId: string | undefined) {
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!personId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, errors } = await client.models.Person.get({ id: personId });
      if (errors) {
        setError(errors.map((e) => e.message).join(', '));
      } else {
        setPerson(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load person');
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { person, loading, error, refresh };
}
