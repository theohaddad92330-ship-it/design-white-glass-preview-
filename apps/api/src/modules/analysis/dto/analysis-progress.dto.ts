import { createZodDto } from 'nestjs-zod'
import { analysisProgressEventSchema } from '@bellum/contracts'

export class AnalysisProgressDto extends createZodDto(analysisProgressEventSchema) {}
