/**
 * A self-owned typing for the global `fetch`.
 *
 * `@types/node` does not declare `Response`, `RequestInit` and friends
 * outright. It declares them as `typeof globalThis extends { onmessage: any }
 * ? {} : import('undici-types').Response`, so that a project which also loads
 * the DOM lib gets the DOM's version instead of a clashing second one. The
 * branch is decided by whatever else happens to be on the type graph — the
 * `lib` setting, which `@types/*` packages the package manager put where the
 * compiler looks, whether `undici-types` resolved at all — and when it lands
 * on the empty-object side (or `undici-types` is unreachable and
 * `skipLibCheck` swallows the resulting error in the `.d.ts`), `Response`
 * silently becomes `{}` and every `response.ok` in the codebase stops
 * compiling. That is what broke the Vercel build while the same commit,
 * lockfile and TypeScript version compiled locally.
 *
 * Rather than pin down that environment, this module declares the small slice
 * of the fetch API the server actually uses and casts the global once. The
 * shapes are stable web-standard ones — a wrong cast here would be a runtime
 * bug, and there is exactly one place to look.
 */

/** The part of a fetch `Response` this codebase reads. */
export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

/** The part of `RequestInit` this codebase sets. */
export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  /**
   * `AbortSignal`, kept opaque for the same reason as the rest of this file:
   * it is passed straight back to `fetch` and never inspected.
   */
  signal?: unknown;
}

/** `fetch`, typed against the interfaces above. */
export const httpFetch = fetch as unknown as (
  input: string,
  init?: FetchInit,
) => Promise<FetchResponse>;
