// Minimal, dependency-free version of Vercel's `waitUntil()` (security/perf
// review 2026-09-04). Extends a serverless invocation's lifetime so
// fire-and-forget background work — here, the best-effort ApiCallLog write
// in lib/apiCallLog.ts — actually finishes instead of racing the instance
// being frozen right after the response is sent, which could otherwise
// silently drop a log row (or a prune's delete) mid-flight.
//
// This is the same mechanism the official `@vercel/functions` package's
// `waitUntil()` uses internally (Vercel's Node runtime sets
// `globalThis[Symbol.for("@vercel/request-context")]` to an object exposing
// `.waitUntil`) — inlined directly rather than adding a dependency for one
// function. A safe no-op anywhere else (local dev, other hosts): the promise
// still runs, it's just not guaranteed to finish before the process exits.
export function waitUntil(promise: Promise<unknown>): void {
  const ctx = (
    globalThis as unknown as {
      [key: symbol]: { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined;
    }
  )[Symbol.for("@vercel/request-context")]?.get?.();

  if (typeof ctx?.waitUntil === "function") {
    ctx.waitUntil(promise);
  }
  // Always attach a catch so an unawaited rejection never surfaces as an
  // unhandled promise rejection, on Vercel or off it.
  promise.catch(() => {});
}
