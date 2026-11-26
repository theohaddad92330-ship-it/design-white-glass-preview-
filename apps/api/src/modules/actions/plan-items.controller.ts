import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import type {
  ActionPlanItem,
  CloseStalePlanItemsResult,
  AwaitingOutcomeAction,
  CreatedPlanAction,
  MyPlanAction,
  SendTiming,
} from '@bellum/contracts'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { ActionPlanItemsService } from './action-plan-items.service'
import { SendTimingService } from './send-timing.service'
import { CloseStalePlanItemsDto } from './dto/close-stale-plan-items.dto'
import { CreatePlanActionDto } from './dto/create-plan-action.dto'
import { ListActionPlanItemsDto } from './dto/list-action-plan-items.dto'
import { PrepareContactPlanDto } from './dto/prepare-contact-plan.dto'
import { ListMyPlanItemsDto } from './dto/list-my-plan-items.dto'
import { ListPlanItemLastOutcomesDto } from './dto/list-plan-item-last-outcomes.dto'
import { UpdateActionPlanItemDto } from './dto/update-action-plan-item.dto'

/**
 * The interactive action-plan checklist. `GET /plan-items?account_id=` no longer
 * writes (#2395.1) : an unacted plan step is returned VIRTUAL (`id` =
 * `plan:<account>:<week>:<step>`); `PATCH /plan-items/:id` persists a
 * single item's `done` / `due_date`, materializing that ONE step on first gesture. Every route is JWT-guarded and scoped to
 * the current user.
 */
@Controller('plan-items')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class PlanItemsController {
  constructor(
    private readonly service: ActionPlanItemsService,
    private readonly sendTiming: SendTimingService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get()
  list(@Query() query: ListActionPlanItemsDto, @CurrentUser() user: CurrentUserPayload): Promise<ActionPlanItem[]> {
    return this.service.listForAccount(user.userId, query.account_id)
  }

  /**
   * Le dernier résultat déclaré de PLUSIEURS comptes, en une lecture (briefing : une ligne par
   * compte appelait `GET /plan-items?account_id=` autant de fois). Déclarée AVANT toute route
   * paramétrée. Lecture de l'espace résolu server-side, comme `mine`.
   */
  @WorkspaceRead()
  @Get('last-outcomes')
  listLastOutcomes(
    @Query() query: ListPlanItemLastOutcomesDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ActionPlanItem[]> {
    return this.service.listLastOutcomes(user.userId, query.account_ids)
  }

  /**
   * #2123.46 — MES actions ouvertes, tous comptes confondus (écran Actions).
   *
   * Déclarée AVANT toute route paramétrée : `mine` n'est pas un identifiant.
   *
   * `@WorkspaceRead` (GA-05, D39) : une LECTURE de l'espace résolu server-side
   * (`resolveActiveWorkspace`), rien n'est écrit, aucun crédit n'est dépensé —
   * `viewer` la lit comme tout le reste du portefeuille.
   *
   * #2717 — `?overdue=true` restreint à la MÊME portée que la tuile « En
   * retard » du Dashboard, pour que le clic atterrisse sur une liste dont le
   * compte égale le chiffre affiché.
   */
  @WorkspaceRead()
  @Get('mine')
  listMine(@Query() query: ListMyPlanItemsDto, @CurrentUser() user: CurrentUserPayload): Promise<MyPlanAction[]> {
    return this.service.listMine(user.userId, query.overdue === true)
  }

  /**
   * #4418.1 — le TOTAL des actions ouvertes que `GET /plan-items/mine` plafonne à 200 : l'écran Actions en
   * déduit combien de lignes il écarte et le dit. Déclarée AVANT toute route paramétrée. `null` = lecture
   * impossible (jamais « 0 »).
   */
  @WorkspaceRead()
  @Get('mine/count')
  countMine(
    @Query() query: ListMyPlanItemsDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ open: number } | null> {
    return this.service.countMine(user.userId, query.overdue === true)
  }

  /**
   * #3211.9 (#3234, lot M11 09/10) — la FILE PROACTIVE « Issues à déclarer » :
   * mes actions faites sans issue (`ActionPlanItemsService.listDoneWithoutOutcome`).
   * Déclarée AVANT toute route paramétrée. `null` = lecture impossible.
   */
  @WorkspaceRead()
  @Get('awaiting-outcome')
  listAwaitingOutcome(@CurrentUser() user: CurrentUserPayload): Promise<AwaitingOutcomeAction[] | null> {
    return this.service.listDoneWithoutOutcome(user.userId)
  }

  /**
   * #3289 (#3264.31/.32/.33) — le créneau d'envoi que l'ESPACE a appris, par
   * canal, mesuré sur les gestes faits et leurs issues déclarées. Déclarée
   * AVANT toute route paramétrée. `null` = lecture impossible.
   */
  @WorkspaceRead()
  @Get('send-timing')
  async sendTimingOfWorkspace(
    @Query('seniority') seniority: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SendTiming | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.sendTiming.forWorkspace(workspaceId, seniority?.trim() || undefined)
  }

  /**
   * #2123.46 / #2123.47 — créer une action depuis le plan d'un compte.
   *
   * La SEULE porte de création côté produit : elle écrit une ligne
   * `action_plan_items`, celle que le plan affiche et que l'écran Actions
   * liste. Écrire au plan modifie une fiche : `records:write`.
   */
  @RequirePermission('records:write')
  @Post()
  create(@Body() dto: CreatePlanActionDto, @CurrentUser() user: CurrentUserPayload): Promise<CreatedPlanAction> {
    return this.service.createFromPlan(user.userId, dto)
  }

  /**
   * #4416 — « Préparer un plan pour <prénom> » : 2-3 étapes pour un contact, rangées dans le plan du compte.
   * Écrit des lignes du plan : `records:write`, comme {@link create}.
   */
  @RequirePermission('records:write')
  @Post('for-contact')
  prepareForContact(
    @Body() dto: PrepareContactPlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ActionPlanItem[]> {
    return this.service.prepareForContact(user.userId, dto)
  }

  /**
   * #4485 — « Proposer de les clore » : marque faites, APRÈS le clic de la personne, ses actions ouvertes
   * vieilles de plus de 30 jours (`ActionPlanItemsService.closeStale`). Écrit des lignes du plan :
   * `records:write`. Déclarée AVANT la route paramétrée `:id`.
   */
  @RequirePermission('records:write')
  @Post('close-stale')
  closeStale(
    @Body() dto: CloseStalePlanItemsDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CloseStalePlanItemsResult> {
    return this.service.closeStale(user.userId, dto.ids)
  }

  // Cocher une action du plan MODIFIE une fiche : c'est `records:write`. La
  // route ne déclarait rien — un `viewer` pouvait cocher la liste de quelqu'un
  // d'autre, et GA-05 la comptait parmi les muettes.
  @RequirePermission('records:write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateActionPlanItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ActionPlanItem> {
    return this.service.update(user.userId, id, dto)
  }
}
