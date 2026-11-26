import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { PlanItemContactBackfillDto } from './dto/plan-item-contact-backfill.dto'
import {
  PlanItemContactBackfillService,
  type PlanItemContactBackfillResult,
} from './plan-item-contact-backfill.service'

/**
 * #4521.1 — LE GESTE D'OPÉRATEUR qui rattrape, pour UN espace, les étapes de plan ouvertes sans contact
 * (doctrine : un correctif rattrape l'existant, ciblé). Même famille que les rattrapages `internal/admin/*` :
 * {@link InternalSecretGuard} (réservé au back-office — il lit et écrit à travers un espace désigné, ce qu'aucun
 * membre d'espace ne doit pouvoir faire). C'est la SEULE porte d'entrée : ni boot, ni routine, ni déploiement.
 */
@Controller('internal/admin/plan-item-contact-backfill')
@UseGuards(InternalSecretGuard)
export class PlanItemContactBackfillController {
  constructor(private readonly backfill: PlanItemContactBackfillService) {}

  @Post()
  @HttpCode(200)
  run(@Body() dto: PlanItemContactBackfillDto): Promise<PlanItemContactBackfillResult> {
    return this.backfill.run(dto.workspace_id, { dryRun: dto.dry_run })
  }
}
