/**
 * #4291.8 — la mission qui suit un projet GAGNÉ.
 *
 * Le lien est celui que la base écrit (`missions.opportunity_id`) ; il n'est jamais déduit d'un nom de client ni
 * d'un montant. Aucune mission trouvée ⇒ `null`, et l'écran garde « Créer la mission » : on relie et on nomme,
 * on ne crée rien tout seul.
 */
export function missionOfProject(
  projectId: string,
  missions: ReadonlyArray<{ id: string; label: string; opportunity_id: string | null }> | undefined,
): { id: string; label: string } | null {
  const found = missions?.find(mission => mission.opportunity_id === projectId && mission.label.trim() !== '')
  return found ? { id: found.id, label: found.label } : null
}
