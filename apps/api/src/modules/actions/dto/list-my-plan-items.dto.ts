import { createZodDto } from 'nestjs-zod'
import { listMyPlanItemsQuerySchema } from '@bellum/contracts'

/** #2717 — `?overdue=true` sur `GET /plan-items/mine`. */
export class ListMyPlanItemsDto extends createZodDto(listMyPlanItemsQuerySchema) {}
