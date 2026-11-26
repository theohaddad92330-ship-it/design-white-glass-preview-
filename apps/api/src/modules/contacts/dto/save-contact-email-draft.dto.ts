import { createZodDto } from 'nestjs-zod'
import { saveContactEmailDraftSchema } from '@bellum/contracts'

export class SaveContactEmailDraftDto extends createZodDto(saveContactEmailDraftSchema) {}
