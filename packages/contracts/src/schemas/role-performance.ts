import { z } from 'zod'
import { CHANNEL_MIN_SAMPLE } from './channel-performance.js'
import { decisionRoleSchema } from './contact.js'

/**
 * #3234 (#3211.11, lot Z17) — la même mesure, coupée par RÔLE DE DÉCISION du
 * contact (technique, économique…). Même fenêtre, même seuil, même règle :
 * sous {@link CHANNEL_MIN_SAMPLE} envois le rôle reste « non mesuré » (taux
 * `null`, jamais 0) — un échec isolé ne se généralise pas à tout le marché.
 * Un rôle « unknown » est une absence, pas un rôle : il ne fait aucune ligne.
 * Le rôle d'un contact est un fait de métier, jamais un critère protégé.
 */
const ROLE_PERFORMANCE_ROLES = decisionRoleSchema.options.filter(role => role !== 'unknown')

const rolePerformanceSchema = z
  .object({
    role: decisionRoleSchema.exclude(['unknown']),
    sent: z.number().int().min(1),
    replied: z.number().int().min(0),
    sufficient: z.boolean(),
    replyRate: z.number().int().min(0).max(100).nullable(),
  })
  .refine(row => row.replied <= row.sent, { message: 'replied cannot exceed sent' })
  .refine(row => row.sufficient === (row.replyRate !== null), {
    message: 'a rate exists only with a sufficient sample',
  })

export type RolePerformance = z.infer<typeof rolePerformanceSchema>

export function toRolePerformance(
  rows: ReadonlyArray<{ role: string; sent: number; replied: number }>,
): RolePerformance[] {
  const known: readonly string[] = ROLE_PERFORMANCE_ROLES
  return rows
    .filter(row => known.includes(row.role) && row.sent > 0)
    .map(row => {
      const sufficient = row.sent >= CHANNEL_MIN_SAMPLE
      return rolePerformanceSchema.parse({
        role: row.role,
        sent: row.sent,
        replied: row.replied,
        sufficient,
        replyRate: sufficient ? Math.round((row.replied / row.sent) * 100) : null,
      })
    })
}
