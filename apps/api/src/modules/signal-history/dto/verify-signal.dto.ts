import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Corps `POST /signal-history/verify` — « je confirme que ce signal tient
 * toujours » (#3206.2 partiel, épopée #3240).
 *
 * Même identité que `linkSignalActionSchema` : le signal est désigné par sa
 * clé PARTAGÉE (compte + libellé), jamais par un id de projection.
 */
export const verifySignalSchema = z.object({
  accountId: z.string().guid(),
  label: z.string().trim().min(1).max(500),
})
export class VerifySignalDto extends createZodDto(verifySignalSchema) {}
