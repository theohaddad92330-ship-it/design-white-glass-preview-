import { createZodDto } from 'nestjs-zod'
import {
  addTargetListItemSchema,
  createTargetListSchema,
  removeTargetListItemSchema,
  updateTargetListItemSchema,
  updateTargetListSchema,
} from '@bellum/contracts'

export class CreateTargetListDto extends createZodDto(createTargetListSchema) {}
export class UpdateTargetListDto extends createZodDto(updateTargetListSchema) {}
export class AddTargetListItemDto extends createZodDto(addTargetListItemSchema) {}
export class UpdateTargetListItemDto extends createZodDto(updateTargetListItemSchema) {}
/** #2156.31 — le motif du retrait, et RIEN d'autre : aucun chemin vers la fiche. */
export class RemoveTargetListItemDto extends createZodDto(removeTargetListItemSchema) {}
