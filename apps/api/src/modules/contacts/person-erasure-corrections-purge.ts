import type { OrgCorrectionValue } from '@bellum/contracts'
import { parseEdgeKey } from '../org-graph/org-graph-correction'

/**
 * #2297.51 — `org_graph_corrections` EST PURGÉE (décision Louis du 19/09/2026,
 * point 2 du lot). Une correction d'organigramme est, par construction, UNE
 * DONNÉE QUI NOMME QUELQU'UN (`OrgGraphCorrectionEntity` : « toujours un id,
 * jamais un nom (S5, homonymes) »), et le ledger la tient jusqu'ici
 * indéfiniment (tombstone `reverted_at`, jamais un DELETE — même doctrine
 * qu'« on archive, on ne supprime pas », et « une correction humaine gagne
 * toujours » pour ce qu'elle réécrit). L'effacement RGPD (doctrine c67, la
 * SEULE exception nommée aux deux) l'emporte ici aussi : une correction qui la
 * DÉSIGNE part avec le reste — sinon son nom resterait lisible dans le ledger
 * après l'effacement de sa fiche.
 *
 * CE QUI LA DÉSIGNE :
 *   - `objectId` EST son nœud (une correction `person` posée SUR elle) ;
 *   - `objectId` est un lien `from|type|to` (une correction `edge`) DONT un
 *     bout est son nœud — le lien n'a plus de sens sans elle ;
 *   - `oldValue` / `newValue` CONTIENNENT son nœud — un `reportsTo` qui pointe
 *     vers elle depuis la fiche d'un AUTRE, ou un `decisionRoles` qui la cite.
 *
 * Une valeur de texte libre (un `title` qui ne cite aucun identifiant) n'est
 * PAS repérée : ce module ne connaît que des identifiants de graphe, jamais un
 * nom — la même limite, assumée, que `person-erasure-analysis-purge.ts` sur un
 * prénom seul.
 *
 * `nodeIds` vient de `erasedPersonGraphNodeIds` (`person-erasure-analysis-purge.ts`),
 * calculé sur le dossier AVANT sa propre purge — deux fonctions pures, deux
 * tables différentes, une seule identité.
 */
function valueNamesId(value: OrgCorrectionValue, nodeIds: ReadonlySet<string>): boolean {
  if (typeof value === 'string') return nodeIds.has(value)
  if (Array.isArray(value)) return value.some(item => nodeIds.has(item))
  return false
}

export function correctionNamesErasedPerson(
  correction: { objectId: string; oldValue: OrgCorrectionValue; newValue: OrgCorrectionValue },
  nodeIds: ReadonlySet<string>,
): boolean {
  if (nodeIds.size === 0) return false
  if (nodeIds.has(correction.objectId)) return true
  const edge = parseEdgeKey(correction.objectId)
  if (edge && (nodeIds.has(edge.fromId) || nodeIds.has(edge.toId))) return true
  return valueNamesId(correction.oldValue, nodeIds) || valueNamesId(correction.newValue, nodeIds)
}
