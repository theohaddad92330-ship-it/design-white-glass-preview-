import type { SelectFieldOption } from '@bellum/ui'

type WithOwner = { owner_id?: string | null }

/**
 * Théo C projects-pipeline.R8/N1 — LE SÉLECTEUR DE RESPONSABLE du pipe (« Tous les responsables »).
 *
 * `''` = tous. Une affaire sans responsable n'est celle de personne : aucun choix nominatif ne la garde, mais « tous »
 * la montre — le filtre ne cache que ce qu'on lui demande de cacher.
 */
export function filterByOwner<T extends WithOwner>(projects: readonly T[], ownerId: string): T[] {
  if (!ownerId) return [...projects]
  return projects.filter(project => project.owner_id === ownerId)
}

/** Les responsables RÉELS du pipe, nommés et triés. Un nom inconnu ne fait aucune ligne : jamais un identifiant brut. */
export function ownerOptions(
  projects: readonly WithOwner[],
  ownerName: (ownerId: string | null) => string | null,
): SelectFieldOption[] {
  const seen = new Set<string>()
  const options: SelectFieldOption[] = []
  for (const project of projects) {
    const id = project.owner_id
    if (!id || seen.has(id)) continue
    seen.add(id)
    const label = ownerName(id)
    if (label) options.push({ value: id, label })
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}
