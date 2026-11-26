import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { NeedsHistoryService, type NeedsHistoryPage } from './needs-history.service'

/** Les filtres de l'outil : techno / zone / période / volume. Aucun filtre libre au-delà (rien sur une personne). */
const bodySchema = z
  .object({
    userId: z.string().guid(),
    workspaceId: z.string().guid(),
    accountId: z.string().guid(),
    tech: z.string().trim().min(1).max(80).optional(),
    zone: z.string().trim().min(1).max(80).optional(),
    since: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    limit: z.number().int().min(1).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict()

class NeedsHistoryDto extends createZodDto(bodySchema) {}

/**
 * #4759 — l'OUTIL de requête de Laura sur l'historique des besoins d'un compte. Même porte que le reste du
 * pont `internal/copilot` (`InternalSecretGuard`). Le plafond de lignes par appel est clampé dans le service,
 * jamais ici ni côté IA : il vit dans `needs-history.limits.ts`.
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class NeedsHistoryController {
  constructor(private readonly needs: NeedsHistoryService) {}

  @Post('account/needs-history')
  async needsHistory(@Body() dto: NeedsHistoryDto): Promise<NeedsHistoryPage | { error: string }> {
    const { userId, workspaceId, accountId, ...filter } = dto
    const page = await this.needs.query({ userId, workspaceId, accountId, filter })
    return page ?? { error: 'account_not_found' }
  }
}
