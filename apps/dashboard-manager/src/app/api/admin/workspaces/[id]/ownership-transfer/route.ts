import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// #4158.33 — transfert de propriété d'un espace (back-office seulement). Relaie vers
// POST /internal/admin/workspaces/:id/ownership-transfer avec le secret interne ; appelée
// par le panneau « Transférer la propriété » de /esn/[id], APRÈS l'aperçu.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'workspaces.write')
  if (refus) return refus

  const { newOwnerUserId } = (await req.json().catch(() => ({}))) as { newOwnerUserId?: string }
  if (!newOwnerUserId || !UUID.test(newOwnerUserId)) {
    return NextResponse.json({ ok: false, error: 'Choisis le nouveau propriétaire.' }, { status: 400 })
  }
  try {
    const { status, data } = await adminMutate(
      'POST',
      `/workspaces/${encodeURIComponent(params.id)}/ownership-transfer`,
      {
        newOwnerUserId,
      },
    )
    // #1666 — le journal d’audit unique. Une propriété qui change de main est un
    // geste de PERMISSION : sa trace ne doit pas expirer comme une ligne ordinaire.
    await journaliserAudit(req, {
      operation: 'workspaces.ownership_transfer',
      category: 'permission',
      subjectType: 'workspace',
      subjectId: params.id,
      subjectLabel: newOwnerUserId,
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
