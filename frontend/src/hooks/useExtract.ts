import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Proposal } from '@/api/client';
import { connectionsQueryKey } from '@/hooks/useConnections';
import { peopleQueryKey } from '@/hooks/usePersonList';

/** Ask the AI to read a note into proposed people and connections. Saves nothing. */
export function useExtract(treeId: string) {
  return useMutation({
    mutationFn: (text: string) =>
      unwrap(api.POST('/api/extract', { params: { query: { tree: treeId } }, body: { text } })),
  });
}

/** Save the reviewed proposal in one go. */
export function useApplyExtract(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Proposal) =>
      unwrap(api.POST('/api/extract/apply', { params: { query: { tree: treeId } }, body })),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
        queryClient.invalidateQueries({ queryKey: connectionsQueryKey }),
      ]),
  });
}
