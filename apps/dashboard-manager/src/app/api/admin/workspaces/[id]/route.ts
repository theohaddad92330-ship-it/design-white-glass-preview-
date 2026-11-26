import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: rename an ESN (workspace). Forwards to
// PATCH /internal/admin/workspaces/:id with the internal secret. Called by the
// rename control on /esn/[id].

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'workspaces.write')
  if (refus) return refus

  const { name } = (await req.json().catch(() => ({}))) as { name?: string }
  const cleanName = (name ?? '').trim()
  if (!cleanName) return NextResponse.json({ ok: false, error: 'Nom de l’ESN requis.' }, { status: 400 })
  try {
    const { status, data } = await adminMutate('PATCH', `/workspaces/${encodeURIComponent(params.id)}`, {
      name: cleanName,
    })
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'workspaces.update',
      category: 'ordinaire',
      subjectType: 'workspace',
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
