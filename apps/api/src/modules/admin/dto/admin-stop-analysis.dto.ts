import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Operator STOP / force-error control for ANY user's analysis. `mode` picks
// between cancelling a live run (`stop` → status `canceled`) and freeing a
// zombie `analyzing` row (`force_error` → status `error`). `actor` is the
// backoffice operator identity (forwarded by the DM from its Basic-Auth user)
// so the audit log records WHO stopped the run.
export const adminStopAnalysisSchema = z.object({
  mode: z.enum(['stop', 'force_error']).optional(),
  actor: z.string().max(200).optional(),
})
export class AdminStopAnalysisDto extends createZodDto(adminStopAnalysisSchema) {}
