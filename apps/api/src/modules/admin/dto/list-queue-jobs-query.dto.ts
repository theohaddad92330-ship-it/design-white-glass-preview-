import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Job states a BullMQ queue exposes to the operator queue viewer. `failed` is
// the incident state (carries `failedReason`); the rest let an operator inspect
// backlog/in-flight/finished jobs. `limit` is lower-bounded here (>= 1) and the
// service hard-caps it; `z.coerce` turns string query params into numbers.
export const QUEUE_JOB_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const

export const listQueueJobsQuerySchema = z.object({
  state: z.enum(QUEUE_JOB_STATES),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
})
export class ListQueueJobsQueryDto extends createZodDto(listQueueJobsQuerySchema) {}
