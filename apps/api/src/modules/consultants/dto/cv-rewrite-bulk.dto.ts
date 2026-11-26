import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { BULK_CV_REWRITE_MAX_CONSULTANTS } from '../bulk-cv-rewrite.service'

/** Body de POST /consultants/cv-rewrite/bulk — la réécriture en lot (#1952.5, épopée #2844). */
export const cvRewriteBulkRequestSchema = z.object({
  opportunity_id: z.string().guid(),
  consultant_ids: z.array(z.string().guid()).min(1).max(BULK_CV_REWRITE_MAX_CONSULTANTS),
})
export class CvRewriteBulkDto extends createZodDto(cvRewriteBulkRequestSchema) {}
