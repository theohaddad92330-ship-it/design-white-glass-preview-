import { createZodDto } from 'nestjs-zod'
import { confirmAnswerSchema } from '@bellum/contracts'

export class ConfirmAnswerDto extends createZodDto(confirmAnswerSchema) {}
