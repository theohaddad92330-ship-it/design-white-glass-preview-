import { createZodDto } from 'nestjs-zod'
import { contactListQuerySchema } from '@bellum/contracts'

export class ListContactsDto extends createZodDto(contactListQuerySchema) {}
