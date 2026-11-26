import { createZodDto } from 'nestjs-zod'
import { advanceStageSchema } from '@bellum/contracts'

export class AdvanceStageDto extends createZodDto(advanceStageSchema) {}
