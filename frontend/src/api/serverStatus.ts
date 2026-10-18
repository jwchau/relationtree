import { useSyncExternalStore } from 'react';

/**
 * Whether the API was reachable on the last request. The frontend (Cloudflare Pages) is always
 * up, but the home server only runs some of the time, so "offline" is a normal state.
 */
export type ServerStatus = 'online' | 'offline';

let status: ServerStatus = 'online';
const listeners = new Set<() => void>();

export function setServerStatus(next: ServerStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useServerStatus(): ServerStatus {
  return useSyncExternalStore(subscribe, () => status);
}
