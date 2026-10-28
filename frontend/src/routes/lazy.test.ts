import { describe, expect, it, vi } from 'vitest';
import { preloadRoute, type RouteLoaders } from './lazy';

const loaders = (): RouteLoaders => ({
  map: vi.fn(() => Promise.resolve()),
  person: vi.fn(() => Promise.resolve()),
  newPerson: vi.fn(() => Promise.resolve()),
  treeSettings: vi.fn(() => Promise.resolve()),
  invite: vi.fn(() => Promise.resolve()),
});

const started = (l: RouteLoaders) =>
  Object.entries(l)
    .filter(([, load]) => vi.mocked(load).mock.calls.length > 0)
    .map(([name]) => name);

describe('preloadRoute', () => {
  it.each([
    ['/map', ['map']],
    ['/people/robin', ['person']],
    ['/people/new', ['newPerson']],
    ['/trees/ash', ['treeSettings']],
    ['/invite/abc', ['invite']],
    // The People list and login are in the main bundle already.
    ['/', []],
    ['/login', []],
  ])("starts loading %s's code at once", (path, expected) => {
    const l = loaders();
    preloadRoute(path, l);
    expect(started(l)).toEqual(expected);
  });
});
