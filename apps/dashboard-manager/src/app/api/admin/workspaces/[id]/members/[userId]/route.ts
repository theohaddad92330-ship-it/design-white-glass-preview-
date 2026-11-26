import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: remove a member from an ESN. Forwards to
// DELETE /internal/admin/workspaces/:id/members/:userId with the internal
// secret. The API refuses to remove the owner. Called by the remove button on
// /esn/[id].

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string; userId: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'workspaces.write')
  if (refus) return refus

  try {
    const { status, data } = await adminMutate(
      'DELETE',
      `/workspaces/${encodeURIComponent(params.id)}/members/${encodeURIComponent(params.userId)}`,
    )
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'workspaces.member_remove',
      category: 'permission',
      subjectType: 'workspace_member',
      subjectId: params.userId,
      subjectLabel: params.id,
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
