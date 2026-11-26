import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { actorFromRequest } from '@/lib/operator'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: bulk-clean a finished state (default `failed`). Forwards to
// POST /internal/admin/queues/:name/clean?state=… with the internal secret
// (which never reaches the browser). The API enforces the queue-name allowlist,
// rejects non-finished states, and audit-logs the mutation with the operator
// `actor`.
export async function POST(req: NextRequest, props: { params: Promise<{ name: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'queues.write')
  if (refus) return refus

  const state = req.nextUrl.searchParams.get('state') ?? 'failed'
  try {
    const { status, data } = await adminMutate(
      'POST',
      `/queues/${encodeURIComponent(params.name)}/clean?state=${encodeURIComponent(state)}`,
      { actor: await actorFromRequest(req) },
    )
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'queues.clean',
      category: 'suppression',
      subjectType: 'queue',
      subjectId: params.name,
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
