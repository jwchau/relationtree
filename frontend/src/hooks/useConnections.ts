import { useCallback, useEffect, useState } from 'react';
import { client } from '@/amplify-client';
import {
  relationshipLabel,
  inverseRelationshipLabel,
  type RelationshipType,
} from '@/lib/relationshipTypes';
import type { Schema } from '../../amplify/data/resource';

type ConnectionRecord = Schema['Connection']['type'];
type PersonRecord = Schema['Person']['type'];

export interface ConnectionWithPerson {
  connectionId: string;
  relationshipType: RelationshipType;
  displayLabel: string;
  otherPerson: PersonRecord;
}

async function resolveOtherPerson(otherPersonId: string): Promise<PersonRecord | null> {
  const { data } = await client.models.Person.get({ id: otherPersonId });
  return data;
}

export function useConnections(personId: string | undefined) {
  const [connections, setConnections] = useState<ConnectionWithPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!personId) return;
    setLoading(true);
    setError(null);
    try {
      const [asA, asB] = await Promise.all([
        client.models.Connection.listConnectionByPersonAId({ personAId: personId }),
        client.models.Connection.listConnectionByPersonBId({ personBId: personId }),
      ]);
      const errors = [...(asA.errors ?? []), ...(asB.errors ?? [])];
      if (errors.length > 0) {
        setError(errors.map((e) => e.message).join(', '));
        setConnections([]);
        return;
      }

      const records: { conn: ConnectionRecord; isPersonA: boolean }[] = [
        ...asA.data.map((conn) => ({ conn, isPersonA: true })),
        ...asB.data.map((conn) => ({ conn, isPersonA: false })),
      ];

      const resolved = await Promise.all(
        records.map(async ({ conn, isPersonA }) => {
          const otherPersonId = isPersonA ? conn.personBId : conn.personAId;
          const otherPerson = await resolveOtherPerson(otherPersonId);
          if (!otherPerson || !conn.relationshipType) return null;
          const relationshipType = conn.relationshipType as RelationshipType;
          const displayLabel = isPersonA
            ? relationshipLabel(relationshipType)
            : inverseRelationshipLabel(relationshipType);
          const result: ConnectionWithPerson = {
            connectionId: conn.id,
            relationshipType,
            displayLabel,
            otherPerson,
          };
          return result;
        }),
      );

      setConnections(resolved.filter((c): c is ConnectionWithPerson => c !== null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { connections, loading, error, refresh };
}
