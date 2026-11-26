import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: grant/adjust a user's credits. Forwards to
// POST /internal/admin/users/:userId/credits with the internal secret (which
// never reaches the browser). Body: { accounts?, enrichment?, reason }. The API
// re-validates (Zod) — this handler only shapes the payload and requires a
// reason + at least one non-zero delta before making the round-trip. Called by
// the grant-credits form on /users/[userId].

export async function POST(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'credits.grant')
  if (refus) return refus

  const body = (await req.json().catch(() => ({}))) as {
    accounts?: unknown
    enrichment?: unknown
    reason?: unknown
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const accounts = Number.isFinite(Number(body.accounts)) ? Math.trunc(Number(body.accounts)) : 0
  const enrichment = Number.isFinite(Number(body.enrichment)) ? Math.trunc(Number(body.enrichment)) : 0

  if (!reason) {
    return NextResponse.json({ ok: false, error: 'Un motif est requis.' }, { status: 400 })
  }
  if (accounts === 0 && enrichment === 0) {
    return NextResponse.json(
      { ok: false, error: 'Indiquer au moins un delta de crédits (analyses ou enrichissements) non nul.' },
      { status: 400 },
    )
  }

  try {
    const { status, data } = await adminMutate('POST', `/users/${encodeURIComponent(params.userId)}/credits`, {
      accounts,
      enrichment,
      reason,
    })
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'credits.grant',
      category: 'ordinaire',
      subjectType: 'user',
      subjectId: params.userId,
      statusCode: status,
    })
    return NextResponse.json(data, { status })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `API injoignable. ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }
}
