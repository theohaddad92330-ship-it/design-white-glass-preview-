import { Body, Controller, Get, Optional, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import type {
  ActivateWorkContextResponse,
  WorkContext,
  WorkContextProfileSuggestionResponse,
  WorkContextsResponse,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { EsnProfileService } from '../esn-profile/esn-profile.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CreateWorkContextDto } from './dto/create-work-context.dto'
import { suggestProfileUpdateFromUsage } from './profile-update-suggestion'
import { WorkContextsService } from './work-contexts.service'

/**
 * #2455 — Contextes de travail enregistrés (LAU-FINAL-168). Module autonome
 * (règle #7) : le retirer supprime `/work-contexts/*` sans toucher au reste
 * (le profil principal vit ailleurs, intact).
 *
 * GA-05 — `WorkspacePermissionGuard` (mesuré absent le 22/09/2026) : ce qui
 * crée, active ou archive déclare `@RequirePermission('records:write')`. Les
 * quatre lectures déclarent `@WorkspaceRead()` — aucune permission
 * `records:read` n'existe (`WorkspacePermission`, `packages/contracts`
 * n'a QUE des familles d'actions mutantes, `viewer` n'en tient aucune et lit
 * pourtant tout) ; poser une permission d'écriture par défaut fermerait la
 * porte à `viewer`/`tech_admin` sur une route qui ne fait que lire, comme
 * documenté dans `workspace-read.decorator.ts` (D39) — même patron que les
 * lectures de `memory.controller.ts`.
 */
@Controller('work-contexts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class WorkContextsController {
  constructor(
    private readonly workContexts: WorkContextsService,
    // #2455.6 — LE SEUL point de ce module qui lit le profil principal, et
    // seulement en LECTURE (jamais une écriture). `@Optional()` : sans le
    // module ESN profile, aucune proposition ne se calcule — jamais une
    // proposition devinée sur un profil illisible.
    @Optional() private readonly esnProfile?: EsnProfileService,
  ) {}

  /** Contextes visibles pour l'appelant : les siens + BU + partagés espace. */
  @WorkspaceRead()
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<WorkContextsResponse> {
    return { items: await this.workContexts.list(user.userId, { includeArchived: includeArchived === 'true' }) }
  }

  @WorkspaceRead()
  @Get(':id')
  get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string): Promise<WorkContext> {
    return this.workContexts.get(user.userId, id)
  }

  /** Créer une variante — jamais une modification du profil principal (#2455.1). */
  @Post()
  @RequirePermission('records:write')
  create(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateWorkContextDto): Promise<WorkContext> {
    return this.workContexts.create(user.userId, body)
  }

  /** Bascule : ouvre une conversation neuve, le fil d'origine reste intact (#2455.5). */
  @Post(':id/activate')
  @RequirePermission('records:write')
  activate(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string): Promise<ActivateWorkContextResponse> {
    return this.workContexts.activate(user.userId, id)
  }

  /** Conservé pour l'historique, non proposé par défaut (#2455.3). */
  @Patch(':id/archive')
  @RequirePermission('records:write')
  archive(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string): Promise<WorkContext> {
    return this.workContexts.archive(user.userId, id)
  }

  /**
   * #2455.6 — un DIFF à afficher, JAMAIS une écriture. Lit le signal d'usage
   * (`WorkContextsService.usageSignal`, qui ne touche jamais `profiles`) et le
   * profil actuel (`EsnProfileService.getAnswers`, lecture seule) pour calculer
   * la proposition PURE (`suggestProfileUpdateFromUsage`). `null` sans le
   * module ESN profile, sans signal (contexte non personnel/pas le sien), ou
   * quand la fonction pure dit qu'il n'y a rien à proposer.
   */
  @WorkspaceRead()
  @Get(':id/profile-suggestion')
  async profileSuggestion(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<WorkContextProfileSuggestionResponse> {
    if (!this.esnProfile) return { suggestion: null }
    const signal = await this.workContexts.usageSignal(user.userId, id)
    if (!signal) return { suggestion: null }
    const answers = await this.esnProfile.getAnswers(user.userId)
    return {
      suggestion: suggestProfileUpdateFromUsage({
        contextSectors: signal.sectors,
        activationCount: signal.activationCount,
        currentTargetSectors: answers.target_sectors ?? [],
      }),
    }
  }
}
