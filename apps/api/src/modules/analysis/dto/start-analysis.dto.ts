import { createZodDto } from 'nestjs-zod'
import { startAnalysisSchema } from '@bellum/contracts'

export class StartAnalysisDto extends createZodDto(startAnalysisSchema) {}
