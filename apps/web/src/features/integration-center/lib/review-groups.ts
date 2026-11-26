import type { CrmReadConflict, CrmReadStatus } from '@bellum/contracts'

/**
 * Théo D settings-integrations.N3 — un GROUPE de l'onglet « À relire » : une fiche (contact ou société) dont un ou
 * plusieurs champs diffèrent entre Bellum (valeur gardée) et l'outil branché (valeur proposée).
 *
 * Les écarts d'une même fiche partagent l'identifiant de l'événement journalisé (`id`) : un seul bloc, un seul
 * « Appliquer ces choix ». La ligne de démonstration n'a pas d'identifiant — elle se regroupe par fiche et par date,
 * et ses gestes sont des aperçus (aucune écriture).
 */
export type ReviewGroup = {
  key: string
  /** Identifiant de l'événement journalisé ; absent sur la ligne de démonstration. */
  eventId: string | null
  provider: CrmReadStatus['provider']
  entityType: CrmReadConflict['entityType']
  entityLabel: string | null
  at: string
  demo: boolean
  fields: CrmReadConflict[]
}

export function buildReviewGroups(statuses: readonly CrmReadStatus[]): ReviewGroup[] {
  const groups = new Map<string, ReviewGroup>()
  for (const status of statuses) {
    for (const item of status.conflictItems ?? []) {
      const key = item.id ?? `${status.provider}|${item.entityLabel ?? item.entityType}|${item.at}`
      const known = groups.get(key)
      if (known) {
        known.fields.push(item)
        continue
      }
      groups.set(key, {
        key,
        eventId: item.id ?? null,
        provider: status.provider,
        entityType: item.entityType,
        entityLabel: item.entityLabel ?? null,
        at: item.at,
        demo: status.demo === true,
        fields: [item],
      })
    }
  }
  return [...groups.values()].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}
