import { createZodDto } from 'nestjs-zod'
import { createWorkContextSchema } from '@bellum/contracts'

export class CreateWorkContextDto extends createZodDto(createWorkContextSchema) {}
