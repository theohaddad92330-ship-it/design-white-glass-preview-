import { createZodDto } from 'nestjs-zod'
import { createCommercialOutcomeSchema } from '@bellum/contracts'

export class CreateCommercialOutcomeDto extends createZodDto(createCommercialOutcomeSchema) {}
