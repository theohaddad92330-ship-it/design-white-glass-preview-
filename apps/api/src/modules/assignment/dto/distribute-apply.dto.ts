import { createZodDto } from 'nestjs-zod'
import { distributeApplyRequestSchema } from '@bellum/contracts'

export class DistributeApplyDto extends createZodDto(distributeApplyRequestSchema) {}
