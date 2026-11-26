import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Cross-user analyses monitoring list (operator backoffice). `search` matches
// company name / owner email / SIREN. `status` is an exact analysis status, or
// the pseudo-value `zombie` (stuck `analyzing` rows). `from`/`to` bound the
// creation date. `limit` is lower-bounded here (>= 1) and hard-capped in the
// service. `z.coerce` turns string query params into numbers.
export const listAnalysesQuerySchema = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(['analyzing', 'completed', 'error', 'canceled', 'zombie']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
})
export class ListAnalysesQueryDto extends createZodDto(listAnalysesQuerySchema) {}
