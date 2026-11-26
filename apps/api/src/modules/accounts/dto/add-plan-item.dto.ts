import { createZodDto } from 'nestjs-zod'
import { userAttackAngleSchema, userPlanActionSchema } from '@bellum/contracts'

// #2123.46 — alias déprécié le 17/09, à retirer après la vague 25 : l'ancien
// corps de `POST /accounts/:id/plan/actions`, traduit vers la ligne canonique
// (`ActionPlanItemsService.createFromLegacyPlanAction`). Une action du plan
// s'écrit par `POST /plan-items` (`CreatePlanActionDto`).
export class AddPlanActionDto extends createZodDto(userPlanActionSchema) {}

export class AddAttackAngleDto extends createZodDto(userAttackAngleSchema) {}
