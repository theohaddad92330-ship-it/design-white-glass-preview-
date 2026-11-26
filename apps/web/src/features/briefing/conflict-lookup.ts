import type { AgendaConflict } from '@bellum/contracts'

/**
 * La carte de conflit encode ses deux évènements dans son id
 * (`conflict:${first.id}:${second.id}`, `briefing-actions.ts`) : la clé est
 * reconstruite à l'identique plutôt que devinée.
 *
 * #2938 — extrait d'`ActionsBlock` (page « Aujourd'hui ») pour que
 * `OverflowPriorities` (page `/actions`) résolve la MÊME carte sur la MÊME
 * règle (GA-26, un seul endroit) plutôt que de la recopier.
 */
export function conflictLookupById(conflicts: AgendaConflict[]): Map<string, AgendaConflict> {
  const map = new Map<string, AgendaConflict>()
  for (const conflict of conflicts) map.set(`conflict:${conflict.first.id}:${conflict.second.id}`, conflict)
  return map
}
