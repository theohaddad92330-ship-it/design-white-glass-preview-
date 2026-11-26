import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'
import { actorFromRequest } from '@/lib/operator'

// LUDOVIC-D LC.10 — proxy serveur : TERMINER une session d'incarnation en cours. Relaie
// POST /internal/admin/impersonations/:jti/terminate avec le secret interne (jamais vu du
// navigateur). Qui termine (`admin_actor`) est DÉRIVÉ côté serveur — jamais lu du client — et
// enregistré dans l'audit d'incarnation (ligne `stop`, `ended_by`). Même capacité que démarrer.

export async function POST(req: NextRequest, props: { params: Promise<{ jti: string }> }) {
  const params = await props.params
  const refus = await exigerCapacite(req, 'impersonate')
  if (refus) return refus

  try {
    const { status, data } = await adminMutate('POST', `/impersonations/${encodeURIComponent(params.jti)}/terminate`, {
      admin_actor: await actorFromRequest(req),
    })
    await journaliserAudit(req, {
      operation: 'impersonations.terminate',
      category: 'impersonation',
      subjectType: 'impersonation',
      subjectId: params.jti,
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
