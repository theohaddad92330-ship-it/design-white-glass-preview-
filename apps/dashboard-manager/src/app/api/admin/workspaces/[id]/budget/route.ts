import { type NextRequest, NextResponse } from 'next/server'
import { workspaceBudgetLeversSchema } from '@bellum/contracts'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: pose les cinq leviers de coût IA d'UN espace (#2975, #2440.83-89).
// Relaie vers PUT /internal/admin/workspaces/:id/budget avec le secret interne ; appelée par le
// panneau « Plafonds de coût IA » de /esn/[id]. Le coût ne s'affiche jamais côté application :
// ce réglage n'existe qu'ici.

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'workspaces.write')
  if (refus) return refus

  const parsed = workspaceBudgetLeversSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Plafonds invalides : un montant positif en dollars, ou vide, et deux interrupteurs.' },
      { status: 400 },
    )
  }
  try {
    const { status, data } = await adminMutate(
      'PUT',
      `/workspaces/${encodeURIComponent(params.id)}/budget`,
      parsed.data,
    )
    await journaliserAudit(req, {
      operation: 'workspaces.budget.update',
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
