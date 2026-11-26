import { createZodDto } from 'nestjs-zod'
import { refreshSchema } from '@bellum/contracts'

export class RefreshDto extends createZodDto(refreshSchema) {}
