import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Only *finished* states are bulk-cleanable — cleaning `active`/`waiting` would
// wipe live/pending work. The service double-checks this (defence in depth); the
// DTO rejects anything else at the edge with a 400.
export const CLEANABLE_QUEUE_STATES = ['completed', 'failed', 'delayed'] as const

export const cleanQueueQuerySchema = z.object({
  state: z.enum(CLEANABLE_QUEUE_STATES),
})
export class CleanQueueQueryDto extends createZodDto(cleanQueueQuerySchema) {}
