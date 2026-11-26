import { createZodDto } from 'nestjs-zod'
import { sendContactEmailSchema } from '@bellum/contracts'

export class SendContactEmailDto extends createZodDto(sendContactEmailSchema) {}
