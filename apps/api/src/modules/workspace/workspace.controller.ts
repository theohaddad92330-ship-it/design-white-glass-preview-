import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import type {
  AcceptWorkspaceInvitationResult,
  ActiveWorkspace,
  MemberPortfolio,
  PortfolioHandoverResult,
  WorkspaceActivityPage,
  WorkspaceDefaultContextModeResolution,
  WorkspaceHiddenSectionsResolution,
  WorkspaceMarketResolution,
  WorkspaceSummary,
  WorkspaceTeam,
  ResendWorkspaceInvitationResult,
  WorkspaceTeamInvitation,
  WorkspaceTimezoneResolution,
  HandoverPlanResult,
  PortfolioVisibility,
  WorkspacePermission,
  WorkspaceTeamMember,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import {
  CreateWorkspaceInvitationDto,
  HandOverPortfolioDto,
  HandoverPlanDto,
  SetMemberPermissionsDto,
  SetCommunitySharingDto,
  SetPortfolioVisibilityDto,
  SwitchWorkspaceDto,
  UpdateWorkspaceDefaultContextModeDto,
  UpdateWorkspaceHiddenSectionsDto,
  UpdateWorkspaceMarketDto,
  SetCrossTeamSupportDto,
  UpdateWorkspaceMemberRoleDto,
  UpdateWorkspaceTimezoneDto,
  WorkspaceActivityQueryDto,
} from './dto/workspace-team.dto'
import { RequirePermission } from './require-permission.decorator'
import { WorkspaceActivityService } from './workspace-activity.service'
import { WorkspaceContextService, type WorkspaceMemberView } from './workspace-context.service'
import { WorkspaceLauraModeService } from './workspace-laura-mode.service'
import { WorkspaceMarketService } from './workspace-market.service'
import { WorkspacePermissionGuard } from './workspace-permission.guard'
import { WorkspacePortfolioHandoverService } from './workspace-portfolio-handover.service'
import { WorkspaceTeamService } from './workspace-team.service'
import { WorkspaceTimezoneService } from './workspace-timezone.service'
import { WorkspaceHiddenSectionsService } from './workspace-hidden-sections.service'

/**
 * Team management for the caller's active workspace (multi-user Phase 3/4).
 * Every route is JWT-guarded; the mutating routes additionally assert the
 * caller's workspace role in {@link WorkspaceTeamService} (owner/admin, or
 * owner-only for role changes). RLS is the second line of defence.
 */
@Controller('workspaces')
@UseGuards(JwtGuard)
export class WorkspaceController {
  constructor(
    private readonly team: WorkspaceTeamService,
    private readonly market: WorkspaceMarketService,
    private readonly timezone: WorkspaceTimezoneService,
    private readonly hiddenSections: WorkspaceHiddenSectionsService,
    private readonly lauraMode: WorkspaceLauraModeService,
    private readonly activity: WorkspaceActivityService,
    private readonly workspaceContext: WorkspaceContextService,
    // La reprise d'un portefeuille (tome 8 §33, angle mort n°2) — un service à
    // part : le retirer retire la reprise et rien d'autre (règle #7).
    private readonly handover: WorkspacePortfolioHandoverService,
  ) {}

  @Get('me')
  getTeam(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceTeam> {
    return this.team.getTeam(user.userId)
  }

  /**
   * Every workspace the caller belongs to — what the switcher renders, with the
   * active one flagged. A user who never joined a team sees exactly one entry
   * (their own), so the switcher can hide itself rather than show a pointless
   * list of one.
   */
  @Get()
  listWorkspaces(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceSummary[]> {
    return this.workspaceContext.listWorkspaces(user.userId)
  }

  /**
   * Switch the caller's active workspace. Membership of the target is proven
   * server-side ({@link WorkspaceContextService.switchWorkspace}) before
   * anything is written — passing an id you were not invited to is a 403, not a
   * new view. Nothing is moved, merged or deleted: the caller's other
   * workspaces and their dossiers are untouched.
   */
  @Post('active')
  switchWorkspace(@CurrentUser() user: CurrentUserPayload, @Body() dto: SwitchWorkspaceDto): Promise<ActiveWorkspace> {
    return this.workspaceContext.switchWorkspace(user.userId, dto.workspaceId)
  }

  /**
   * Members of the caller's active workspace — the lightweight list every
   * "assign to…" picker needs (action-plan delegation, account portfolio, the
   * copilot Membres panel).
   *
   * Readable by ANY member on purpose: knowing who is on your team is not a
   * privileged fact, and gating it behind `team:manage` would leave the rep-side
   * pickers empty — which is exactly the bug this route fixes. The web client
   * called `GET /workspace/members` (singular), a route that never existed; the
   * 404 was swallowed by a `?? []`, so the assignment dropdowns had silently
   * been empty since they shipped.
   */
  @Get('members')
  listMembers(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceMemberView[]> {
    return this.workspaceContext.listMembers(user.userId)
  }

  /**
   * « Journal d'activité » (Théo p.21 P2) — who launched an analysis, enriched
   * a contact, exported, sent a message, invited/removed a member, connected an
   * integration. STRICTLY scoped to the caller's active workspace and gated by
   * the `team:manage` RBAC permission (owner | admin | sales_ops → 200, every
   * other role → 403). Class-level JwtGuard runs first, then the permission
   * guard reads the `@RequirePermission` metadata.
   */
  @Get('activity')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  getActivity(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: WorkspaceActivityQueryDto,
  ): Promise<WorkspaceActivityPage> {
    return this.activity.list(user.userId, query)
  }

  /** The active workspace's resolved target market (any member may read). */
  @Get('market')
  getMarket(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceMarketResolution> {
    return this.market.getMarket(user.userId)
  }

  /** Set the active workspace's target market (owner/admin only). */
  @Patch('market')
  setMarket(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateWorkspaceMarketDto,
  ): Promise<WorkspaceMarketResolution> {
    return this.market.setMarket(user.userId, dto.market)
  }

  /** #1958.2 — le fuseau RÉSOLU de l'espace actif (n'importe quel membre peut le lire). */
  @Get('timezone')
  @WorkspaceRead()
  getTimezone(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceTimezoneResolution> {
    return this.timezone.getTimezone(user.userId)
  }

  /** #1958.2 — régler le fuseau de l'espace actif (owner/admin uniquement, même
   *  porte que le marché). `timezone: null` retire le réglage. */
  @Patch('timezone')
  setTimezone(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateWorkspaceTimezoneDto,
  ): Promise<WorkspaceTimezoneResolution> {
    return this.timezone.setTimezone(user.userId, dto.timezone)
  }

  /** #2957 (#2179.2/.35) — les sections masquées de l'espace actif (n'importe
   *  quel membre peut les lire : la navigation les masque pour TOUS). */
  @Get('hidden-sections')
  @WorkspaceRead()
  getHiddenSections(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceHiddenSectionsResolution> {
    return this.hiddenSections.getHiddenSections(user.userId)
  }

  /** #2957 (#2179.35) — masquer/réafficher une section (owner/admin uniquement). */
  // GA-05 — la porte déclarée au niveau de la route ; le service garde en plus
  // son contrôle propriétaire/administrateur.
  @Patch('hidden-sections')
  @RequirePermission('team:manage')
  setHiddenSections(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateWorkspaceHiddenSectionsDto,
  ): Promise<WorkspaceHiddenSectionsResolution> {
    return this.hiddenSections.setHiddenSections(user.userId, dto.hiddenSections)
  }

  /**
   * #2451.9 — le mode de contexte PAR DÉFAUT de l'espace (n'importe quel membre
   * peut le lire). ⚠️ Ce n'est PAS une règle d'espace (#2081.14) : un réglage
   * qui pose une valeur de repli, jamais un droit retiré.
   */
  @Get('laura-mode')
  @WorkspaceRead()
  getDefaultContextMode(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceDefaultContextModeResolution> {
    return this.lauraMode.getDefaultContextMode(user.userId)
  }

  /** #2451.9 — régler le mode par défaut de l'espace actif (owner/admin uniquement, même porte que le marché et le fuseau). */
  // GA-05 — la porte déclarée au niveau de la route ; le service garde en plus
  // son contrôle propriétaire/administrateur.
  @Patch('laura-mode')
  @RequirePermission('team:manage')
  setDefaultContextMode(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateWorkspaceDefaultContextModeDto,
  ): Promise<WorkspaceDefaultContextModeResolution> {
    return this.lauraMode.setDefaultContextMode(user.userId, dto.defaultContextMode)
  }

  /**
   * Qui voit quels comptes (décision D5). Propriétaire uniquement : c'est le
   * seul réglage qui change ce que TOUTE l'équipe voit d'un coup.
   */
  @Patch('portfolio-visibility')
  setPortfolioVisibility(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SetPortfolioVisibilityDto,
  ): Promise<{ visibility: PortfolioVisibility }> {
    return this.team.setPortfolioVisibility(user.userId, dto.visibility)
  }

  /**
   * Le partage communautaire (tome 2 §5.3). Propriétaire uniquement : c'est le
   * réglage qui décide de ce que cet espace donne à voir aux autres.
   */
  @Patch('community-sharing')
  setCommunitySharing(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SetCommunitySharingDto,
  ): Promise<{ sharing: boolean }> {
    return this.team.setCommunitySharing(user.userId, dto.sharing)
  }

  @Post('invitations')
  createInvitation(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateWorkspaceInvitationDto,
  ): Promise<WorkspaceTeamInvitation> {
    return this.team.createInvitation(user.userId, dto)
  }

  // `:token` is an opaque base64url string (not a UUID) — no ParseUUIDPipe.
  @Post('invitations/:token/accept')
  acceptInvitation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('token') token: string,
  ): Promise<AcceptWorkspaceInvitationResult> {
    return this.team.acceptInvitation(user.userId, user.email, token)
  }

  @Get('invitations')
  listInvitations(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceTeamInvitation[]> {
    return this.team.listInvitations(user.userId)
  }

  /** #4158.2 — renvoie l'invitation (nouveau jeton, +7 j) et dit si l'e-mail est parti. */
  @Post('invitations/:id/resend')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  resendInvitation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ResendWorkspaceInvitationResult> {
    return this.team.resendInvitation(user.userId, id)
  }

  @Delete('invitations/:id')
  revokeInvitation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ revoked: true }> {
    return this.team.revokeInvitation(user.userId, id)
  }

  @Delete('members/:userId')
  removeMember(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
  ): Promise<{ removed: true }> {
    return this.team.removeMember(user.userId, targetUserId)
  }

  /**
   * Ce qu'un membre PORTE — la prévisualisation d'une reprise de portefeuille
   * (tome 8 §33, angle mort n°2 : « la sortie d'un utilisateur »).
   *
   * Elle précède toujours le transfert à l'écran : un geste irréversible sans
   * prévisualisation de ce qu'il déplace est un piège. Elle nomme AUSSI ce qui
   * ne se transmet pas — la messagerie, l'agenda, les conversations — pour
   * qu'un administrateur ne croie pas avoir tout repris.
   */
  @Get('members/:userId/portfolio')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  getMemberPortfolio(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
  ): Promise<MemberPortfolio> {
    return this.handover.preview(user.userId, targetUserId)
  }

  /**
   * Transférer le portefeuille d'un membre à un autre — le geste explicite d'un
   * administrateur, jamais un effet de bord d'un retrait.
   *
   * Le sortant n'est PAS retiré ici : on reprend souvent AVANT le départ
   * (préavis), et on retire parfois sans reprendre — auquel cas
   * {@link removeMember} remet le portefeuille dans la file des non-attribués,
   * ce qu'il fait déjà.
   */
  @Post('members/:userId/handover')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  handOverPortfolio(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId', new ParseUUIDPipe()) fromUserId: string,
    @Body() dto: HandOverPortfolioDto,
  ): Promise<PortfolioHandoverResult> {
    return this.handover.handOver(user.userId, fromUserId, dto.toUserId)
  }

  /**
   * #4158.29 — répartir le portefeuille d'un partant entre plusieurs collègues,
   * par lots. `confirm: false` (défaut) rend le récapitulatif sans rien écrire ;
   * `confirm: true` valide. Même droit que le transfert simple : `team:manage`.
   */
  @Post('members/:userId/handover-plan')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  planHandover(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId', new ParseUUIDPipe()) fromUserId: string,
    @Body() dto: HandoverPlanDto,
  ): Promise<HandoverPlanResult> {
    return this.handover.plan(user.userId, fromUserId, dto)
  }

  /**
   * Les permissions accordées EN PROPRE à un membre, en plus de son rôle.
   *
   * La liste COMPLÈTE, pas un delta : un tableau vide retire toutes les
   * exceptions, et c'est le geste qu'on veut pouvoir faire d'un clic. Réservé
   * au propriétaire, comme le changement de rôle — accorder une exception
   * nominative déplace ce que quelqu'un peut faire sans que son rôle affiché
   * ne change.
   */
  @Put('members/:userId/permissions')
  setMemberPermissions(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
    @Body() dto: SetMemberPermissionsDto,
  ): Promise<{ permissions: WorkspacePermission[] }> {
    return this.team.setMemberPermissions(user.userId, targetUserId, dto.permissions)
  }

  /** Désigne le « renfort transversal » (#3387.10) — `team:manage`, vérifié par le service. */
  @Patch('members/:userId/cross-team-support')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  setCrossTeamSupport(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
    @Body() dto: SetCrossTeamSupportDto,
  ): Promise<WorkspaceTeamMember> {
    return this.team.setCrossTeamSupport(user.userId, targetUserId, dto.enabled)
  }

  @Patch('members/:userId/role')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  updateMemberRole(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
    @Body() dto: UpdateWorkspaceMemberRoleDto,
  ): Promise<WorkspaceTeamMember> {
    return this.team.updateMemberRole(user.userId, targetUserId, dto.role)
  }
}
