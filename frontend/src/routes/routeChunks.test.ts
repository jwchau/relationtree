import { describe, expect, it } from 'vitest';
import { lazyRouteFor, lazyRouteModules } from './routeChunks';
import { routeLoaders } from './lazy';

const cases: [string, string | null][] = [
  ['/map', 'map'],
  ['/people/robin', 'person'],
  ['/people/new', 'newPerson'],
  ['/trees/ash', 'treeSettings'],
  ['/invite/abc', 'invite'],
  // In the main bundle already.
  ['/', null],
  ['/login', null],
];

describe('lazyRouteFor', () => {
  it.each(cases)('names the lazy page for %s', (path, expected) => {
    expect(lazyRouteFor(path)).toBe(expected);
  });

  it('works on its own, as index.html runs it before the app loads', () => {
    // The build inlines its source; it mustn't lean on anything outside itself.
    const standalone = new Function(`return (${lazyRouteFor.toString()})`)() as typeof lazyRouteFor;
    for (const [path, expected] of cases) expect(standalone(path)).toBe(expected);
  });

  it('knows the module of every lazy page', () => {
    expect(Object.keys(lazyRouteModules).sort()).toEqual(Object.keys(routeLoaders).sort());
  });
});
