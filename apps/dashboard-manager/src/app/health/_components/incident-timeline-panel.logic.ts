import type { IncidentTimelineEntry } from '@/lib/operator-health'

/**
 * #2445.12 (épopée #2766) — le libellé d'UNE transition, tel qu'affiché sur la
 * chronologie. Deux mots, jamais une couleur seule (D79/GA-33).
 */
export function depuisCombienDeTemps(occurredAt: string, now: Date = new Date()): string | null {
  // #2445.12 — vue de triage : « depuis 5 h ». Date illisible → null, jamais « depuis 0 min ».
  const ms = now.getTime() - new Date(occurredAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `depuis ${minutes} min`
  const heures = Math.floor(minutes / 60)
  if (heures < 24) return `depuis ${heures} h`
  return `depuis ${Math.floor(heures / 24)} j`
}

export function libelleTransition(transition: IncidentTimelineEntry['transition']): string {
  return transition === 'degraded' ? 'a cessé de répondre' : 's’est rétablie'
}
