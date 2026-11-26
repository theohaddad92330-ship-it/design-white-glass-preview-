import { createZodDto } from 'nestjs-zod'
import { updateContactStatusSchema } from '@bellum/contracts'

export class UpdateContactDto extends createZodDto(updateContactStatusSchema) {}
