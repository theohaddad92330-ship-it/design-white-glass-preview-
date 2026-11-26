import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  TEMPS1_REQUIRED_KEYS,
  isAnswerFilled,
  isPersonalAnswerKey,
  type EsnAnswers,
  type PlanFeatureKey,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { releaseMemberWork } from '../workspace/release-member-work'
import { PlanCatalogService, type PlanCatalogPatch } from '../credits/plan-catalog.service'
import { PlanPriceSyncService } from '../credits/plan-price-sync.service'
import {
  OwnerActivationService,
  type OwnerActivationState,
  type SendOwnerInvitationResult,
  type SendOwnerInvitationRefusal,
} from './owner-activation.service'
import { PLAN_KEYS, type PlanDefinition, type PlanKey } from '../credits/plan-catalog.defaults'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

/**
 * Les douze questions que le questionnaire du premier temps POSE.
 *
 * Les dix de `TEMPS1_REQUIRED_KEYS` (la porte de complétion serveur), plus les
 * deux que le FLUX exige sans que la porte les réclame : le domaine d'offre et
 * le placement en CDI. Elles se lisent depuis les contrats et non d'une liste
 * recopiée — c'est ce qui empêche cet écran de mentir le jour où une question
 * s'ajoute.
 */
const ESN_PROFILE_CONSOLE_KEYS: readonly (keyof EsnAnswers)[] = [
  ...TEMPS1_REQUIRED_KEYS,
  'offer_domains',
  'recruits_for_clients',
]

interface AdminUserWorkspace {
  id: string
  name: string
  role: string
}

/**
 * PLAN-GATE #4381 — DE QUI VIENT le plan affiché.
 *
 * Le plan ne vit pas sur la personne : il vit sur l'abonnement du PROPRIÉTAIRE
 * de l'espace actif, et c'est lui que lisent le verrou de fonctionnalité et les
 * crédits. Le back-office disait « plan de Hamdi » en lisant la ligne de Hamdi ;
 * le verrou lisait celle d'un autre. Cette étiquette dit la vraie portée.
 */
interface AdminPlanScope {
  workspaceId: string
  workspaceName: string
  ownerUserId: string
  ownerEmail: string | null
  /** La personne affichée EST le propriétaire : son plan est le sien. */
  isOwner: boolean
}

export interface AdminUser {
  userId: string
  email: string | null
  fullName: string | null
  /** Le plan EFFECTIF — celui de `planScope`, pas la ligne de la personne. */
  plan: string
  /** `null` = compte solo sans espace : le plan est celui de la personne. */
  planScope: AdminPlanScope | null
  accountsUsed: number
  accountsLimit: number
  workspaces: AdminUserWorkspace[]
  createdAt: string
}

export interface AdminWorkspace {
  id: string
  name: string
  ownerUserId: string
  ownerEmail: string | null
  memberCount: number
  createdAt: string
}

/**
 * L'état de la fiche ESN PARTAGÉE d'un espace, vu de la console.
 *
 * ⚠️ POURQUOI CET ÉCRAN EXISTE (#1671-ter, demandé par Louis le 07/09/2026)
 * « bedros est bien dans la team abricotlabs mais l'onboarding est encore lancé
 * quand il se connecte ». Répondre a demandé de savoir si l'associé
 * PROPRIÉTAIRE avait réellement rempli la fiche de l'ESN — une question que la
 * console ne savait pas poser, et qui n'était lisible qu'en base de production.
 *
 * ⚠️ CE QU'ON N'EXPOSE PAS, ET C'EST DÉLIBÉRÉ : les VALEURS des réponses. Le
 * positionnement, les secteurs visés et les types de comptes ciblés sont la
 * stratégie commerciale d'un client. La question du support est « est-ce
 * rempli ? », jamais « avec quoi ? » — et une console d'opérateur n'a pas
 * besoin de la seconde pour répondre à la première.
 */
// Non exportée : elle n'est lue que par `AdminWorkspaceDetail`, juste en
// dessous. La console porte sa PROPRE déclaration (`dashboard-manager/src/lib/
// admin.ts`), parce qu'elle consomme l'API par HTTP et non par le type.
interface AdminWorkspaceEsnProfile {
  /** Une ligne canonique existe pour cet espace : sans elle, aucun membre
   *  n'hérite de rien et chacun repasse tout le questionnaire. */
  canonical: boolean
  /** Qui la porte. `null` quand il n'y a pas de ligne canonique. */
  heldByUserId: string | null
  heldByEmail: string | null
  version: number | null
  updatedAt: string | null
  /** Les douze questions du premier temps, chacune répondue ou non. */
  answers: { key: string; scope: 'company' | 'personal'; filled: boolean }[]
  /** Combien de faits sur l'ENTREPRISE sont renseignés — ce dont un associé
   *  qui rejoint l'espace hérite, et donc ce qu'on ne lui repose pas. */
  companyFilled: number
  companyTotal: number
}

export interface AdminWorkspaceMember {
  userId: string
  email: string | null
  fullName: string | null
  role: string
  joinedAt: string
}

interface AdminWorkspaceInvitation {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string
  createdAt: string
}

export interface AdminOverview {
  totalUsers: number
  totalWorkspaces: number
  totalAccounts: number
  plans: Record<PlanKey, number>
}

export interface AdminPlan {
  key: PlanKey
  label: string
  price: number
  accountsLimit: number
  enrichmentCredits: number
  seats: number
  /** Monthly price in cents of one seat beyond `seats`. */
  extraSeatPrice: number
  /** Whether a user can self-serve checkout this plan (trial/beta = operator-only). */
  selfServe: boolean
  /** Les features que le palier ouvre (gating par offre). */
  features: PlanFeatureKey[]
  sortOrder: number
}

export interface AdminWorkspaceDetail {
  workspace: AdminWorkspace
  members: AdminWorkspaceMember[]
  invitations: AdminWorkspaceInvitation[]
  esnProfile: AdminWorkspaceEsnProfile
  /** L'activation du propriétaire, persistée (#2643.2). `null` = aucune
   *  invitation n'a jamais été préparée pour cet espace (compte réutilisé). */
  ownerInvitation: OwnerActivationState | null
}

/** Serialize a DB timestamp (Date from the entity hydrator, or a string when it
 *  comes back off a raw query) to a stable ISO string. */
function toIso(value: Date | string | null | undefined): string {
  if (!value) return ''
  return value instanceof Date ? value.toISOString() : String(value)
}

/** `first last`, trimmed, or `null` when neither is set. */
function buildFullName(first: string | null | undefined, last: string | null | undefined): string | null {
  const full = [first, last]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .trim()
  return full.length > 0 ? full : null
}

function clampLimit(limit: number | undefined): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

/**
 * Super-admin backoffice queries. This service is intentionally CROSS-TENANT —
 * the platform operator (behind the internal secret) sees every user, workspace
 * and account, so none of these queries scope by `user_id`. It must never be
 * reachable without `InternalSecretGuard`.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(WorkspaceInvitationEntity)
    private readonly invitations: Repository<WorkspaceInvitationEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    // La fiche ESN partagée de l'espace (#1671-ter). Un DÉPÔT d'entité, pas le
    // service d'un voisin : GA-07 mesure les imports service → service et exclut
    // explicitement les entités, qui sont un schéma partagé.
    @InjectRepository(EsnProfileEntity)
    private readonly esnProfiles: Repository<EsnProfileEntity>,
    private readonly planCatalog: PlanCatalogService,
    private readonly planPriceSync: PlanPriceSyncService,
    // L'activation du propriétaire d'un siège provisionné à la main —
    // persistée (#2643.2), envoyée sur clic opérateur (#2643.1).
    private readonly ownerActivation: OwnerActivationService,
    // PLAN-GATE #4381 — la MÊME résolution d'espace actif que le verrou et les
    // crédits : une seule vérité sur « quel abonnement s'applique à cette personne ».
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  async getOverview(): Promise<AdminOverview> {
    const [totalUsers, totalWorkspaces, totalAccounts] = await Promise.all([
      this.profiles.createQueryBuilder('p').getCount(),
      this.workspaces.createQueryBuilder('w').getCount(),
      this.accounts.createQueryBuilder('a').getCount(),
    ])

    // Distribution over ALL users (profiles LEFT JOIN subscriptions): a user
    // with no subscription row counts as `trial`, matching the per-user default.
    const planRows = await this.profiles
      .createQueryBuilder('p')
      .leftJoin(SubscriptionEntity, 's', 's.user_id = p.user_id')
      .select("COALESCE(s.plan, 'trial')", 'plan')
      .addSelect('COUNT(*)', 'count')
      .groupBy("COALESCE(s.plan, 'trial')")
      .getRawMany<{ plan: string; count: string }>()

    // Un compteur par palier du catalogue — `PLAN_KEYS` est la source, sinon
    // ajouter un palier laisse silencieusement sa ligne à `undefined`.
    const plans = Object.fromEntries(PLAN_KEYS.map(key => [key, 0])) as Record<PlanKey, number>
    for (const row of planRows) {
      if (isPlanKey(row.plan)) {
        plans[row.plan] = Number(row.count ?? 0)
      }
    }

    return { totalUsers, totalWorkspaces, totalAccounts, plans }
  }

  async getPlans(): Promise<AdminPlan[]> {
    const plans = await this.planCatalog.all()
    return plans.map(toAdminPlan)
  }

  /**
   * Edit an EXISTING plan's template (name / price / caps / seats). Delegates to
   * {@link PlanCatalogService.update} (validates the key + non-negative ints,
   * upserts, refreshes the cache). AUDIT: the change is logged.
   *
   * DESIGN: CAPS are not retroactive — the edited template is used by the NEXT
   * checkout / assignPlan and never rewrites existing subscribers' stored caps
   * (those live on `subscriptions`), so a cap edit can't silently strip a
   * customer's topped-up credits.
   *
   * PRICES are the exception, by design: an edited plan price OR extra-seat
   * price propagates to the subscriptions already running on the plan, otherwise
   * they would bill the old amount forever. Nobody is charged early — the propagation uses
   * `proration_behavior: 'none'`, so each subscriber meets the new rate at their
   * next renewal (see {@link PlanPriceSyncService}).
   */
  async updatePlan(key: string, patch: PlanCatalogPatch): Promise<AdminPlan> {
    const before = await this.planCatalog.get(key)
    const def = await this.planCatalog.update(key, patch)
    this.logger.log(`Admin edited plan ${def.key}`, {
      tags: { 'admin.op': 'plan.update', 'plan.key': def.key },
    })

    // Fire-and-forget: re-pricing N live subscriptions is N Stripe round-trips,
    // which must not hold the operator's request open. The sync is idempotent and
    // holds a per-plan lock, so a second edit landing mid-run converges rather
    // than corrupting. Failures are logged per subscription, never thrown here —
    // the catalog edit itself already succeeded.
    const priceChanged = patch.price !== undefined && before && before.price !== def.price
    const seatPriceChanged =
      patch.extra_seat_price !== undefined && before && before.extra_seat_price !== def.extra_seat_price
    if (priceChanged || seatPriceChanged) {
      void this.planPriceSync.syncPlan(def.key).catch((error: unknown) => {
        this.logger.error(`Plan price propagation failed for ${def.key}`, {
          error,
          tags: { 'admin.op': 'plan.price_sync_failed', 'plan.key': def.key },
        })
      })
    }

    return toAdminPlan(def)
  }

  async listUsers(query: {
    search?: string
    limit?: number
    offset?: number
  }): Promise<{ users: AdminUser[]; total: number }> {
    const limit = clampLimit(query.limit)
    const offset = query.offset && query.offset > 0 ? query.offset : 0

    const qb = this.profiles.createQueryBuilder('p')
    if (query.search) {
      qb.where('(p.email ILIKE :s OR p.first_name ILIKE :s OR p.last_name ILIKE :s)', { s: `%${query.search}%` })
    }
    const total = await qb.clone().getCount()
    const rows = await qb.orderBy('p.created_at', 'DESC').offset(offset).limit(limit).getMany()
    const users = await this.buildAdminUsers(rows)
    return { users, total }
  }

  async listWorkspaces(query: {
    search?: string
    limit?: number
    offset?: number
  }): Promise<{ workspaces: AdminWorkspace[]; total: number }> {
    const limit = clampLimit(query.limit)
    const offset = query.offset && query.offset > 0 ? query.offset : 0

    const qb = this.workspaces.createQueryBuilder('w')
    if (query.search) {
      /**
       * #1673.4 — un espace n'a qu'UN nom AFFICHÉ (`w.name`, souvent laissé au
       * défaut « Mon espace »), mais une ESN a aussi une RAISON SOCIALE
       * (`legal_entities.name`, celle qui apparaît sur une facture) et un nom
       * DÉCLARÉ dans son questionnaire (`esn_profiles.esn_name`). Chercher
       * seulement `w.name` rendait ZÉRO résultat pour un espace bien réel,
       * cherché sous un de ces DEUX AUTRES noms — et un zéro se lit comme
       * « aucun espace », jamais comme « cherché sous le mauvais champ ».
       *
       * ⚠️ CE N'EST PAS une jointure par nom entre deux référentiels — la
       * famille de défaut que ce dépôt refuse ailleurs (`crm-routines.
       * service.ts:193` : `esn_directory` ne se joint à `accounts` QUE par
       * SIREN, jamais par libellé, parce qu'un mauvais rapprochement colle la
       * mémoire d'un compte sur un autre). Ici, l'identifiant qui relie ces
       * trois champs est `workspace_id` — une clé étrangère RÉELLE, pas une
       * comparaison de chaînes : les trois DÉCRIVENT par construction le même
       * `w.id`, la question n'est que « dans lequel de ses noms l'opérateur
       * a-t-il tapé ? ». Aucune entité n'est devinée ; l'espace qu'on cherche
       * EST celui dont `w.id` porte ce nom, quel que soit le champ qui le
       * porte.
       *
       * `esn_profiles.is_current` exclut les versions archivées du
       * questionnaire ; `legal_entities.archived` exclut une raison sociale
       * qui n'est plus celle de l'espace — chercher une entrée périmée
       * retrouverait un espace sous un nom qu'il ne porte plus.
       */
      qb.where(
        `(w.name ILIKE :s
          OR EXISTS (
            SELECT 1 FROM esn_profiles ep
            WHERE ep.workspace_id = w.id AND ep.is_current = true AND ep.esn_name ILIKE :s
          )
          OR EXISTS (
            SELECT 1 FROM legal_entities le
            WHERE le.workspace_id = w.id AND le.archived = false AND le.name ILIKE :s
          ))`,
        { s: `%${query.search}%` },
      )
    }
    const total = await qb.clone().getCount()
    const rows = await qb.orderBy('w.created_at', 'DESC').offset(offset).limit(limit).getMany()
    const workspaces = await this.buildAdminWorkspaces(rows)
    return { workspaces, total }
  }

  async getWorkspaceDetail(id: string): Promise<AdminWorkspaceDetail> {
    const workspace = await this.workspaces.findOne({ where: { id } })
    if (!workspace) {
      throw new NotFoundException(`Workspace ${id} not found`)
    }
    const [adminWorkspace] = await this.buildAdminWorkspaces([workspace])

    const memberRows = await this.members
      .createQueryBuilder('m')
      .leftJoin(ProfileEntity, 'p', 'p.user_id = m.user_id')
      .select('m.user_id', 'userId')
      .addSelect('m.role', 'role')
      .addSelect('m.created_at', 'joinedAt')
      .addSelect('p.email', 'email')
      .addSelect('p.first_name', 'firstName')
      .addSelect('p.last_name', 'lastName')
      .where('m.workspace_id = :id', { id })
      .orderBy('m.created_at', 'ASC')
      .getRawMany<{
        userId: string
        role: string
        joinedAt: Date | string
        email: string | null
        firstName: string | null
        lastName: string | null
      }>()

    const members: AdminWorkspaceMember[] = memberRows.map(row => ({
      userId: row.userId,
      email: row.email ?? null,
      fullName: buildFullName(row.firstName, row.lastName),
      role: row.role,
      joinedAt: toIso(row.joinedAt),
    }))

    const invitationRows = await this.invitations.find({
      where: { workspace_id: id },
      order: { created_at: 'DESC' },
    })
    const invitations: AdminWorkspaceInvitation[] = invitationRows.map(inv => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: toIso(inv.expires_at),
      createdAt: toIso(inv.created_at),
    }))

    return {
      workspace: adminWorkspace!,
      members,
      invitations,
      esnProfile: await this.loadEsnProfile(id),
      // #2643.2 — l'état persisté de l'e-mail d'activation, pour que l'écran
      // sache dire où il en est sans avoir à rouvrir la réponse de création.
      ownerInvitation: await this.ownerActivation.getState(id),
    }
  }

  /**
   * #2643.1 — le SEUL chemin par lequel l'API envoie l'e-mail d'activation :
   * un clic opérateur, relayé tel quel. `actorEmail` vient de la session du
   * back-office (`operateurDeLaRequete` côté `dashboard-manager`), jamais du
   * corps de la requête — même garde que `avecAuteur` pour le provisionnement.
   */
  sendOwnerInvitation(
    workspaceId: string,
    actorEmail: string,
  ): Promise<SendOwnerInvitationResult | SendOwnerInvitationRefusal> {
    return this.ownerActivation.send(workspaceId, actorEmail)
  }

  /**
   * L'état de la fiche ESN partagée — voir {@link AdminWorkspaceEsnProfile}.
   *
   * ⚠️ Les douze clés listées sont celles que le questionnaire du premier temps
   * POSE : les dix de `TEMPS1_REQUIRED_KEYS`, plus le domaine d'offre et le
   * placement en CDI, que la porte de complétion serveur n'exige pas mais que le
   * FLUX demande. Les lister ici depuis les contrats, et non à la main, est ce
   * qui empêche cet écran de mentir le jour où une question s'ajoute.
   *
   * Aucune VALEUR ne sort : `filled`, jamais le contenu.
   */
  private async loadEsnProfile(workspaceId: string): Promise<AdminWorkspaceEsnProfile> {
    const row = await this.esnProfiles.findOne({
      where: { workspace_id: workspaceId, is_workspace_canonical: true, is_current: true },
    })
    const answers = ESN_PROFILE_CONSOLE_KEYS.map(key => ({
      key,
      scope: (isPersonalAnswerKey(key) ? 'personal' : 'company') as 'company' | 'personal',
      filled: row ? isAnswerFilled(row[key] as string | string[] | null | undefined) : false,
    }))
    const company = answers.filter(answer => answer.scope === 'company')
    return {
      canonical: row !== null,
      heldByUserId: row?.user_id ?? null,
      heldByEmail: row ? ((await this.profiles.findOne({ where: { user_id: row.user_id } }))?.email ?? null) : null,
      version: row?.version ?? null,
      updatedAt: row?.updated_at ? toIso(row.updated_at) : null,
      answers,
      companyFilled: company.filter(answer => answer.filled).length,
      companyTotal: company.length,
    }
  }

  async assignPlan(userId: string, plan: PlanKey): Promise<AdminUser> {
    const profile = await this.profiles.findOne({ where: { user_id: userId } })
    if (!profile) {
      throw new NotFoundException(`User ${userId} not found`)
    }

    // PLAN-GATE #4381 — le plan se pose sur la ligne que le verrou LIT : celle du
    // propriétaire de l'espace actif de la personne (`getCredits`,
    // `PlanFeaturesService`). Écrire la ligne de la personne elle-même la laissait
    // sans effet dès qu'elle n'était pas propriétaire — le back-office affichait
    // « Entreprise », l'app restait verrouillée. Pour un propriétaire (ou un compte
    // solo) la cible reste sa propre ligne : rien ne change pour eux.
    const scope = await this.resolvePlanScope(userId)
    const targetUserId = scope?.ownerUserId ?? userId

    const config = await this.planCatalog.getOrDefault(plan)
    const existing = await this.subscriptions.findOne({ where: { user_id: targetUserId } })
    const merged = this.subscriptions.merge(existing ?? this.subscriptions.create({ user_id: targetUserId }), {
      plan,
      accounts_limit: config.accounts_limit,
      enrichment_credits: config.enrichment_credits,
    })
    await this.subscriptions.save(merged)

    const [user] = await this.buildAdminUsers([profile])
    return user!
  }

  /** L'espace actif d'une personne et son propriétaire — `null` sans espace. */
  private async resolvePlanScope(userId: string): Promise<AdminPlanScope | null> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
      if (!workspace) return null
      const owner = await this.profiles.findOne({ where: { user_id: workspace.owner_user_id } })
      return {
        workspaceId,
        workspaceName: workspace.name,
        ownerUserId: workspace.owner_user_id,
        ownerEmail: owner?.email ?? null,
        isOwner: workspace.owner_user_id === userId,
      }
    } catch {
      return null
    }
  }

  async createWorkspace(name: string, ownerUserId: string): Promise<AdminWorkspace> {
    const owner = await this.profiles.findOne({ where: { user_id: ownerUserId } })
    if (!owner) {
      throw new NotFoundException(`User ${ownerUserId} not found`)
    }

    const workspace = await this.workspaces.save(this.workspaces.create({ name, owner_user_id: ownerUserId }))
    await this.members.save(this.members.create({ workspace_id: workspace.id, user_id: ownerUserId, role: 'owner' }))

    const [adminWorkspace] = await this.buildAdminWorkspaces([workspace])
    return adminWorkspace!
  }

  async renameWorkspace(id: string, name: string): Promise<AdminWorkspace> {
    const workspace = await this.workspaces.findOne({ where: { id } })
    if (!workspace) {
      throw new NotFoundException(`Workspace ${id} not found`)
    }
    workspace.name = name
    const saved = await this.workspaces.save(workspace)
    const [adminWorkspace] = await this.buildAdminWorkspaces([saved])
    return adminWorkspace!
  }

  async addMember(
    workspaceId: string,
    userId: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<AdminWorkspaceMember> {
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    if (!workspace) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`)
    }
    const profile = await this.profiles.findOne({ where: { user_id: userId } })
    if (!profile) {
      throw new NotFoundException(`User ${userId} not found`)
    }
    const existing = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: userId } })
    if (existing) {
      throw new ConflictException('Cet utilisateur est déjà membre de cet espace')
    }

    const saved = await this.members.save(this.members.create({ workspace_id: workspaceId, user_id: userId, role }))
    return {
      userId: saved.user_id,
      email: profile.email ?? null,
      fullName: buildFullName(profile.first_name, profile.last_name),
      role: saved.role,
      joinedAt: toIso(saved.created_at),
    }
  }

  async removeMember(workspaceId: string, userId: string): Promise<{ removed: true }> {
    const member = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: userId } })
    if (!member) {
      throw new NotFoundException(`Member ${userId} not found in workspace ${workspaceId}`)
    }
    if (member.role === 'owner') {
      throw new BadRequestException('retirer le propriétaire est interdit')
    }
    await this.members.delete({ workspace_id: workspaceId, user_id: userId })
    // #4158.4 (jumeau de `WorkspaceTeamService.removeMember`) — son portefeuille et
    // ses actions déléguées retournent à « sans porteur ». Best-effort et APRÈS la
    // suppression : le membre est déjà retiré, un UPDATE raté ne le ré-inscrit pas.
    try {
      await releaseMemberWork(this.accounts.manager, workspaceId, userId)
    } catch (error) {
      this.logger.warn(
        `Portefeuille de ${userId} non libéré (${(error as Error).message}). Le membre est retiré ; ses comptes restent à réattribuer à la main.`,
      )
    }
    return { removed: true }
  }

  /** Batch-hydrate `AdminUser` rows: one subscriptions lookup + one memberships
   *  join for the whole page, assembled in memory (no N+1). */
  private async buildAdminUsers(profiles: ProfileEntity[]): Promise<AdminUser[]> {
    if (profiles.length === 0) return []
    const userIds = profiles.map(p => p.user_id)

    // PLAN-GATE #4381 — l'abonnement qui s'applique est celui du PROPRIÉTAIRE de
    // l'espace actif, pas la ligne de la personne : on le résout comme le verrou.
    const scopes = await Promise.all(userIds.map(id => this.resolvePlanScope(id)))
    const scopeByUser = new Map(userIds.map((id, i) => [id, scopes[i] ?? null]))
    const subOwnerIds = [...new Set(userIds.map(id => scopeByUser.get(id)?.ownerUserId ?? id))]

    const subs = await this.subscriptions.find({ where: { user_id: In(subOwnerIds) } })
    const subByUser = new Map(subs.map(s => [s.user_id, s]))

    const memberRows = await this.members
      .createQueryBuilder('m')
      .innerJoin(WorkspaceEntity, 'w', 'w.id = m.workspace_id')
      .select('m.user_id', 'userId')
      .addSelect('w.id', 'workspaceId')
      .addSelect('w.name', 'workspaceName')
      .addSelect('m.role', 'role')
      .where('m.user_id IN (:...userIds)', { userIds })
      .getRawMany<{ userId: string; workspaceId: string; workspaceName: string; role: string }>()

    const workspacesByUser = new Map<string, AdminUserWorkspace[]>()
    for (const row of memberRows) {
      const list = workspacesByUser.get(row.userId) ?? []
      list.push({ id: row.workspaceId, name: row.workspaceName, role: row.role })
      workspacesByUser.set(row.userId, list)
    }

    // Un user SANS ligne subscription n'a encore rien consommé : son plafond est
    // celui du palier de départ (`decouverte`, 1 recherche), pas l'essai complet.
    const trialLimit = (await this.planCatalog.getOrDefault('decouverte')).accounts_limit
    return profiles.map(profile => {
      const planScope = scopeByUser.get(profile.user_id) ?? null
      const sub = subByUser.get(planScope?.ownerUserId ?? profile.user_id)
      return {
        userId: profile.user_id,
        email: profile.email ?? null,
        fullName: buildFullName(profile.first_name, profile.last_name),
        plan: sub?.plan ?? 'decouverte',
        planScope,
        accountsUsed: sub?.accounts_used ?? 0,
        // Effective cap = plan quota + one-off top-up (same convention as the
        // client detail sheet and the app's own credits pill).
        accountsLimit: sub ? sub.accounts_limit + (sub.topup_analyses ?? 0) : trialLimit,
        workspaces: workspacesByUser.get(profile.user_id) ?? [],
        createdAt: toIso(profile.created_at),
      }
    })
  }

  /** Batch-hydrate `AdminWorkspace` rows: one grouped member-count query + one
   *  owner-email lookup for the whole page. */
  private async buildAdminWorkspaces(workspaces: WorkspaceEntity[]): Promise<AdminWorkspace[]> {
    if (workspaces.length === 0) return []
    const ids = workspaces.map(w => w.id)
    const ownerIds = [...new Set(workspaces.map(w => w.owner_user_id))]

    const countRows = await this.members
      .createQueryBuilder('m')
      .select('m.workspace_id', 'workspaceId')
      .addSelect('COUNT(*)', 'count')
      .where('m.workspace_id IN (:...ids)', { ids })
      .groupBy('m.workspace_id')
      .getRawMany<{ workspaceId: string; count: string }>()
    const countByWorkspace = new Map(countRows.map(row => [row.workspaceId, Number(row.count ?? 0)]))

    const owners = ownerIds.length > 0 ? await this.profiles.find({ where: { user_id: In(ownerIds) } }) : []
    const emailByUser = new Map(owners.map(o => [o.user_id, o.email ?? null]))

    return workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      ownerUserId: workspace.owner_user_id,
      ownerEmail: emailByUser.get(workspace.owner_user_id) ?? null,
      memberCount: countByWorkspace.get(workspace.id) ?? 0,
      createdAt: toIso(workspace.created_at),
    }))
  }
}

function isPlanKey(value: string): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value)
}

/** Map a catalog {@link PlanDefinition} to the backoffice DTO shape. */
function toAdminPlan(def: PlanDefinition): AdminPlan {
  return {
    key: def.key as PlanKey,
    label: def.label,
    price: def.price,
    accountsLimit: def.accounts_limit,
    enrichmentCredits: def.enrichment_credits,
    seats: def.seats,
    extraSeatPrice: def.extra_seat_price,
    selfServe: def.self_serve,
    features: [...def.features],
    sortOrder: def.sort_order,
  }
}
