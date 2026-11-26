import { createZodDto } from 'nestjs-zod'
import { closeStalePlanItemsSchema } from '@bellum/contracts'

/** #4485 — `POST /plan-items/close-stale`. */
export class CloseStalePlanItemsDto extends createZodDto(closeStalePlanItemsSchema) {}
