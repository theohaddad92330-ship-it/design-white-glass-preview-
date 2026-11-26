import { Body, Controller, Post, Query, UseGuards } from '@nestjs/common'
import type { ContactReachabilityCatchupOutcome } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import {
  ContactReachabilityCatchupService,
  type ContactEnrichmentCoverage,
  type ContactReachabilityTargetedOutcome,
} from '../contacts/contact-reachability-catchup.service'
import {
  AdminContactReachabilityCatchupDto,
  AdminContactReachabilityTargetedDto,
} from './dto/admin-contact-reachability-catchup.dto'

/**
 * #3549 (02/10/2026) — LE GESTE D'OPÉRATEUR du rattrapage des coordonnées
 * manquantes. Même famille que {@link AdminMissingRolesCatchupController} :
 * préfixe `internal/admin`, même {@link InternalSecretGuard} (cross-tenant par
 * construction — ne jamais le retirer). C'est la SEULE porte d'entrée : rien
 * d'autre dans le dépôt n'appelle `runCatchup`, ni boot ni routine. GRATUIT pour
 * le client ; coupé par l'interrupteur `contacts.reachability_catchup`.
 */
@Controller('internal/admin/contact-reachability-catchup')
@UseGuards(InternalSecretGuard)
export class AdminContactReachabilityCatchupController {
  constructor(private readonly catchup: ContactReachabilityCatchupService) {}

  /** Lecture seule — chiffre l'ampleur AVANT de lancer `run`. */
  @Post('preview')
  async preview(@Query('limit') limit?: string): Promise<{ concerned: number }> {
    const rows = await this.catchup.listConcerned(limit ? Number(limit) : undefined)
    return { concerned: rows.length }
  }

  @Post()
  run(@Body() dto: AdminContactReachabilityCatchupDto): Promise<ContactReachabilityCatchupOutcome> {
    return this.catchup.runCatchup(dto.actor ?? 'backoffice', dto.limit)
  }

  /**
   * E1 (#3698, point 6) — rejoue une LISTE d'ids (≤ 50) à qui il manque
   * téléphone, e-mail ou LinkedIn : cascade complète, gratuite. Statut PAR
   * contact. Jamais appelé ailleurs que par un opérateur.
   */
  @Post('targeted')
  runTargeted(@Body() dto: AdminContactReachabilityTargetedDto): Promise<ContactReachabilityTargetedOutcome> {
    return this.catchup.runForIds(dto.actor ?? 'backoffice', dto.contact_ids)
  }

  /**
   * E1 (point 7) — lecture seule : la couverture de l'échantillon, par
   * coordonnée et par source (les sources se nomment ICI, opérateur seulement).
   */
  @Post('coverage')
  coverage(@Body() dto: AdminContactReachabilityTargetedDto): Promise<ContactEnrichmentCoverage> {
    return this.catchup.coverage(dto.contact_ids)
  }
}
