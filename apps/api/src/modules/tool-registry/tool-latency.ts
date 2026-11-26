import type { ToolLatency } from '@bellum/contracts'

/** Une synchronisation réelle : quand la donnée a changé côté outil (source),
 *  quand elle est arrivée dans Bellum. Jamais une moyenne devinée. */
export type LatencyObservation = { sourceAt: Date; arrivedAt: Date }

const WINDOW_DAYS = 7
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000
/** En dessous, une moyenne dirait plus qu'elle ne sait — trois points réels
 *  minimum avant d'afficher un ordre de grandeur (jamais 0, jamais 1 point). */
const MIN_SAMPLES = 3

function formatDuration(ms: number): { fr: string; en: string } {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return { fr: '< 1 min', en: '< 1 min' }
  if (minutes < 60) return { fr: `~${minutes} min`, en: `~${minutes} min` }
  const hours = Math.round(minutes / 60)
  return { fr: `~${hours} h`, en: `~${hours} h` }
}

/**
 * #2261.13 (décision Louis 19/09) — la latence probable d'un outil connecté,
 * MESURÉE sur ses synchronisations réelles, jamais une valeur de doc.
 *
 * `wired` distingue deux raisons de « non mesuré » qui n'ont pas le même
 * avenir : un outil dont Bellum ne capture pas encore l'horodatage source
 * (`wired: false`) ne progressera JAMAIS sans un changement de code — dire
 * « pas assez de mesures pour l'instant » serait faux, ça laisserait croire
 * que ça vient. Un outil câblé avec un échantillon encore trop petit
 * (`wired: true`, count < 3) progressera, lui, tout seul au fil des vraies
 * synchronisations — la raison le dit avec le compte réel.
 *
 * Pure : ni horloge ni base ne sont lues ici — `now` et `observations` sont
 * les deux seules entrées, ce qui rend la fonction testable sans mock.
 */
export function measureToolLatency(
  observations: readonly LatencyObservation[],
  now: Date,
  wired: boolean,
): ToolLatency {
  if (!wired) {
    return {
      source: 'not_measured',
      reason: {
        fr: "Bellum ne capture pas encore l'horodatage source de cet outil pour calculer ce délai.",
        en: "Bellum does not yet capture this tool's source timestamp to compute this delay.",
      },
    }
  }

  const windowStart = now.getTime() - WINDOW_MS
  const inWindow = observations.filter(o => {
    const arrived = o.arrivedAt.getTime()
    const source = o.sourceAt.getTime()
    // Une source APRÈS l'arrivée est une incohérence d'horloge, pas une
    // mesure : on l'écarte plutôt que d'afficher un délai négatif.
    return arrived >= windowStart && arrived <= now.getTime() && source <= arrived
  })

  if (inWindow.length < MIN_SAMPLES) {
    return {
      source: 'not_measured',
      reason: {
        fr: `Pas assez de synchronisations réelles pour mesurer (${inWindow.length} sur les ${WINDOW_DAYS} derniers jours, ${MIN_SAMPLES} nécessaires).`,
        en: `Not enough real synchronizations to measure (${inWindow.length} in the last ${WINDOW_DAYS} days, ${MIN_SAMPLES} needed).`,
      },
    }
  }

  const totalMs = inWindow.reduce((sum, o) => sum + (o.arrivedAt.getTime() - o.sourceAt.getTime()), 0)
  const avgMs = totalMs / inWindow.length

  return {
    source: 'measured',
    value: formatDuration(avgMs),
    as_of: now.toISOString(),
    window_days: WINDOW_DAYS,
    sample_count: inWindow.length,
  }
}
