import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { analysisScopeModeSchema } from '@bellum/contracts'

/**
 * Query de `GET /analysis/launch-plan` (#1583) — ce qui VA se passer si on
 * lance cette analyse, lu AVANT tout débit. Le schéma reste LOCAL à ce module
 * (pas un ajout à `@bellum/contracts`) : c'est une lecture de service, pas un
 * contrat de payload partagé avec l'API IA ou un autre client.
 */
export const launchPlanQuerySchema = z.object({
  company_name: z.string().trim().min(1),
  siren: z.string().optional(),
  scope_mode: analysisScopeModeSchema.optional(),
  /** SIMON-FIX S.18 — « Actualiser » : relance explicite, le cache de résultat ne s'applique pas (comme `start()`). */
  relaunch: z
    .enum(['true', '1'])
    .optional()
    .transform(value => value !== undefined),
})

export class LaunchPlanQueryDto extends createZodDto(launchPlanQuerySchema) {}
