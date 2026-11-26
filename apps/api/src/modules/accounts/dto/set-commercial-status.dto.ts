import { createZodDto } from 'nestjs-zod'
import { setCommercialStatusSchema } from '@bellum/contracts'

export class SetCommercialStatusDto extends createZodDto(setCommercialStatusSchema) {}
