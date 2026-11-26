import { z } from 'zod'
import { CHANNEL_MIN_SAMPLE } from './channel-performance.js'

/**
 * #3211.11 (#3234, lot RAISON-B 12/10) — la même mesure que par canal et par
 * rôle, coupée par ANGLE du message : la raison que le brouillon porte
 * (`outreach_messages.reason`), reliée à l'e-mail réellement envoyé par
 * l'identifiant de message du fournisseur (lot W3). Même seuil
 * ({@link CHANNEL_MIN_SAMPLE}, un seul endroit) : sous dix envois l'angle reste
 * « non mesuré » (taux `null`, jamais 0) — un échec isolé ne se généralise pas.
 * Un envoi sans angle connu ne fait aucune ligne. Jamais le corps du message.
 */
const ANGLE_LABEL_MAX = 80

export function normalizeAngleLabel(reason: string | null | undefined): string | null {
  const label = (reason ?? '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, ANGLE_LABEL_MAX).trim()
  return label || null
}

const anglePerformanceSchema = z
  .object({
    angle: z.string().min(1).max(ANGLE_LABEL_MAX),
    sent: z.number().int().min(1),
    replied: z.number().int().min(0),
    sufficient: z.boolean(),
    replyRate: z.number().int().min(0).max(100).nullable(),
  })
  .refine(row => row.replied <= row.sent, { message: 'replied cannot exceed sent' })
  .refine(row => row.sufficient === (row.replyRate !== null), {
    message: 'a rate exists only with a sufficient sample',
  })

export type AnglePerformance = z.infer<typeof anglePerformanceSchema>

export function toAnglePerformance(
  rows: ReadonlyArray<{ angle: string; sent: number; replied: number }>,
): AnglePerformance[] {
  const merged = new Map<string, { sent: number; replied: number }>()
  for (const row of rows) {
    const label = normalizeAngleLabel(row.angle)
    if (!label || row.sent <= 0) continue
    const current = merged.get(label) ?? { sent: 0, replied: 0 }
    merged.set(label, { sent: current.sent + row.sent, replied: current.replied + row.replied })
  }
  return [...merged].map(([angle, { sent, replied }]) => {
    const sufficient = sent >= CHANNEL_MIN_SAMPLE
    return anglePerformanceSchema.parse({
      angle,
      sent,
      replied,
      sufficient,
      replyRate: sufficient ? Math.round((replied / sent) * 100) : null,
    })
  })
}
