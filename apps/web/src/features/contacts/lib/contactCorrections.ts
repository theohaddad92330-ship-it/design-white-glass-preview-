import type { OrgGraphCorrection } from '@bellum/contracts'

/**
 * #2150.60 — « la fiche Contact conserve les corrections. »
 *
 * Le ledger `org_graph_corrections` est déjà exposé, en entier, par
 * `GET /accounts/:accountId/org-graph/corrections` (org-graph.controller.ts) —
 * le même que l'onglet Organigramme du compte lit (GA-26 : une seule source).
 * Cette fonction ne fait qu'un TRI, côté client : la fiche d'un contact ne
 * montre que ce qui LE concerne.
 *
 * ⚠️ Une correction ANNULÉE reste — « on archive, on ne supprime pas » — le
 * tri ne filtre jamais sur `revertedAt`.
 *
 * Le format d'une clé de lien est `fromId|type|toId` (`edgeKey`,
 * apps/api/.../org-graph-correction.ts) : un simple split, pas une
 * revalidation du type de lien — ce fichier ne décide rien du graphe, il lit
 * une clé déjà écrite.
 */
export function contactCorrectionsFor(
  corrections: readonly OrgGraphCorrection[],
  contactId: string,
): OrgGraphCorrection[] {
  return corrections.filter(entry => correctionTouchesContact(entry, contactId))
}

function correctionTouchesContact(entry: OrgGraphCorrection, contactId: string): boolean {
  if (entry.objectType === 'person') return entry.objectId === contactId
  if (entry.objectType === 'edge') {
    const [fromId, , toId] = entry.objectId.split('|')
    return fromId === contactId || toId === contactId
  }
  return false
}
