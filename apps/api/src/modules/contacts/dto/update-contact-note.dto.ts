import { createZodDto } from 'nestjs-zod'
import { updateContactNoteSchema } from '@bellum/contracts'

export class UpdateContactNoteDto extends createZodDto(updateContactNoteSchema) {}
