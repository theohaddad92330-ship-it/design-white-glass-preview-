import { createZodDto } from 'nestjs-zod'
import { importEsnTargetPersonasSchema } from '@bellum/contracts'

export class ImportEsnTargetPersonasDto extends createZodDto(importEsnTargetPersonasSchema) {}
