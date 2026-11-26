import { createZodDto } from 'nestjs-zod'
import { orgEnrichmentPlanRequestSchema } from '@bellum/contracts'

/** Body of POST /analysis/:accountId/enrichment-plan — le mode de ciblage et
 *  ses paramètres (§11 FINAL, planificateur d'enrichissement). Une preview :
 *  ne crée rien, ne débite rien — voir `OrgEnrichmentPlannerService.estimate`. */
export class OrgEnrichmentPlanDto extends createZodDto(orgEnrichmentPlanRequestSchema) {}

/** Body of POST /analysis/:accountId/enrichment-confirm — lance UNE vague du
 *  mode demandé. Mêmes paramètres que l'estimation : le serveur RECALCULE la
 *  sélection, il ne fait jamais confiance à une estimation déjà affichée. */
export class OrgEnrichmentConfirmDto extends createZodDto(orgEnrichmentPlanRequestSchema) {}
