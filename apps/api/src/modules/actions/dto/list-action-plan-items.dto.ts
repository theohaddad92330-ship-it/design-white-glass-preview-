import { createZodDto } from 'nestjs-zod'
import { listActionPlanItemsQuerySchema } from '@bellum/contracts'

export class ListActionPlanItemsDto extends createZodDto(listActionPlanItemsQuerySchema) {}
