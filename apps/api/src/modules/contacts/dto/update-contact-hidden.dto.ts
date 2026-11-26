import { createZodDto } from 'nestjs-zod'
import { updateContactHiddenSchema } from '@bellum/contracts'

export class UpdateContactHiddenDto extends createZodDto(updateContactHiddenSchema) {}
