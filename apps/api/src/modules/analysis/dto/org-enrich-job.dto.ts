import { createZodDto } from 'nestjs-zod'
import { orgEnrichEntityRequestSchema, orgEnrichGapsRequestSchema, orgEnrichNextRequestSchema } from '@bellum/contracts'

/** Body de `POST /analysis/:accountId/enrich-next` — « enrichir les N suivants ».
 *  `batchSize` absent = le CTA produit (50) ; au-delà du plafond, la requête est
 *  refusée en 400 plutôt que silencieusement rabotée. */
export class OrgEnrichNextDto extends createZodDto(orgEnrichNextRequestSchema) {}

/** Body de `POST /analysis/:accountId/enrich-entity` — « cette direction ».
 *  `entity` est OBLIGATOIRE : sans elle la vague n'a pas de périmètre, et un
 *  périmètre deviné serait un débit sur une sélection que personne n'a demandée. */
export class OrgEnrichEntityDto extends createZodDto(orgEnrichEntityRequestSchema) {}

/** Body de `POST /analysis/:accountId/enrich-gaps` — « rôles manquants ». */
export class OrgEnrichGapsDto extends createZodDto(orgEnrichGapsRequestSchema) {}
