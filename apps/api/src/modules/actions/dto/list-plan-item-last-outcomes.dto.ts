import { createZodDto } from 'nestjs-zod'
import { listPlanItemLastOutcomesQuerySchema } from '@bellum/contracts'

export class ListPlanItemLastOutcomesDto extends createZodDto(listPlanItemLastOutcomesQuerySchema) {}
