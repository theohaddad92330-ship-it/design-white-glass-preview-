import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { GroupHeadBackfillService, type GroupHeadBackfillResult } from './group-head-backfill.service'
import { AdminGroupHeadBackfillDto } from './dto/admin-group-head-backfill.dto'

/**
 * #3917 — LE GESTE D'OPÉRATEUR qui rattrape `group_head_siren` des comptes déjà analysés. Même famille que
 * {@link AdminCommercialBriefBackfillController} : `internal/admin`, {@link InternalSecretGuard}, jamais appelé
 * par un navigateur ni au déploiement — rien d'autre dans le dépôt n'appelle `GroupHeadBackfillService.run`.
 */
@Controller('internal/admin/group-head-backfill')
@UseGuards(InternalSecretGuard)
export class AdminGroupHeadBackfillController {
  constructor(private readonly backfill: GroupHeadBackfillService) {}

  @Post()
  run(@Body() dto: AdminGroupHeadBackfillDto): Promise<GroupHeadBackfillResult> {
    return this.backfill.run(dto)
  }
}
