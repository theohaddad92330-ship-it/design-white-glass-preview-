import { createZodDto } from 'nestjs-zod'
import { linkedinLookupRequestSchema } from '@bellum/contracts'

/** H-DECISIONS #4348 — Body de `POST /consultants/linkedin-lookup`. */
export class LinkedinLookupDto extends createZodDto(linkedinLookupRequestSchema) {}
