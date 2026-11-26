import type { TimelineEvent } from '@bellum/contracts'

/** Une ligne du fil : l'événement le plus récent d'un groupe, et combien de fois il s'est répété. */
interface CollapsedTimelineEntry {
  event: TimelineEvent
  count: number
}

/** `YYYY-MM-DD` dans le fuseau du LECTEUR — « le même jour » est celui qu'il voit. */
function localDay(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * #3405 / #3505 (recette prod 01/10) — « Fiche contact ouverte · Gerald »
 * ×4 identiques à la suite le 30/09 : chaque ouverture est journalisée, et six
 * lignes noyaient le reste du fil.
 *
 * Seules les ACTIONS se regroupent, et seulement si elles sont identiques
 * (même type, même libellé, même détail, même contact) le MÊME JOUR. Un
 * mouvement d'opportunité, une exécution de workflow et un changement de statut
 * (`transition`) sont des événements : une ligne chacun. Rien n'est supprimé —
 * le journal garde tout ; seul l'affichage porte l'instant de la plus récente
 * et le nombre. L'ordre d'entrée est conservé.
 */
export function collapseTimelineEvents(events: readonly TimelineEvent[]): CollapsedTimelineEntry[] {
  const entries: CollapsedTimelineEntry[] = []
  const seen = new Map<string, CollapsedTimelineEntry>()
  for (const event of events) {
    if (event.kind !== 'action' || event.transition) {
      entries.push({ event, count: 1 })
      continue
    }
    const key = [event.type, event.label, event.detail ?? '', event.contactId ?? '', localDay(event.at)].join('|')
    const existing = seen.get(key)
    if (existing) {
      existing.count += 1
      if (new Date(event.at).getTime() > new Date(existing.event.at).getTime()) existing.event = event
      continue
    }
    const entry: CollapsedTimelineEntry = { event, count: 1 }
    seen.set(key, entry)
    entries.push(entry)
  }
  return entries
}
