import { createZodDto } from 'nestjs-zod'
import { bulkImportContactsSchema } from '@bellum/contracts'

export class BulkImportContactsDto extends createZodDto(bulkImportContactsSchema) {}
