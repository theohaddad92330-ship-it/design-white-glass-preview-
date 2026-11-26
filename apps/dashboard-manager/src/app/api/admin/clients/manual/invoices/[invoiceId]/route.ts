import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Proxy côté serveur : encaisser une facture, ou corriger une saisie. Pas de
// DELETE — une facture fausse se corrige ; un journal troué ne se rapproche
// plus de la comptabilité qu'il reflète.

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
      `/clients/manual/invoices/${encodeURIComponent(params.invoiceId)}`,
      body,
    )
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'invoices.update',
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
