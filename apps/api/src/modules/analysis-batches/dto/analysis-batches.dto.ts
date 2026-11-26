import { createZodDto } from 'nestjs-zod'
import { confirmAnalysisBatchItemSchema, createAnalysisBatchSchema } from '@bellum/contracts'

/** #2293 — la liste d'entrée d'un lot : sa source et ses entreprises (≤ 50). */
export class CreateAnalysisBatchDto extends createZodDto(createAnalysisBatchSchema) {}
/** #2293.4 — l'entité choisie pour lever une ambiguïté. */
export class ConfirmAnalysisBatchItemDto extends createZodDto(confirmAnalysisBatchItemSchema) {}
