import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createZodDto } from 'nestjs-zod'
import { Repository } from 'typeorm'
import { z } from 'zod'
import { SPRINT_EVENTS, SPRINT_LEVELS, type SprintLevel, type SprintSwitch } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { AccountEntity } from '../../database/entities/account.entity'
import { resolveOwnerNames } from '../accounts/account-owner.util'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { SprintsService, type SprintBoard, type SprintBoardAccount } from './sprints.service'

const moveSchema = z.object({
  sprint: z.enum(SPRINT_LEVELS),
  /** Obligatoire vers `no_go` — la règle vit dans le contrat, pas ici. */
  reason: z.string().nullable().optional(),
  /**
   * BEL-SC-228 (#3257) — la décision générique (`SprintDecisionFields`).
   * Absent = colonne intacte ; `null` explicite l'efface. `reviewAt` obligatoire
   * vers `watch` est vérifié par `sprintDecisionProblems`, pas ici (le contrat
   * ne fait que borner la FORME, jamais la règle métier).
   */
  decisionReason: z.string().trim().max(1000).nullable().optional(),
  effortEstimate: z.string().trim().max(300).nullable().optional(),
  reviewAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'reviewAt must be YYYY-MM-DD')
    .nullable()
    .optional(),
  promotionCondition: z.string().trim().max(1000).nullable().optional(),
  demotionCondition: z.string().trim().max(1000).nullable().optional(),
})
class MoveSprintDto extends createZodDto(moveSchema) {}

const eventSchema = z.object({
  event: z.enum(SPRINT_EVENTS),
  /** L'id de ce qui a déclenché l'évènement — l'action au journal d'activité,
   *  par exemple. Porte l'idempotence : rejouer la même cause ne bascule pas
   *  deux fois (contrainte unique en base, sur compte + évènement + cette
   *  référence). */
  sourceRef: z.string().min(1),
})
class SprintEventDto extends createZodDto(eventSchema) {}

/** Le board d'effort (tome 5 §28). Trois colonnes, une sortie, un plafond dur. */
@Controller('sprints')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class SprintsController {
  constructor(
    private readonly sprints: SprintsService,
    private readonly workspaceContext: WorkspaceContextService,
    // #3257.7a — le porteur sur la carte : `Repository<AccountEntity>` est un
    // schéma partagé (hors GA-07, voir le docblock de `module-boundaries.spec.ts`),
    // jamais le service des comptes — celui-ci fermerait un cycle de modules.
    @InjectRepository(AccountEntity)
    private readonly accountsRepo: Repository<AccountEntity>,
  ) {}

  private async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /**
   * #3257.7a — pose le PORTEUR sur des cartes déjà résolues (`owners`), sans
   * requête supplémentaire. `owner_id` absent ou compte libre → `owner: null`,
   * une vraie réponse, jamais un uuid ni un « inconnu ».
   */
  private attachOwners(
    accounts: SprintBoardAccount[],
    owners: Map<string, SprintBoardAccount['owner']>,
  ): SprintBoardAccount[] {
    return accounts.map(a => ({ ...a, owner: a.owner_id ? (owners.get(a.owner_id) ?? null) : null }))
  }

  @Get()
  async board(@CurrentUser() user: CurrentUserPayload): Promise<SprintBoard & { focus_capacity: number }> {
    const workspaceId = await this.workspaceOf(user.userId)
    const board = await this.sprints.board(workspaceId)
    // Tous les niveaux (`SPRINT_LEVELS`, source unique — Veille et Route
    // partenaire comprises), jamais une liste recopiée à la main.
    const all = SPRINT_LEVELS.flatMap(level => board[level])
    // UNE seule requête pour tout le board, jamais une par colonne ni par carte.
    const owners = await resolveOwnerNames(
      this.accountsRepo,
      all.map(a => a.owner_id),
    )
    return {
      focus: this.attachOwners(board.focus, owners),
      extension: this.attachOwners(board.extension, owners),
      volume: this.attachOwners(board.volume, owners),
      no_go: this.attachOwners(board.no_go, owners),
      watch: this.attachOwners(board.watch, owners),
      partner_route: this.attachOwners(board.partner_route, owners),
      // #3296 — sans cette ligne, les comptes non placés lus par le service ne
      // sortaient jamais de l'API.
      unplaced: board.unplaced,
      // #3407 — le plafond du Focus de l'espace (8 par commercial), celui que `PATCH` applique.
      focus_capacity: await this.sprints.focusCapacity(workspaceId),
    }
  }

  /**
   * Un évènement arrivé sur un compte — réponse positive, rendez-vous obtenu,
   * deux relances sans réponse…
   *
   * Rend TOUJOURS ce qu'il faut faire, et dit s'il l'a fait. Une bascule qui
   * descend l'effort revient en `applied: false` avec sa raison : c'est une
   * proposition à afficher, pas un silence.
   */
  @RequirePermission('records:write')
  @Post('accounts/:id/event')
  async event(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SprintEventDto,
  ): Promise<{ applied: boolean; switch: SprintSwitch | null; level: SprintLevel | null }> {
    return this.sprints.applyEvent(await this.workspaceOf(user.userId), id, dto.event, dto.sourceRef)
  }

  @RequirePermission('records:write')
  @Patch('accounts/:id')
  async move(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveSprintDto,
  ): Promise<SprintBoardAccount> {
    const updated = await this.sprints.move(
      await this.workspaceOf(user.userId),
      id,
      dto.sprint,
      dto.reason ?? null,
      {
        reason: dto.decisionReason,
        effortEstimate: dto.effortEstimate,
        reviewAt: dto.reviewAt,
        promotionCondition: dto.promotionCondition,
        demotionCondition: dto.demotionCondition,
      },
      user.userId,
    )
    const owners = await resolveOwnerNames(this.accountsRepo, [updated.owner_id])
    const [withOwner] = this.attachOwners([updated], owners)
    return withOwner
  }
}
