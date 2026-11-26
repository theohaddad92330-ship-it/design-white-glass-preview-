import { createZodDto } from 'nestjs-zod'
import { recordContactCrmExportSchema } from '@bellum/contracts'

export class RecordContactCrmExportDto extends createZodDto(recordContactCrmExportSchema) {}
