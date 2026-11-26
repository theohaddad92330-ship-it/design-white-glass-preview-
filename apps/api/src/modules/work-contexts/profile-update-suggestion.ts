/**
 * #2455.6 — « Mise à jour du profil principal jamais automatique, diff affiché ».
 *
 * `WorkContextsService` n'écrit jamais dans `profiles`/`esn_profiles`
 * (#2455.8, garde dans `work-contexts.service.spec.ts`). Cette fonction PURE
 * (aucune I/O, aucune écriture) calcule seulement le diff À PROPOSER quand un
 * contexte personnel a été activé assez souvent pour dire « usage régulier »
 * ET que ses secteurs divergent du profil actuel — jamais une proposition sur
 * une activation isolée, jamais une écriture décidée seule.
 */

type ProfileUpdateSuggestion = {
  field: 'target_sectors'
  current: string[]
  suggested: string[]
}

/**
 * Sous ce nombre d'activations, une seule utilisation ne prouve rien — un
 * contexte essayé une fois n'est pas un usage régulier.
 */
export const REGULAR_USAGE_ACTIVATIONS = 3

export function suggestProfileUpdateFromUsage(input: {
  contextSectors: readonly string[]
  activationCount: number
  currentTargetSectors: readonly string[]
}): ProfileUpdateSuggestion | null {
  if (input.activationCount < REGULAR_USAGE_ACTIVATIONS) return null
  if (input.contextSectors.length === 0) return null

  const current = [...input.currentTargetSectors]
  const suggested = [...new Set(input.contextSectors)]
  const currentSet = new Set(current)
  const same = current.length === suggested.length && suggested.every(sector => currentSet.has(sector))
  if (same) return null

  return { field: 'target_sectors', current, suggested }
}
