import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Person } from '@/api/client';
import { peopleQueryKey } from './usePersonList';
import type { ParentKind, RelationshipType } from '@/lib/relationshipTypes';

export interface ConnectionWithPerson {
  connectionId: string;
  relationshipType: RelationshipType;
  /** The other person's plain role relative to the person being viewed (computed by the
   * API); `connectionLabel` makes it specific with the kind below. */
  displayLabel: string;
  parentKind: ParentKind | null;
  ended: boolean;
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
        parentKind: row.parent_kind,
        ended: row.ended,
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
    mutationFn: (input: {
      personAId: string;
      personBId: string;
      type: RelationshipType;
      parentKind?: ParentKind | null;
      ended?: boolean;
    }) =>
      unwrap(
        api.POST('/api/connections', {
          body: {
            person_a_id: input.personAId,
            person_b_id: input.personBId,
            type: input.type,
            // Only the fields that fit the type; the API rejects the others.
            ...(input.type === 'PARENT' && input.parentKind && { parent_kind: input.parentKind }),
            ...(input.type === 'SPOUSE' && input.ended && { ended: true }),
          },
        }),
      ),
    // A new link can connect someone to the map (FG-11), and the map's graph sits under ['people'].
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: connectionsQueryKey }),
      queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
    ]),
  });
}

/** Changes a link's parent kind or whether a partnership has ended (FG-8). */
export function useEditConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { connectionId: string; parentKind?: ParentKind; ended?: boolean }) =>
      unwrap(
        api.PATCH('/api/connections/{connection_id}', {
          params: { path: { connection_id: input.connectionId } },
          body: {
            ...(input.parentKind !== undefined && { parent_kind: input.parentKind }),
            ...(input.ended !== undefined && { ended: input.ended }),
          },
        }),
      ),
    // The map draws these too, and its graph sits under ['people'].
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: connectionsQueryKey }),
      queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
    ]),
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
    // Removing a link can disconnect someone from the map, whose graph sits under ['people'].
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: connectionsQueryKey }),
      queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
    ]),
  });
}
