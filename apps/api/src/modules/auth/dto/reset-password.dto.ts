import { createZodDto } from 'nestjs-zod'
import { resetPasswordSchema } from '@bellum/contracts'

export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
