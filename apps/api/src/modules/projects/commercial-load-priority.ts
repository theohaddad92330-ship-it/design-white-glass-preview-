/**
 * #2035.11 — la priorisation des besoins par la charge commerciale, PURE et
 * sans base.
 *
 * Un besoin dont le porteur (`owner_id`) a atteint ou dépassé le plafond de
 * l'espace (`WorkspaceCommercialLoadSettingsService.maxOpenNeedsFor`, réglé sur
 * `workspace_commercial_load_settings.max_open_needs`) passe APRÈS les
 * besoins dont le porteur a encore de la marge — jamais un score pondéré,
 * jamais une probabilité : une comparaison à un entier déjà connu.
 *
 * `openNeedsByOwner` est calculé par l'appelant (`OpenNeedsService`, un
 * `GROUP BY owner_id` sur les besoins ouverts) — cette fonction ne lit rien,
 * elle ne fait que RANGER ce qu'on lui donne.
 */
export function sortByCommercialLoad<T extends { owner_id: string | null }>(
  rows: readonly T[],
  openNeedsByOwner: ReadonlyMap<string, number>,
  maxOpenNeeds: number,
): T[] {
  // Sans porteur : personne à qui reprocher la charge, jamais déprioritisé.
  const atCapacity = (row: T): boolean =>
    row.owner_id !== null && (openNeedsByOwner.get(row.owner_id) ?? 0) >= maxOpenNeeds
  // `Array.prototype.sort` est STABLE (ECMA-262 depuis ES2019, V8 aussi) :
  // l'ordre déjà posé par l'appelant (deadline ASC, created_at DESC) ne bouge
  // pas entre deux besoins de même charge. `[...rows]` : la liste reçue n'est
  // jamais mutée.
  return [...rows].sort((a, b) => Number(atCapacity(a)) - Number(atCapacity(b)))
}
