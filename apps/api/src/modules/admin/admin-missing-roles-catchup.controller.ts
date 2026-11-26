import { Body, Controller, Post, Query, UseGuards } from '@nestjs/common'
import type { MissingRolesCatchupOutcome } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { MissingRolesCatchupService } from '../analysis/missing-roles-catchup.service'
import { AdminMissingRolesCatchupDto } from './dto/admin-missing-roles-catchup.dto'

/**
 * #2637.1 (21/09/2026) — LE GESTE D'OPÉRATEUR qui déclenche le rattrapage
 * automatique des rôles manquants.
 *
 * Même famille que {@link AdminSegmentCatchupController} : préfixe
 * `internal/admin`, même {@link InternalSecretGuard} — cross-tenant par
 * construction, le garde sépare cette route de tous les comptes de tous les
 * espaces. Il ne doit jamais être retiré.
 *
 * ⚠️ Contrairement à `AdminSegmentCatchupController` (six segments
 * GRATUITS), CETTE route débite le crédit du client — voir le docblock de
 * `MissingRolesCatchupService`. C'est la SEULE porte d'entrée : rien
 * d'autre dans le dépôt n'appelle `MissingRolesCatchupService.runCatchup`, ni
 * un `onApplicationBootstrap`, ni une routine planifiée. Même appelée ici, la
 * course reste coupée si l'interrupteur `accounts.missing_roles_catchup`
 * (kill-switches.ts) est posé.
 */
@Controller('internal/admin/missing-roles-catchup')
@UseGuards(InternalSecretGuard)
export class AdminMissingRolesCatchupController {
  constructor(private readonly catchup: MissingRolesCatchupService) {}

  /** Lecture seule — les comptes concernés, sans rien déclencher. Sert à
   *  chiffrer l'ampleur (et donc le crédit engagé) AVANT de lancer `run`. */
  @Post('preview')
  async preview(@Query('limit') limit?: string): Promise<{ concerned: number }> {
    const rows = await this.catchup.listConcernedAccounts(limit ? Number(limit) : undefined)
    return { concerned: rows.length }
  }

  /** Le rattrapage lui-même — voir le docblock de la classe. */
  @Post()
  run(@Body() dto: AdminMissingRolesCatchupDto): Promise<MissingRolesCatchupOutcome> {
    return this.catchup.runCatchup(dto.actor ?? 'backoffice', dto.limit)
  }
}
