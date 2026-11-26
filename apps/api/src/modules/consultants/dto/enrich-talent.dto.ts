import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** #3831.1 — Body de `POST /consultants/:id/enrich` : `apolloId`, l'homonyme
 *  CHOISI après `GET /consultants/search-by-name`, absent par défaut (le
 *  chemin historique — profil LinkedIn déjà sur la fiche — ne change pas). */
export const enrichTalentRequestSchema = z.object({
  apolloId: z.string().min(1).optional(),
})
export class EnrichTalentDto extends createZodDto(enrichTalentRequestSchema) {}
