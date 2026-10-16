import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Person } from '@/api/client';
import type { RelationshipType } from '@/lib/relationshipTypes';

export interface ConnectionWithPerson {
  connectionId: string;
  relationshipType: RelationshipType;
  /** The other person's role relative to the person being viewed (computed by the API). */
  displayLabel: string;
  otherPerson: Person;
}

export const connectionsQueryKey = ['connections'] as const;

export function useConnections(personId: string | undefined) {
  const query = useQuery({
    queryKey: [...connectionsQueryKey, personId],
    enabled: Boolean(personId),
    queryFn: async (): Promise<ConnectionWithPerson[]> => {
      const rows = await unwrap(
        api.GET('/api/people/{person_id}/connections', {
          params: { path: { person_id: personId! } },
        }),
      );
      return rows.map((row) => ({
        connectionId: row.id,
        relationshipType: row.type,
        displayLabel: row.label,
        otherPerson: row.other_person,
      }));
    },
  });
  return {
    connections: query.data ?? [],
    loading: query.isPending,
    error: query.error?.message ?? null,
  };
}

// A connection shows up on two people's lists, so mutations invalidate every
// ['connections', ...] query rather than guessing which ones changed.

export function useCreateConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { personAId: string; personBId: string; type: RelationshipType }) =>
      unwrap(
        api.POST('/api/connections', {
          body: { person_a_id: input.personAId, person_b_id: input.personBId, type: input.type },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectionsQueryKey }),
  });
}

export function useDeleteConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      unwrap(
        api.DELETE('/api/connections/{connection_id}', {
          params: { path: { connection_id: connectionId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectionsQueryKey }),
  });
}
