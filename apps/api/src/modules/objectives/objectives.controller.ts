import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import { MEMBER_OBJECTIVE_MONTH_PATTERN } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CreateObjectiveProposalDto, RespondObjectiveProposalDto } from './dto/objective-proposal.dto'
import { UpsertObjectiveDto } from './dto/upsert-objective.dto'
import { ObjectiveProposalsService } from './objective-proposals.service'
import { ObjectivesService } from './objectives.service'

/**
 * Objectif commercial chiffré par membre (cockpit manager §10). `/objectives/me`
 * est ouvert à tout membre (il gère SON objectif) ; `/objectives/team` est réservé
 * à ceux qui encadrent une équipe (`team:manage`).

 * ⚠️ La permission est posée sur la ROUTE et non sur la classe : `/objectives/me`
 * doit rester ouvert à tout membre — chacun gère son propre objectif, et le
 * fermer priverait un commercial de la seule chose qu'il déclare lui-même.
 */
@Controller('objectives')
// Les objectifs se posent depuis le Pilotage : même porte.
@RequireFeature('manager_cockpit')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class ObjectivesController {
  constructor(
    private readonly objectives: ObjectivesService,
    private readonly proposals: ObjectiveProposalsService,
  ) {}

  /** L'objectif du membre pour le mois (courant par défaut), ou `null` si non déclaré. */
  @Get('me')
  getMine(@CurrentUser() user: CurrentUserPayload, @Query('month') month?: string) {
    return this.objectives.getMyObjective(user.userId, sanitizeMonth(month))
  }

  /** Déclarer / mettre à jour l'objectif du membre pour le mois. */
  @Put('me')
  upsertMine(@CurrentUser() user: CurrentUserPayload, @Body() body: UpsertObjectiveDto) {
    return this.objectives.upsertMyObjective(user.userId, body)
  }

  /**
   * Les sept objectifs commerciaux nommés du membre courant (lot FA,
   * #2114.16-.27) : cible + réalisé réel + période + couverture, pour le
   * `/dashboard` personnel.
   */
  // GA-05, la maille ROUTE : cette route-ci N'EST PAS nue comme ses voisines
  // `/objectives/me`. Elle rend sept axes dont `revenue` et `margin`, calculés
  // sur `daily_rate`/`daily_cost` des missions — des chiffres de paie, pas « la
  // donnée de l'espace ». `@WorkspaceRead` s'exclut lui-même de ce cas
  // (`workspace-read.decorator.ts`, « QUAND NE PAS LE POSER » n°2), et
  // `finance:read:own` existe précisément pour ça (D1, 26/08/2026) : le
  // commercial voit SON périmètre, `finance:read` reste celle de l'espace.
  @Get('me/commercial')
  @RequirePermission('finance:read:own')
  getMineCommercial(@CurrentUser() user: CurrentUserPayload, @Query('month') month?: string) {
    return this.objectives.getMyCommercialObjectives(user.userId, sanitizeMonth(month))
  }

  // Théo D team-business.N2 — « Un objectif choisi, pas imposé en silence ».
  // Déclarées AVANT toute route paramétrée.

  /** Mes propositions de cible en attente de réponse (tout membre). */
  @Get('proposals/mine')
  listMyProposals(@CurrentUser() user: CurrentUserPayload) {
    return this.proposals.listMine(user.userId)
  }

  /** Les propositions du mois pour l'équipe (direction). */
  @Get('proposals')
  @RequirePermission('team:manage')
  listTeamProposals(@CurrentUser() user: CurrentUserPayload, @Query('month') month?: string) {
    return this.proposals.listForTeam(user.userId, sanitizeMonth(month))
  }

  /** La direction propose une cible à un membre — rien ne change avant sa réponse. */
  @Post('proposals')
  @RequirePermission('team:manage')
  propose(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateObjectiveProposalDto) {
    return this.proposals.propose(user.userId, body)
  }

  /** Le membre accepte (la cible est appliquée) ou refuse (rien ne change). */
  @Patch('proposals/:id')
  respond(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RespondObjectiveProposalDto,
  ) {
    return this.proposals.respond(user.userId, id, body.decision)
  }

  /** L'atteinte de l'équipe pour le mois (manager). */
  @Get('team')
  @RequirePermission('team:manage')
  getTeam(@CurrentUser() user: CurrentUserPayload, @Query('month') month?: string) {
    return this.objectives.getTeamProgress(user.userId, sanitizeMonth(month))
  }
}

/**
 * Ne laisse passer qu'un mois `YYYY-MM-01` bien formé (il alimente un `$::date`) ;
 * toute autre valeur retombe sur le défaut (mois courant), jamais un cast qui casse.
 */
function sanitizeMonth(month?: string): string | undefined {
  return month && MEMBER_OBJECTIVE_MONTH_PATTERN.test(month) ? month : undefined
}
