// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { queryClient } from '@/api/queryClient';
import { usePersonList } from '@/hooks/usePersonList';

const ok = (data: unknown) => Promise.resolve({ data, error: undefined, response: new Response(null, { status: 200 }) });

let fetches: number;
beforeEach(() => {
  queryClient.clear();
  fetches = 0;
  vi.spyOn(api, 'GET').mockImplementation((() => {
    fetches++;
    return ok([]);
  }) as never);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  queryClient.clear();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

/** Opens the People list, leaves it, and comes back after `minutes`. */
async function revisitAfter(minutes: number) {
  const first = renderHook(() => usePersonList('ash'), { wrapper });
  await waitFor(() => expect(fetches).toBe(1));
  first.unmount();
  await act(() => vi.advanceTimersByTimeAsync(minutes * 60 * 1000));
  renderHook(() => usePersonList('ash'), { wrapper });
  await act(() => vi.advanceTimersByTimeAsync(50));
}

describe('the app query client', () => {
  it('reuses data on coming back within five minutes', async () => {
    await revisitAfter(4);
    expect(fetches).toBe(1);
  });

  it('fetches again once the data is five minutes old', async () => {
    await revisitAfter(6);
    await waitFor(() => expect(fetches).toBe(2));
  });
});
