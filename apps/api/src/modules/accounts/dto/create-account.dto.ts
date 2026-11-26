import { createZodDto } from 'nestjs-zod'
import { createAccountSchema } from '@bellum/contracts'

export class CreateAccountDto extends createZodDto(createAccountSchema) {}
