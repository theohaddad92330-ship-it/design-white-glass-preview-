import { createZodDto } from 'nestjs-zod'
import { prepareContactPlanSchema } from '@bellum/contracts'

/** #4416 — le corps de `POST /plan-items/for-contact` : le compte et le contact pour qui on prépare des étapes. */
export class PrepareContactPlanDto extends createZodDto(prepareContactPlanSchema) {}
