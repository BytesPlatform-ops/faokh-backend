/**
 * Data-mode switch.
 *
 * `mock`  — everything is served from the in-memory demo store. No network.
 * `api`   — everything is served from the NestJS backend.
 *
 * Pages never read this. Only the service adapters do, so the day the backend
 * is repaired the switch is one environment variable and zero page edits.
 */
export type DataMode = 'mock' | 'api';

const CONFIGURED_MODE = process.env.NEXT_PUBLIC_DATA_MODE as DataMode | undefined;

/**
 * Production must never silently serve demo data.
 *
 * A deployment that reaches real users with the mode unset, or set to `mock`,
 * would show a broker fabricated inventory and let them "book" a unit that does
 * not exist — a failure that looks like a working application, which is far
 * worse than one that refuses to start.
 *
 * `NODE_ENV` cannot be the signal on its own: `next build` sets it to
 * `production` for every build, including the optimised build the mock-mode E2E
 * suite runs against. So a mock production build is allowed only when somebody
 * has explicitly said so, and that acknowledgement is exactly what a real
 * deployment will not have.
 */
const MOCK_BUILD_ACKNOWLEDGED = process.env.NEXT_PUBLIC_ALLOW_MOCK_BUILD === '1';

if (
  process.env.NODE_ENV === 'production' &&
  CONFIGURED_MODE !== 'api' &&
  !MOCK_BUILD_ACKNOWLEDGED
) {
  throw new Error(
    'NEXT_PUBLIC_DATA_MODE must be "api" for a production build. ' +
      `It is currently ${CONFIGURED_MODE === undefined ? 'unset' : `"${CONFIGURED_MODE}"`}. ` +
      'Mock mode serves fabricated inventory and must never reach real users. ' +
      'To build the demo store deliberately (local testing, E2E), also set ' +
      'NEXT_PUBLIC_ALLOW_MOCK_BUILD=1.',
  );
}

export const DATA_MODE: DataMode = CONFIGURED_MODE ?? 'mock';

export const IS_MOCK = DATA_MODE === 'mock';

const CONFIGURED_API_URL = process.env.NEXT_PUBLIC_API_URL;

if (!IS_MOCK && (CONFIGURED_API_URL === undefined || CONFIGURED_API_URL.trim() === '')) {
  throw new Error(
    'NEXT_PUBLIC_API_URL must be set when NEXT_PUBLIC_DATA_MODE=api. ' +
      'Falling back to localhost would make every screen fail with a network error ' +
      'that looks like the backend being down.',
  );
}

export const API_BASE_URL = CONFIGURED_API_URL ?? 'http://localhost:4000';

/**
 * Simulated latency.
 *
 * Deliberately non-zero: without it, every screen renders instantly in mock
 * mode and the loading and skeleton states are never seen — so they rot, and
 * ship broken the first time a real network is involved.
 */
export async function simulateLatency(ms = 220): Promise<void> {
  if (!IS_MOCK) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thin fetch wrapper for `api` mode.
 *
 * Authentication travels as a Supabase bearer token rather than a cookie, so
 * the API needs no CSRF machinery: a cross-site page cannot read the token out
 * of Supabase's storage, and nothing is attached ambiently by the browser.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { getAccessToken } = await import('@/lib/supabase');
  const token = await getAccessToken();

  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: { message?: string } }).error.message ?? 'Request failed')
        : 'Request failed';
    // 401 is worth naming explicitly: the UI can send the user back to sign-in
    // rather than showing "Request failed" on every panel at once.
    if (response.status === 401) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

/** Thrown by adapters for paths the backend has not implemented yet, so an
 *  accidental `api`-mode switch fails loudly rather than rendering blanks. */
export function notImplementedInApiMode(operation: string): never {
  throw new Error(
    `${operation} is not yet available in api mode — the NestJS backend is still being repaired. ` +
      'Set NEXT_PUBLIC_DATA_MODE=mock.',
  );
}
