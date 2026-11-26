import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  addAccountTeamMemberRequestSchema,
  addAccountTeamScopeRequestSchema,
  addDoNotContactRequestSchema,
  colleagueContactCheckRequestSchema,
  type AccountTeamResponse,
  type AddAccountTeamMemberRequest,
  type AddDoNotContactRequest,
  type AlreadyProposedResponse,
  type ColleagueActivityResponse,
  type ColleagueContactCheckRequest,
  type ColleagueContactCheckResponse,
  type DoNotContactEntry,
  type DoNotContactListResponse,
  type DuplicateCandidatesResponse,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { GovernanceService } from '../crm-core/governance.service'
import { TeamGuardrailsService, type GuardrailContext } from './team-guardrails.service'

/**
 * #4158 (lot L4) — garde-fous entre collègues. Lectures ouvertes à tout membre
 * de l'espace actif (`@WorkspaceRead`) ; écritures sous `records:write`, sauf le
 * retrait d'une exclusion (`team:manage`). Chaque lecture est bornée par l'espace
 * ACTIF : un identifiant d'un autre espace répond 404.
 */
@Controller('team-guardrails')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class TeamGuardrailsController {
  constructor(
    private readonly guardrails: TeamGuardrailsService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly governance: GovernanceService,
  ) {}

  /** L'espace ACTIF de l'appelant : jamais un identifiant venu du corps de la requête. */
  private async ctxOf(user: CurrentUserPayload): Promise<GuardrailContext> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { userId: user.userId, workspaceId, role }
  }

  /** #4158.20 — qui a travaillé ce compte. */
  @Get('accounts/:id/activity')
  @WorkspaceRead()
  async accountActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ColleagueActivityResponse> {
    return this.guardrails.activityOnAccount(await this.ctxOf(user), id)
  }

  /** #4158.20 — qui a travaillé ce contact. */
  @Get('contacts/:id/activity')
  @WorkspaceRead()
  async contactActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ColleagueActivityResponse> {
    return this.guardrails.activityOnContact(await this.ctxOf(user), id)
  }

  /** #4158.21/.22 — ce que l'espace sait de ces contacts avant d'écrire. Lecture (POST pour le lot). */
  @Post('contacts/check')
  @HttpCode(200)
  @WorkspaceRead()
  async check(
    @Body(new ZodValidationPipe(colleagueContactCheckRequestSchema)) body: ColleagueContactCheckRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ColleagueContactCheckResponse> {
    return this.guardrails.checkContacts(await this.ctxOf(user), body.contact_ids)
  }

  /** #4158.22 — la liste « ne pas contacter » de l'espace. */
  @Get('do-not-contact')
  @WorkspaceRead()
  async listDoNotContact(@CurrentUser() user: CurrentUserPayload): Promise<DoNotContactListResponse> {
    return { items: await this.guardrails.listDoNotContact(await this.ctxOf(user)) }
  }

  @Post('do-not-contact')
  @RequirePermission('records:write')
  async addDoNotContact(
    @Body(new ZodValidationPipe(addDoNotContactRequestSchema)) body: AddDoNotContactRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<DoNotContactEntry> {
    return this.guardrails.addDoNotContact(await this.ctxOf(user), body)
  }

  @Delete('do-not-contact/:id')
  @RequirePermission('team:manage')
  @HttpCode(204)
  async liftDoNotContact(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.guardrails.liftDoNotContact(await this.ctxOf(user), id)
  }

  /** #4158.23 — ces consultants ont-ils déjà été proposés par un collègue ? */
  @Get('needs/:needId/already-proposed')
  @WorkspaceRead()
  async alreadyProposed(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Query('consultant_ids') consultantIds: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AlreadyProposedResponse> {
    return this.guardrails.alreadyProposed(await this.ctxOf(user), needId, parseIds(consultantIds))
  }

  /** #4158.23 — idem depuis une opportunité du vivier (positionnements au-delà de « retenu »). */
  @Get('projects/:projectId/already-proposed')
  @WorkspaceRead()
  async alreadyProposedOnProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('consultant_ids') consultantIds: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AlreadyProposedResponse> {
    return this.guardrails.alreadyProposedOnProject(await this.ctxOf(user), projectId, parseIds(consultantIds))
  }

  /** #4158.24 — fiches qui ressemblent à celle-ci (jamais de fusion). */
  @Get('duplicates')
  @WorkspaceRead()
  async duplicates(
    @Query('kind') kind: string,
    @Query('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<DuplicateCandidatesResponse> {
    const entity = kind === 'contact' ? 'contact' : 'account'
    return { items: await this.guardrails.duplicateCandidates(await this.ctxOf(user), entity, id) }
  }

  /** « Proposer la fusion » : une paire à trancher par un humain, rien de fusionné. */
  @Post('duplicates/propose')
  @RequirePermission('records:write')
  @HttpCode(204)
  async proposeMerge(
    @Body() body: { kind: 'account' | 'contact'; left_id: string; right_id: string },
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    const kind = body?.kind === 'contact' ? 'contact' : 'account'
    const ctx = await this.ctxOf(user)
    const [left, right] = [String(body?.left_id), String(body?.right_id)]
    await this.guardrails.assertMergeProposable(ctx, kind, left, right)
    await this.governance.proposeDuplicates(ctx.workspaceId, [
      { entityType: kind, leftId: left, rightId: right, reason: 'Proposé à la main par un collègue', confidence: 0.9 },
    ])
  }

  /** #4158.25 — l'équipe d'un compte. */
  @Get('accounts/:id/team')
  @WorkspaceRead()
  async team(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountTeamResponse> {
    return this.guardrails.accountTeam(await this.ctxOf(user), id)
  }

  @Post('accounts/:id/team')
  @RequirePermission('records:write')
  async addTeamMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addAccountTeamMemberRequestSchema)) body: AddAccountTeamMemberRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountTeamResponse> {
    return this.guardrails.addTeamMember(await this.ctxOf(user), id, body.user_id)
  }

  @Delete('accounts/:id/team/:memberId')
  @RequirePermission('records:write')
  async removeTeamMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountTeamResponse> {
    return this.guardrails.removeTeamMember(await this.ctxOf(user), id, memberId)
  }

  /** #4996 — poser un périmètre à un membre (le sien, ou celui d'un autre si l'on compose l'équipe). */
  @Post('accounts/:id/team/:userId/scopes')
  @RequirePermission('records:write')
  async addTeamScope(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) memberId: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountTeamResponse> {
    // Le membre vient du chemin, jamais du corps : un seul endroit pour dire de qui l'on parle.
    const parsed = addAccountTeamScopeRequestSchema.safeParse({
      ...(typeof body === 'object' && body !== null ? body : {}),
      user_id: memberId,
    })
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(i => i.message).join(' ; '))
    return this.guardrails.addTeamScope(await this.ctxOf(user), id, parsed.data)
  }

  @Delete('accounts/:id/team/:userId/scopes/:scopeId')
  @RequirePermission('records:write')
  async removeTeamScope(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) memberId: string,
    @Param('scopeId', ParseUUIDPipe) scopeId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountTeamResponse> {
    return this.guardrails.removeTeamScope(await this.ctxOf(user), id, memberId, scopeId)
  }
}

/** Les identifiants d'une liste `a,b,c` — uniquement des uuid, 100 au plus. */
function parseIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(id => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 100)
}
