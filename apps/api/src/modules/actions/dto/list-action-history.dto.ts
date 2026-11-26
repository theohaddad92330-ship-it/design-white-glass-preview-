import { createZodDto } from 'nestjs-zod'
import { actionHistoryQuerySchema } from '@bellum/contracts'

export class ListActionHistoryDto extends createZodDto(actionHistoryQuerySchema) {}
