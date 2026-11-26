import { createZodDto } from 'nestjs-zod'
import { authorizeContactRecommendationSchema } from '@bellum/contracts'

/** #2160.60 — la raison LEVÉE (`homonym_conflict` / `entity_mismatch` uniquement,
 *  jamais une raison RGPD/opposition/effacement — le schéma zod n'accepte que ces deux valeurs). */
export class AuthorizeContactRecommendationDto extends createZodDto(authorizeContactRecommendationSchema) {}
