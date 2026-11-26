import { z } from 'zod'

/**
 * #3278.3 (#3259.7) — « les presets de timing/canal cèdent devant les
 * résultats MESURÉS du workspace ».
 *
 * Ce qui se mesure : parmi les messages/appels SORTANTS d'un canal, la part
 * qui a reçu une activité ENTRANTE du même contact dans les
 * {@link CHANNEL_REPLY_WINDOW_DAYS} jours. Un envoi plus récent que la fenêtre
 * n'est pas encore jugeable : il n'entre pas au dénominateur.
 *
 * Le seuil ({@link CHANNEL_MIN_SAMPLE}) et la fenêtre vivent ICI, à UN seul
 * endroit (GA-26) ; l'IA ne reçoit que le drapeau `sufficient` et ne recalcule
 * aucun seuil. Sous le seuil, le canal reste « non mesuré » : `replyRate` est
 * `null`, jamais 0.
 */
export const CHANNEL_PERFORMANCE_CHANNELS = ['email', 'call', 'linkedin'] as const

export const CHANNEL_REPLY_WINDOW_DAYS = 14
export const CHANNEL_MIN_SAMPLE = 10

export const channelPerformanceSchema = z
  .object({
    channel: z.enum(CHANNEL_PERFORMANCE_CHANNELS),
    sent: z.number().int().min(1),
    replied: z.number().int().min(0),
    sufficient: z.boolean(),
    replyRate: z.number().int().min(0).max(100).nullable(),
  })
  .refine(row => row.replied <= row.sent, { message: 'replied cannot exceed sent' })
  .refine(row => row.sufficient === (row.replyRate !== null), {
    message: 'a rate exists only with a sufficient sample',
  })

export const channelPerformanceListSchema = z.array(channelPerformanceSchema)
export type ChannelPerformance = z.infer<typeof channelPerformanceSchema>

/** Agrège des comptages bruts en faits mesurés ; écarte canal inconnu / sans envoi. */
export function toChannelPerformance(
  rows: ReadonlyArray<{ channel: string; sent: number; replied: number }>,
): ChannelPerformance[] {
  const known: readonly string[] = CHANNEL_PERFORMANCE_CHANNELS
  return rows
    .filter(row => known.includes(row.channel) && row.sent > 0)
    .map(row => {
      const sufficient = row.sent >= CHANNEL_MIN_SAMPLE
      return channelPerformanceSchema.parse({
        channel: row.channel,
        sent: row.sent,
        replied: row.replied,
        sufficient,
        replyRate: sufficient ? Math.round((row.replied / row.sent) * 100) : null,
      })
    })
}
