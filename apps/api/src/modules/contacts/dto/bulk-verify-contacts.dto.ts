import { createZodDto } from 'nestjs-zod'
import { bulkVerifyContactsRequestSchema } from '@bellum/contracts'

export class BulkVerifyContactsDto extends createZodDto(bulkVerifyContactsRequestSchema) {}
