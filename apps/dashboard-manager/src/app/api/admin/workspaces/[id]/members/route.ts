import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: add a member (by userId + optional role) to an ESN.
// Forwards to POST /internal/admin/workspaces/:id/members with the internal
// secret. Called by the "add member" form on /esn/[id].

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'workspaces.write')
  if (refus) return refus

  const { userId, role } = (await req.json().catch(() => ({}))) as { userId?: string; role?: string }
  const uid = (userId ?? '').trim()
  if (!uid) return NextResponse.json({ ok: false, error: 'userId requis.' }, { status: 400 })
  const body = role ? { userId: uid, role } : { userId: uid }
  try {
    const { status, data } = await adminMutate('POST', `/workspaces/${encodeURIComponent(params.id)}/members`, body)
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'workspaces.member_add',
      category: 'permission',
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
