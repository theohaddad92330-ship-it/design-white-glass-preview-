import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import {
  CommercialBriefBackfillService,
  type CommercialBriefBackfillResult,
} from '../analysis/commercial-brief-backfill.service'
import { AdminCommercialBriefBackfillDto } from './dto/admin-commercial-brief-backfill.dto'

/**
 * Point 45 (briefs comptes, 01/10/2026) — LE GESTE D'OPÉRATEUR qui rattrape le
 * brief commercial des comptes DÉJÀ analysés (doctrine : un correctif de collecte
 * rattrape l'existant, ciblé, par segment).
 *
 * Même famille que {@link AdminSegmentCatchupController} : préfixe
 * `internal/admin`, {@link InternalSecretGuard} (secret d'en-tête, aucun JWT
 * utilisateur) — jamais public, jamais appelé par un navigateur. Le garde ne doit
 * jamais être retiré : cette route déclenche des appels modèle payants.
 *
 * C'est la SEULE porte d'entrée du rattrapage : rien d'autre dans le dépôt
 * n'appelle `CommercialBriefBackfillService.run` — ni démarrage, ni tâche
 * planifiée. Il ne part donc jamais seul au déploiement.
 */
@Controller('internal/admin/commercial-brief-backfill')
@UseGuards(InternalSecretGuard)
export class AdminCommercialBriefBackfillController {
  constructor(private readonly backfill: CommercialBriefBackfillService) {}

  @Post()
  run(@Body() dto: AdminCommercialBriefBackfillDto): Promise<CommercialBriefBackfillResult> {
    return this.backfill.run(dto)
  }
}
