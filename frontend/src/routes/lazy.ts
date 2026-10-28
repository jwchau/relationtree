import { lazy } from 'react';
import { lazyRouteFor, type LazyRoute } from './routeChunks';

// Pages loaded on first use, so the People list (the usual first page) doesn't wait for the
// map and d3, settings or invites. The People list and login stay in the main bundle.
export const routeLoaders: Record<LazyRoute, () => Promise<unknown>> = {
  map: () => import('@/routes/MapPage'),
  person: () => import('@/routes/PersonDetailPage'),
  newPerson: () => import('@/routes/PersonCreatePage'),
  treeSettings: () => import('@/routes/TreeSettingsPage'),
  invite: () => import('@/routes/InvitePage'),
};

export type RouteLoaders = typeof routeLoaders;

export const MapPage = lazy(() => import('@/routes/MapPage'));
export const PersonDetailPage = lazy(() => import('@/routes/PersonDetailPage'));
export const PersonCreatePage = lazy(() => import('@/routes/PersonCreatePage'));
export const TreeSettingsPage = lazy(() => import('@/routes/TreeSettingsPage'));
export const InvitePage = lazy(() => import('@/routes/InvitePage'));

/** Starts loading the code for the page the app opened on. Signed-in pages wait for the
 * session before they render, so without this their code would only start loading after it,
 * one more step in a row. In a build, index.html has already asked for it (vite.config.ts);
 * this covers the dev server. */
export function preloadRoute(pathname: string, loaders: RouteLoaders = routeLoaders): void {
  const route = lazyRouteFor(pathname);
  if (route) void loaders[route]().catch(() => undefined);
}
