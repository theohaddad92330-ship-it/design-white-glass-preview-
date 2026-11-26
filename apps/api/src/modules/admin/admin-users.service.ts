import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { clampResetTtl, DEFAULT_RESET_LINK_TTL, resetTtlMs, type ResetLinkTtlKey } from '@bellum/contracts'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { SupabaseService } from '../../supabase/supabase.service'
import { buildResetLink } from '../auth/reset-link'
import { creditCapacity } from '../credits/credits.service'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import { cellsOfAccounts, countAccountPopulation } from '../accounts/account-counts'

/** Ban duration passed to Supabase to suspend an account "forever" (~100 years).
 *  Supabase has no true permanent ban — a very long duration is the idiom. */
const SUSPEND_BAN_DURATION = '876000h'
/** Sentinel that clears an existing ban. */
const UNSUSPEND_BAN_DURATION = 'none'

interface AdminUserWorkspaceRef {
  id: string
  name: string
  role: string
  /**
   * L'espace que cette personne voit RÉELLEMENT en ouvrant l'application.
   *
   * ⚠️ Il ne se déduit PAS de la liste : quelqu'un qui appartient à son espace
   * personnel ET à celui de son ESN a deux adhésions valides, et seul le
   * sélecteur dit laquelle est active. C'est exactement la question que la
   * console ne savait pas répondre le 07/09/2026 — « bedros est bien dans la
   * team abricotlabs mais l'onboarding est encore lancé » — et qui a coûté un
   * aller-retour en base de production pour être tranchée.
   *
   * La valeur vient de `WorkspaceContextService.resolveActiveWorkspace`, LA
   * résolution du produit, jamais d'une seconde implémentation : c'est la
   * multiplication de ces copies qui a causé #1671-bis (quatre implémentations,
   * deux qui sautaient l'étape du choix). La console montre donc ce que
   * l'utilisateur voit, et ne peut pas diverger de lui.
   */
  isActive: boolean
}

/** Auth-side state, sourced from Supabase's service-role admin API — never from
 *  our own tables (which don't hold confirmation / ban / last-sign-in). Null on
 *  the detail payload when the lookup fails, so we surface "indisponible" rather
 *  than invent a status. */
interface AdminUserAuthState {
  confirmed: boolean
  banned: boolean
  bannedUntil: string | null
  lastSignInAt: string | null
  email: string | null
}

/** #4423.1 — la dernière trace d'usage connue et d'où elle vient. */
/** #4423.2 — ce que chaque compteur voisin compte, et qui fait l'écart. */
interface AdminUserAccountsBreakdown {
  /** #4423.2 — comptes non archivés : le « Comptes actifs » de la vue ESN. */
  active: number
  /** Analyses lancées (= `accountsCount`). */
  total: number
  /** Analyses terminées — « N comptes analysés » côté Laura. */
  completed: number
  /** Comptes suivis (statut commercial) — « Comptes suivis » côté app. */
  followed: number
  notCompletedNames: string[]
  notFollowedNames: string[]
  /** #4423.2 — le statut des analyses non terminées (« imported: 276 »), jamais un écart muet. */
  notCompletedByStatus: Record<string, number>
  /** #4423.2 — les échecs avec leur raison consignée (`null` = aucune). */
  failedReasons: { name: string; reason: string | null }[]
}

interface AdminUserLastActivity {
  at: string
  source: 'sign_in' | 'action' | 'laura'
}

export interface AdminUserDetail {
  userId: string
  email: string | null
  fullName: string | null
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  createdAt: string
  plan: string
  accountsUsed: number
  accountsLimit: number
  enrichmentCredits: number
  workspaces: AdminUserWorkspaceRef[]
  /** How many analyses (accounts rows) this user has created. */
  accountsCount: number
  auth: AdminUserAuthState | null
  /** #4423.1 — le plus récent entre la connexion par mot de passe et la dernière trace d'usage
   *  (action produit, message à Laura). `null` = aucune trace nulle part, jamais une date inventée. */
  lastActivity: AdminUserLastActivity | null
  /** #4423.2 — `null` = lecture impossible, jamais une ventilation de zéros. */
  accountsBreakdown: AdminUserAccountsBreakdown | null
}

export interface AdminUserBanResult {
  userId: string
  banned: boolean
  bannedUntil: string | null
}

/**
 * L'état d'authentification d'UN compte, tel que l'annuaire le lit (#1664).
 *
 * Les mêmes champs que {@link AdminUserAuthState}, moins l'e-mail : l'annuaire
 * le porte déjà par le profil, et une adresse qui voyage deux fois est une
 * adresse qu'on masque une fois sur deux.
 *
 * Local : seul {@link AdminUsersAuthStates} le nomme, et c'est lui que les
 * appelants manipulent (knip refuse un type exporté lu dans son seul fichier).
 */
interface AdminUserAuthSnapshot {
  userId: string
  confirmed: boolean
  banned: boolean
  bannedUntil: string | null
  /** `null` = ce compte ne s'est JAMAIS connecté. Un compte ABSENT de la liste,
   *  lui, n'est pas « jamais connecté » : il est inconnu — voir `complete`. */
  lastSignInAt: string | null
}

/**
 * Ce que le magasin d'authentification a pu dire de TOUS les comptes.
 *
 * ⚠️ `complete` porte la distinction qui fait toute la valeur de cette lecture :
 * **« jamais connecté » et « on ne sait pas quand » ne sont pas la même
 * chose.** Un utilisateur absent de `states` est INCONNU, jamais « jamais
 * connecté » — et `complete: false` dit que l'absence peut venir de nous
 * (magasin en panne, plafond de pages atteint) plutôt que du compte.
 */
export interface AdminUsersAuthStates {
  complete: boolean
  states: AdminUserAuthSnapshot[]
}

/** Comptes lus par page. Le plafond de GoTrue est 1 000 ; 200 garde la réponse
 *  petite sans multiplier les allers-retours. */
const AUTH_PAGE_SIZE = 200
/** Plafond DUR de pages — 5 000 comptes. Au-delà, on ne devine pas : les
 *  comptes non lus ressortent « inconnus », et `complete: false` le dit. */
const AUTH_MAX_PAGES = 25

export interface AdminCreditsResult {
  userId: string
  plan: string
  accountsLimit: number
  accountsUsed: number
  enrichmentCredits: number
}

/** The raw Supabase auth user is loosely typed for admin-only fields like
 *  `banned_until`, so we read it off a permissive record shape. */
type RawAuthUser = {
  email?: string | null
  email_confirmed_at?: string | null
  confirmed_at?: string | null
  last_sign_in_at?: string | null
  banned_until?: string | null
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return ''
  return value instanceof Date ? value.toISOString() : String(value)
}

function buildFullName(first: string | null | undefined, last: string | null | undefined): string | null {
  const full = [first, last]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .trim()
  return full.length > 0 ? full : null
}

/** A `banned_until` in the future (or the sentinel `none` cleared) → banned. */
function isBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false
  const until = new Date(bannedUntil)
  if (Number.isNaN(until.getTime())) return false
  return until.getTime() > Date.now()
}

function mapAuthState(user: RawAuthUser): AdminUserAuthState {
  const bannedUntil = user.banned_until ?? null
  return {
    confirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
    banned: isBanned(bannedUntil),
    bannedUntil,
    lastSignInAt: user.last_sign_in_at ?? null,
    email: user.email ?? null,
  }
}

/**
 * Per-user backoffice management — the powerful half of the admin surface
 * (suspend / delete / reset / credit grants). Split out of {@link AdminService}
 * so the read-only directory and these auth-mutating operations evolve
 * independently. Cross-tenant by design; reachable ONLY behind
 * `InternalSecretGuard`. Auth-side operations go through the Supabase
 * service-role admin API; credit grants write our own `subscriptions` +
 * `credit_ledger` tables.
 */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name)

  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(CreditLedgerEntity)
    private readonly ledger: Repository<CreditLedgerEntity>,
    private readonly supabase: SupabaseService,
    private readonly planCatalog: PlanCatalogService,
    private readonly config: ConfigService,
    @InjectRepository(UserActionEntity)
    private readonly actions: Repository<UserActionEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly chatMessages: Repository<ChatMessageEntity>,
  ) {}

  /** Mêmes définitions que les écrans : « analysé » = analyse terminée (`status = 'completed'`),
   *  « suivi » = `ACCOUNT_HYGIENE_PREDICATES.followedAccounts` (statut commercial, hors supprimé). */
  private async loadAccountsBreakdown(userId: string): Promise<AdminUserAccountsBreakdown | null> {
    try {
      const rows = await this.accounts.find({
        where: { user_id: userId },
        select: ['company_name', 'status', 'commercial_status', 'error_message'],
      })
      // #4423.2 — les CHIFFRES viennent de la définition commune (`account-counts.ts`), la même que la vue ESN.
      const population = countAccountPopulation(cellsOfAccounts(rows))
      const followedStatuses = ['watching', 'opportunity', 'opening', 'customer']
      const isFollowed = (a: AccountEntity): boolean =>
        followedStatuses.includes(a.commercial_status) && a.status !== 'deleted'
      const names = (list: AccountEntity[]): string[] => list.slice(0, 5).map(a => a.company_name)
      // #4423.2 — les non terminées NOMMENT leur statut ; un échec dit sa raison (`null` = aucune consignée).
      const notCompletedByStatus: Record<string, number> = {}
      for (const a of rows)
        if (a.status !== 'completed') notCompletedByStatus[a.status] = (notCompletedByStatus[a.status] ?? 0) + 1
      return {
        total: population.launched,
        notCompletedByStatus,
        failedReasons: rows
          .filter(a => a.status === 'error')
          .slice(0, 5)
          .map(a => ({ name: a.company_name, reason: a.error_message?.trim() || null })),
        completed: population.completed,
        active: population.active,
        followed: population.followed,
        notCompletedNames: names(rows.filter(a => a.status !== 'completed')),
        notFollowedNames: names(rows.filter(a => !isFollowed(a))),
      }
    } catch (err) {
      this.logger.warn(`Accounts breakdown unreadable: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  /** #4423.1 — `auth.users.last_sign_in_at` ne bouge qu'à la connexion par mot de passe : un espace
   *  actif pendant des semaines sur une session ouverte y paraît dormant. On prend le maximum de
   *  ce qui est DÉJÀ enregistré (actions produit, messages à Laura), sans table nouvelle. */
  private async loadLastActivity(userId: string, signInAt: string | null): Promise<AdminUserLastActivity | null> {
    const [action, laura] = await Promise.all([
      this.lastAt(() =>
        this.actions
          .createQueryBuilder('a')
          .select('MAX(a.created_at)', 'lastAt')
          .where('a.user_id = :userId', { userId })
          .getRawOne<{ lastAt: Date | string | null }>(),
      ),
      this.lastAt(() =>
        this.chatMessages
          .createQueryBuilder('m')
          .select('MAX(m.created_at)', 'lastAt')
          .where('m.user_id = :userId', { userId })
          .andWhere("m.role = 'user'")
          .getRawOne<{ lastAt: Date | string | null }>(),
      ),
    ])
    const candidates: { at: Date; source: AdminUserLastActivity['source'] }[] = []
    const signIn = signInAt ? new Date(signInAt) : null
    if (signIn && !Number.isNaN(signIn.getTime())) candidates.push({ at: signIn, source: 'sign_in' })
    if (action) candidates.push({ at: action, source: 'action' })
    if (laura) candidates.push({ at: laura, source: 'laura' })
    if (candidates.length === 0) return null
    const best = candidates.reduce((a, b) => (b.at.getTime() > a.at.getTime() ? b : a))
    return { at: best.at.toISOString(), source: best.source }
  }

  /** Une source d'usage en panne ne fait pas « jamais actif » : elle sort du maximum, c'est tout. */
  private async lastAt(read: () => Promise<{ lastAt: Date | string | null } | null | undefined>): Promise<Date | null> {
    try {
      const raw = (await read())?.lastAt
      if (!raw) return null
      const date = raw instanceof Date ? raw : new Date(raw)
      return Number.isNaN(date.getTime()) ? null : date
    } catch (err) {
      this.logger.warn(`Last-activity source unreadable: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  /** @param activeWorkspaceId l'espace que cette personne voit réellement, résolu
   *  par le contrôleur — cf. {@link AdminUserWorkspaceRef.isActive}. */
  async getUserDetail(userId: string, activeWorkspaceId: string | null): Promise<AdminUserDetail> {
    const profile = await this.requireProfile(userId)

    const [ownSub, workspaces, accountsCount, auth] = await Promise.all([
      this.subscriptions.findOne({ where: { user_id: userId } }),
      this.loadWorkspaces(userId, activeWorkspaceId),
      this.accounts.count({ where: { user_id: userId } }),
      this.loadAuthState(userId),
    ])
    const lastActivity = await this.loadLastActivity(userId, auth?.lastSignInAt ?? null)
    const accountsBreakdown = await this.loadAccountsBreakdown(userId)
    const trial = await this.planCatalog.getOrDefault('trial')
    // CEDRIC-FIX C.10 — la même source que l'app : le pool du PROPRIÉTAIRE de l'espace que la personne
    // voit (`CreditsService.resolveBillingSubscription`), pas sa propre ligne d'abonnement. Sans espace
    // actif résolu, la ligne de la personne (rien n'est deviné).
    const sub = await this.billingPoolOf(userId, activeWorkspaceId, ownSub)

    return {
      userId,
      email: profile.email ?? null,
      fullName: buildFullName(profile.first_name, profile.last_name),
      firstName: profile.first_name ?? null,
      lastName: profile.last_name ?? null,
      avatarUrl: profile.avatar_url ?? null,
      createdAt: toIso(profile.created_at),
      plan: sub?.plan ?? 'trial',
      accountsUsed: sub?.accounts_used ?? 0,
      // CEDRIC-FIX C.10 — la capacité DÉPENSABLE, définie à UN seul endroit (`creditCapacity` : quota +
      // recharge + report encore valide). L'ancienne somme locale omettait le report.
      accountsLimit: sub ? creditCapacity(sub) : trial.accounts_limit,
      enrichmentCredits: sub?.enrichment_credits ?? trial.enrichment_credits,
      workspaces,
      accountsCount,
      auth,
      lastActivity,
      accountsBreakdown,
    }
  }

  /** CEDRIC-FIX C.10 — la ligne d'abonnement qui porte le pool de crédits vu par cette personne. */
  private async billingPoolOf(
    userId: string,
    activeWorkspaceId: string | null,
    ownSub: SubscriptionEntity | null,
  ): Promise<SubscriptionEntity | null> {
    if (!activeWorkspaceId) return ownSub
    const workspace = await this.workspaces.findOne({ where: { id: activeWorkspaceId } })
    const ownerId = workspace?.owner_user_id
    if (!ownerId || ownerId === userId) return ownSub
    return (await this.subscriptions.findOne({ where: { user_id: ownerId } })) ?? ownSub
  }

  /**
   * L'état d'authentification de TOUS les comptes, en une lecture (#1664).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE MÉTHODE EXISTE
   * ─────────────────────────────────────────────────────────────────────────
   * L'annuaire (`GET internal/admin/users`) ne porte que NOS tables : ni la
   * dernière connexion, ni la suspension, qui vivent côté Supabase. C'est la
   * raison écrite noir sur blanc dans `user-row-actions.tsx` pour laquelle une
   * ligne de liste n'offrait pas « Suspendre » : « le lire coûterait un appel
   * par utilisateur à chaque affichage ». Une page de `listUsers` en coûte UN
   * pour deux cents comptes — la raison tombe, le geste peut revenir en ligne.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QU'ELLE NE FAIT JAMAIS
   * ─────────────────────────────────────────────────────────────────────────
   * Inventer un état. Un magasin en panne ne rend pas « tout le monde est
   * actif et personne ne s'est jamais connecté » — il rend `complete: false` et
   * une liste partielle, et l'écran DIT ce qu'il ne sait pas. C'est la même
   * règle que `loadAuthState`, qui rend `null` plutôt qu'un statut fabriqué.
   */
  async listAuthStates(): Promise<AdminUsersAuthStates> {
    const states: AdminUserAuthSnapshot[] = []
    try {
      for (let page = 1; page <= AUTH_MAX_PAGES; page += 1) {
        const { data, error } = await this.supabase.getClient().auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE })
        if (error) {
          this.logger.error('Auth listing failed', { error, tags: { 'admin.op': 'users.list_auth' } })
          // Les pages DÉJÀ lues sont vraies et restent : les jeter rendrait
          // « inconnu » un état qu'on connaissait. `complete: false` suffit à
          // dire que le reste ne l'est pas.
          return { complete: false, states }
        }
        const batch = (data?.users ?? []) as (RawAuthUser & { id?: string })[]
        for (const user of batch) {
          if (!user.id) continue
          const mapped = mapAuthState(user)
          states.push({
            userId: user.id,
            confirmed: mapped.confirmed,
            banned: mapped.banned,
            bannedUntil: mapped.bannedUntil,
            lastSignInAt: mapped.lastSignInAt,
          })
        }
        if (batch.length < AUTH_PAGE_SIZE) return { complete: true, states }
      }
      this.logger.warn(`Auth listing hit the ${AUTH_MAX_PAGES}-page ceiling — remaining accounts stay unknown`)
      return { complete: false, states }
    } catch (err) {
      this.logger.error('Auth listing threw', { error: err, tags: { 'admin.op': 'users.list_auth' } })
      return { complete: false, states }
    }
  }

  async suspendUser(userId: string): Promise<AdminUserBanResult> {
    await this.requireProfile(userId)
    const user = await this.updateBan(userId, SUSPEND_BAN_DURATION)
    const state = mapAuthState(user)
    this.logger.warn(`Admin suspended user ${userId}`)
    return { userId, banned: state.banned, bannedUntil: state.bannedUntil }
  }

  async unsuspendUser(userId: string): Promise<AdminUserBanResult> {
    await this.requireProfile(userId)
    const user = await this.updateBan(userId, UNSUSPEND_BAN_DURATION)
    const state = mapAuthState(user)
    this.logger.log(`Admin unsuspended user ${userId}`)
    return { userId, banned: state.banned, bannedUntil: state.bannedUntil }
  }

  /** Irreversible: removes the Supabase auth user. Our own rows (profile,
   *  subscription, accounts) cascade/orphan per their FK config — this method
   *  only owns the auth-side delete. */
  async deleteUser(userId: string): Promise<{ deleted: true; userId: string }> {
    await this.requireProfile(userId)
    const { error } = await this.supabase.getClient().auth.admin.deleteUser(userId)
    if (error) {
      this.logger.error(`Failed to delete user ${userId}`, { error, tags: { 'admin.op': 'user.delete' } })
      throw new BadRequestException(`Suppression impossible : ${error.message}`)
    }
    this.logger.warn(`Admin deleted user ${userId}`)
    return { deleted: true, userId }
  }

  /**
   * Un lien de réinitialisation que l'opérateur remet lui-même, SANS e-mail.
   *
   * C'est le chemin qui débloque quelqu'un dont la boîte ne reçoit rien : on
   * génère, on transmet par le canal qu'on veut, la personne définit son mot de
   * passe. Aucune connexion n'est ouverte à sa place — l'opérateur copie un
   * lien, il n'entre pas dans le compte.
   *
   * ⚠️ Ce lien rendait jusqu'au 20/08 le `action_link` SUPABASE brut
   * (`…supabase.co/auth/v1/verify?token=…&redirect_to=…`), qui atterrit sur la
   * RACINE de l'application — où aucun écran ne sait le consommer. L'opérateur
   * remettait donc un lien qui ne permettait pas de changer son mot de passe,
   * et la personne se retrouvait sur la page d'accueil sans rien comprendre.
   * On construit désormais le MÊME lien que le flux e-mail, par la même
   * fonction : deux constructions divergeaient, l'une des deux était fausse.
   */
  async generateResetLink(
    userId: string,
    ttl: ResetLinkTtlKey = DEFAULT_RESET_LINK_TTL,
  ): Promise<{ link: string; email: string; expiresAt: string; ttl: ResetLinkTtlKey; clamped: boolean }> {
    const profile = await this.requireProfile(userId)
    const email = profile.email
    if (!email) {
      throw new BadRequestException("Cet utilisateur n'a pas d'email — lien de réinitialisation impossible.")
    }
    const redirectTo = `${this.config.get<string>('frontendUrl', '').replace(/\/+$/, '')}/auth/reset-password`
    const { data, error } = await this.supabase
      .getClient()
      .auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
    // Le `hashed_token`, pas le token brut : c'est lui que notre écran sait
    // échanger contre une session, et il ne vaut qu'une fois.
    const tokenHash = data?.properties?.hashed_token
    if (error || !tokenHash) {
      this.logger.error(`Failed to generate reset link for ${userId}`, {
        error,
        tags: { 'admin.op': 'user.reset_link' },
      })
      throw new BadRequestException(`Génération du lien impossible${error ? ` : ${error.message}` : ''}.`)
    }
    // ⚠️ DEUX échéances, et la plus courte gagne. La nôtre est signée ; celle de
    // Supabase (`MAILER_OTP_EXP`) s'applique à l'échange du jeton. Promettre
    // 48 heures pendant que le projet en accorde une produirait le pire lien
    // possible : notre écran l'accepte, la personne saisit son mot de passe, et
    // Supabase refuse. `SUPABASE_OTP_EXP_SECONDS` déclare le plafond réel ;
    // absent, on ne devine RIEN et la durée demandée passe.
    const ceilingSeconds = this.config.get<number>('supabaseOtpExpSeconds')
    const granted = clampResetTtl(resetTtlMs(ttl), ceilingSeconds ? ceilingSeconds * 1000 : null)
    const expiresAt = Date.now() + granted.ms
    const link = buildResetLink({
      frontendUrl: this.config.get<string>('frontendUrl', ''),
      tokenHash,
      expiresAt,
      secret: this.config.getOrThrow<string>('supabaseJwtSecret'),
    })
    // L'échéance voyage avec le lien : un opérateur qui envoie un lien périmé
    // ne le sait pas, et c'est la personne bloquée qui le découvre. `clamped`
    // dit que la durée demandée a été rabotée — le back-office l'affiche, plutôt
    // que de laisser croire à 48 heures qui n'existent pas.
    return { link, email, expiresAt: new Date(expiresAt).toISOString(), ttl, clamped: granted.clamped }
  }

  /**
   * Grant (or claw back) credits on the user's subscription. `accounts` moves
   * `accounts_limit` (analysis-slot allowance), `enrichment` moves
   * `enrichment_credits`; both are signed and floored at 0. Every non-zero delta
   * appends an immutable `credit_ledger` row so manual movements are auditable
   * alongside consume/refund/top-up. Zod already rejects an all-zero payload, but
   * we re-guard for the direct-call path.
   */
  async grantCredits(
    userId: string,
    input: { accounts?: number; enrichment?: number; reason: string },
  ): Promise<AdminCreditsResult> {
    await this.requireProfile(userId)
    const accountsDelta = Math.trunc(input.accounts ?? 0)
    const enrichmentDelta = Math.trunc(input.enrichment ?? 0)
    if (accountsDelta === 0 && enrichmentDelta === 0) {
      throw new BadRequestException('Indiquer au moins un delta de crédits non nul.')
    }

    const trial = await this.planCatalog.getOrDefault('trial')
    const existing = await this.subscriptions.findOne({ where: { user_id: userId } })
    const sub =
      existing ??
      this.subscriptions.create({
        user_id: userId,
        plan: 'trial',
        accounts_limit: trial.accounts_limit,
        accounts_used: 0,
        enrichment_credits: trial.enrichment_credits,
      })

    sub.accounts_limit = Math.max(0, (sub.accounts_limit ?? 0) + accountsDelta)
    sub.enrichment_credits = Math.max(0, (sub.enrichment_credits ?? 0) + enrichmentDelta)
    const saved = await this.subscriptions.save(sub)

    const reason = `admin_grant: ${input.reason}`
    if (accountsDelta !== 0) {
      await this.recordLedger(userId, 'analysis_slot', accountsDelta, reason)
    }
    if (enrichmentDelta !== 0) {
      await this.recordLedger(userId, 'enrichment_credit', enrichmentDelta, reason)
    }
    this.logger.log(`Admin granted credits to ${userId}: accounts=${accountsDelta} enrichment=${enrichmentDelta}`)

    return {
      userId,
      plan: saved.plan ?? 'trial',
      accountsLimit: saved.accounts_limit ?? 0,
      accountsUsed: saved.accounts_used ?? 0,
      enrichmentCredits: saved.enrichment_credits ?? 0,
    }
  }

  private async requireProfile(userId: string): Promise<ProfileEntity> {
    const profile = await this.profiles.findOne({ where: { user_id: userId } })
    if (!profile) {
      throw new NotFoundException(`User ${userId} not found`)
    }
    return profile
  }

  /**
   * Les espaces de cette personne, celui qu'elle VOIT marqué.
   *
   * ⚠️ `activeWorkspaceId` arrive en PARAMÈTRE, résolu par le contrôleur avec
   * `WorkspaceContextService` — la résolution du produit, pas une cinquième
   * copie (c'en est la multiplication qui a causé #1671-bis). Le contrôleur est
   * aussi la couche où GA-07 autorise qu'un geste traverse deux domaines.
   * `null` ⇒ aucune ligne marquée, jamais une ligne devinée.
   */
  private async loadWorkspaces(userId: string, activeWorkspaceId: string | null): Promise<AdminUserWorkspaceRef[]> {
    const rows = await this.members
      .createQueryBuilder('m')
      .innerJoin(WorkspaceEntity, 'w', 'w.id = m.workspace_id')
      .select('w.id', 'workspaceId')
      .addSelect('w.name', 'workspaceName')
      .addSelect('m.role', 'role')
      .where('m.user_id = :userId', { userId })
      .orderBy('m.created_at', 'ASC')
      .getRawMany<{ workspaceId: string; workspaceName: string; role: string }>()

    return rows.map(row => ({
      id: row.workspaceId,
      name: row.workspaceName,
      role: row.role,
      isActive: row.workspaceId === activeWorkspaceId,
    }))
  }

  /** Best-effort auth lookup: on any Supabase error we log and return null so the
   *  detail page degrades to "auth indisponible" instead of a hard 500 (the DB
   *  side of the profile is still useful). Never fabricates a status. */
  private async loadAuthState(userId: string): Promise<AdminUserAuthState | null> {
    try {
      const { data, error } = await this.supabase.getClient().auth.admin.getUserById(userId)
      if (error || !data?.user) {
        if (error) {
          this.logger.error(`Auth lookup failed for ${userId}`, { error, tags: { 'admin.op': 'user.get_auth' } })
        }
        return null
      }
      return mapAuthState(data.user as RawAuthUser)
    } catch (err) {
      this.logger.error(`Auth lookup threw for ${userId}`, { error: err, tags: { 'admin.op': 'user.get_auth' } })
      return null
    }
  }

  private async updateBan(userId: string, banDuration: string): Promise<RawAuthUser> {
    const { data, error } = await this.supabase
      .getClient()
      .auth.admin.updateUserById(userId, { ban_duration: banDuration })
    if (error || !data?.user) {
      this.logger.error(`Failed to update ban for ${userId}`, { error, tags: { 'admin.op': 'user.ban' } })
      throw new BadRequestException(`Opération impossible${error ? ` : ${error.message}` : ''}.`)
    }
    return data.user as RawAuthUser
  }

  private async recordLedger(
    ownerUserId: string,
    resource: 'analysis_slot' | 'enrichment_credit',
    delta: number,
    reason: string,
  ): Promise<void> {
    try {
      await this.ledger.insert({
        owner_user_id: ownerUserId,
        workspace_id: null,
        actor_user_id: null,
        kind: 'topup',
        resource,
        delta,
        reason,
        account_id: null,
      })
    } catch (err) {
      // Audit write is best-effort — the counter is authoritative and already
      // saved. Log and swallow so a ledger hiccup never fails the grant.
      this.logger.error(`Failed to write admin grant ledger row for ${ownerUserId}`, {
        error: err,
        tags: { 'admin.op': 'user.grant_ledger' },
      })
    }
  }
}
