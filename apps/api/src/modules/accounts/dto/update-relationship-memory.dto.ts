import { createZodDto } from 'nestjs-zod'
import { updateRelationshipMemorySchema } from '@bellum/contracts'

/** Body de PATCH /accounts/:id/relationship-memory — bloc Mémoire couche zéro (p8). */
export class UpdateRelationshipMemoryDto extends createZodDto(updateRelationshipMemorySchema) {}
