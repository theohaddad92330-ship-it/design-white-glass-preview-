import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #3416.x2 — le corps du geste d'opérateur qui rattrape `analysisFound`.
//  - `workspaceId` OBLIGATOIRE : UN espace, jamais tout le parc (doctrine
//    « un correctif rattrape l'existant — ciblé ») ;
//  - `dryRun` vaut `true` par défaut : le mode réel se DEMANDE (`false`
//    explicite, booléen JSON strict — la chaîne "false" est refusée) ;
//  - `.strict()` : aucun champ de plus ne passe.
const analysisFoundBackfillSchema = z
  .object({
    workspaceId: z.string().guid(),
    dryRun: z.boolean().default(true),
  })
  .strict()

export class AnalysisFoundBackfillDto extends createZodDto(analysisFoundBackfillSchema) {}
