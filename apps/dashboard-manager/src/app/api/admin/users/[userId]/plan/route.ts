import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate, type PlanKey } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: change a user's plan/offer. Forwards to the API's
// PATCH /internal/admin/users/:userId/plan with the internal secret (which never
// reaches the browser). Called by the inline plan control on /users.

// Current catalog keys — must match the API's assignPlanSchema. The stale
// ['pro','business'] were rejected upstream (400), so team/growth could never be
// assigned and the user's accounts_limit never re-synced to the plan nominal.
const PLANS: PlanKey[] = ['trial', 'starter', 'team', 'growth', 'beta']

export async function PATCH(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'users.plan')
  if (refus) return refus

  const { plan } = (await req.json().catch(() => ({}))) as { plan?: string }
  if (!plan || !PLANS.includes(plan as PlanKey)) {
    return NextResponse.json({ ok: false, error: `Plan invalide (attendu : ${PLANS.join(', ')}).` }, { status: 400 })
  }
  try {
    const { status, data } = await adminMutate('PATCH', `/users/${encodeURIComponent(params.userId)}/plan`, { plan })
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'users.plan',
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
