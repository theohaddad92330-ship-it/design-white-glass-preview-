import { createZodDto } from 'nestjs-zod'
import { confirmEmailChangeSchema } from '@bellum/contracts'

export class ConfirmEmailChangeDto extends createZodDto(confirmEmailChangeSchema) {}
