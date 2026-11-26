import { createZodDto } from 'nestjs-zod'
import { assignAccountSchema } from '@bellum/contracts'

export class AssignAccountDto extends createZodDto(assignAccountSchema) {}
