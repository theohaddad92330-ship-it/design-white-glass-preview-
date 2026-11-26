import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: suspend (ban) a user. Forwards to
// POST /internal/admin/users/:userId/suspend with the internal secret (which
// never reaches the browser). Called by the suspend toggle on /users/[userId].

export async function POST(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'users.suspend')
  if (refus) return refus

  try {
    const { status, data } = await adminMutate('POST', `/users/${encodeURIComponent(params.userId)}/suspend`)
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'users.suspend',
      category: 'permission',
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
