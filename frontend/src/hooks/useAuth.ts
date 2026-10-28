import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, resetCsrfToken, unwrap, type User } from '@/api/client';

export const meQueryKey = ['me'] as const;

/** The logged-in user, or null when there is no session. Shared with the startup prefetch. */
export const meQuery = queryOptions({
  queryKey: meQueryKey,
  queryFn: async (): Promise<User | null> => {
    const { data, error, response } = await api.GET('/api/auth/me');
    if (response.status === 401) return null;
    if (error !== undefined || !data) throw new ApiError(response.status, 'Failed to load session');
    return data;
  },
  staleTime: Infinity,
});

export function useMe() {
  return useQuery(meQuery);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      unwrap(api.POST('/api/auth/login', { body: credentials })),
    onSuccess: (user) => {
      resetCsrfToken();
      queryClient.setQueryData(meQueryKey, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/logout')),
    onSettled: () => {
      resetCsrfToken();
      // Update ['me'] in place (RequireAuth is subscribed to it and redirects), then drop the
      // rest of the cached data. queryClient.clear() would orphan RequireAuth's subscription.
      queryClient.setQueryData(meQueryKey, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meQueryKey[0] });
    },
  });
}
