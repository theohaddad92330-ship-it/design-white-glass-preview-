import { createZodDto } from 'nestjs-zod'
import { signupSchema } from '@bellum/contracts'

export class SignupDto extends createZodDto(signupSchema) {}
