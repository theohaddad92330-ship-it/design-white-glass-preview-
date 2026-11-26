import { type NextRequest, NextResponse } from 'next/server'
import { exigerCapacite } from '@/lib/guard'

// Server-side proxy for the API console — the internal secret never reaches the
// browser. Calls the operator telemetry endpoints and returns the raw response
// (status + timing + body) so the UI can show exactly what the API answered.

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3012'
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? ''

export async function POST(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'analyses.run')
  if (refus) return refus

  const { endpoint, limit, accountId } = (await req.json().catch(() => ({}))) as {
    endpoint?: string
    limit?: string | number
    accountId?: string
  }

  const path =
    endpoint === 'detail' && accountId
      ? `/internal/telemetry/${encodeURIComponent(accountId)}`
      : `/internal/telemetry?limit=${Number(limit) || 50}`

  const startedAt = Date.now()
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'x-internal-secret': INTERNAL_API_SECRET },
      cache: 'no-store',
    })
    const text = await res.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      /* keep raw text */
    }
    return NextResponse.json({ ok: res.ok, status: res.status, ms: Date.now() - startedAt, path, body })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      status: 0,
      ms: Date.now() - startedAt,
      path,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
