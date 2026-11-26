import { createZodDto } from 'nestjs-zod'
import { declareSentSchema } from '@bellum/contracts'

export class DeclareSentDto extends createZodDto(declareSentSchema) {}
