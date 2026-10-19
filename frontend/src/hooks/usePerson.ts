import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  api,
  unwrap,
  type Person,
  type PersonInput,
  type PersonPatch,
} from '@/api/client';
import { connectionsQueryKey } from '@/hooks/useConnections';
import { peopleQueryKey } from '@/hooks/usePersonList';
import { removePersonPhoto, uploadPersonPhoto } from '@/lib/photoStorage';

export type { Person };

export function usePerson(personId: string | undefined) {
  const query = useQuery({
    queryKey: [...peopleQueryKey, personId],
    enabled: Boolean(personId),
    queryFn: async (): Promise<Person | null> => {
      const { data, error, response } = await api.GET('/api/people/{person_id}', {
        params: { path: { person_id: personId! } },
      });
      if (response.status === 404) return null;
      if (error !== undefined || !data) throw new ApiError(response.status, 'Failed to load person');
      return data;
    },
  });
  return { person: query.data ?? null, loading: query.isPending, error: query.error?.message ?? null };
}

// Mutations invalidate the ['people'] prefix, which also refreshes every ['people', id] query.

export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PersonInput) => unwrap(api.POST('/api/people', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
  });
}

export function useUpdatePerson(personId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PersonPatch) =>
      unwrap(
        api.PATCH('/api/people/{person_id}', { params: { path: { person_id: personId } }, body }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
  });
}

/** Mark (or unmark) this person as the current user, so Ask understands "me" and "my". */
export function useSetMe(personId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (isMe: boolean) => {
      const params = { params: { path: { person_id: personId } } };
      if (isMe) await unwrap(api.PUT('/api/people/{person_id}/me', params));
      else await unwrap(api.DELETE('/api/people/{person_id}/me', params));
    },
    // Marking someone unmarks whoever was "me" before, so refresh everyone.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
  });
}

export function useDeletePerson(personId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(api.DELETE('/api/people/{person_id}', { params: { path: { person_id: personId } } })),
    // The API also deletes the person's connections (shown on other people's pages) and photo.
    onSuccess: () => invalidatePeopleAndConnections(queryClient),
  });
}

// People (and their photos) also appear inside other people's connection lists and graphs.
function invalidatePeopleAndConnections(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
    queryClient.invalidateQueries({ queryKey: connectionsQueryKey }),
  ]);
}

export function useUploadPhoto(personId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadPersonPhoto(personId, file),
    onSuccess: () => invalidatePeopleAndConnections(queryClient),
  });
}

export function useRemovePhoto(personId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => removePersonPhoto(personId),
    onSuccess: () => invalidatePeopleAndConnections(queryClient),
  });
}
