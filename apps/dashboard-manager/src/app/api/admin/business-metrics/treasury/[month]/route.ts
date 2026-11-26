import { type NextRequest, NextResponse } from 'next/server'
import { businessMetricsMutate } from '@/lib/business-metrics'
import { exigerCapacite, operateurDeLaRequete } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Relais serveur : saisir ou CORRIGER un mois de trésorerie (#1649).
//
// ⚠️ Aucune écriture vers la facturation. Cette route pose le solde bancaire de
// l'ENTREPRISE, pas celui d'un client — elle ne touche ni prix, ni abonnement,
// ni facture. C'est aussi pourquoi son plancher est `owner`.

export async function PUT(req: NextRequest, props: { params: Promise<{ month: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'treasury.write')
  if (refus) return refus

  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Corps de requête invalide.' }, { status: 400 })
  }

  // L'auteur est RELU côté serveur, jamais reçu du navigateur : un champ du
  // corps se forge, une session signée non.
  const operateur = await operateurDeLaRequete(req)

  try {
    const { status, data } = await businessMetricsMutate(
      'PUT',
      `/treasury/${encodeURIComponent(params.month)}`,
      body,
      operateur?.email ?? null,
    )
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'treasury.write',
      category: 'ordinaire',
      subjectType: 'treasury_month',
      subjectId: params.month,
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
