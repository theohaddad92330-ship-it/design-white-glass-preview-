import { createZodDto } from 'nestjs-zod'
import { verifyOtpSchema } from '@bellum/contracts'

export class VerifyOtpDto extends createZodDto(verifyOtpSchema) {}
