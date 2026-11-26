import { NextResponse, type NextRequest } from 'next/server'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

/**
 * LE TEST DE L'ISSUE : « tentative de suppression d'une ligne → refus » (#1666).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ROUTE EXISTE ALORS QU'ELLE NE FAIT RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * Sans elle, un `DELETE /api/admin/audit/<id>` recevrait un **404** de routage.
 * Un 404 se lit comme « cette route n'est pas encore écrite », donc comme
 * quelque chose qu'on pourrait ajouter — et c'est exactement la lecture qu'on
 * refuse. Le **405** dit l'inverse : la ressource existe, et elle ne se modifie
 * pas. Jamais. Par personne.
 *
 * ⚠️ CE N'EST PAS CETTE ROUTE QUI TIENT LA RÈGLE, et il faut le dire :
 * elle serait contournable en appelant l'API directement. Ce qui la tient,
 * c'est que **l'API répond 405 elle aussi** (`AuditJournalController`) et
 * surtout que `AuditJournalService` n'a AUCUNE méthode qui supprime une ligne
 * choisie. On retire le MOYEN, pas seulement la permission — une garde qui
 * vérifierait un rôle laisserait la méthode en place, et une méthode finit
 * toujours par être appelée depuis ailleurs.
 *
 * ⚠️ LA TENTATIVE EST JOURNALISÉE, EN CATÉGORIE `suppression`.
 * Elle échoue, donc son `outcome` est `refus` — mais sa CATÉGORIE la range dans
 * la seule rétention PERMANENTE. Une tentative d'effacer le journal d'audit est
 * précisément la ligne qu'on ne veut pas voir expirer au bout de deux ans.
 */
export const dynamic = 'force-dynamic'

/**
 * Le REFUS lui-même, décrit une fois : les trois verbes rendent le même message.
 *
 * ⚠️ NI `exigerCapacite` NI `journaliserAudit` NE SONT REMONTÉS ICI, et ce n'est
 * pas de la maladresse. Deux gardes du dépôt lisent le CORPS de chaque export,
 * verbe par verbe — `toute-route-declare-sa-capacite.test.ts` et
 * `journal-audit-a-des-ecrivains.test.ts` — précisément pour qu'un appel écrit
 * dans le voisin ne puisse pas satisfaire celui qu'on mesure. Les factoriser
 * rendrait les deux gardes aveugles sur ce fichier, et l'auteur du prochain
 * verbe n'aurait rien pour lui rappeler les deux portes. Seul le TEXTE du refus
 * est partagé : lui, on veut qu'il soit identique.
 */
function refusLectureSeule(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error:
        'Le journal d’audit est en lecture seule : une ligne ne se supprime ni ne se modifie, et aucune purge ' +
        'manuelle n’existe. Les rétentions (24 mois pour les actions ordinaires, 36 pour les permissions, les ' +
        'exports et les impersonations, permanent pour les suppressions) sont appliquées par un passage quotidien ' +
        'qui inscrit au journal ce qu’il a effacé.',
    },
    { status: 405 },
  )
}

/** La ligne d'audit d'une tentative — même forme pour les trois verbes. */
function tentative(id: string, verbe: string) {
  return {
    operation: 'audit.delete_attempt',
    category: 'suppression' as const,
    outcome: 'refus' as const,
    subjectType: 'audit_event',
    subjectId: id.slice(0, 200),
    statusCode: 405,
    detail: `Tentative de ${verbe} sur une ligne du journal d’audit — refusée.`,
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'audit.read')
  if (refus) return refus
  await journaliserAudit(req, tentative(params.id, 'suppression'))
  return refusLectureSeule()
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params
  const refus = await exigerCapacite(req, 'audit.read')
  if (refus) return refus
  await journaliserAudit(req, tentative(params.id, 'modification'))
  return refusLectureSeule()
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params
  const refus = await exigerCapacite(req, 'audit.read')
  if (refus) return refus
  await journaliserAudit(req, tentative(params.id, 'remplacement'))
  return refusLectureSeule()
}
