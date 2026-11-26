import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { SessionLifecycleState, SessionResponse, SessionUser } from '@bellum/contracts'
import { failure, success, type Result } from '@bellum/utils'
import { isAuthRetryableFetchError, type Session, type User } from '@supabase/supabase-js'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProfileContextService } from '../profile-context/profile-context.service'
import type { AuthFailure } from './auth.types'
import { SupabaseAuthGateway } from './supabase-auth.gateway'

const FIRST_SESSION_WINDOW_MS = 10 * 60 * 1000 // 10 min

const SESSION_CACHE_TTL_MS = 20 * 1000
const SESSION_CACHE_MAX = 5000

@Injectable()
export class SessionService {
  private readonly sessionCache = new Map<string, { at: number; user: SessionUser }>()

  constructor(
    private readonly gateway: SupabaseAuthGateway,
    private readonly profileContext: ProfileContextService,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  mapToSessionResponse(session: Session, user: User): SessionResponse {
    const userData = this.mapToSessionUser(user)
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at ?? null,
      user: userData,
    }
  }

  mapToSessionUser(user: User): SessionUser {
    // fix/roles-app-metadata — les rôles se lisent dans `app_metadata`, écrit
    // SEULEMENT par la clé de service. `user_metadata` est modifiable par
    // l'utilisateur lui-même (PUT /auth/v1/user avec son jeton) : y lire un rôle
    // laissait un client s'attribuer `backoffice`. Il n'est plus lu ici, jamais.
    // Bascule des opérateurs existants : `pnpm --filter @bellum/api roles:app-metadata`.
    const appRoles: unknown = user.app_metadata?.['roles']
    const roles =
      Array.isArray(appRoles) && appRoles.length > 0 && appRoles.every((r): r is string => typeof r === 'string')
        ? appRoles
        : ['customer']
    return {
      id: user.id,
      email: user.email ?? '',
      email_confirmed_at: user.email_confirmed_at ?? null,
      created_at: user.created_at,
      roles,
    }
  }

  async refresh(refreshToken: string): Promise<Result<SessionResponse, AuthFailure>> {
    const { data, error } = await this.gateway.client.auth.refreshSession({ refresh_token: refreshToken })
    // Session tenue 24 h (15/09/2026) : TOUTE erreur devenait `invalid_refresh_token`
    // (401), le seul verdict qui renvoie le navigateur à la connexion — un
    // hoquet réseau au réveil déconnectait. Une panne ne dit rien du jeton.
    if (error && isProviderOutage(error)) {
      return failure({
        code: 'auth_provider_unavailable',
        message: 'Service d’authentification momentanément indisponible',
      })
    }
    if (error || !data.session || !data.user) {
      return failure({ code: 'invalid_refresh_token', message: error?.message || 'Refresh token invalide' })
    }
    const sessionResponse: SessionResponse = this.mapToSessionResponse(data.session, data.user)
    return success(sessionResponse)
  }

  /**
   * Mints a fresh session for a user WITHOUT their password — used by the 2FA
   * challenge once the TOTP code checks out (the password isn't stored, so we
   * can't re-run `signInWithPassword`). We issue a single-use magic link via the
   * admin API and consume it immediately via `verifyOtp`, the same technique as
   * the email-verification flow.
   */
  async mintSessionForUserId(userId: string): Promise<Result<SessionResponse, AuthFailure>> {
    const user = await this.gateway.findUserById(userId)
    if (!user?.email) {
      return failure({ code: 'user_not_found', message: 'Utilisateur introuvable' })
    }
    const { data: link, error: linkError } = await this.gateway.client.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    })
    if (linkError || !link?.properties?.hashed_token) {
      return failure({ code: 'invalid_credentials', message: linkError?.message || 'Impossible de générer la session' })
    }
    const { data, error } = await this.gateway.client.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.properties.hashed_token,
    })
    if (error || !data.session || !data.user) {
      return failure({ code: 'invalid_credentials', message: error?.message || 'Impossible de générer la session' })
    }
    return success(this.mapToSessionResponse(data.session, data.user))
  }

  async getSession(userId: string): Promise<Result<{ user: SessionUser }, AuthFailure>> {
    const { data, error } = await this.gateway.client.auth.admin.getUserById(userId)
    if (error || !data.user) {
      return failure({ code: 'user_not_found', message: error?.message || 'Utilisateur introuvable' })
    }
    const userSession: SessionUser = this.mapToSessionUser(data.user)
    return success({ user: userSession })
  }

  /**
   * perf P3 (29/09/2026) — `GET /auth/session` : lecture de PROFIL (id, e-mail,
   * rôles des métadonnées), pas contrôle de sécurité — le JwtGuard authentifie
   * déjà la requête. Elle rappelait Supabase admin à chaque chargement de page.
   * Cache mémoire ≤ 30 s, clé userId, jamais sur un échec, purgé à la
   * déconnexion. Les gardes d'autorisation appellent `getSession` SANS cache.
   */
  async getSessionCached(userId: string): Promise<Result<{ user: SessionUser }, AuthFailure>> {
    const hit = this.sessionCache.get(userId)
    if (hit && Date.now() - hit.at < SESSION_CACHE_TTL_MS) return success({ user: hit.user })
    const result = await this.getSession(userId)
    if (result.type === 'success') {
      if (this.sessionCache.size >= SESSION_CACHE_MAX) this.sessionCache.clear()
      this.sessionCache.set(userId, { at: Date.now(), user: result.output.user })
    }
    return result
  }

  invalidateSession(userId: string): void {
    this.sessionCache.delete(userId)
  }

  async getLifecycleState(userId: string): Promise<SessionLifecycleState> {
    // perf P3 — trois lectures indépendantes : en parallèle, pas en série.
    const [authUser, profileSnapshot, accountsCount] = await Promise.all([
      this.gateway.findUserById(userId),
      this.profileContext.getMe(userId),
      this.accounts.count({ where: { user_id: userId } }),
    ])

    const isFirstSession = withinFirstSessionWindow(authUser?.created_at ?? null, authUser?.last_sign_in_at ?? null)
    const hasLaunchedAnalysis = accountsCount > 0
    const hasGeneratedProfile = profileSnapshot.status === 'succeeded'
    const welcomePhrase = profileSnapshot.profile_context?.bellumPhrases?.welcome ?? null
    const shouldShowWelcome = !hasLaunchedAnalysis && Boolean(welcomePhrase)

    return {
      is_first_session: isFirstSession,
      has_launched_analysis: hasLaunchedAnalysis,
      has_generated_profile: hasGeneratedProfile,
      welcome_phrase: welcomePhrase,
      should_show_welcome: shouldShowWelcome,
    }
  }
}

/**
 * Le fournisseur n'a pas pu trancher : réseau (statut 0), 429, 5xx, ou un corps
 * illisible (sans statut). Seul un 4xx explicite — jeton déjà utilisé,
 * introuvable — est un verdict sur le jeton.
 */
function isProviderOutage(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true
  const status: unknown = (error as { status?: unknown } | null)?.status
  if (typeof status !== 'number') return true
  return status === 0 || status === 429 || status >= 500
}

function withinFirstSessionWindow(createdAt: string | null, lastSignInAt: string | null): boolean {
  if (!createdAt) return false
  if (!lastSignInAt) return true
  const delta = Math.abs(new Date(lastSignInAt).getTime() - new Date(createdAt).getTime())
  return delta <= FIRST_SESSION_WINDOW_MS
}
