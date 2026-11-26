import { updateRoutineContentRequestSchema, updateRoutineRequestSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'

/** Réutilise le schéma partagé — pas de seconde vérité sur les bornes. */
export class UpdateRoutineDto extends createZodDto(updateRoutineRequestSchema) {}

/** #2843.30 — le gabarit du contenu d'une routine (par espace). */
export class UpdateRoutineContentDto extends createZodDto(updateRoutineContentRequestSchema) {}
