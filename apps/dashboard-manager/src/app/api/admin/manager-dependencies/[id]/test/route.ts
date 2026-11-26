import { type NextRequest, NextResponse } from 'next/server'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'
import { testManagerDependency, type ManagerDependencyId } from '@/lib/manager-dependencies'

const VALID_IDS: readonly ManagerDependencyId[] = ['stripe', 'supabase', 'slack', 'resend', 'vercel', 'github']

function isManagerDependencyId(value: string): value is ManagerDependencyId {
  return (VALID_IDS as readonly string[]).includes(value)
}

/**
 * #1676.2 — « chaque ligne porte un bouton Tester, qui fait un appel réel non
 * destructif et affiche le résultat. » Ce proxy déclenche le test (routé, côté
 * `testManagerDependency`, soit localement — Supabase/Vercel/GitHub — soit
 * vers l'API — Stripe/Resend/Slack) et journalise le geste : un opérateur qui
 * teste Stripe en production laisse une trace, comme n'importe quel appel
 * sortant déclenché depuis la console.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'audit.read')
  if (refus) return refus

  if (!isManagerDependencyId(params.id)) {
    return NextResponse.json(
      { ok: false, detail: `Dépendance inconnue : ${params.id}`, checkedAt: new Date().toISOString() },
      { status: 400 },
    )
  }

  const result = await testManagerDependency(params.id)
  // La route elle-même réussit toujours (200) : c'est le TEST qui peut dire
  // « non configuré » ou « refusé ». `outcome` porte donc ce que le test a
  // trouvé, jamais dérivé d'un code HTTP qui n'a pas varié.
  await journaliserAudit(req, {
    operation: 'manager-dependencies.test',
    category: 'ordinaire',
    subjectType: 'dependency',
    subjectId: params.id,
    outcome: result.ok ? 'succes' : 'echec',
    statusCode: 200,
    detail: result.detail,
  })
  return NextResponse.json(result)
}
