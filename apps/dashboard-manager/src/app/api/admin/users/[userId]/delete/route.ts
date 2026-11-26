import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: irreversibly delete a user. Forwards to
// DELETE /internal/admin/users/:userId with the internal secret (which never
// reaches the browser). Called by the delete island on /users/[userId] AFTER an
// explicit confirm step. Uses POST here (a form-style action) but maps to the
// API's DELETE verb.
//
// #1664.2 — the confirmation word typed on the screen is forwarded AS the
// API's confirmation body. The API is the real gate (its Zod schema rejects
// anything but the exact word) — this proxy just carries it through rather
// than silently dropping it, which would leave a caller of this DM route
// (not just the API) able to skip confirmation.

export async function POST(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'users.delete')
  if (refus) return refus

  const body = (await req.json().catch(() => ({}))) as { confirm?: string }
  try {
    const { status, data } = await adminMutate('DELETE', `/users/${encodeURIComponent(params.userId)}`, {
      confirm: body.confirm,
    })
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'users.delete',
      category: 'suppression',
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
