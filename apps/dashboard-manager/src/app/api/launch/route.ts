import { type NextRequest, NextResponse } from 'next/server'
import { exigerCapacite } from '@/lib/guard'

// Launch a REAL analysis through the NestJS worker (persisted, resumable) so it
// shows up live in the Monitoring — created immediately as `analyzing`, then
// `completed` with full per-phase telemetry once the worker finishes.
//
// This is the production path (BullMQ → worker → Postgres), unlike `/api/analyze`
// which hits the IA FastAPI phases directly and never persists. Always targets
// the REAL API; the internal secret stays server-side and never reaches the
// browser.

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000'
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

// userContext is either a structured AnalysisContext preset object or free text;
// forwarded verbatim to the API, which validates + renders it. profileData is the
// ESN's OWN profile (offers/sectors/size/no-go) — it conditions the whole run
// (insider detection, no-go gate, fit-angle), so the SAME company yields a
// different dossier per profile. Forwarded verbatim to /internal/analyze.
type LaunchBody = { company?: string; userContext?: unknown; profileData?: Record<string, unknown>; fresh?: boolean }

export async function POST(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'analyses.run')
  if (refus) return refus

  const { company, userContext, profileData, fresh } = (await req.json().catch(() => ({}))) as LaunchBody
  const name = (company ?? '').trim()
  if (!name) return NextResponse.json({ ok: false, error: 'Nom d’entreprise requis.' }, { status: 400 })
  if (!INTERNAL_SECRET) {
    return NextResponse.json(
      { ok: false, error: 'INTERNAL_API_SECRET non configuré côté dashboard — impossible d’appeler l’API.' },
      { status: 500 },
    )
  }

  try {
    const res = await fetch(`${API_BASE}/internal/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({
        company: name,
        fresh: fresh ?? true,
        ...(userContext ? { userContext } : {}),
        ...(profileData && Object.keys(profileData).length > 0 ? { profileData } : {}),
      }),
      cache: 'no-store',
    })
    const text = await res.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      /* keep raw text for the error message */
    }
    if (!res.ok) {
      const message =
        (body as { message?: string } | null)?.message ?? (typeof body === 'string' ? body : `HTTP ${res.status}`)
      return NextResponse.json({ ok: false, error: `L’API a répondu ${res.status} — ${message}` }, { status: 502 })
    }
    const {
      accountId,
      jobId,
      fresh: wasFresh,
    } = (body ?? {}) as {
      accountId?: string
      jobId?: string
      fresh?: boolean
    }
    return NextResponse.json({ ok: true, accountId, jobId, fresh: wasFresh })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `API injoignable (${API_BASE}). ${err instanceof Error ? err.message : ''}` },
      { status: 502 },
    )
  }
}
