import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type TreeRole } from '@/api/client';
import { peopleQueryKey } from '@/hooks/usePersonList';

export const treesQueryKey = ['trees'] as const;

/** The trees the user belongs to, with their role in each. */
export const treesQuery = queryOptions({
  queryKey: treesQueryKey,
  queryFn: () => unwrap(api.GET('/api/trees')),
});

export function useTrees() {
  return useQuery(treesQuery);
}

export function useMembers(treeId: string) {
  return useQuery({
    queryKey: [...treesQueryKey, treeId, 'members'],
    queryFn: () =>
      unwrap(api.GET('/api/trees/{tree_id}/members', { params: { path: { tree_id: treeId } } })),
  });
}

// Tree mutations invalidate ['trees'], which covers the list (names, roles, member counts) and
// every members list.

export function useCreateTree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => unwrap(api.POST('/api/trees', { body: { name } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: treesQueryKey }),
  });
}

export function useRenameTree(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      unwrap(
        api.PATCH('/api/trees/{tree_id}', { params: { path: { tree_id: treeId } }, body: { name } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: treesQueryKey }),
  });
}

export function useAddMember(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; role: TreeRole }) =>
      unwrap(api.POST('/api/trees/{tree_id}/members', { params: { path: { tree_id: treeId } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: treesQueryKey }),
  });
}

export function useChangeRole(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: TreeRole }) =>
      unwrap(
        api.PATCH('/api/trees/{tree_id}/members/{user_id}', {
          params: { path: { tree_id: treeId, user_id: userId } },
          body: { role },
        }),
      ),
    // Changing my own role changes what I can do with the tree's people.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: treesQueryKey }),
  });
}

/** Remove a member, or leave the tree when it's the current user. */
export function useRemoveMember(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      unwrap(
        api.DELETE('/api/trees/{tree_id}/members/{user_id}', {
          params: { path: { tree_id: treeId, user_id: userId } },
        }),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: treesQueryKey }),
        queryClient.invalidateQueries({ queryKey: peopleQueryKey }),
      ]),
  });
}
