import { createZodDto } from 'nestjs-zod'
import { enrichContactSchema } from '@bellum/contracts'

export class EnrichContactDto extends createZodDto(enrichContactSchema) {}
