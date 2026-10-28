// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { tree } from '@/lib/map/testTree';
import { useCreateConnection, useDeleteConnection } from './useConnections';
import { useTreeGraph } from './useTreeGraph';

const ok = (data: unknown) => Promise.resolve({ data, error: undefined, response: new Response(null, { status: 200 }) });

let queryClient: QueryClient;
let graphFetches: number;
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  graphFetches = 0;
  vi.spyOn(api, 'GET').mockImplementation(((path: string) => {
    if (path === '/api/trees/{tree_id}/graph') graphFetches++;
    return ok(tree(['Robin'], []));
  }) as never);
  vi.spyOn(api, 'POST').mockImplementation((() => ok({ id: 'c1' })) as never);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useTreeGraph freshness', () => {
  it('reuses the graph on another visit to a map, while it is fresh', async () => {
    // Edits refresh it themselves (below), so a visit needn't fetch the whole tree again.
    const first = renderHook(() => useTreeGraph('ash'), { wrapper });
    await waitFor(() => expect(first.result.current.graph).not.toBeNull());
    first.unmount();
    const second = renderHook(() => useTreeGraph('ash'), { wrapper });
    expect(second.result.current.graph).not.toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(graphFetches).toBe(1);
  });

  it('fetches the graph again after a connection is created', async () => {
    const { result } = renderHook(() => ({ graph: useTreeGraph('ash'), create: useCreateConnection() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.graph.graph).not.toBeNull());
    await act(() => result.current.create.mutateAsync({ personAId: 'Zoe', personBId: 'Robin', type: 'FRIEND' }));
    await waitFor(() => expect(graphFetches).toBe(2));
  });

  it('fetches the graph again every 45 minutes, before its photo links expire', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderHook(() => useTreeGraph('ash'), { wrapper });
      await waitFor(() => expect(graphFetches).toBe(1));
      await act(() => vi.advanceTimersByTimeAsync(44 * 60 * 1000));
      expect(graphFetches).toBe(1);
      await act(() => vi.advanceTimersByTimeAsync(60 * 1000));
      await waitFor(() => expect(graphFetches).toBe(2));
    } finally {
      vi.useRealTimers();
    }
  });

  it('fetches the graph again after a connection is deleted', async () => {
    vi.spyOn(api, 'DELETE').mockImplementation((() => ok(undefined)) as never);
    const { result } = renderHook(() => ({ graph: useTreeGraph('ash'), remove: useDeleteConnection() }), { wrapper });
    await waitFor(() => expect(result.current.graph.graph).not.toBeNull());
    await act(() => result.current.remove.mutateAsync('c1'));
    await waitFor(() => expect(graphFetches).toBe(2));
  });
});
