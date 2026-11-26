import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  actionIntentSchema,
  actionLevelSettingSchema,
  simulateActionLevelRequestSchema,
  type ActionDispatchResult,
  type ActionLevelSetting,
  type ActionIntent,
  type DispatchBulkResponse,
  type SimulateActionLevelRequest,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { ActionLevelSimulationReport } from '../action-os/copilot-action-gate'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { MemoryService } from '../memory/memory.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { readActionLevelSetting, writeActionLevelSetting } from './action-level-setting'
import { ActionRouterService } from './action-router.service'
import { DispatchBulkDto } from './dto/dispatch-bulk.dto'

/**
 * Action Router HTTP surface — turns a recommendation into an executed action
 * (§3, §8). JWT-guarded; the workspace/user come from the token (never the body).
 * Lives under `/actions` alongside the activity-feed controller (distinct paths).
 */
@Controller('actions')
// #2449 — `WorkspacePermissionGuard` s'ajoute au JWT pour que
// `@RequirePermission` ait un lecteur. Les routes qui n'en déclarent aucune
// gardent EXACTEMENT le comportement qu'elles avaient : le garde ne refuse que
// ce qu'une route a nommé.
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ActionRouterController {
  constructor(
    private readonly actionRouter: ActionRouterService,
    // #2896 / #2449.34 — le sac de préférences où vit le niveau réglé, lu ICI
    // (orchestration au contrôleur, GA-07), jamais par un service de plus.
    private readonly memory: MemoryService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * #2896 / #2449.34 — le niveau d'action RÉGLÉ par l'appelant (`null` = le
   * défaut de #2449). Personnel : aucune permission au-delà du jeton, l'identité
   * ne vient jamais du corps.
   */
  @Get('level')
  async level(@CurrentUser() user: CurrentUserPayload): Promise<ActionLevelSetting> {
    return readActionLevelSetting(this.memory, user.userId)
  }

  /**
   * #2896 / #2449.34 — régler SON niveau. Le schéma refuse « automatiser » :
   * ce n'est pas un mandat personnel (#2449.26, la capacité n'existe pas).
   */
  @Put('level')
  async setLevel(
    @Body(new ZodValidationPipe(actionLevelSettingSchema)) dto: ActionLevelSetting,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ActionLevelSetting> {
    return writeActionLevelSetting(
      this.memory,
      {
        userId: user.userId,
        workspaceId: async () => (await this.workspaceContext.resolveActiveWorkspace(user.userId)).workspaceId,
      },
      dto,
    )
  }

  /**
   * Execute one typed action intent → its dispatch result. The body is a
   * discriminated union, so it's validated with a param-level Zod pipe (a
   * `createZodDto` class can't wrap a union base type).
   */
  @Post('dispatch')
  async dispatch(
    @Body(new ZodValidationPipe(actionIntentSchema)) intent: ActionIntent,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ActionDispatchResult> {
    return this.actionRouter.dispatch(intent, { userId: user.userId, email: user.email })
  }

  /** Execute a list of intents best-effort → aggregated results + summary. */
  @Post('dispatch/bulk')
  async dispatchBulk(
    @Body() dto: DispatchBulkDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<DispatchBulkResponse> {
    return this.actionRouter.dispatchBulk(dto.intents, { userId: user.userId, email: user.email })
  }

  /**
   * #2400.5 / #2449.29 — LE DRY RUN : ce que le niveau demandé ferait de ces
   * gestes, sans en exécuter un seul.
   *
   * ⚠️ `origin: 'system'` est posé ICI, en dur, et ce n'est pas une omission :
   * une simulation demandée depuis un écran ne doit PAS bénéficier du « clic
   * vaut accord ». On veut savoir ce qui partirait TOUT SEUL — c'est la seule
   * question qu'une simulation d'activation d'automatisation pose. Simuler avec
   * le clic de celui qui simule rendrait un rapport toujours vert.
   *
   * La route est un POST parce que le corps porte une liste ; elle n'écrit
   * rien, ne réclame aucune clé d'idempotence et ne touche aucun service en aval.
   */
  @Post('simulate')
  // #2449.28 / #2449.32 — éprouver un niveau d'action est un geste de
  // GOUVERNANCE : c'est ce qu'on fait avant d'activer une automatisation. Le
  // droit est donc le même que l'habilitation au niveau « automatiser »
  // (`AUTOMATE_LEVEL_PERMISSION`), et pour la même raison qu'ailleurs dans le
  // dépôt : « manager » n'est pas un rôle du produit, c'est quiconque gère
  // l'équipe — on réutilise la matrice plutôt que d'inventer une seconde liste.
  @RequirePermission('team:manage')
  async simulate(
    @Body(new ZodValidationPipe(simulateActionLevelRequestSchema)) dto: SimulateActionLevelRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ActionLevelSimulationReport> {
    return this.actionRouter.simulateBulk(dto.intents, {
      userId: user.userId,
      email: user.email,
      actionLevel: dto.actionLevel,
      origin: 'system',
    })
  }
}
