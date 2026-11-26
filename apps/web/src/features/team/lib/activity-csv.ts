import type { WorkspaceActivityItem } from '@bellum/contracts'

/**
 * Théo D settings-outils.A4 — le journal d'activité en lignes de CSV. Les faits sont ceux de l'API (jamais recalculés) ;
 * une valeur absente reste une cellule VIDE (ni « null », ni « 0 »), l'acteur se lit par son nom, sinon son e-mail en clair.
 */
export function activityCsvRows(
  items: readonly WorkspaceActivityItem[],
  labels: { header: readonly string[]; event: (name: string) => string },
): string[][] {
  return [
    [...labels.header],
    ...items.map(item => [
      item.occurredAt,
      item.actor.name ?? item.actor.email ?? '',
      labels.event(item.event),
      item.target ?? '',
      item.detail ?? '',
    ]),
  ]
}
