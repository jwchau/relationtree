import createClient, { type Middleware } from 'openapi-fetch';
import type { components, paths } from './schema';
import { setServerStatus } from './serverStatus';

export type Person = components['schemas']['PersonOut'];
export type PersonInput = components['schemas']['PersonIn'];
export type PersonPatch = components['schemas']['PersonPatch'];
export type User = components['schemas']['UserOut'];

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// The API is on another origin, so the frontend can't read its csrftoken cookie.
// Fetch the token once and send it back as X-CSRFToken on unsafe requests.
// Django rotates the token on login/logout, so those call resetCsrfToken().
let csrfToken: Promise<string> | null = null;

function getCsrfToken(): Promise<string> {
  csrfToken ??= fetch(`${API_URL}/api/auth/csrf`, { credentials: 'include' })
    .then((r) => r.json() as Promise<{ csrf_token: string }>)
    .then((body) => body.csrf_token)
    .catch((err: unknown) => {
      csrfToken = null;
      throw err;
    });
  return csrfToken;
}

export function resetCsrfToken() {
  csrfToken = null;
}

let onUnauthorized: () => void = () => {};

/** Called when a request gets 401 (session expired or logged out elsewhere). */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const middleware: Middleware = {
  async onRequest({ request }) {
    if (!SAFE_METHODS.has(request.method)) {
      request.headers.set('X-CSRFToken', await getCsrfToken());
    }
    return request;
  },
  onResponse({ request, response }) {
    setServerStatus('online');
    const isAuthProbe = request.url.endsWith('/api/auth/me') || request.url.endsWith('/api/auth/login');
    if (response.status === 401 && !isAuthProbe) onUnauthorized();
    return response;
  },
  onError() {
    // fetch() itself failed: the home server (or its tunnel) is down. Not an auth problem.
    setServerStatus('offline');
  },
};

export const api = createClient<paths>({ baseUrl: API_URL, credentials: 'include' });
api.use(middleware);

function errorMessage(error: unknown, response: Response): string {
  const detail = (error as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === 'string') return detail;
  // Ninja validation errors: { detail: [{ loc: [...], msg: '...' }] }
  if (Array.isArray(detail)) {
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => `${d.loc?.at(-1) ?? 'field'}: ${d.msg}`)
      .join(', ');
  }
  if (response.status === 429) return 'Too many failed attempts. Try again later.';
  return `Request failed (${response.status})`;
}

/** Turn an openapi-fetch result into its data, or throw an ApiError. */
export async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request;
  if (error !== undefined || !response.ok) {
    throw new ApiError(response.status, errorMessage(error, response));
  }
  return data as T;
}
