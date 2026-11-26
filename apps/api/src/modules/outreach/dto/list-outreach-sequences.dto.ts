import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const listOutreachSequencesQuerySchema = z.object({
  /** Filtre optionnel : les séquences d'un contact précis (fiche contact). */
  contact_id: z.string().guid().optional(),
  /** #5029.1 — les séquences qui proposent CE consultant (Reverse Market : « déjà proposé »). */
  consultant_id: z.string().guid().optional(),
})

/** Query de `GET /outreach/sequences`. */
export class ListOutreachSequencesDto extends createZodDto(listOutreachSequencesQuerySchema) {}
