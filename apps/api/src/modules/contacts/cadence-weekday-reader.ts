import { SEND_TIMING_WEEKDAYS } from '@bellum/contracts'
import type { CadencePreferredWeekdayReader } from './module-tokens'

type Weekday = (typeof SEND_TIMING_WEEKDAYS)[number]

/** La vue minimale du réglage d'espace (`WorkspaceCommercialLoadSettingsService`) dont la cadence a besoin. */
type ImposedWeekdaySource = { effectiveFor(workspaceId: string): Promise<{ cadenceWeekday?: string | null }> }

/** La vue minimale de la mesure (`SendTimingService`) : le créneau e-mail appris. */
type LearnedWeekdaySource = {
  forWorkspace(
    workspaceId: string,
  ): Promise<{ channels: readonly { channel: string; best?: { weekday: Weekday } | null }[] } | null>
}

/**
 * #3289.29 — le jour de la semaine auquel `CadenceService` cale les relances : celui que l'espace
 * IMPOSE (réglage), sinon celui qu'il a APPRIS (créneau e-mail mesuré), sinon `null` — l'échéancier
 * nominal, jamais un jour deviné. Composé ici (GA-07) : la cadence n'importe aucun des deux services.
 */
export function cadencePreferredWeekdayReader(
  imposed: ImposedWeekdaySource | undefined,
  learned: LearnedWeekdaySource | undefined,
): CadencePreferredWeekdayReader {
  return async workspaceId => {
    if (imposed) {
      try {
        const day = (await imposed.effectiveFor(workspaceId)).cadenceWeekday
        const known = SEND_TIMING_WEEKDAYS.find(weekday => weekday === day)
        if (known) return known
      } catch {
        // Une lecture ratée du réglage ne bloque pas la cadence : on retombe sur le jour appris.
      }
    }
    if (!learned) return null
    const report = await learned.forWorkspace(workspaceId)
    return report?.channels.find(c => c.channel === 'email')?.best?.weekday ?? null
  }
}
