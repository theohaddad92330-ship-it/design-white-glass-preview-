import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  createAutomationRuleRequestSchema,
  saveAutomationRuleDraftRequestSchema,
  updateAutomationRuleRequestSchema,
  type AutomationRuleView,
  type AutomationSwitchPreviewView,
  type AutomationTrialView,
  type CreateAutomationRuleRequest,
  type SaveAutomationRuleDraftRequest,
  type UpdateAutomationRuleRequest,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AutomationRuleEditorService } from './automation-rule-editor.service'
import { AutomationRulesService } from './automation-rules.service'

/**
 * Lot L-D1 (#4167) — « Actions › Automatisations » : les règles « quand signal →
 * alors … » de LA PERSONNE qui appelle, dans son espace actif.
 *
 * `@PersonalScope` : chaque route sert les règles de celui qui appelle, jamais
 * celles d'un collègue (le service borne par `(espace, personne)`). Allumer, créer,
 * plafonner et supprimer décident de ce qui sera inscrit et préparé en son nom :
 * `messages:send`, comme créer une séquence. Rien de ce que ces règles font ne
 * part sans validation humaine (c82).
 *
 * L'espace est résolu ICI, la couche d'orchestration (GA-07).
 */
@Controller('automation-rules')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
@PersonalScope()
export class AutomationRulesController {
  constructor(
    private readonly rules: AutomationRulesService,
    private readonly editor: AutomationRuleEditorService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<AutomationRuleView[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.rules.list(workspaceId, user.userId)
  }

  @Post()
  @RequirePermission('messages:send')
  async create(
    @Body(new ZodValidationPipe(createAutomationRuleRequestSchema)) dto: CreateAutomationRuleRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AutomationRuleView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.rules.create(workspaceId, user.userId, dto)
  }

  @Patch(':id')
  @RequirePermission('messages:send')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAutomationRuleRequestSchema)) dto: UpdateAutomationRuleRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AutomationRuleView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.rules.update(workspaceId, user.userId, id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('messages:send')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.rules.remove(workspaceId, user.userId, id)
  }

  /** Théo C automations-bibliotheque.N3 — le journal des essais de LA PERSONNE (jamais ceux d'un collègue). */
  @Get('trials')
  async trials(@CurrentUser() user: CurrentUserPayload): Promise<AutomationTrialView[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.editor.listTrials(workspaceId, user.userId)
  }

  /** Théo C automations-editeur.N2/N3 — enregistre le brouillon ; la règle qui tourne n'est pas touchée. */
  @Put(':id/draft')
  @RequirePermission('messages:send')
  async saveDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saveAutomationRuleDraftRequestSchema)) dto: SaveAutomationRuleDraftRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AutomationRuleView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.editor.saveDraft(workspaceId, user.userId, id, dto)
  }

  /** « Tester le parcours » : lit les vraies données, ne crée ni tâche ni message. */
  @Post(':id/trial')
  @RequirePermission('messages:send')
  async trial(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AutomationTrialView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.editor.runTrial(workspaceId, user.userId, id)
  }

  /**
   * #2399.7 — la comparaison rendue AVANT la bascule. Elle ne modifie pas la règle : voir ne demande pas `messages:send`
   * (qui peut voir la règle voit ce qui changerait) ; la bascule, elle, le demande. Le contrôleur ne rend jamais une règle
   * qui n'est pas celle de LA PERSONNE.
   */
  @Get(':id/switch-preview')
  async switchPreview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AutomationSwitchPreviewView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.editor.switchPreview(workspaceId, user.userId, id)
  }

  /** « Activer la version N+1 » : seulement un brouillon déjà testé ET dont la comparaison a été rendue. */
  @Post(':id/activate-draft')
  @RequirePermission('messages:send')
  async activateDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AutomationRuleView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.editor.activateDraft(workspaceId, user.userId, id)
  }

  @Post(':id/duplicate')
  @RequirePermission('messages:send')
  async duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AutomationRuleView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.editor.duplicate(workspaceId, user.userId, id)
  }

  /** « Archiver cette règle » — on archive, on ne supprime pas. */
  @Post(':id/archive')
  @HttpCode(204)
  @RequirePermission('messages:send')
  async archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.editor.archive(workspaceId, user.userId, id)
  }
}
