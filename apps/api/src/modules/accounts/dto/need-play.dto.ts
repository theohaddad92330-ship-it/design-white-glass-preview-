import { createZodDto } from 'nestjs-zod'
import { needPlayRequestSchema } from '@bellum/contracts'

export class NeedPlayDto extends createZodDto(needPlayRequestSchema) {}
