import { createZodDto } from 'nestjs-zod'
import { verifyEmailOtpSchema } from '@bellum/contracts'

export class VerifyEmailOtpDto extends createZodDto(verifyEmailOtpSchema) {}
