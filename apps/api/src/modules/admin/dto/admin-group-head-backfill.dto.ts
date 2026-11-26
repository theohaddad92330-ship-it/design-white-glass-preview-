import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #3917 — le rattrapage ciblé de `accounts.group_head_siren`. `workspaceId` OBLIGATOIRE : jamais tout le parc.
export const adminGroupHeadBackfillSchema = z.object({
  workspaceId: z.string().guid(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  afterId: z.string().guid().optional(),
})
export class AdminGroupHeadBackfillDto extends createZodDto(adminGroupHeadBackfillSchema) {}
