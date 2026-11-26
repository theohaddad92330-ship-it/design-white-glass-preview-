import type { Activity } from '@bellum/contracts'

/**
 * #3697.8 — la dernière objection RÉELLEMENT EXPRIMÉE par le contact, avec sa provenance.
 *
 * Elle n'a qu'une source : le débrief d'un appel CONSIGNÉ par le commercial (`callDebrief.objection`,
 * saisi dans « Consigner un appel »). Une objection que le support d'appel ANTICIPE
 * (`EngagementObjections`) est une possibilité : elle n'entre jamais ici, et rien d'autre ne la
 * déduit. La provenance (l'appel, sa date) voyage avec le texte — « jamais une valeur sans son origine ».
 *
 * Absente ⇒ `null` : aucune ligne, jamais une objection fabriquée.
 */
type ExpressedObjection = { text: string; at: string }

export function lastExpressedObjection(
  activities: readonly Pick<Activity, 'kind' | 'occurredAt' | 'callDebrief'>[],
): ExpressedObjection | null {
  let best: ExpressedObjection | null = null
  for (const activity of activities) {
    if (activity.kind !== 'call') continue
    const text = activity.callDebrief?.objection?.trim()
    if (!text) continue
    if (!best || Date.parse(activity.occurredAt) > Date.parse(best.at)) best = { text, at: activity.occurredAt }
  }
  return best
}
