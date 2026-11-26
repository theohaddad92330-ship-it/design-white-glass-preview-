import { createZodDto } from 'nestjs-zod'
import { externalSourcingSearchQuerySchema } from '@bellum/contracts'

/** #2190.12 — `maxPerSource` optionnel, borné AVANT d'atteindre le service
 *  (une valeur hors bornes est refusée ici, jamais silencieusement corrigée). */
export class ExternalSourcingSearchQueryDto extends createZodDto(externalSourcingSearchQuerySchema) {}
