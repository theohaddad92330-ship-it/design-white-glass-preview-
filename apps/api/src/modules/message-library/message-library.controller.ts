import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  setContentVisibilitySchema,
  type SetContentVisibility,
  confirmMandatoryFactRequestSchema,
  confirmMessageClaimRequestSchema,
  createMessageLibraryEntrySchema,
  messageLibrarySelectionCriteriaSchema,
  renderMessageLibraryEntryRequestSchema,
  type ConfirmMandatoryFactRequest,
  type ConfirmMessageClaimRequest,
  type CreateMessageLibraryEntry,
  type MessageLibraryEntry,
  type MessageLibraryRenderResult,
  type MessageLibrarySelectionCriteria,
  type MessageLibrarySelectionTrace,
  type RenderMessageLibraryEntryRequest,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { MessageLibraryService, type MessageLibraryCtx } from './message-library.service'

/**
 * #3427 — la surface HTTP de la bibliothèque d'exemples commerciaux. Espace
 * et rôle résolus depuis le TOKEN (GA-07), jamais depuis le corps.
 */
@Controller('message-library')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MessageLibraryController {
  constructor(
    private readonly messageLibrary: MessageLibraryService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async ctx(user: CurrentUserPayload): Promise<MessageLibraryCtx> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { userId: user.userId, workspaceId, role }
  }

  @Post()
  @RequirePermission('records:write')
  async create(
    @Body(new ZodValidationPipe(createMessageLibraryEntrySchema)) dto: CreateMessageLibraryEntry,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageLibraryEntry> {
    return this.messageLibrary.create(await this.ctx(user), dto)
  }

  /** AVANT `:id`. Idempotent : pose les séquences livrées, sans doublon. */
  @Post('import-defaults')
  @RequirePermission('records:write')
  async importDefaults(@CurrentUser() user: CurrentUserPayload): Promise<{ imported: number; alreadyThere: number }> {
    return this.messageLibrary.importDefaults(await this.ctx(user))
  }

  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<MessageLibraryEntry[]> {
    return this.messageLibrary.list(await this.ctx(user))
  }

  /** AVANT `:id` : sinon `select` s'y lirait comme un UUID (404 deviné). */
  @Post('select')
  @WorkspaceRead()
  async select(
    @Body(new ZodValidationPipe(messageLibrarySelectionCriteriaSchema)) criteria: MessageLibrarySelectionCriteria,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageLibrarySelectionTrace> {
    return this.messageLibrary.select(await this.ctx(user), criteria)
  }

  @Get(':id')
  @WorkspaceRead()
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageLibraryEntry> {
    return this.messageLibrary.get(await this.ctx(user), id)
  }

  /** #4158.30 — l'auteur partage son exemple avec l'équipe, ou le reprend en personnel. */
  @Patch(':id/visibility')
  @RequirePermission('records:write')
  async setVisibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setContentVisibilitySchema)) dto: SetContentVisibility,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageLibraryEntry> {
    return this.messageLibrary.setVisibility(await this.ctx(user), id, dto.visibility)
  }

  /** #3439.1 — confirmer UN fait obligatoire (qui, quand) ; `records:write`. */
  @Post(':id/confirm-fact')
  @RequirePermission('records:write')
  async confirmFact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(confirmMandatoryFactRequestSchema)) dto: ConfirmMandatoryFactRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageLibraryEntry> {
    return this.messageLibrary.confirmMandatoryFact(await this.ctx(user), id, dto.fact)
  }

  /** #3437 / #3438 — confirmer UNE affirmation (qui, quand) ; `records:write`. */
  @Post(':id/confirm-claim')
  @RequirePermission('records:write')
  async confirmClaim(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(confirmMessageClaimRequestSchema)) dto: ConfirmMessageClaimRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageLibraryEntry> {
    return this.messageLibrary.confirmClaim(await this.ctx(user), id, dto.claimIndex)
  }

  @Post(':id/render')
  @WorkspaceRead()
  async render(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(renderMessageLibraryEntryRequestSchema)) dto: RenderMessageLibraryEntryRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageLibraryRenderResult> {
    return this.messageLibrary.render(await this.ctx(user), id, dto.variables)
  }
}
