import { createZodDto } from 'nestjs-zod'
import {
  accountCorePatchSchema,
  contactCorePatchSchema,
  createContactSchema,
  createNoteSchema,
  listNotesQuerySchema,
  updateNoteSchema,
} from '@bellum/contracts'

export class AccountCorePatchDto extends createZodDto(accountCorePatchSchema) {}
export class ContactCorePatchDto extends createZodDto(contactCorePatchSchema) {}
export class CreateContactDto extends createZodDto(createContactSchema) {}
export class CreateNoteDto extends createZodDto(createNoteSchema) {}
export class UpdateNoteDto extends createZodDto(updateNoteSchema) {}
export class ListNotesQueryDto extends createZodDto(listNotesQuerySchema) {}
