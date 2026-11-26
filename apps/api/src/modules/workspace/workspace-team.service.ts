import { randomBytes } from 'node:crypto'
import type { Brand } from '@bellum/contracts'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { In, LessThanOrEqual, MoreThan, Repository } from 'typeorm'
import type {
  AcceptWorkspaceInvitationResult,
  CreateWorkspaceInvitation,
  PortfolioVisibility,
  WorkspacePermission,
  WorkspaceRole,
  WorkspaceTeam,
  WorkspaceTeamInvitation,
  WorkspaceTeamMember,
  StructuredLexicon,
} from '@bellum/contracts'
import { EMPTY_STRUCTURED_LEXICON, hasPermission, structuredLexiconSchema } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { releaseMemberWork } from './release-member-work'
import { WorkspaceMemberPermissionEntity } from '../../database/entities/workspace-member-permission.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import { MailerService } from '../mailer/mailer.service'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspaceBrandService } from './workspace-brand.service'

/** How long a fresh invitation stays acceptable. */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * #4158.1 — les rôles qui portent l'administration de l'espace. Attribués,
 * retirés ou modifiés SEULEMENT par l'un d'eux : `sales_ops` porte
 * `team:manage` mais ne se fabrique pas un administrateur.
 */
const ADMIN_TIER: readonly WorkspaceRole[] = ['owner', 'admin']

/** #4158.1 — 403 quand `callerRole` touche un rôle du palier admin sans en être. */
function assertMayTouchRoles(callerRole: WorkspaceRole, ...touched: readonly WorkspaceRole[]): void {
  if (touched.some(role => ADMIN_TIER.includes(role)) && !ADMIN_TIER.includes(callerRole)) {
    throw new ForbiddenException('Seul un propriétaire ou un administrateur gère les rôles administrateur')
  }
}

// Seat allowance is a class method now ({@link WorkspaceTeamService.seatAllowance})
// so it reads per-plan seats from the DB-backed PlanCatalogService.

/** `first last`, trimmed, or `null` when neither is set. */
function buildFullName(first: string | null | undefined, last: string | null | undefined): string | null {
  const full = [first, last]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .trim()
  return full.length > 0 ? full : null
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString()
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

/**
 * Team management for the caller's *active* workspace — the API behind the
 * "Équipe" settings screen (multi-user Phase 3/4). Every mutation is gated by
 * {@link WorkspaceContextService.assertRole}, so membership + role are proven
 * server-side rather than trusted from the client.
 *
 * Role matrix (RBAC — see `hasPermission`/`ROLE_PERMISSIONS` in `@bellum/contracts`):
 *  - invite / list-invitations / revoke / remove-member → anyone with the
 *    `team:manage` permission (`owner` | `admin` | `sales_ops`)
 *  - change-member-role → `owner` only (kept the tightest — minting/altering
 *    roles is privilege-sensitive, so it is never widened to `team:manage`)
 */
@Injectable()
export class WorkspaceTeamService {
  private readonly logger = new Logger(WorkspaceTeamService.name)

  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(WorkspaceInvitationEntity)
    private readonly invitations: Repository<WorkspaceInvitationEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    // DB-backed plan catalog — the single source of truth for per-plan seats.
    private readonly planCatalog: PlanCatalogService,
    private readonly brands: WorkspaceBrandService,
    // Journal d'activité (audit) — best-effort, `@Optional()` so the direct-`new`
    // specs need no change. Properties carry type/target/date/actor ONLY.
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // Portefeuille du membre retiré — `@Optional()` pour la même raison. Ce sont
    // des ENTITÉS partagées, pas des services d'un autre module : la frontière
    // tient, et sans elles `removeMember` se comporte exactement comme avant.
    @Optional()
    @InjectRepository(AccountEntity)
    private readonly accounts?: Repository<AccountEntity>,
    @Optional()
    @InjectRepository(ContactEntity)
    private readonly contacts?: Repository<ContactEntity>,
    @Optional()
    @InjectRepository(WorkspaceMemberPermissionEntity)
    private readonly memberPermissions?: Repository<WorkspaceMemberPermissionEntity>,
    // #4158.4 — les actions déléguées du partant. Entité partagée, `@Optional()`
    // comme les autres : sans elle, `removeMember` se comporte comme avant.
    @Optional()
    @InjectRepository(ActionPlanItemEntity)
    private readonly planItems?: Repository<ActionPlanItemEntity>,
  ) {}

  /**
   * Seat allowance for a subscription — included plan seats + purchased extra
   * seats. Per-plan seats come from the DB-backed catalog (single source of
   * truth); an unknown/absent plan falls back to `trial`. Byte-identical to the
   * former const-based helper (strict key membership, no alias normalisation).
   */
  private async seatAllowance(sub: { plan?: string | null; extra_seats?: number | null } | null): Promise<number> {
    const def = (sub?.plan && (await this.planCatalog.get(sub.plan))) || (await this.planCatalog.getOrDefault('trial'))
    return def.seats + (sub?.extra_seats ?? 0)
  }

  /** `GET /workspaces/me` — the active workspace, its members, pending invites
   *  and seat usage. Any member may read it. */
  async getTeam(userId: string): Promise<WorkspaceTeam> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    if (!workspace) throw new NotFoundException('Espace de travail introuvable')

    const members = await this.loadMembers(workspaceId)
    const invitations = (await this.loadPendingInvitations(workspaceId)).map(toTeamInvitation)
    const total = await this.seatAllowance(await this.ownerSub(workspace.owner_user_id))

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        role,
        memberCount: members.length,
        communityDataSharing: workspace.community_data_sharing === true,
        portfolioVisibility: workspace.portfolio_visibility === 'restricted' ? 'restricted' : 'open',
        // Le lexique (D17) descend avec l'espace pour que la navigation de
        // CHACUN porte les mots de l'équipe — y compris sans `team:manage`,
        // qui garde son domicile (`GET /esn-profile/offer-portfolio`).
        // Best-effort : un lexique illisible rend les libellés du produit, ce
        // qui est un repli JUSTE, jamais une donnée inventée.
        lexicon: await this.readLexicon(workspaceId),
      },
      members,
      invitations,
      seats: { used: members.length + invitations.length, total },
    }
  }

  /**
   * #2077.9 — whether the caller could invite a colleague RIGHT NOW: has
   * `team:manage` on the active workspace AND the workspace still has a free
   * seat. Read-only and best-effort — any failure degrades to `false` (the
   * activation checklist that calls this must never crash on a read that
   * isn't its own domain; a milestone this call can't resolve is safer read
   * as "not applicable" than as a false promise of "pending").
   */
  async canInviteColleague(userId: string): Promise<boolean> {
    try {
      const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
      if (!hasPermission(role, 'team:manage')) return false
      const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
      const memberCount = await this.members.count({ where: { workspace_id: workspaceId } })
      const pendingCount = (await this.loadPendingInvitations(workspaceId)).length
      const total = await this.seatAllowance(await this.ownerSub(workspace?.owner_user_id))
      return memberCount + pendingCount < total
    } catch {
      return false
    }
  }

  /**
   * Le lexique de l'espace (D17), lu sur la ligne CANONIQUE de l'espace.
   *
   * Lecture par le manager de la connexion déjà injectée, et non par le service
   * du portefeuille : `EsnProfileModule` dépend déjà de la résolution d'espace,
   * et l'injecter ici fermerait le cercle entre les deux modules — chaque
   * module reste retirable (règle #7).
   *
   * Best-effort et SILENCIEUX : un lexique illisible, une ligne absente ou une
   * requête en échec rendent « aucune surcharge ». Les libellés du produit sont
   * alors ceux d'aujourd'hui — un repli JUSTE, jamais une donnée inventée — et
   * l'écran Équipe ne tombe pas parce qu'un réglage de vocabulaire est abîmé.
   */
  private async readLexicon(workspaceId: string): Promise<StructuredLexicon> {
    try {
      const rows = (await this.workspaces.manager.query(
        `SELECT offer_portfolio FROM esn_profiles WHERE workspace_id = $1 AND is_workspace_canonical = true LIMIT 1`,
        [workspaceId],
      )) as { offer_portfolio: unknown }[]
      const stored = rows[0]?.offer_portfolio
      if (!stored || typeof stored !== 'object') return EMPTY_STRUCTURED_LEXICON
      const parsed = structuredLexiconSchema.safeParse((stored as { lexicon?: unknown }).lexicon ?? {})
      return parsed.success ? parsed.data : EMPTY_STRUCTURED_LEXICON
    } catch {
      return EMPTY_STRUCTURED_LEXICON
    }
  }

  /** `POST /workspaces/invitations` — owner/admin only. Enforces the plan seat
   *  limit, dedupes pending invites, creates the row and emails the link
   *  (best-effort). */
  async createInvitation(userId: string, dto: CreateWorkspaceInvitation): Promise<WorkspaceTeamInvitation> {
    const { invitation } = await this.createInvitationWithDelivery(userId, dto)
    return invitation
  }

  /**
   * {@link createInvitation}, plus whether the notification email actually left.
   *
   * The self-serve "Équipe" screen doesn't need this — the invite row is
   * persisted, visible and re-sendable, so a transport hiccup is recoverable in
   * one click. Operator provisioning does: a client set up in the backoffice and
   * never notified looks like a success on screen and surfaces as a phone call
   * days later. The delivery outcome is reported, never swallowed.
   */
  async createInvitationWithDelivery(
    userId: string,
    dto: CreateWorkspaceInvitation,
  ): Promise<{ invitation: WorkspaceTeamInvitation; emailSent: boolean; emailError: string | null }> {
    const workspaceId = await this.activeWorkspaceId(userId)
    const caller = await this.workspaceContext.assertPermission(userId, workspaceId, 'team:manage')
    // #4158.1 — inviter un admin, c'est en créer un.
    assertMayTouchRoles(caller.role, dto.role)

    const email = dto.email.trim().toLowerCase()
    // #4158.3 — une ligne `pending` PÉRIMÉE bloquerait l'index unique (un seul
    // `pending` par adresse et par espace) : on la marque `expired` d'abord.
    await this.invitations.update(
      { workspace_id: workspaceId, email, status: 'pending', expires_at: LessThanOrEqual(new Date()) },
      { status: 'expired' },
    )

    // Already a member? (resolve email → profile → membership)
    const profile = await this.profiles.findOne({ where: { email } })
    if (profile) {
      const existingMember = await this.members.findOne({
        where: { workspace_id: workspaceId, user_id: profile.user_id },
      })
      if (existingMember) {
        throw new ConflictException('Cette personne est déjà membre de cet espace')
      }
    }

    // One live invite per (workspace, email).
    const pending = await this.loadPendingInvitations(workspaceId)
    if (pending.some(inv => inv.email.toLowerCase() === email)) {
      throw new ConflictException('Une invitation est déjà en attente pour cet email')
    }

    // Seat limit: current members + pending invites must stay under the plan cap.
    const memberRows = await this.members.find({ where: { workspace_id: workspaceId } })
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    const total = await this.seatAllowance(await this.ownerSub(workspace?.owner_user_id))
    if (memberRows.length + pending.length >= total) {
      throw new HttpException(
        `Sièges épuisés (${memberRows.length + pending.length}/${total}). Passez à un forfait supérieur pour inviter plus de collaborateurs.`,
        HttpStatus.PAYMENT_REQUIRED,
      )
    }

    const invitation = await this.invitations.save(
      this.invitations.create({
        workspace_id: workspaceId,
        email,
        role: dto.role,
        token: randomBytes(24).toString('base64url'),
        invited_by: userId,
        status: 'pending',
        expires_at: new Date(Date.now() + INVITATION_TTL_MS),
      }),
    )

    /*
     * ⚠️ La marque de l'ESPACE, pas la nôtre — marque blanche, 01/09/2026.
     *
     * C'est l'e-mail le plus exposé du produit : il part vers quelqu'un qui
     * n'a PAS encore de compte, souvent un partenaire ou un client de l'ESN.
     * Il portait notre nom deux fois (« sur BellumAI ») et partait de notre
     * adresse. Un client en marque blanche invitait donc ses propres clients
     * au nom de son fournisseur.
     */
    const brand = await this.brands.getForWorkspace(workspaceId)
    const delivery = await this.sendInvitationEmail(
      invitation.email,
      invitation.token,
      workspace?.name ?? 'un espace de travail',
      brand,
      workspace?.brand_email_from ?? null,
    )

    // Journal d'activité — who invited whom (type/target/date/actor only).
    void this.analytics?.track('member_invited', {
      userId,
      workspaceId,
      properties: { target: invitation.email, role: invitation.role, invitationId: invitation.id },
    })

    return { invitation: toTeamInvitation(invitation), emailSent: delivery.sent, emailError: delivery.error }
  }

  /** `POST /workspaces/invitations/:token/accept` — the logged-in user's email
   *  must match the invited address. Creates the membership, marks the invite
   *  accepted. */
  async acceptInvitation(userId: string, userEmail: string, token: string): Promise<AcceptWorkspaceInvitationResult> {
    const invitation = await this.invitations.findOne({ where: { token } })
    if (!invitation) throw new NotFoundException('Invitation introuvable')

    if (invitation.status === 'revoked') throw new HttpException('Cette invitation a été révoquée', HttpStatus.GONE)
    if (invitation.status === 'accepted')
      throw new HttpException('Cette invitation a déjà été utilisée', HttpStatus.GONE)
    if (invitation.status === 'expired' || invitation.expires_at.getTime() < Date.now()) {
      if (invitation.status !== 'expired') {
        invitation.status = 'expired'
        await this.invitations.save(invitation)
      }
      throw new HttpException('Cette invitation a expiré', HttpStatus.GONE)
    }

    if (invitation.email.toLowerCase() !== userEmail.trim().toLowerCase()) {
      throw new ForbiddenException('Cette invitation ne correspond pas à votre adresse email')
    }

    const workspace = await this.workspaces.findOne({ where: { id: invitation.workspace_id } })
    if (!workspace) throw new NotFoundException('Espace de travail introuvable')

    const existing = await this.members.findOne({ where: { workspace_id: workspace.id, user_id: userId } })
    const role: WorkspaceRole = existing?.role ?? invitation.role
    if (!existing) {
      await this.members.save(
        this.members.create({ workspace_id: workspace.id, user_id: userId, role: invitation.role }),
      )
    }

    invitation.status = 'accepted'
    invitation.accepted_at = new Date()
    await this.invitations.save(invitation)

    // Land the joiner IN the workspace they just joined.
    //
    // Without this, accepting is a silent no-op for anyone who already had an
    // account: signup gives every user a personal workspace, and the resolver
    // preferred it, so the new member kept seeing their own empty space. Their
    // personal workspace is NOT touched — it stays in the switcher next to this
    // one, with all the dossiers they built before being invited.
    //
    // Best-effort: the membership is already committed, so a failure to record
    // the preference must not turn a successful join into an error. The user is
    // a member either way and can select the workspace from the switcher.
    try {
      await this.workspaceContext.switchWorkspace(userId, workspace.id)
    } catch (error) {
      this.logger.warn(
        `Invitation accepted for ${userId} but active workspace not switched (${(error as Error).message})`,
      )
    }

    return { workspaceId: workspace.id, workspaceName: workspace.name, role }
  }

  /**
   * #2016 — une demande d'accès ACCEPTÉE par un administrateur (geste
   * d'utilisateur, `WorkspaceJoinService.decide`). Même porte que
   * l'invitation : `team:manage`, puis la limite de sièges, puis l'entrée en
   * simple membre et la bascule de l'espace actif du NOUVEAU membre — sans
   * elle, il resterait dans son espace personnel et n'hériterait pas du
   * profil de l'entreprise (#2016.7, `inherited_answer_keys`).
   */
  async admitJoinRequester(
    adminUserId: string,
    workspaceId: string,
    targetUserId: string,
  ): Promise<AcceptWorkspaceInvitationResult> {
    await this.workspaceContext.assertPermission(adminUserId, workspaceId, 'team:manage')
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    if (!workspace) throw new NotFoundException('Espace de travail introuvable')

    const existing = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: targetUserId } })
    if (!existing) {
      const memberRows = await this.members.find({ where: { workspace_id: workspaceId } })
      const pending = await this.loadPendingInvitations(workspaceId)
      const total = await this.seatAllowance(await this.ownerSub(workspace.owner_user_id))
      if (memberRows.length + pending.length >= total) {
        throw new HttpException(
          `Sièges épuisés (${memberRows.length + pending.length}/${total}). Passez à un forfait supérieur pour accueillir plus de collaborateurs.`,
          HttpStatus.PAYMENT_REQUIRED,
        )
      }
      await this.members.save(this.members.create({ workspace_id: workspaceId, user_id: targetUserId, role: 'member' }))
    }

    // Best-effort, comme `acceptInvitation` : l'appartenance est déjà écrite.
    try {
      await this.workspaceContext.switchWorkspace(targetUserId, workspaceId)
    } catch (error) {
      this.logger.warn(
        `Join request accepted for ${targetUserId} but active workspace not switched (${(error as Error).message})`,
      )
    }

    return { workspaceId, workspaceName: workspace.name, role: existing?.role ?? 'member' }
  }

  /** `GET /workspaces/invitations` — owner/admin only. */
  async listInvitations(userId: string): Promise<WorkspaceTeamInvitation[]> {
    const workspaceId = await this.activeWorkspaceId(userId)
    await this.workspaceContext.assertPermission(userId, workspaceId, 'team:manage')
    return (await this.loadPendingInvitations(workspaceId)).map(toTeamInvitation)
  }

  /**
   * #4158.2 — `POST /workspaces/invitations/:id/resend`. Régénère le jeton
   * (l'ancien lien meurt), repousse l'expiration de 7 jours et renvoie l'e-mail
   * par le chemin existant ; l'issue de l'envoi est RENDUE, jamais avalée.
   * Mêmes règles de rôle que l'invitation (#4158.1). Une invitation déjà
   * périmée se réveille (nouveau siège vérifié) ; acceptée ou révoquée : 409.
   */
  async resendInvitation(
    userId: string,
    invitationId: string,
  ): Promise<{ invitation: WorkspaceTeamInvitation; emailSent: boolean; emailError: string | null }> {
    const workspaceId = await this.activeWorkspaceId(userId)
    const caller = await this.workspaceContext.assertPermission(userId, workspaceId, 'team:manage')

    const invitation = await this.invitations.findOne({ where: { id: invitationId, workspace_id: workspaceId } })
    if (!invitation) throw new NotFoundException('Invitation introuvable')
    assertMayTouchRoles(caller.role, invitation.role)
    if (invitation.status !== 'pending' && invitation.status !== 'expired') {
      throw new ConflictException("Cette invitation n'est plus en attente")
    }

    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    if (invitation.status === 'expired') {
      const pending = await this.loadPendingInvitations(workspaceId)
      if (pending.some(inv => inv.email.toLowerCase() === invitation.email.toLowerCase())) {
        throw new ConflictException('Une invitation est déjà en attente pour cet email')
      }
      const memberRows = await this.members.find({ where: { workspace_id: workspaceId } })
      const total = await this.seatAllowance(await this.ownerSub(workspace?.owner_user_id))
      if (memberRows.length + pending.length >= total) {
        throw new HttpException(
          `Sièges épuisés (${memberRows.length + pending.length}/${total}). Passez à un forfait supérieur pour inviter plus de collaborateurs.`,
          HttpStatus.PAYMENT_REQUIRED,
        )
      }
    }

    invitation.token = randomBytes(24).toString('base64url')
    invitation.status = 'pending'
    invitation.expires_at = new Date(Date.now() + INVITATION_TTL_MS)
    const saved = await this.invitations.save(invitation)

    const brand = await this.brands.getForWorkspace(workspaceId)
    const delivery = await this.sendInvitationEmail(
      saved.email,
      saved.token,
      workspace?.name ?? 'un espace de travail',
      brand,
      workspace?.brand_email_from ?? null,
    )
    return { invitation: toTeamInvitation(saved), emailSent: delivery.sent, emailError: delivery.error }
  }

  /**
   * #4158.3 — marque `expired` les invitations dont l'échéance est passée.
   * Idempotent ; les lectures ne s'y fient pas (elles filtrent sur `expires_at`),
   * c'est le rangement de la table. Appelé par le balayage planifié.
   */
  async markExpiredInvitations(): Promise<number> {
    const res = await this.invitations.update(
      { status: 'pending', expires_at: LessThanOrEqual(new Date()) },
      { status: 'expired' },
    )
    return res.affected ?? 0
  }

  /** `DELETE /workspaces/invitations/:id` — owner/admin only. */
  async revokeInvitation(userId: string, invitationId: string): Promise<{ revoked: true }> {
    const workspaceId = await this.activeWorkspaceId(userId)
    await this.workspaceContext.assertPermission(userId, workspaceId, 'team:manage')

    const invitation = await this.invitations.findOne({ where: { id: invitationId, workspace_id: workspaceId } })
    if (!invitation) throw new NotFoundException('Invitation introuvable')
    if (invitation.status === 'pending') {
      invitation.status = 'revoked'
      await this.invitations.save(invitation)
      // Journal d'activité — a pending invite was revoked.
      void this.analytics?.track('invitation_revoked', {
        userId,
        workspaceId,
        properties: { target: invitation.email, invitationId: invitation.id },
      })
    }
    return { revoked: true }
  }

  /** `DELETE /workspaces/members/:userId` — owner/admin only; the owner cannot
   *  be removed. */
  async removeMember(userId: string, targetUserId: string): Promise<{ removed: true }> {
    const workspaceId = await this.activeWorkspaceId(userId)
    const caller = await this.workspaceContext.assertPermission(userId, workspaceId, 'team:manage')

    const target = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: targetUserId } })
    if (!target) throw new NotFoundException('Membre introuvable')
    if (target.role === 'owner') throw new BadRequestException('Le propriétaire ne peut pas être retiré')
    // #4158.1 — retirer un admin est réservé à owner/admin.
    assertMayTouchRoles(caller.role, target.role)

    await this.members.delete({ workspace_id: workspaceId, user_id: targetUserId })
    // Le portefeuille du partant retourne dans la file des non-attribués. Sans
    // ça, ses comptes gardent l'identifiant d'un non-membre : ils disparaissent
    // de la file « non attribués » (qui filtre sur `assigned_to IS NULL`), sont
    // comptés comme attribués dans les indicateurs, et le libre-service refuse
    // de les reprendre — orphelins ET verrouillés. On ne désigne AUCUN
    // successeur : un compte chez la mauvaise personne est pire que sans porteur.
    await this.releasePortfolio(workspaceId, targetUserId, userId)
    // Journal d'activité — who removed whom. The label lookup + write are both
    // best-effort: a failure must never fail the (already committed) removal.
    if (this.analytics) void this.emitMemberRemoved(userId, workspaceId, targetUserId)
    return { removed: true }
  }

  /**
   * Régler le cloisonnement de portefeuille de l'espace (décision D5).
   *
   * Réservé au propriétaire : c'est le seul réglage du produit qui change ce
   * que TOUTE l'équipe voit d'un coup. Le confier à `team:manage` reviendrait à
   * laisser un responsable d'équipe rendre invisible le portefeuille d'une
   * autre.
   */
  async setPortfolioVisibility(
    userId: string,
    visibility: PortfolioVisibility,
  ): Promise<{ visibility: PortfolioVisibility }> {
    const workspaceId = await this.activeWorkspaceId(userId)
    await this.workspaceContext.assertRole(userId, workspaceId, ['owner'])
    await this.workspaces.update({ id: workspaceId }, { portfolio_visibility: visibility })
    return { visibility }
  }

  /**
   * Activer ou couper le partage communautaire (tome 2 §5.3, décision D51).
   *
   * Propriétaire uniquement, pour la même raison que le cloisonnement : c'est
   * le seul autre réglage qui décide de ce qui SORT de l'espace. Décoché par
   * défaut — un opt-in coché d'avance n'est pas un opt-in.
   */
  async setCommunitySharing(userId: string, sharing: boolean): Promise<{ sharing: boolean }> {
    const workspaceId = await this.activeWorkspaceId(userId)
    await this.workspaceContext.assertRole(userId, workspaceId, ['owner'])
    await this.workspaces.update({ id: workspaceId }, { community_data_sharing: sharing })
    return { sharing }
  }

  /**
   * Les permissions accordées EN PROPRE à un membre — la liste complète, pas un
   * delta : envoyer un tableau vide les retire toutes, et c'est le geste qu'on
   * veut pouvoir faire d'un clic.
   *
   * Réservé au propriétaire, comme le changement de rôle. Accorder une
   * exception nominative est du même ordre : ça déplace ce que quelqu'un peut
   * faire, sans que son rôle affiché ne change — c'est précisément pour ça que
   * la trace de QUI a accordé est enregistrée.
   */
  async setMemberPermissions(
    userId: string,
    targetUserId: string,
    permissions: readonly WorkspacePermission[],
  ): Promise<{ permissions: WorkspacePermission[] }> {
    const workspaceId = await this.activeWorkspaceId(userId)
    await this.workspaceContext.assertRole(userId, workspaceId, ['owner'])

    const target = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: targetUserId } })
    if (!target) throw new NotFoundException('Membre introuvable')
    if (!this.memberPermissions) throw new NotFoundException('Permissions non disponibles')

    // Remplacement complet : on efface puis on réécrit. Un delta laisserait la
    // question « la liste envoyée était-elle exhaustive ? » sans réponse, et
    // c'est exactement le genre de doute qu'un écran de droits ne doit pas créer.
    await this.memberPermissions.delete({ workspace_id: workspaceId, user_id: targetUserId })
    const unique = [...new Set(permissions)]
    if (unique.length > 0) {
      await this.memberPermissions.insert(
        unique.map(permission => ({
          workspace_id: workspaceId,
          user_id: targetUserId,
          permission,
          granted_by: userId,
        })),
      )
    }

    // Journal d'activité — une exception nominative déplace un privilège SANS
    // changer le rôle affiché, et ses effets ne se défont pas : ce qui a été lu
    // l'a été. La liste part avec la ligne, parce que « on a changé ses droits »
    // sans dire lesquels n'est pas une trace.
    const profile = await this.profiles.findOne({ where: { user_id: targetUserId } })
    void this.analytics?.track('member_permissions_changed', {
      userId,
      workspaceId,
      properties: { target: profile?.email ?? null, targetUserId, permissions: unique },
    })
    return { permissions: unique }
  }

  /** Libère comptes, contacts et actions déléguées portés par un membre qui quitte l'espace.
   *  #4158.54 — passe par le helper PARTAGÉ avec le retrait back-office
   *  (`releaseMemberWork`) : un jumeau qui n'en libérerait qu'une moitié laisserait
   *  des comptes chez un non-membre. Best-effort et APRÈS la suppression : un membre
   *  déjà retiré ne doit pas se retrouver ré-inscrit parce qu'un UPDATE a échoué. */
  private async releasePortfolio(workspaceId: string, userId: string, removedBy?: string): Promise<void> {
    // Dépôts non câblés (tests, module retiré) : comportement d'avant, rien à libérer.
    const manager = this.accounts?.manager ?? this.contacts?.manager ?? this.planItems?.manager
    if (!manager) return
    try {
      await releaseMemberWork(manager, workspaceId, userId, removedBy)
    } catch (error) {
      this.logger.warn(
        `Portefeuille de ${userId} non libéré (${(error as Error).message}). Le membre est retiré ; ses comptes restent à réattribuer à la main.`,
      )
    }
  }

  /** `PATCH /workspaces/members/:userId/role` — `team:manage`, with admin roles
   *  reserved to owner/admin (#4158.1); the owner cannot be
   *  demoted (nor a second owner minted — the body schema forbids `owner`). */
  async updateMemberRole(
    userId: string,
    targetUserId: string,
    role: Exclude<WorkspaceRole, 'owner'>,
  ): Promise<WorkspaceTeamMember> {
    const workspaceId = await this.activeWorkspaceId(userId)
    const caller = await this.workspaceContext.assertPermission(userId, workspaceId, 'team:manage')

    const target = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: targetUserId } })
    if (!target) throw new NotFoundException('Membre introuvable')
    if (target.role === 'owner') throw new BadRequestException('Le rôle du propriétaire ne peut pas être modifié')
    // #4158.1 — sales_ops gère les rôles non admin ; ni promotion ni rétrogradation d'un admin.
    assertMayTouchRoles(caller.role, target.role, role)

    target.role = role
    await this.members.save(target)

    const [member] = await this.hydrateMembers([target])
    // Journal d'activité — role changes are privilege-sensitive, always logged.
    void this.analytics?.track('member_role_changed', {
      userId,
      workspaceId,
      properties: { target: member?.email ?? null, targetUserId, role },
    })
    return member!
  }

  /**
   * `PATCH /workspaces/members/:userId/cross-team-support` — désigne (ou
   * retire) le « renfort transversal » (#3387.10). `team:manage`, comme
   * l'invitation et le retrait : c'est le geste de qui organise l'équipe.
   * Aucun droit n'est accordé ni retiré, aucun compte ne change de main.
   */
  async setCrossTeamSupport(userId: string, targetUserId: string, enabled: boolean): Promise<WorkspaceTeamMember> {
    const workspaceId = await this.activeWorkspaceId(userId)
    await this.workspaceContext.assertPermission(userId, workspaceId, 'team:manage')

    const target = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: targetUserId } })
    if (!target) throw new NotFoundException('Membre introuvable')

    target.cross_team_support = enabled
    await this.members.save(target)

    const [member] = await this.hydrateMembers([target])
    return member!
  }

  /* ------------------------------------------------------------------ */
  /*  Internals                                                          */
  /* ------------------------------------------------------------------ */

  /** Fire-and-forget `member_removed` journal line — resolves the removed
   *  member's email for the target label, then appends. Never throws. */
  private async emitMemberRemoved(userId: string, workspaceId: string, targetUserId: string): Promise<void> {
    try {
      const profile = await this.profiles.findOne({ where: { user_id: targetUserId } })
      await this.analytics?.track('member_removed', {
        userId,
        workspaceId,
        properties: { target: profile?.email ?? null, targetUserId },
      })
    } catch (error) {
      this.logger.warn(`member_removed journal write skipped (${(error as Error).message})`)
    }
  }

  private async activeWorkspaceId(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  private async ownerSub(
    ownerUserId: string | undefined,
  ): Promise<{ plan: string | null; extra_seats: number } | null> {
    if (!ownerUserId) return null
    const sub = await this.subscriptions.findOne({ where: { user_id: ownerUserId } })
    if (!sub) return null
    return { plan: sub.plan ?? null, extra_seats: sub.extra_seats ?? 0 }
  }

  private async loadPendingInvitations(workspaceId: string): Promise<WorkspaceInvitationEntity[]> {
    return this.invitations.find({
      // #4158.3 — `expires_at` passé = `expired`, qu'un balayage l'ait marquée ou non :
      // ni siège compté, ni e-mail bloqué, ni ligne dans la liste.
      where: { workspace_id: workspaceId, status: 'pending', expires_at: MoreThan(new Date()) },
      order: { created_at: 'DESC' },
    })
  }

  private async loadMembers(workspaceId: string): Promise<WorkspaceTeamMember[]> {
    const rows = await this.members.find({ where: { workspace_id: workspaceId }, order: { created_at: 'ASC' } })
    return this.hydrateMembers(rows)
  }

  /**
   * Attach email/full name from the profiles table (one batched lookup), plus
   * les permissions accordées en propre.
   *
   * ⚠️ Les permissions sont lues en UNE requête pour tout le lot, pas une par
   * membre : l'écran Équipe charge tout le monde d'un coup, et N lectures y
   * seraient N + 1 requêtes pour une information de deux lignes.
   *
   * Un espace sans la table (déploiement antérieur à la migration) rend un
   * tableau VIDE, jamais `undefined` : « aucune exception » est une réponse,
   * et laisser le champ absent ferait envoyer une liste complète à l'aveugle —
   * ce qui effacerait en silence des accords existants.
   */
  private async hydrateMembers(rows: WorkspaceMemberEntity[]): Promise<WorkspaceTeamMember[]> {
    if (rows.length === 0) return []
    const userIds = [...new Set(rows.map(r => r.user_id))]
    const profiles = await this.profiles.find({ where: { user_id: In(userIds) } })
    const byUser = new Map(profiles.map(p => [p.user_id, p]))

    const grants = new Map<string, WorkspacePermission[]>()
    if (this.memberPermissions) {
      const granted = await this.memberPermissions.find({
        where: { workspace_id: rows[0]!.workspace_id, user_id: In(userIds) },
      })
      for (const grant of granted) {
        const bucket = grants.get(grant.user_id) ?? []
        bucket.push(grant.permission as WorkspacePermission)
        grants.set(grant.user_id, bucket)
      }
    }

    return rows.map(row => {
      const profile = byUser.get(row.user_id)
      return {
        userId: row.user_id,
        email: profile?.email ?? null,
        fullName: buildFullName(profile?.first_name, profile?.last_name),
        role: row.role,
        joinedAt: toIso(row.created_at),
        extraPermissions: grants.get(row.user_id) ?? [],
        crossTeamSupport: row.cross_team_support === true,
      }
    })
  }

  /** Best-effort invitation email. A missing/unconfigured transport must not
   *  fail the invite — the row is already persisted and revocable. The outcome
   *  is RETURNED (not just logged) so operator provisioning can report a client
   *  that was created but never notified. */
  private async sendInvitationEmail(
    to: string,
    token: string,
    workspaceName: string,
    brand: Brand,
    from: string | null,
  ): Promise<{ sent: boolean; error: string | null }> {
    const base = this.config.get<string>('frontendUrl', 'http://localhost:5173').replace(/\/+$/, '')
    const acceptUrl = `${base}/invitation/${token}`
    try {
      await this.mailer.sendNotificationEmail({
        to,
        subject: `Invitation à rejoindre ${workspaceName} sur ${brand.name}`,
        heading: `Vous êtes invité·e à rejoindre ${workspaceName}`,
        bodyLines: [
          `Un membre de cet espace de travail vous invite à collaborer sur ${brand.name}.`,
          'Cliquez sur le bouton ci-dessous pour accepter (lien valable 7 jours).',
        ],
        ctaUrl: acceptUrl,
        ctaLabel: "Accepter l'invitation",
        from,
      })
      return { sent: true, error: null }
    } catch (error) {
      const message = (error as Error).message
      this.logger.warn(`Invitation email to ${to} not sent (${message}). Invite still created.`)
      return { sent: false, error: message }
    }
  }
}

function toTeamInvitation(inv: WorkspaceInvitationEntity): WorkspaceTeamInvitation {
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    expiresAt: toIso(inv.expires_at),
    createdAt: toIso(inv.created_at),
  }
}
