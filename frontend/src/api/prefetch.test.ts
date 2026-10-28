// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { prefetchStartup } from '@/api/prefetch';
import { queryClient as appQueryClient } from '@/api/queryClient';
import { usePersonList } from '@/hooks/usePersonList';

// What each call asked for, as "path id": requests are left hanging, so everything listed
// was started before any of them answered.
let started: string[];
let answer: (path: string) => Promise<unknown>;
const hanging = () => new Promise<never>(() => {});

beforeEach(() => {
  started = [];
  answer = hanging;
  vi.spyOn(api, 'GET').mockImplementation(((path: string, init?: { params?: Record<string, Record<string, string>> }) => {
    const params = init?.params ?? {};
    const id = Object.values({ ...params.path, ...params.query })[0];
    started.push(id ? `${path} ${id}` : path);
    return answer(path);
  }) as never);
});
afterEach(() => vi.restoreAllMocks());

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('prefetchStartup', () => {
  it('starts the session, the trees and the remembered tree\'s people together on the People page', () => {
    prefetchStartup(client(), '/', 'ash');
    expect(started).toEqual(['/api/auth/me', '/api/trees', '/api/people ash']);
  });

  it("starts a person, their connections and the tree's graph on a person's page", () => {
    prefetchStartup(client(), '/people/robin', 'ash');
    expect(started).toEqual([
      '/api/auth/me',
      '/api/trees',
      '/api/people/{person_id} robin',
      '/api/people/{person_id}/connections robin',
      '/api/trees/{tree_id}/graph ash',
    ]);
  });

  it("starts the tree's graph on the map", () => {
    prefetchStartup(client(), '/map', 'ash');
    expect(started).toEqual(['/api/auth/me', '/api/trees', '/api/trees/{tree_id}/graph ash']);
  });

  it('starts only the session and the trees without a remembered tree, or on other pages', () => {
    prefetchStartup(client(), '/', null);
    prefetchStartup(client(), '/trees/ash/settings', 'ash');
    expect(started).toEqual(['/api/auth/me', '/api/trees', '/api/auth/me', '/api/trees']);
  });

  it('lets a failed request go quietly: the page asks again and shows the error itself', async () => {
    answer = () => Promise.reject(new TypeError('Failed to fetch'));
    const queryClient = client();
    await expect(prefetchStartup(queryClient, '/', 'gone')).resolves.toBeUndefined();
  });

  it('hands the People page its list without asking again', async () => {
    answer = (path) =>
      Promise.resolve({
        data: path === '/api/people' ? [{ id: 'p1' }] : [],
        error: undefined,
        response: new Response(null, { status: 200 }),
      });
    // The app's own client, with its stale time: what main.tsx prefetches into.
    appQueryClient.clear();
    await prefetchStartup(appQueryClient, '/', 'ash');
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: appQueryClient }, children);

    const { result } = renderHook(() => usePersonList('ash'), { wrapper });

    await waitFor(() => expect(result.current.people).toEqual([{ id: 'p1' }]));
    expect(started.filter((s) => s.startsWith('/api/people '))).toHaveLength(1);
  });
});
