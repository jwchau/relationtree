import { useCallback, useEffect, useState } from 'react';
import { client } from '@/amplify-client';
import type { Schema } from '../../amplify/data/resource';

export type PersonSummary = Schema['Person']['type'];

export function usePersonList() {
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, errors } = await client.models.Person.list();
      if (errors) {
        setError(errors.map((e) => e.message).join(', '));
      } else {
        setPeople(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load people');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { people, loading, error, refresh };
}
