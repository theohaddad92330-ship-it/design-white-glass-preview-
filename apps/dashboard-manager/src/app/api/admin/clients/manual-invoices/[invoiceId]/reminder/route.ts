import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'
import { actorFromRequest } from '@/lib/operator'

// Relais serveur : CONSIGNER une relance qu'un humain vient d'envoyer (#1655,
// règle 4 — « chaque relance est journalisée avec sa date et son auteur »).
//
// ⚠️ CONSIGNER N'EST PAS ENVOYER. Cette route n'a ni destinataire, ni corps de
// message dans son corps de requête : elle enregistre qu'un opérateur a envoyé
// le texte préparé, depuis SA messagerie. Aucun fournisseur d'e-mail n'est
// atteignable d'ici.

export async function POST(req: NextRequest, props: { params: Promise<{ invoiceId: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'invoices.write')
  if (refus) return refus

  const body = (await req.json().catch(() => null)) as { tone?: unknown } | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Corps de requête invalide.' }, { status: 400 })
  }

  // L'auteur est RELU côté serveur, jamais reçu du navigateur : un champ du
  // corps se forge, une session signée non. Sans lui, la trace dirait
  // « quelqu'un », ce qui n'est pas une trace (#1668).
  const actor = await actorFromRequest(req)

  try {
    const { status, data } = await adminMutate(
      'POST',
      `/clients/manual-invoices/${encodeURIComponent(params.invoiceId)}/reminder`,
      { tone: body.tone, actor },
    )
    // #1666 — le journal d'audit unique. CONSIGNER n'est pas ENVOYER : la ligne dit qu'un opérateur a envoyé le
    // texte préparé depuis SA messagerie. C'est bien un geste de la console, et
    // il se relit — mais il ne porte aucun corps de message.
    // Le résultat se DÉDUIT du code rendu : un refus n'est pas une panne.
    await journaliserAudit(req, {
      operation: 'invoices.reminder',
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
