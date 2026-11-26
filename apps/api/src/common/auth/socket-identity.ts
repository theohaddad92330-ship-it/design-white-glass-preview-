import type { Logger } from '@nestjs/common'
import passport from 'passport'
import type { Server, Socket } from 'socket.io'
import { SESSION_SCOPE_HEADER } from './scoped-session-cookie'

/**
 * L'identité d'un socket — QUI EST-CE ?, décidé une fois, à la connexion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux passerelles Socket.IO (analyse, profileur) n'avaient AUCUN contrôle
 * d'identité : ni garde, ni `handleConnection`, ni intercepteur. Le seul filtre
 * était le CORS de la poignée de main — qui borne les origines d'un NAVIGATEUR
 * et ne dit rien d'un client écrit à la main. Chaque salle était donc désignée
 * par un identifiant venu du MESSAGE du client : nommer celui d'un autre
 * suffisait à entrer dans sa salle et à s'y faire rejouer son tampon.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX GESTES, PAS UN
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Qui es-tu ?** — ici, à la connexion, UNE fois. Le jeton, jamais le corps
 *     du message. Un socket qui ne le prouve pas n'entre pas dans le namespace :
 *     on retire le MOYEN (il ne peut pas même émettre `join`), pas seulement la
 *     permission de recevoir.
 *  2. **As-tu le droit d'entrer dans CETTE salle ?** — chez chaque passerelle,
 *     à chaque `join`, contre l'identité posée ici (voir {@link socketPrincipal}).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PASSPORT PLUTÔT QU'UNE VÉRIFICATION RECOPIÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * La vérification d'un jeton Supabase n'est pas une ligne : algorithmes
 * autorisés (HS256 + ES256/RS256 via JWKS, `alg: none` bloqué), audience
 * épinglée pour rejeter un jeton `service_role`, extraction depuis le cookie
 * `session:{userId}` propre à chaque identité. Tout cela vit déjà dans
 * `JwtStrategy` / `ImpersonationStrategy`. Les recopier ici créerait un second
 * réglage qui divergerait au premier changement — c'est exactement ce que la
 * loi « un réglage vit à un seul endroit » interdit.
 *
 * On rejoue donc les stratégies DÉJÀ ENREGISTRÉES sur le singleton passport
 * (`AuthModule` les instancie au démarrage), en leur présentant une requête
 * reconstruite depuis la poignée de main. Corollaire volontaire : si aucune
 * stratégie n'est enregistrée, tout est refusé — on échoue FERMÉ.
 */

/** L'identité rendue par les stratégies passport de l'API. */
type SocketPrincipal = { userId: string; email: string; impersonation?: boolean }

/**
 * Les stratégies essayées, dans l'ordre de `JwtGuard` : une incarnation active
 * l'emporte sur une session normale restée dans le même navigateur.
 */
const STRATEGIES = ['impersonation', 'jwt'] as const

/** Ce que passport lit d'une requête — rien d'autre n'est nécessaire ici. */
type HandshakeRequest = { headers: Record<string, unknown>; cookies: Record<string, string> }

/** La signature de l'intergiciel rendu par `passport.authenticate`, réduite à
 *  ce que le rappel personnalisé laisse réellement utiliser. */
type PassportHandler = (request: HandshakeRequest, response: object, next: (error?: unknown) => void) => void

/** Ce que Socket.IO expose d'une poignée de main et qui nous intéresse. */
type Handshake = { headers?: Record<string, unknown>; auth?: Record<string, unknown> }

/**
 * Découpe un en-tête `Cookie` brut comme le fait `cookie-parser` côté HTTP :
 * premier nom gagnant, valeur dé-encodée quand elle l'est.
 *
 * Écrit ici plutôt qu'importé : la poignée de main Socket.IO ne passe pas par
 * la chaîne de middlewares Express, donc `req.cookies` n'existe pas — et
 * ajouter une dépendance pour huit lignes coûterait plus que ces huit lignes.
 */
function parseCookieHeader(header: unknown): Record<string, string> {
  const parsed: Record<string, string> = {}
  if (typeof header !== 'string' || header.length === 0) return parsed
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const name = part.slice(0, separator).trim()
    if (!name || name in parsed) continue
    let value = part.slice(separator + 1).trim()
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    try {
      value = decodeURIComponent(value)
    } catch {
      // Valeur non encodée : on garde le brut, comme cookie-parser.
    }
    parsed[name] = value
  }
  return parsed
}

/**
 * Reconstruit, depuis la poignée de main, la requête que les stratégies savent
 * lire — et RIEN de plus. Trois sources, toutes déjà supportées côté HTTP :
 *
 *  - `auth.token` : le porteur explicite (client hors navigateur, test, mobile) ;
 *  - l'en-tête `Authorization` de la poignée de main, même rôle ;
 *  - les cookies que le navigateur joint à la poignée de main — c'est LE chemin
 *    du SPA, dont le jeton est `HttpOnly` et donc illisible en JavaScript.
 *
 * `auth.userId` ne fait que DÉSIGNER lequel des cookies déjà détenus lire (même
 * rôle que l'en-tête {@link SESSION_SCOPE_HEADER} côté HTTP, que la poignée de
 * main d'un WebSocket ne peut pas porter). Il n'accorde rien : sans le cookie
 * correspondant, la lecture rend `null` et la connexion est refusée.
 */
function buildHandshakeRequest(handshake: Handshake | undefined): HandshakeRequest {
  const headers: Record<string, unknown> = { ...(handshake?.headers ?? {}) }
  const auth = handshake?.auth ?? {}

  const token = auth['token']
  if (typeof token === 'string' && token.length > 0) headers['authorization'] = `Bearer ${token}`

  const declared = auth['userId']
  if (typeof declared === 'string' && declared.length > 0) headers[SESSION_SCOPE_HEADER] = declared

  return { headers, cookies: parseCookieHeader(headers['cookie']) }
}

/**
 * Rejoue UNE stratégie passport déjà enregistrée sur la requête reconstruite.
 *
 * Le rappel personnalisé court-circuite tout ce que passport ferait d'une
 * réponse HTTP (redirection, `WWW-Authenticate`, session) : la stratégie appelle
 * `success` / `fail` / `error`, on ne lit que ça. Toute autre issue — stratégie
 * inconnue, exception — rend `null` : on échoue FERMÉ.
 */
function runStrategy(name: string, request: HandshakeRequest): Promise<SocketPrincipal | null> {
  return new Promise(resolve => {
    let settled = false
    const settle = (principal: SocketPrincipal | null): void => {
      if (settled) return
      settled = true
      resolve(principal)
    }
    try {
      const authenticate = passport.authenticate(name, { session: false }, (error: unknown, user: unknown) => {
        settle(error || !user ? null : (user as SocketPrincipal))
      })
      // `passport.authenticate` est typé pour Express ; on ne lui présente que
      // ce que les stratégies lisent — en-têtes et cookies. Le rappel ci-dessus
      // court-circuite tout usage de la réponse.
      const handler = authenticate as unknown as PassportHandler
      handler(request, {}, () => settle(null))
    } catch {
      settle(null)
    }
  })
}

/** L'identité prouvée par la poignée de main, ou `null` si elle ne prouve rien. */
async function authenticateHandshake(handshake: Handshake | undefined): Promise<SocketPrincipal | null> {
  const request = buildHandshakeRequest(handshake)
  for (const strategy of STRATEGIES) {
    const principal = await runStrategy(strategy, request)
    if (principal?.userId) return principal
  }
  return null
}

/** Où l'intercepteur range l'identité, et où les passerelles la relisent. */
const PRINCIPAL_KEY = 'user'

/**
 * L'identité prouvée à la connexion de CE socket, ou `null`.
 *
 * C'est la seule source d'identité qu'une passerelle doit lire. Le corps d'un
 * message n'en est jamais une : il est écrit par celui qui l'envoie.
 */
export function socketPrincipal(client: Socket): SocketPrincipal | null {
  const data = (client as { data?: Record<string, unknown> }).data
  const principal = data?.[PRINCIPAL_KEY] as SocketPrincipal | undefined
  return principal?.userId ? principal : null
}

/**
 * Les serveurs Socket.IO qui portent déjà l'intercepteur.
 *
 * Même raison que {@link attachRedisAdapterOnce} : les deux passerelles
 * partagent UN serveur (même port, namespace par défaut), et chacune appelle
 * cette fonction depuis son `afterInit` — règle n°7 du dépôt, retirer un module
 * ne doit pas faire disparaître silencieusement l'authentification. Seul le
 * premier appelant monte l'intercepteur ; un second le ferait tourner deux fois
 * par connexion.
 */
const authenticatedServers = new WeakSet<Server>()

/**
 * Monte l'authentification de connexion sur le serveur Socket.IO partagé.
 *
 * Refuser ici, et pas dans les gestionnaires de message, est délibéré : un
 * refus d'intercepteur empêche le socket d'ENTRER dans le namespace. Il ne peut
 * donc émettre aucun `join` — la porte est fermée, pas seulement la boîte aux
 * lettres. Le client reçoit un `connect_error` et ne réessaie pas en boucle.
 */
export function attachSocketAuthOnce(server: Server, logger: Logger): void {
  if (authenticatedServers.has(server)) return
  authenticatedServers.add(server)

  server.use((socket: Socket, next: (err?: Error) => void) => {
    void authenticateHandshake((socket as { handshake?: Handshake }).handshake)
      .then(principal => {
        if (!principal) {
          logger.warn('Connexion Socket.IO refusée : la poignée de main ne prouve aucune identité')
          next(new Error('Authentification requise'))
          return
        }
        const data = (socket as { data?: Record<string, unknown> }).data
        if (data) data[PRINCIPAL_KEY] = principal
        next()
      })
      .catch((error: unknown) => {
        // Échec FERMÉ : une panne de vérification n'ouvre pas la porte.
        logger.error('Échec de la vérification du jeton Socket.IO', {
          error: error instanceof Error ? error : new Error(String(error)),
        })
        next(new Error('Authentification requise'))
      })
  })
}
