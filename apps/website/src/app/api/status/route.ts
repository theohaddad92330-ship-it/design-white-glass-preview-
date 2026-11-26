import { NextResponse } from 'next/server'

/**
 * Same-origin proxy for the public API status. The /status page polls this
 * route (no CORS dependency on the API's FRONTEND_URL list) and the route
 * forwards to `GET <API>/status` — which does the real dependency checks and
 * caches them 15s server-side.
 *
 * `API_URL` is server-only (no NEXT_PUBLIC_ prefix): the browser never needs
 * it, and the payload passed through contains nothing sensitive by contract.
 */
const API_URL = process.env.API_URL ?? 'https://api.bellum-ai.com'
const UPSTREAM_TIMEOUT_MS = 5_000

const NO_STORE = { 'cache-control': 'no-store' } as const

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(new URL('/status', API_URL), {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) {
      throw new Error(`upstream /status returned HTTP ${res.status}`)
    }
    const payload = (await res.json()) as Record<string, unknown>
    return NextResponse.json(payload, { headers: NO_STORE })
  } catch {
    // An unreachable API is itself the strongest "down" signal — report it
    // honestly instead of inventing component states (no fake data).
    return NextResponse.json(
      { status: 'unreachable', checkedAt: new Date().toISOString() },
      { status: 502, headers: NO_STORE },
    )
  }
}
