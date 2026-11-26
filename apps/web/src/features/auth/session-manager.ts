import { SESSION_REVOKED_CODE, type AuthOutcome, type SessionResponse, type SessionUser } from '@bellum/contracts'
import { setAuthExpiredHandler } from '@/lib/api'
import { sessionIsDead } from '@/lib/api-error'
import { clearClientUserState } from './clear-client-user-state'
import { beginVoluntaryExit, endVoluntaryExit } from './lib/pre-login-target'
import { forgetVoluntarySignOut, hasVoluntarySignOut, markVoluntarySignOut } from './voluntary-sign-out'
import { sharedAccessExpiry } from './cross-tab-refresh'
import { authApi } from './api'
import { forgetTabDemoFlag, isTabDemo } from './demo-tab'
import { hasLoggedInCookie } from './logged-in-cookie'
import { forgetTabIdentity, readTabIdentity, rememberTabIdentity } from './tab-identity'

type SessionState = {
  user: SessionUser | null
  loading: boolean
  /** Le serveur n'a pas pu répondre (429, 5xx, réseau). « On ne sait pas » —
   *  à distinguer de `user: null`, qui affirme « pas de session ». Sans cette
   *  distinction, un 429 pendant une analyse renvoyait le commercial sur
   *  `/login` avec son crédit débité. */
  sessionUnavailable: boolean
  /** R15-7 (15/09/2026) : cet appareil a été RÉVOQUÉ (plafond d'appareils, ou
   *  déconnecté depuis un autre). L'avis bloquant le dit et propose de se
   *  reconnecter — sans lui, l'onglet restait une coquille vide. */
  sessionRevoked: boolean
}

/** La requête a été refusée parce que l'appareil est révoqué (code machine). */
function isRevocation(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === SESSION_REVOKED_CODE
}

type Listener = (state: SessionState) => void

/** Safety margin before `expires_at` to fire the proactive refresh.
 *  60 s covers small clock skews without being chatty. */
const RENEWAL_LEAD_MS = 60 * 1000

/** Échéance de l'access INCONNUE (démarrage par `/auth/session`, message d'un
 *  onglet d'une version antérieure) : renouveler au plus tard dans 50 min, sous
 *  l'heure par défaut de Supabase. L'ancienne hypothèse — « 24 h pleines » —
 *  laissait un access d'une heure expirer sans que le réveil ne le voie. */
const UNKNOWN_EXPIRY_RENEWAL_MS = 50 * 60 * 1000

/** Un renouvellement en panne (réseau, 5xx) se retente — la session est gardée. */
const RENEWAL_RETRY_MS = 30 * 1000

/** #3511 — en démonstration, un battement toutes les 10 min tant que l'onglet est
 *  visible : il re-date le bail de la salle (30 min) et renouvelle la session,
 *  la démo tient donc aussi longtemps que la personne navigue. */
const DEMO_KEEPALIVE_MS = 10 * 60 * 1000

/** Plafond d'un `setTimeout` (2^31 - 1 ms) : au-delà, il se déclencherait tout de suite. */
const MAX_TIMER_DELAY_MS = 2_147_483_647

/** Name of the `BroadcastChannel` that synchronises refreshes between
 *  tabs. Without it, two tabs would refresh in parallel — Supabase
 *  rotates the refresh token, so the second one uses an invalidated
 *  token and the user gets kicked out. */
const AUTH_CHANNEL_NAME = 'bellum:auth'

/** Un échec qui ne dit RIEN de la session : quota (429), panne (5xx), réseau
 *  coupé. Seuls 401/403 signifient « ces jetons ne valent plus rien ». */
function isServerUnavailable(error: unknown): boolean {
  // On lit le `status` plutôt que `instanceof ApiError` : le rechargement de
  // modules (tests, code splitting) peut faire coexister deux définitions de la
  // classe, et l'identité échouerait là où le statut, lui, reste vrai.
  const status: unknown = (error as { status?: unknown } | null | undefined)?.status
  if (typeof status === 'number') return !sessionIsDead(status)
  // Pas de statut du tout = la requête n'a jamais abouti (TypeError: Failed to
  // fetch). Un serveur muet n'invalide pas une session.
  return true
}

/** Délais des rejeux du démarrage quand le serveur n'a pas répondu (#3243). */
const BOOT_RETRY_DELAYS_MS = [3_000, 10_000, 30_000] as const

type AuthBroadcastMessage =
  | { type: 'session-applied'; user: SessionUser; expires_at: number | null }
  /** `userId` : QUI se déconnecte. Absent d'un onglet resté sur une version
   *  antérieure — on retombe alors sur l'ancien comportement (tout le monde se
   *  déconnecte), plutôt que d'ignorer une déconnexion réelle. */
  | { type: 'session-cleared'; userId?: string | null }

/**
 * Source of truth for the auth session in the browser. Tokens never
 * touch JS — both `session:{userId}` (access) and `uploadsSig:{userId}`
 * (refresh) live in HttpOnly cookies set by the API and travel with
 * every request via `credentials: 'include'`. This manager only tracks
 * the user payload so React can render conditional UI.
 *
 * Refresh is handled in three places — session tenue 24 h (15/09/2026) :
 *  1. **Boot** — `loadSession()` tries `/auth/session` (warm cookie),
 *     falls back to `/auth/refresh` on 401 (access cookie absent or expired,
 *     `loggedIn` + refresh still there).
 *  2. **Proactive** — a due date ~60 s before `expires_at`, checked against the
 *     WALL CLOCK by a timer AND on every wake signal (`visibilitychange`,
 *     `focus`, `online`, `pageshow`). A timer alone does not survive a Mac
 *     asleep all night: it simply never runs.
 *  3. **Reactive** — `apiFetch` retries on 401 via `refreshTokensOnce`.
 *
 * Every refresh goes through ONE door (`refreshSessionShared`): single-flight
 * inside the tab and across tabs. A network error, a timeout or a 5xx never
 * logs out — only a real refusal does.
 *
 * Multi-tab: a `BroadcastChannel` shares successful refreshes so other
 * tabs adopt the up-to-date user without their own re-fetch.
 */
class SessionManager {
  private state: SessionState = {
    user: null,
    loading: true,
    sessionUnavailable: false,
    sessionRevoked: false,
  }
  /** L'avis de révocation a été acquitté (« Me reconnecter ») : il ne revient
   *  pas avant qu'une nouvelle session soit appliquée. */
  private revocationAcknowledged = false
  private listeners = new Set<Listener>()
  private loaded = false
  private renewalTimer: ReturnType<typeof setTimeout> | null = null
  private demoKeepalive: ReturnType<typeof setInterval> | null = null
  private renewalDueAt: number | null = null
  private renewing: Promise<void> | null = null
  private lastRenewalAt = 0
  private channel: BroadcastChannel | null = null

  constructor() {
    // When `apiFetch` detects that `/auth/refresh` failed, we clear the
    // React state so the router redirects to `/login` on the next render.
    setAuthExpiredHandler(reason => (reason === SESSION_REVOKED_CODE ? this.revoke() : this.clear()))

    if (typeof window !== 'undefined') {
      // Rattrapage au réveil : le minuteur a pu ne jamais tourner (veille,
      // onglet gelé). Chaque signal relit l'horloge murale.
      document.addEventListener('visibilitychange', this.handleWake)
      window.addEventListener('focus', this.handleWake)
      window.addEventListener('online', this.handleWake)
      window.addEventListener('pageshow', this.handleWake)

      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel(AUTH_CHANNEL_NAME)
        this.channel.addEventListener('message', this.handleBroadcast)
      }
    }
  }

  getState(): SessionState {
    return this.state
  }

  /** Resolves once the boot-time session probe has settled, so route
   *  guards can read a stable `user` instead of racing `loading`. */
  async ensureLoaded(): Promise<SessionState> {
    if (!this.state.loading) return this.state
    return new Promise<SessionState>(resolve => {
      const unsub = this.subscribe(state => {
        if (!state.loading) {
          unsub()
          resolve(state)
        }
      })
    })
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async loadSession(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    // Fast path — the JS-readable `loggedIn:` sentinel is present, so a warm
    // access cookie is likely: probe `/auth/session`, only refreshing if it 401s.
    const hasToken = hasLoggedInCookie()
    if (hasToken) {
      try {
        const { user } = await authApi.session()
        rememberTabIdentity(user.id)
        this.setState({ user, loading: false, sessionUnavailable: false, sessionRevoked: false })
        // `/auth/session` ne rend pas `expires_at` : on prend celle du dernier
        // renouvellement connu (tous onglets confondus), sinon une échéance
        // prudente. Supposer « 24 h pleines » laissait expirer un access d'1 h.
        this.scheduleRenewal(null)
        return
      } catch (error) {
        // Le serveur est injoignable : on ne conclut rien et on n'essaie même
        // pas le refresh — il échouerait pour la même raison, et son échec
        // serait lu comme une session morte.
        if (isServerUnavailable(error)) {
          this.markUnavailable()
          return
        }
        // Access cookie expired or missing — fall through to a silent refresh.
      }
    }

    // No readable sentinel (anonymous visitor) OR the access probe above failed.
    // Crucially, when the API lives on a cross-site host the `loggedIn:` sentinel
    // is written on the API's domain and is UNREADABLE by this SPA — so a valid
    // session would look "logged out" and the user got kicked on every hard
    // reload (see refresh-cookie.interceptor). We instead attempt ONE silent
    // `/auth/refresh`: the HttpOnly refresh cookie travels cross-site regardless
    // of the sentinel, so it restores a real session when one exists and cleanly
    // clears (→ redirect to /login) for a genuinely anonymous visitor. The proper
    // fix is still COOKIE_DOMAIN (makes the sentinel readable + shared); this is a
    // belt-and-suspenders that costs one extra 401 for true anonymous first-loads.
    try {
      const session = await authApi.refresh()
      this.applySession(session)
    } catch (error) {
      // Seule une session RÉELLEMENT invalide justifie de purger l'état client.
      if (isServerUnavailable(error)) {
        // #3573 — sans jeton lisible, un refresh muet ne justifie PAS de retenir
        // les gardes (visiteur anonyme + API absente = /login attendu, jamais
        // une attente infinie). Avec jeton, on reste en « indisponible ».
        this.markUnavailable(!hasToken)
        return
      }
      this.endSession(error)
    }
  }

  /** Serveur indisponible : on ne purge rien, et on rouvre `loadSession` pour
   *  que la navigation suivante retente au lieu de rester sur un verdict pris
   *  pendant une panne. */
  private markUnavailable(anonymous = false): void {
    this.loaded = false
    this.setState({ ...this.state, loading: false, sessionUnavailable: !anonymous })
    this.scheduleBootRetry()
  }

  /** #3243 (régression 03/10) — `loadSession` n'était rejoué par PERSONNE : un
   *  « Failed to fetch » au démarrage laissait l'onglet sans utilisateur, et
   *  chaque garde d'écran le lisait comme « déconnecté » → /login, session
   *  intacte côté serveur. On rejoue donc le démarrage (3 s, 10 s, 30 s), et à
   *  chaque réveil (`online`, `focus`…). Un vrai refus arrête tout. */
  private bootRetries = 0
  private bootRetryTimer: ReturnType<typeof setTimeout> | null = null

  private scheduleBootRetry(): void {
    if (this.state.user || this.bootRetryTimer) return
    // R38 (16/10) — en démonstration, « La démo se prépare » n'a pas de fin à deviner : après les trois essais,
    // la session REPREND toute seule, toutes les 30 s, tant que la salle ne répond pas — jamais un rechargement
    // manuel. Hors démo, la règle d'origine tient : trois essais puis les réveils (`online`, `focus`).
    const exhausted = this.bootRetries >= BOOT_RETRY_DELAYS_MS.length
    if (exhausted && !isTabDemo()) return
    const delay = BOOT_RETRY_DELAYS_MS[Math.min(this.bootRetries, BOOT_RETRY_DELAYS_MS.length - 1)]!
    this.bootRetries += 1
    this.bootRetryTimer = setTimeout(() => {
      this.bootRetryTimer = null
      void this.retryBoot()
    }, delay)
  }

  private async retryBoot(): Promise<void> {
    if (this.state.user) return
    await this.loadSession()
  }

  async login(email: string, password: string): Promise<AuthOutcome> {
    const outcome = await authApi.login(email, password)
    if (outcome.status === 'authenticated') {
      this.applySession(outcome.session)
    }
    return outcome
  }

  /** Passwordless login step 1 — request an email code for an existing account. */
  async requestOtp(email: string): Promise<void> {
    await authApi.requestOtp(email)
  }

  /** Passwordless login step 2 — verify the email code. On `authenticated` the
   *  session is applied exactly like a password login; `mfa_required` is handed
   *  back so the caller can show the same 2FA challenge step. */
  async verifyOtp(email: string, code: string): Promise<AuthOutcome> {
    const outcome = await authApi.verifyOtp(email, code)
    if (outcome.status === 'authenticated') {
      this.applySession(outcome.session)
    }
    return outcome
  }

  /** Completes a 2FA login: exchanges the pending `mfaToken` + code for a real
   *  session, applied exactly like a normal successful login (same cookies,
   *  same React state bootstrap, same redirect trigger). */
  async challengeMfa(mfaToken: string, code: string): Promise<void> {
    const outcome = await authApi.mfaChallenge(mfaToken, code)
    if (outcome.status === 'authenticated') {
      this.applySession(outcome.session)
    }
  }

  async signup(email: string, password: string, firstName: string, lastName?: string): Promise<AuthOutcome> {
    const outcome = await authApi.signup(email, password, firstName, lastName)
    if (outcome.status === 'authenticated') {
      this.applySession(outcome.session)
    }
    return outcome
  }

  /** Confirms a password reset and persists the returned session so the
   *  user lands authenticated, ready to be redirected to the dashboard. */
  async confirmResetPassword(tokenHash: string, password: string, expiresAt: number, signature: string): Promise<void> {
    const session = await authApi.confirmResetPassword(tokenHash, password, expiresAt, signature)
    this.applySession(session)
  }

  async refreshSession(): Promise<void> {
    try {
      const session = await authApi.refresh()
      this.applySession(session)
    } catch (error) {
      // Seule une session RÉELLEMENT invalide justifie de purger l'état client.
      if (isServerUnavailable(error)) {
        this.markUnavailable()
        return
      }
      this.endSession(error)
    }
  }

  async logout(options?: { scope?: 'tab' }): Promise<void> {
    try {
      await authApi.logout(options)
    } catch {
      // Server call may fail — clear local state anyway.
    }
    // Déconnexion EXPLICITE — la seule qui efface le marqueur de démonstration
    // (voir `demo-tab.ts`) : un `clear()` déclenché par un 401 ordinaire le
    // laisse en place, sinon `RedirectTo` ne saurait plus renvoyer un visiteur
    // de démo vers `/demo/acces` plutôt que `/login`. Couvre à la fois le
    // « Quitter » du bandeau démo et une vraie déconnexion.
    forgetTabDemoFlag()
    // 29/09/2026 — une sortie VOLONTAIRE n'est pas une révocation : la 401
    // `session_revoked` que l'ancien cookie reprend ensuite (rechargement,
    // /demo/acces) ne doit pas lever l'avis « déconnecté de cet appareil ».
    // Le repère survit au rechargement (sessionStorage) jusqu'à la prochaine
    // session appliquée. La page d'avant-sortie n'est pas retenue non plus.
    beginVoluntaryExit()
    markVoluntarySignOut()
    this.revocationAcknowledged = true
    this.clear()
  }

  async signInWithGoogle(): Promise<void> {
    const { url } = await authApi.oauthGoogleUrl()
    window.location.href = url
  }

  async handleOauthCallback(accessToken: string, refreshToken: string): Promise<void> {
    const session = await authApi.oauthCallback(accessToken, refreshToken)
    this.applySession(session)
  }

  applySession(session: Pick<SessionResponse, 'user' | 'expires_at'>): void {
    const previousUserId = this.state.user?.id ?? null
    if (previousUserId && previousUserId !== session.user.id) {
      void clearClientUserState()
    }
    // Cet onglet travaille désormais pour CETTE identité, et il le dira à chaque
    // requête — c'est ce qui empêche le serveur de lui servir le cookie d'une
    // autre session présente dans le même navigateur (DEMO-01).
    rememberTabIdentity(session.user.id)
    this.revocationAcknowledged = false
    forgetVoluntarySignOut()
    endVoluntaryExit()
    this.setState({ user: session.user, loading: false, sessionUnavailable: false, sessionRevoked: false })
    this.scheduleRenewal(session.expires_at)
    this.broadcast({ type: 'session-applied', user: session.user, expires_at: session.expires_at })
  }

  clear(): void {
    const userId = this.state.user?.id ?? readTabIdentity()
    this.cancelRenewal()
    forgetTabIdentity()
    // L'avis de révocation survit à un `clear()` ordinaire : la requête suivante
    // de l'appareil révoqué reprend une 401 et ne doit pas l'effacer.
    this.setState({ user: null, loading: false, sessionUnavailable: false, sessionRevoked: this.state.sessionRevoked })
    void clearClientUserState()
    this.broadcast({ type: 'session-cleared', userId })
  }

  /** R15-7 — l'appareil est révoqué : état d'auth vidé ET avis levé (sauf s'il
   *  vient d'être acquitté, la personne est déjà en route vers la connexion). */
  revoke(): void {
    this.clear()
    if (!this.revocationAcknowledged && !this.state.sessionRevoked && !hasVoluntarySignOut()) {
      this.setState({ ...this.state, sessionRevoked: true })
    }
  }

  /** « Me reconnecter » : l'avis se ferme et ne revient pas avant une nouvelle session. */
  acknowledgeRevocation(): void {
    this.revocationAcknowledged = true
    if (this.state.sessionRevoked) this.setState({ ...this.state, sessionRevoked: false })
  }

  /** Un refus réel : révocation (avis) ou session morte (état vidé). */
  private endSession(error: unknown): void {
    if (isRevocation(error)) this.revoke()
    else this.clear()
  }

  /* ------------------------------------------------------------------ */
  /*  Proactive refresh                                                 */
  /* ------------------------------------------------------------------ */

  /** `expiresAt` en secondes Unix ; `null` = inconnue (on lit alors la marque
   *  partagée du dernier renouvellement, sinon une échéance prudente). */
  private scheduleRenewal(expiresAt: number | null | undefined): void {
    const known = typeof expiresAt === 'number' ? expiresAt : sharedAccessExpiry()
    const dueAt = known !== null ? known * 1000 - RENEWAL_LEAD_MS : Date.now() + UNKNOWN_EXPIRY_RENEWAL_MS
    this.armRenewal(dueAt)
  }

  private armRenewal(dueAt: number): void {
    this.cancelRenewal()
    if (isTabDemo()) {
      this.demoKeepalive = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
        if (this.state.user) void this.renew()
      }, DEMO_KEEPALIVE_MS)
    }
    // Plancher après un renouvellement réussi : une échéance DÉJÀ passée à la
    // réception (horloge du poste en avance, access très court) n'enchaîne pas
    // les refresh — et, surtout, laisse un minuteur armé au lieu de n'en laisser
    // aucun pendant que le renouvellement en cours se termine.
    const effectiveDueAt = Math.max(dueAt, this.lastRenewalAt + RENEWAL_RETRY_MS)
    this.renewalDueAt = effectiveDueAt
    const delayMs = effectiveDueAt - Date.now()
    if (delayMs <= 0) {
      void this.renew()
      return
    }
    // Le minuteur n'est qu'un des déclencheurs : il relit l'horloge murale en
    // tombant, et les signaux de réveil font de même s'il n'a jamais tourné.
    this.renewalTimer = setTimeout(() => this.checkRenewal(), Math.min(delayMs, MAX_TIMER_DELAY_MS))
  }

  private cancelRenewal(): void {
    if (this.demoKeepalive !== null) {
      clearInterval(this.demoKeepalive)
      this.demoKeepalive = null
    }
    if (this.renewalTimer !== null) {
      clearTimeout(this.renewalTimer)
      this.renewalTimer = null
    }
    this.renewalDueAt = null
  }

  /** Relit l'horloge MURALE : dû → on renouvelle ; pas encore → on réarme
   *  (après une veille, le délai restant du minuteur ne veut plus rien dire). */
  private checkRenewal(): void {
    if (!this.state.user || this.renewalDueAt === null) return
    // Un autre onglet (ou la relance d'un 401) a pu renouveler sans que le canal
    // ne nous le dise : son échéance, plus lointaine, fait foi.
    const shared = sharedAccessExpiry()
    const sharedDueAt = shared !== null ? shared * 1000 - RENEWAL_LEAD_MS : null
    const dueAt = sharedDueAt !== null && sharedDueAt > this.renewalDueAt ? sharedDueAt : this.renewalDueAt
    if (Date.now() >= dueAt) {
      void this.renew()
      return
    }
    this.armRenewal(dueAt)
  }

  /** Un seul renouvellement à la fois dans l'onglet (plusieurs signaux de
   *  réveil arrivent ensemble) ; entre onglets, c'est la porte de `api.ts`. */
  private renew(): Promise<void> {
    this.renewing ??= this.runRenewal().finally(() => {
      this.renewing = null
    })
    return this.renewing
  }

  private async runRenewal(): Promise<void> {
    if (!this.state.user) return
    try {
      const session = await authApi.refresh()
      // Déconnecté pendant le vol (bouton « se déconnecter ») : ne rien ressusciter.
      if (!this.state.user) return
      this.lastRenewalAt = Date.now()
      this.applySession(session)
    } catch (error) {
      // « Un timeout n'est pas un échec » : réseau, délai, 429, 5xx ne disent
      // rien de la session. On la garde, sans bandeau, et on retente.
      if (isServerUnavailable(error)) {
        this.armRenewal(Date.now() + RENEWAL_RETRY_MS)
        return
      }
      this.endSession(error)
    }
  }

  private readonly handleWake = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (!this.state.user && this.state.sessionUnavailable) {
      void this.retryBoot()
      return
    }
    this.checkRenewal()
  }

  /* ------------------------------------------------------------------ */
  /*  Multi-tab sync                                                    */
  /* ------------------------------------------------------------------ */

  private broadcast(message: AuthBroadcastMessage): void {
    this.channel?.postMessage(message)
  }

  /**
   * Ce message concerne-t-il l'identité de CET onglet ?
   *
   * Le canal inter-onglets était adopté sans condition, et c'est la seconde
   * moitié de DEMO-01 : ouvrir la démonstration dans un onglet diffusait
   * « session appliquée : visiteur démo », et l'onglet du vrai compte, resté
   * ouvert à côté, adoptait ce visiteur — écran de démonstration compris. Un
   * onglet qui sait qui il est n'écoute plus que les messages qui le concernent.
   *
   * Un onglet qui ne sait pas encore (premier chargement) adopte, comme avant :
   * c'est ainsi qu'un onglet ouvert AVANT la connexion se synchronise.
   */
  private concernsThisTab(userId: string | null | undefined): boolean {
    const identity = readTabIdentity()
    if (!identity) return true
    if (!userId) return true
    return userId === identity
  }

  private readonly handleBroadcast = (event: MessageEvent<AuthBroadcastMessage>): void => {
    const msg = event.data
    if (msg.type === 'session-applied') {
      if (!this.concernsThisTab(msg.user.id)) return
      // Another tab refreshed — adopt the new user without firing our
      // own `/auth/refresh` (the refresh token has already been rotated).
      rememberTabIdentity(msg.user.id)
      this.setState({ user: msg.user, loading: false, sessionUnavailable: false, sessionRevoked: false })
      this.scheduleRenewal(msg.expires_at)
    } else if (msg.type === 'session-cleared') {
      if (!this.concernsThisTab(msg.userId)) return
      this.cancelRenewal()
      forgetTabIdentity()
      this.setState({ ...this.state, user: null, loading: false, sessionUnavailable: false })
      void clearClientUserState()
    }
  }

  private setState(next: SessionState) {
    this.state = next
    for (const listener of this.listeners) {
      listener(next)
    }
  }
}

export const sessionManager = new SessionManager()
