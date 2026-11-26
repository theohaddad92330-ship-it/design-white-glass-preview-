import { createZodDto } from 'nestjs-zod'
import { contactRankingQuerySchema } from '@bellum/contracts'

export class ContactRankingQueryDto extends createZodDto(contactRankingQuerySchema) {}
