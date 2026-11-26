import { createZodDto } from 'nestjs-zod'
import { createPlanActionSchema } from '@bellum/contracts'

/** #2123.46 — le corps de `POST /plan-items` : une action saisie depuis le plan. */
export class CreatePlanActionDto extends createZodDto(createPlanActionSchema) {}
