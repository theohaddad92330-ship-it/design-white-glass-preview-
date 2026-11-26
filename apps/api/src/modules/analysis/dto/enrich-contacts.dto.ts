import { createZodDto } from 'nestjs-zod'
import { enrichContactsSchema } from '@bellum/contracts'

/** Body of POST /analysis/:accountId/enrich-contacts — optional S6 re-run scope. */
export class EnrichContactsDto extends createZodDto(enrichContactsSchema) {}
