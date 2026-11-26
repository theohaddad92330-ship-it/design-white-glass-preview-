import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Relais serveur : DÉCLARER un litige sur une facture, ou le LEVER (#1655).
//
// C'est la porte de la règle « aucune relance sur une facture en litige ».
// Sans elle, l'état existerait en base sans qu'aucun humain puisse le poser —
// une lecture sans chemin d'écriture, la famille de défauts n°1 de ce dépôt.

export async function PATCH(req: NextRequest, props: { params: Promise<{ invoiceId: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'invoices.write')
  if (refus) return refus

  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Corps de requête invalide.' }, { status: 400 })
  }

  try {
    const { status, data } = await adminMutate(
      'PATCH',
      `/clients/manual-invoices/${encodeURIComponent(params.invoiceId)}/dispute`,
      body,
    )
    // #1666 — le journal d'audit unique. Un litige est une DÉCLARATION humaine à portée commerciale : qui l'a
    // posé, et quand, doit se relire. La catégorie reste `ordinaire` — ce n'est
    // ni une permission, ni une suppression — donc 24 mois, la rétention du
    // geste courant.
    // Le résultat se DÉDUIT du code rendu : un refus n'est pas une panne.
    await journaliserAudit(req, {
      operation: 'invoices.dispute',
      category: 'ordinaire',
      subjectType: 'invoice',
      subjectId: params.invoiceId,
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
