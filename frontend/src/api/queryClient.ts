import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry network blips, but not real API answers (404, 403, 422...).
      retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 2,
      staleTime: 30_000,
    },
  },
});
