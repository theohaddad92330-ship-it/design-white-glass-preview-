import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { acteurDepuisBasicAuth, exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: STOP / force-error ANY user's analysis. Forwards to
// POST /internal/admin/analyses/:id/stop with the internal secret (which never
// reaches the browser). `mode` picks between cancelling a live run (`stop`) and
// freeing a zombie `analyzing` row (`force_error`). The Basic-Auth operator
// identity is forwarded as `actor` so the API audit log records WHO stopped it.

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'analyses.stop')
  if (refus) return refus

  const body = (await req.json().catch(() => ({}))) as { mode?: string }
  const mode = body.mode === 'force_error' ? 'force_error' : 'stop'
  try {
    const { status, data } = await adminMutate('POST', `/analyses/${encodeURIComponent(params.id)}/stop`, {
      mode,
      actor: acteurDepuisBasicAuth(req),
    })
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'analyses.stop',
      category: 'ordinaire',
      subjectType: 'analysis',
      subjectId: params.id,
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
