import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** Fields we map onto a Pipedrive Person. All optional at the edge; the client
 *  composes a `name` fallback (Pipedrive requires it). */
export const pipedriveExportContactSchema = z
  .object({
    email: z.string().email().optional(),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    company: z.string().trim().min(1).max(200).optional(),
    jobTitle: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(3).max(40).optional(),
    linkedinUrl: z.string().url().max(500).optional(),
  })
  .strict()

export class PipedriveExportContactDto extends createZodDto(pipedriveExportContactSchema) {}
