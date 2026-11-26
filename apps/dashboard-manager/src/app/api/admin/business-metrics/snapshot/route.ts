import { type NextRequest, NextResponse } from 'next/server'
import { businessMetricsMutate } from '@/lib/business-metrics'
import { exigerCapacite, operateurDeLaRequete } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Relais serveur : FIGER un mois de MRR (#1645).
//
// Le passage du 1er le fait tout seul ; ce chemin sert au premier instantané de
// la série, qu'on ne veut pas attendre un mois pour avoir.
//
// ⚠️ Figer est une écriture IRRÉVERSIBLE par construction — un mois figé n'est
// jamais recalculé. Le plancher est donc `owner`, comme le reste des revenus.

export async function POST(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'treasury.write')
  if (refus) return refus

  const body = (await req.json().catch(() => null)) as unknown
  const operateur = await operateurDeLaRequete(req)

  try {
    const { status, data } = await businessMetricsMutate(
      'POST',
      '/snapshot',
      body && typeof body === 'object' ? body : {},
      operateur?.email ?? null,
    )
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'business_metrics.snapshot',
      category: 'ordinaire',
      subjectType: 'business_metrics',
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
