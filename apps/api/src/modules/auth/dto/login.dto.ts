import { createZodDto } from 'nestjs-zod'
import { loginSchema } from '@bellum/contracts'

export class LoginDto extends createZodDto(loginSchema) {}
