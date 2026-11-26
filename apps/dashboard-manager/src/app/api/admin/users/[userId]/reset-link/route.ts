import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: generate a password-recovery link for a user. Forwards to
// POST /internal/admin/users/:userId/reset-link with the internal secret (which
// never reaches the browser). Returns the API's { link, email, expiresAt, ttl,
// clamped } to the operator to copy — we deliberately never auto-log-in on the
// user's behalf. Called by the reset-link island on /users/[userId].
//
// La DURÉE demandée est transmise telle quelle. Elle n'est pas validée ici : le
// contrat de l'API la refuse si elle n'est pas une des quatre clés, et
// dupliquer la liste ici en ferait une seconde vérité qui divergerait au premier
// choix ajouté.

export async function POST(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'users.resetLink')
  if (refus) return refus

  try {
    // Un corps absent ou illisible n'est pas une erreur : l'API applique alors
    // son défaut (48 heures), ce qui est exactement ce qu'on veut.
    const body = await req.json().catch(() => ({}))
    const { status, data } = await adminMutate('POST', `/users/${encodeURIComponent(params.userId)}/reset-link`, body)
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'users.reset_link',
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
