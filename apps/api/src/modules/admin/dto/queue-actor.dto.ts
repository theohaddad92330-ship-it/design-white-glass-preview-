import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Optional operator identity forwarded by the dashboard-manager proxy (from the
// Basic-Auth user) so the API audit log records WHO retried/removed/cleaned a
// job. Defaults to `backoffice` in the service when absent.
export const queueActorSchema = z.object({
  actor: z.string().max(200).optional(),
})
export class QueueActorDto extends createZodDto(queueActorSchema) {}
