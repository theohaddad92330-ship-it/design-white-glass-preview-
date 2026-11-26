import { createZodDto } from 'nestjs-zod'
import { updateActionPlanItemSchema } from '@bellum/contracts'

export class UpdateActionPlanItemDto extends createZodDto(updateActionPlanItemSchema) {}
