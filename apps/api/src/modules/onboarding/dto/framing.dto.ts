import { createZodDto } from 'nestjs-zod'
import { saveFramingDecisionSchema, validateFramingSchema } from '@bellum/contracts'

export class SaveFramingDecisionDto extends createZodDto(saveFramingDecisionSchema) {}
export class ValidateFramingDto extends createZodDto(validateFramingSchema) {}
