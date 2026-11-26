import { createZodDto } from 'nestjs-zod'
import { confirmResetPasswordSchema } from '@bellum/contracts'

export class ConfirmResetPasswordDto extends createZodDto(confirmResetPasswordSchema) {}
