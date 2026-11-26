import { createZodDto } from 'nestjs-zod'
import { sendBulkEmailSchema } from '@bellum/contracts'

export class SendBulkEmailDto extends createZodDto(sendBulkEmailSchema) {}
