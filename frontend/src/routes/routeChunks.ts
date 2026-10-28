// Which pages load on first use (see lazy.ts), shared with the build: vite.config.ts inlines
// lazyRouteFor into index.html, so the opening page's code starts loading alongside the main
// bundle instead of after it has run. Kept free of imports for that reason.

export type LazyRoute = 'map' | 'person' | 'newPerson' | 'treeSettings' | 'invite';

/** The lazy page a URL opens, or null for one in the main bundle (the People list, login).
 * Self-contained: it runs on its own in index.html. */
export function lazyRouteFor(pathname: string): LazyRoute | null {
  if (pathname === '/map') return 'map';
  if (pathname === '/people/new') return 'newPerson';
  if (pathname.startsWith('/people/')) return 'person';
  if (pathname.startsWith('/trees/')) return 'treeSettings';
  if (pathname.startsWith('/invite/')) return 'invite';
  return null;
}

/** Each lazy page's module, for finding its chunk in the build. */
export const lazyRouteModules: Record<LazyRoute, string> = {
  map: 'src/routes/MapPage.tsx',
  person: 'src/routes/PersonDetailPage.tsx',
  newPerson: 'src/routes/PersonCreatePage.tsx',
  treeSettings: 'src/routes/TreeSettingsPage.tsx',
  invite: 'src/routes/InvitePage.tsx',
};
