import { createZodDto } from 'nestjs-zod'
import { regenerateProfileContextSectionInputSchema } from '@bellum/contracts'

export class RegenerateProfileContextSectionDto extends createZodDto(regenerateProfileContextSectionInputSchema) {}
