import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Operator grants (or adjusts) a user's credit counters from the backoffice.
// `accounts` bumps the analysis-slot allowance (`accounts_limit`), `enrichment`
// bumps the enrichment credit balance — both are signed deltas (a negative value
// claws credits back, floored at 0 by the service). At least one of the two must
// be non-zero. `reason` is mandatory so every manual movement is auditable in the
// credit ledger.
export const grantCreditsSchema = z
  .object({
    accounts: z.coerce.number().int().optional(),
    enrichment: z.coerce.number().int().optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .refine(dto => (dto.accounts ?? 0) !== 0 || (dto.enrichment ?? 0) !== 0, {
    message: 'Indiquer au moins un delta de crédits (accounts ou enrichment) non nul.',
    path: ['accounts'],
  })
export class GrantCreditsDto extends createZodDto(grantCreditsSchema) {}
