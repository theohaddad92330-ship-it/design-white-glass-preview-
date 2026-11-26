import { Body, Controller, Logger, Optional, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { can } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { CrmAdapterRegistry } from '../crm/adapter/crm-adapter.registry'
import { CrmMirrorReader } from '../crm-mirror/crm-mirror.reader'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

class CopilotCrmDealsDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** `lost` / `won` / `closed` (gagnées ET perdues). Une affaire ouverte ne se liste pas ici. */
      outcome: z.enum(['lost', 'won', 'closed']),
      /** Ne garde que ce qui a bougé après cette date (ISO) — la fenêtre demandée à Laura. */
      since: z.string().max(40).optional(),
    })
    .strict(),
) {}

/** Pages lues par appel : la borne de volume, DITE (`complete: false`) quand elle coupe. */
const MAX_PAGES = 8
const PAGE_SIZE = 200

/**
 * #4065.8 — « les affaires perdues en 2026 et leur interlocuteur » : la liste des affaires du CRM branché.
 *
 * AUCUNE lecture neuve : c'est `read.deals` de l'adaptateur commun (#4189), celui que le cache des signaux
 * relit déjà, avec les droits `crm:read` de CET utilisateur. Jamais le nom de l'éditeur (`connected: bool`).
 * Un CRM sans lecture d'affaires, ou aucun CRM, répond `connected: false` — jamais une liste vide qui se
 * lirait « aucune affaire perdue ».
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotCrmDealsController {
  private readonly logger = new Logger(CopilotCrmDealsController.name)

  constructor(
    private readonly adapters: CrmAdapterRegistry,
    private readonly workspaceContext: WorkspaceContextService,
    // SYNC-A — le miroir CRM d'abord ; la lecture directe seulement si le miroir est vide pour ce CRM.
    @Optional() private readonly mirror?: CrmMirrorReader,
  ) {}

  @Post('crm/deals')
  async deals(@Body() dto: CopilotCrmDealsDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    if (!can(role, extra, 'crm:read')) return { error: 'crm_read_forbidden' }

    const found = await this.adapters.firstConnected(dto.userId, adapter => adapter.read?.deals !== undefined)
    const direct = found?.adapter.read?.deals
    if (!found || !direct) return { connected: false, deals: [] }
    const readDeals = (await this.mirror?.readDeals(workspaceId, found.adapter.provider)) ?? direct

    const kept: Array<{
      id: string
      title: string | null
      stage: string | null
      status: string | null
      amount: number | null
      accountName: string | null
      contactName: string | null
      closedAt: string | null
    }> = []
    let read = 0
    let after: string | undefined
    let complete = false
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await readDeals(dto.userId, {
          limit: PAGE_SIZE,
          ...(after ? { after } : {}),
          ...(dto.since ? { since: dto.since } : {}),
        })
        read += result.deals.length
        for (const deal of result.deals) {
          // Une affaire ouverte ou sans statut lisible ne se liste jamais ici.
          if (deal.status === null || deal.status === 'open') continue
          if (dto.outcome !== 'closed' && deal.status !== dto.outcome) continue
          kept.push({
            id: deal.id,
            title: deal.title,
            stage: deal.stage,
            status: deal.status,
            amount: deal.amount,
            accountName: deal.accountName,
            contactName: deal.contactName ?? null,
            // La clôture RÉELLE seulement ; l'échéance prévue n'en est pas une.
            closedAt: deal.closedAt ?? null,
          })
        }
        if (!result.nextAfter) {
          complete = true
          break
        }
        after = result.nextAfter
      }
    } catch (error) {
      this.logger.warn(
        `copilot.crm_deals read failed user=${dto.userId}`,
        error instanceof Error ? error.message : error,
      )
      return { error: 'crm_read_failed' }
    }
    return { connected: true, deals: kept, dealsRead: read, complete }
  }
}
