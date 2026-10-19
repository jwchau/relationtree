import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, resetCsrfToken, unwrap, type InviteDetails, type TreeRole } from '@/api/client';
import { meQueryKey } from '@/hooks/useAuth';
import { treesQueryKey } from '@/hooks/useTrees';

const invitesKey = (treeId: string) => [...treesQueryKey, treeId, 'invites'];

/** An owner's pending invites for a tree (no tokens: those are shown once, when made). */
export function useInvites(treeId: string) {
  return useQuery({
    queryKey: invitesKey(treeId),
    queryFn: () =>
      unwrap(api.GET('/api/trees/{tree_id}/invites', { params: { path: { tree_id: treeId } } })),
  });
}

export function useCreateInvite(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: TreeRole) =>
      unwrap(
        api.POST('/api/trees/{tree_id}/invites', {
          params: { path: { tree_id: treeId } },
          body: { role },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitesKey(treeId) }),
  });
}

export function useRevokeInvite(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: number) =>
      unwrap(
        api.DELETE('/api/trees/{tree_id}/invites/{invite_id}', {
          params: { path: { tree_id: treeId, invite_id: inviteId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitesKey(treeId) }),
  });
}

/** What an invite link is for, or null when it's dead (unknown, used, revoked or expired). */
export function useInviteDetails(token: string) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: async (): Promise<InviteDetails | null> => {
      const { data, error, response } = await api.GET('/api/invites/{token}', {
        params: { path: { token } },
      });
      if (response.status === 404) return null;
      if (error !== undefined || !data) throw new ApiError(response.status, 'Failed to load invite');
      return data;
    },
    staleTime: Infinity,
  });
}

export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/invites/{token}/accept', { params: { path: { token } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: treesQueryKey }),
  });
}

/** Create an account through the invite. Signs the new user in, like logging in does. */
export function useSignupWithInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      unwrap(api.POST('/api/invites/{token}/signup', { params: { path: { token } }, body })),
    onSuccess: async () => {
      // Django rotates the CSRF token on login.
      resetCsrfToken();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meQueryKey }),
        queryClient.invalidateQueries({ queryKey: treesQueryKey }),
      ]);
    },
  });
}
