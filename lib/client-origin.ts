import { headers } from "next/headers";

/**
 * The caller's network origin, as far as the proxy chain reports it.
 *
 * Server actions cannot see the socket, so the first hop of `x-forwarded-for`
 * (set by the reverse proxy) is the best available answer, with `x-real-ip` as a
 * fallback. When neither header exists — a direct local request, a test — every
 * caller shares the `unknown` origin, which is still a bucket, not a bypass.
 */
export async function clientOrigin(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return h.get("x-real-ip")?.trim() || "unknown";
}
