import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry network blips, but not real API answers (404, 403, 422...).
      retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 2,
      // Your own edits invalidate what they change, so data only goes out of date through
      // another member's edits to a shared tree; those show within five minutes, or on reload.
      // Shorter made every return to a page or to the tab refetch it.
      staleTime: 5 * 60 * 1000,
    },
  },
});
