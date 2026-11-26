import type { ProfilerErrorPayload, ProfilerFieldEvent, ProfilerSocketPayload } from '@bellum/contracts'
import { UNIVERSAL_IMPORT_SOCKET_EVENTS, profilerSocketEvents, type UniversalImportJobState } from '@bellum/contracts'
import { readTabIdentity } from '@/features/auth/tab-identity'
import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/**
 * Single shared Socket.IO connection. Never destroyed — disconnecting and
 * recreating would drop the listener registrations everything relies on.
 * Call the unsubscribe returned by ``subscribeToAccount`` to stop watching
 * one account's events without tearing the connection.
 */
let socket: Socket | null = null
const joinedRooms = new Set<string>()

/**
 * La connexion PROUVE désormais son identité : l'API refuse une poignée de
 * main qui n'apporte aucune preuve (les deux passerelles n'authentifiaient
 * personne — n'importe quel client pouvait écouter les analyses d'un autre).
 *
 * Le jeton d'accès vit dans un cookie `HttpOnly` : illisible en JavaScript, et
 * c'est voulu. On ne peut donc PAS le poser dans `auth`. Ce qu'on peut, et ce
 * qui suffit : laisser le navigateur joindre ses cookies à la poignée de main
 * (`withCredentials`) et DIRE lequel lire.
 *
 * `auth.userId` est le pendant WebSocket de l'en-tête `X-Bellum-User` que
 * chaque requête HTTP porte déjà : une poignée de main WebSocket ne peut pas
 * porter d'en-tête personnalisé. Il n'accorde rien — c'est un identifiant
 * public qui désigne lequel des cookies déjà détenus par ce navigateur doit
 * être lu, et sans ce cookie l'API refuse. Sans lui, un navigateur portant
 * deux identités (la démonstration à côté d'un vrai compte) verrait le serveur
 * prendre « le premier cookie venu » — exactement le mélange que
 * `tab-identity.ts` a supprimé côté HTTP.
 *
 * `auth` est une FONCTION : elle est rappelée à chaque (re)connexion, donc une
 * identité connue après la création du singleton est bien envoyée.
 */
function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket'],
      withCredentials: true,
      auth: cb => cb({ userId: readTabIdentity() ?? undefined }),
    })
    wireRejoin(socket)
  }
  return socket
}

/**
 * Re-déclare les salles à chaque connexion.
 *
 * Socket.IO ne rejoue pas les `join` après une reconnexion : les salles vivent
 * côté serveur, attachées au socket qui vient de mourir. Le client se croyait
 * donc dans une salle qu'il ne tenait plus, et la barre de progression restait
 * figée pour toujours. Ça ne se voyait presque jamais avant ; ça se verrait
 * désormais à chaque session rafraîchie (un jeton expiré fait refuser la
 * poignée de main, la suivante repart d'un socket neuf).
 */
function wireRejoin(s: Socket): void {
  s.on('connect', () => {
    for (const accountId of joinedRooms) s.emit('join', accountId)
    for (const userId of profilerRooms) s.emit(profilerSocketEvents.join, userId)
    for (const jobId of importHandlers.keys()) s.emit(UNIVERSAL_IMPORT_SOCKET_EVENTS.join, jobId)
    // #3666 — rejoindre la salle ne rejoue RIEN : l'événement de fin émis
    // pendant la déconnexion est perdu. Ceux qui tiennent l'état réel (le
    // filet `useAnalysisStatusSync`) le relisent à chaque connexion.
    for (const listener of connectListeners) listener()
  })
}

const connectListeners = new Set<() => void>()

/** Prévient à chaque (re)connexion du socket partagé ; renvoie le désabonnement. */
export function onSocketConnect(listener: () => void): () => void {
  connectListeners.add(listener)
  return () => {
    connectListeners.delete(listener)
  }
}

/**
 * Analysis events the backend gateway emits. Every payload carries an
 * ``accountId`` (the Socket.IO room key) and a ``jobId`` (the BullMQ handle,
 * useful for cancel/status calls). The central dispatcher routes each event
 * to the right per-account handler set so two simultaneous analyses never
 * collide on the shared socket.
 */
type AnalysisEvent =
  | 'phase:started'
  | 'phase:progress'
  | 'phase:complete'
  | 'analysis:done'
  | 'analysis:error'
  | 'analysis:retry'
  | 'analysis:degraded'

type AnalysisEventPayload = { accountId: string; jobId: string } & Record<string, unknown>
type AccountHandler = (payload: AnalysisEventPayload) => void

/**
 * Per-account handler registry. Outer key is the event name, inner key the
 * accountId — both isolated so unsubscribing one account never affects another.
 */
const accountHandlers: Record<AnalysisEvent, Map<string, Set<AccountHandler>>> = {
  'phase:started': new Map(),
  'phase:progress': new Map(),
  'phase:complete': new Map(),
  'analysis:done': new Map(),
  'analysis:error': new Map(),
  'analysis:retry': new Map(),
  'analysis:degraded': new Map(),
}

const ANALYSIS_EVENTS = Object.keys(accountHandlers) as AnalysisEvent[]

/**
 * One central listener per event, dispatching to the per-account handler
 * keyed by ``payload.accountId``. Idempotent: wiring happens once for the
 * lifetime of the singleton socket so subsequent subscribes don't stack new
 * listeners on top of old ones.
 */
let dispatcherWired = false
function wireDispatcher(s: Socket): void {
  if (dispatcherWired) return
  dispatcherWired = true
  for (const event of ANALYSIS_EVENTS) {
    s.on(event, (payload: AnalysisEventPayload) => {
      const handlers = accountHandlers[event].get(payload?.accountId)
      if (!handlers) return
      for (const handler of handlers) handler(payload)
    })
  }
}

/**
 * Subscribe handlers to a specific account's analysis events. Returns an
 * ``unsubscribe`` callback that removes only this account's handlers — it
 * never touches another account that is still in flight. Joining the room
 * is idempotent so calling this twice with the same accountId is safe.
 */
export function subscribeToAccount(
  accountId: string,
  handlers: Partial<Record<AnalysisEvent, AccountHandler>>,
): () => void {
  const s = getSocket()
  if (!s.connected && !s.active) s.connect()
  wireDispatcher(s)
  if (!joinedRooms.has(accountId)) {
    s.emit('join', accountId)
    joinedRooms.add(accountId)
    // #3666.8 — rejoindre ne rejoue RIEN : ce qui s'est émis tant que la salle
    // était quittée est perdu. Socket déjà connecté = aucun `connect` à venir,
    // donc on relit l'état réel ici ; sinon c'est le `connect` qui s'en charge.
    if (s.connected) for (const listener of connectListeners) listener()
  }
  for (const event of ANALYSIS_EVENTS) {
    const cb = handlers[event]
    if (!cb) continue
    const perAccount = accountHandlers[event].get(accountId) ?? new Set<AccountHandler>()
    perAccount.add(cb)
    accountHandlers[event].set(accountId, perAccount)
  }
  return () => {
    for (const event of ANALYSIS_EVENTS) {
      const cb = handlers[event]
      if (!cb) continue
      const perAccount = accountHandlers[event].get(accountId)
      if (!perAccount) continue
      perAccount.delete(cb)
      if (perAccount.size === 0) accountHandlers[event].delete(accountId)
    }
    const stillObserved = ANALYSIS_EVENTS.some(event => (accountHandlers[event].get(accountId)?.size ?? 0) > 0)
    if (joinedRooms.has(accountId) && !stillObserved) {
      s.emit('leave', accountId)
      joinedRooms.delete(accountId)
    }
    // Disconnect only when nothing else is watching — keeps the singleton
    // alive for the next consumer.
    if (joinedRooms.size === 0 && profilerRooms.size === 0 && importHandlers.size === 0 && s.connected) {
      s.disconnect()
    }
  }
}

type ProfilerEventName =
  | 'profiler:phase:started'
  | 'profiler:phase:complete'
  | 'profiler:field:emitted'
  | 'profiler:done'
  | 'profiler:error'

type ProfilerHandlers = {
  onPhaseStarted?: (payload: ProfilerSocketPayload) => void
  onPhaseComplete?: (payload: ProfilerSocketPayload) => void
  onField?: (payload: ProfilerFieldEvent) => void
  onDone?: (payload: { userId: string }) => void
  onError?: (payload: ProfilerErrorPayload) => void
}

const profilerRooms = new Set<string>()
const profilerHandlers = new Map<string, Set<ProfilerHandlers>>()
let profilerDispatcherWired = false

function wireProfilerDispatcher(s: Socket): void {
  if (profilerDispatcherWired) return
  profilerDispatcherWired = true
  const route = <T extends { userId: string }>(
    event: ProfilerEventName,
    handler: (h: ProfilerHandlers) => ((p: T) => void) | undefined,
  ) => {
    s.on(event, (payload: T) => {
      const handlers = profilerHandlers.get(payload?.userId)
      if (!handlers) return
      for (const set of handlers) handler(set)?.(payload)
    })
  }
  route<ProfilerSocketPayload>(profilerSocketEvents.phaseStarted, h => h.onPhaseStarted)
  route<ProfilerSocketPayload>(profilerSocketEvents.phaseComplete, h => h.onPhaseComplete)
  route<ProfilerFieldEvent>(profilerSocketEvents.fieldEmitted, h => h.onField)
  route<{ userId: string }>(profilerSocketEvents.done, h => h.onDone)
  route<ProfilerErrorPayload>(profilerSocketEvents.error, h => h.onError)
}

export function subscribeToProfiler(userId: string, handlers: ProfilerHandlers): () => void {
  const s = getSocket()
  if (!s.connected && !s.active) s.connect()
  wireProfilerDispatcher(s)
  if (!profilerRooms.has(userId)) {
    s.emit(profilerSocketEvents.join, userId)
    profilerRooms.add(userId)
  }
  const perUser = profilerHandlers.get(userId) ?? new Set<ProfilerHandlers>()
  perUser.add(handlers)
  profilerHandlers.set(userId, perUser)
  return () => {
    const set = profilerHandlers.get(userId)
    if (set) {
      set.delete(handlers)
      if (set.size === 0) profilerHandlers.delete(userId)
    }
    if (profilerRooms.has(userId) && !(profilerHandlers.get(userId)?.size ?? 0)) {
      s.emit(profilerSocketEvents.leave, userId)
      profilerRooms.delete(userId)
    }
    if (joinedRooms.size === 0 && profilerRooms.size === 0 && importHandlers.size === 0 && s.connected) {
      s.disconnect()
    }
  }
}

/* -------------------------------------------------------------------- */
/*  Import universel — la progression d'un job                          */
/* -------------------------------------------------------------------- */

type ImportProgressHandler = (state: UniversalImportJobState) => void

/** Les abonnés par job — `wireRejoin` relit ses clés à chaque reconnexion. */
const importHandlers = new Map<string, Set<ImportProgressHandler>>()
let importDispatcherWired = false

/**
 * S'abonne à la progression d'UN job d'import universel. Le serveur n'ouvre la
 * salle qu'à un membre de l'espace du job ; un refus laisse l'écran sur sa
 * lecture HTTP périodique, jamais sur une barre figée.
 */
export function subscribeToImportJob(jobId: string, onProgress: ImportProgressHandler): () => void {
  const s = getSocket()
  if (!s.connected && !s.active) s.connect()
  if (!importDispatcherWired) {
    importDispatcherWired = true
    s.on(UNIVERSAL_IMPORT_SOCKET_EVENTS.progress, (state: UniversalImportJobState) => {
      for (const handler of importHandlers.get(state?.id) ?? []) handler(state)
    })
  }
  const handlers = importHandlers.get(jobId) ?? new Set<ImportProgressHandler>()
  if (handlers.size === 0) s.emit(UNIVERSAL_IMPORT_SOCKET_EVENTS.join, jobId)
  handlers.add(onProgress)
  importHandlers.set(jobId, handlers)
  return () => {
    handlers.delete(onProgress)
    if (handlers.size > 0) return
    importHandlers.delete(jobId)
    s.emit(UNIVERSAL_IMPORT_SOCKET_EVENTS.leave, jobId)
    if (joinedRooms.size === 0 && profilerRooms.size === 0 && importHandlers.size === 0 && s.connected) s.disconnect()
  }
}
