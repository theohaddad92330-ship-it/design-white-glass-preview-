import { createZodDto } from 'nestjs-zod'
import { assignContactsSchema } from '@bellum/contracts'

export class AssignContactsDto extends createZodDto(assignContactsSchema) {}
