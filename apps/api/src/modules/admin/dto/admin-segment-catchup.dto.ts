import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #AF (18/09/2026) — LE GESTE D'OPÉRATEUR qui déclenche le rattrapage ciblé du
// segment contacts (#2543). `actor` est l'identité opérateur (même convention
// que `AdminStopAnalysisDto` : forwardée par le DM depuis son Basic-Auth) pour
// que la trace du service dise QUI a déclenché le lot. `limit` borne le
// nombre de comptes rejoués en un appel — jamais tout le parc (#AF.2).
export const adminSegmentCatchupSchema = z.object({
  actor: z.string().max(200).optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  // #4923.15 — rattrapage contacts restreint à des comptes NOMMÉS (jamais plus de 50).
  account_ids: z.array(z.string().uuid()).max(50).optional(),
})
export class AdminSegmentCatchupDto extends createZodDto(adminSegmentCatchupSchema) {}
