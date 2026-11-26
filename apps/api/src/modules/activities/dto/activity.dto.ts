import { createZodDto } from 'nestjs-zod'
import { activityQuerySchema, logActivitySchema } from '@bellum/contracts'
import { z } from 'zod'

export class ActivityQueryDto extends createZodDto(activityQuerySchema) {}
export class LogActivityDto extends createZodDto(logActivitySchema) {}

/**
 * La fenêtre de capture. Bornée à 180 jours : au-delà c'est une reprise
 * d'historique, qui se planifie (T9) et ne tient pas dans une requête HTTP.
 */
export const activitySyncSchema = z.object({ windowDays: z.number().int().min(1).max(180).optional() }).strict()
export class ActivitySyncDto extends createZodDto(activitySyncSchema) {}
