import { randomUUID } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { exigerCapacite } from '@/lib/guard'

// Launch real IA phases from the dashboard (operator test). Server-side proxy
// to the IA FastAPI service so the browser never holds keys. Runs phases 1..N
// in sequence, chaining each phase's output into the next — so you can test a
// single phase or the whole pipeline. The production path (persistence, BullMQ,
// resume) goes through the NestJS worker; this is a fast IA-only test harness.

const IA_BASE_URL = process.env.IA_BASE_URL ?? 'http://localhost:8000'

type PhaseResult = { name: string; status: number; ms: number; ok: boolean; data?: unknown; error?: string }

function unwrap(body: unknown): unknown {
  const b = body as { data?: unknown } | null
  return (b && typeof b === 'object' && 'data' in b ? b.data : body) ?? {}
}

async function callPhase(path: string, payload: unknown): Promise<PhaseResult & { raw: unknown }> {
  const startedAt = Date.now()
  const res = await fetch(`${IA_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const text = await res.text()
  let raw: unknown = text
  try {
    raw = JSON.parse(text)
  } catch {
    /* keep raw */
  }
  return { name: path, status: res.status, ms: Date.now() - startedAt, ok: res.ok, raw, data: unwrap(raw) }
}

export async function POST(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'analyses.run')
  if (refus) return refus

  const { company, upTo, userContext } = (await req.json().catch(() => ({}))) as {
    company?: string
    upTo?: number
    userContext?: unknown
  }
  const name = (company ?? '').trim()
  // Forwarded to the phases that consume the input contract (research + plan).
  const ctx = userContext ? { user_context: userContext } : {}
  const last = Math.min(4, Math.max(1, Number(upTo) || 1))
  if (!name) return NextResponse.json({ ok: false, phases: [], error: 'Nom d’entreprise requis.' })

  const accountId = randomUUID()
  const phases: PhaseResult[] = []
  const startedAt = Date.now()

  try {
    // Phase 1 — research.
    const p1 = await callPhase('/phase/1/research', { company_name: name, account_id: accountId, ...ctx })
    phases.push(strip(p1, 'research'))
    if (!p1.ok || last < 2) return done(phases, startedAt)
    const research = p1.data as Record<string, unknown>

    // Phase 2 — contacts (Apollo searches by company name; seeds optional).
    const p2 = await callPhase('/phase/2/contacts', { company_name: name, account_id: accountId, seed_contacts: [] })
    phases.push(strip(p2, 'contacts'))
    if (!p2.ok || last < 3) return done(phases, startedAt)
    const contacts = ((p2.data as { contacts?: unknown[] })?.contacts ?? []) as unknown[]

    // Phase 3 — classify.
    const p3 = await callPhase('/phase/3/classify', { account_id: accountId, contacts })
    phases.push(strip(p3, 'classify'))
    if (!p3.ok || last < 4) return done(phases, startedAt)
    const classified = ((p3.data as { contacts?: unknown[] })?.contacts ?? contacts) as unknown[]

    // Phase 4 — plan.
    const p4 = await callPhase('/phase/4/plan', {
      account_id: accountId,
      account_data: research,
      contacts: classified,
      ...ctx,
    })
    phases.push(strip(p4, 'plan'))
    return done(phases, startedAt)
  } catch (err) {
    return NextResponse.json({
      ok: false,
      phases,
      ms: Date.now() - startedAt,
      error: `IA injoignable (${IA_BASE_URL}). Lance le service IA. ${err instanceof Error ? err.message : ''}`,
    })
  }
}

function strip(p: PhaseResult & { raw: unknown }, name: string): PhaseResult {
  return { name, status: p.status, ms: p.ms, ok: p.ok, data: p.data }
}

function done(phases: PhaseResult[], startedAt: number) {
  return NextResponse.json({ ok: phases.every(p => p.ok), phases, ms: Date.now() - startedAt })
}
