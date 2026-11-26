/**
 * #3666.3 — UN SEUL vocabulaire d'état pour les opérations longues
 * (analyse, import) : en attente / en cours / terminée / partielle / interrompue.
 *
 * #4295.1 — le vocabulaire vit désormais dans `@bellum/contracts` (`operation-status.ts`), partagé avec l'API
 * et ce que Laura lit : ce fichier le RÉEXPORTE, il ne le redéclare pas (GA-26).
 */
export { analysisOperationStatus, importOperationStatus, type OperationStatus } from '@bellum/contracts'

/**
 * #3666.6 — « fichier reçu ≠ import terminé ». `received` : le fichier est là,
 * RIEN n'est écrit. `written` : des lignes sont en base (en totalité ou en
 * partie — l'état d'opération dit laquelle). Le troisième palier,
 * « exploitable par Laura », est {@link importReadableByLaura}.
 */
export function importStage(state: string): 'received' | 'written' | null {
  if (state === 'draft' || state === 'simulated') return 'received'
  if (state === 'applied' || state === 'partial') return 'written'
  return null
}

/**
 * #3666.6 — « exploitable par Laura ». Aucun état d'indexation n'existe, et c'est
 * un fait de construction, pas une lacune : les objets qu'un import écrit
 * (contacts, comptes, besoins, tags…) sont des tables structurées que Laura lit
 * EN DIRECT (`copilot-contacts-search`, outils `search_workspace_contacts` /
 * `get_account_contacts`), sans étape d'indexation. Écrit = lisible, donc le
 * palier se déduit de l'état — et ne s'affiche jamais avant la première ligne écrite.
 */
export function importReadableByLaura(state: string): boolean {
  return importStage(state) === 'written'
}
