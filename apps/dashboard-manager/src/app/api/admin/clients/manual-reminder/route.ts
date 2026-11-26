import { type NextRequest, NextResponse } from 'next/server'
import { fetchBillingReminder } from '@/lib/billing-calendar'
import { exigerCapacite } from '@/lib/guard'

// Relais serveur : la relance PRÉPARÉE d'une période en retard (#1655).
//
// ⚠️ LECTURE SEULE, ET AUCUN ENVOI. Cette route rend un objet, dont un sujet et
// un corps de message. Elle ne connaît aucun fournisseur de messagerie, n'écrit
// rien, et le seul appel réseau qu'elle fait est vers NOTRE API — c'est le
// secret interne qui reste côté serveur, jamais dans le navigateur.
//
// ⚠️ La capacité exigée est `invoices.write`, alors que le geste est une
// lecture. C'est délibéré et plus strict que nécessaire : préparer la relance
// d'une facture, c'est lire des coordonnées de facturation et un montant, et
// `/facturation` est déjà fermé aux seuls `owner`. Une capacité de lecture
// dédiée serait plus fine — elle est SIGNALÉE dans le rapport de ce lot plutôt
// qu'inventée ici : la matrice des rôles n'appartient pas à ce lot.

export async function GET(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'invoices.write')
  if (refus) return refus

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  const periodStart = req.nextUrl.searchParams.get('periodStart')
  if (!workspaceId || !periodStart) {
    return NextResponse.json(
      { ok: false, error: 'Il faut un espace et une période — aucune des deux ne se devine.' },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json(await fetchBillingReminder(workspaceId, periodStart, req.nextUrl.searchParams.get('tone')))
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `API injoignable. ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }
}
