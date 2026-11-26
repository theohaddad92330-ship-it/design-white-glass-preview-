import type {
  ChatResearchMode,
  ChatScopeObject,
  LauraContextMode,
  LauraPageContext,
  ToolFamily,
  FollowUpRef,
  ReplyTransformRequest,
} from '@bellum/contracts'
import { refreshTokensOnce } from '@/lib/api'
import { apiBase } from '@/lib/api-origin'
import { ApiError, extractError } from '@/lib/api-error'
import { readTabIdentity } from '@/features/auth/tab-identity'
import { hasLoggedInCookie } from '@/features/auth/logged-in-cookie'
import type { ChatResponseContext } from '@/features/chat/view/ContextDisclosure'
import { i18n } from '@/i18n'
import { isSupportedLanguage } from '@/i18n/config'

/**
 * UN TOUR DE LAURA — la seule porte du navigateur vers `POST /ia/chat`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tome 7 §48 appelle « risque technique n°1 du programme » le cas où chaque
 * surface implémenterait sa propre logique de conversation. `useLaura` tient
 * déjà cette promesse pour les interventions PROACTIVES (`/laura/*`, GA-39) ;
 * il ne tenait rien du côté des conversations, parce qu'il n'y avait qu'une
 * seule surface conversationnelle — l'écran `/chat`, qui appelait `/ia/chat`
 * depuis son composant de 1 432 lignes.
 *
 * La bulle en est une DEUXIÈME. Le jour où une deuxième surface arrive, recopier
 * les vingt lignes de la première est plus rapide que d'extraire une fonction —
 * et c'est ainsi qu'on obtient deux assistantes : deux façons de composer le
 * corps, deux façons de lire le refus du plafond, et le jour où le serveur
 * ajoute un champ, une seule des deux le porte.
 *
 * Ce fichier est donc la porte. Une garde le vérifie — **GA-237**,
 * `laura-turn-single-door.test.ts` : aucun autre fichier de `apps/web/src` n'a
 * le droit d'écrire le chemin `'/ia/chat'`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE DÉCIDE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le plafond quotidien (celui du plan — #4016 L7 : le plan fait foi,
 * `CHAT_DAILY_MESSAGE_LIMIT` n'est plus qu'un plafond de sécurité optionnel —
 * sur 24 h glissantes), le budget du tour (`CHAT_TURN_BUDGET_S` 90 s, plafond dur
 * `CHAT_TURN_CEILING_S` 105 s), le contexte serveur (profil, compte, contacts,
 * plan, mémoire longue), la trace Langfuse : **tout vit côté serveur**, et
 * emprunter cette porte suffit à les subir. C'est ce qui rend la phrase « la
 * bulle est éphémère mais pas gratuite » vraie sans qu'aucune ligne de la bulle
 * n'ait à s'en occuper : `assertChatQuota` s'exécute avant toute chose sur
 * `POST /ia/chat`, quel que soit l'appelant.
 *
 * ⚠️ Le plafond se compte par UTILISATEUR et sur les messages de rôle `user`
 * (`chat_messages`), pas par fil : un fil éphémère qu'on ne persiste pas n'est
 * donc **pas** un moyen de passer sous le radar — c'est l'appel lui-même qui est
 * compté, à l'entrée du contrôleur, avant l'appel au modèle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOT STREAM (12/09/2026) — `/ia/chat` DIFFUSE EN SSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le service IA rend maintenant le tour en Server-Sent Events (texte au fur et
 * à mesure, étapes d'outils, puis un événement terminal `done` dans la forme
 * de l'ancienne enveloppe JSON) — `apiFetch` ne convient plus (`res.json()`
 * jetterait sur un flux). Les deux fonctions ci-dessous partagent donc leur
 * propre plomberie HTTP au lieu de `apiFetch` :
 *
 *  - `askLaura` (inchangée pour ses appelants — `LauraDock`, la bulle) LIT le
 *    flux jusqu'au bout et ne rend que le résultat final : elle n'a JAMAIS
 *    diffusé, et ne diffuse toujours pas après ce lot.
 *  - `askLauraStreaming` (nouvelle — l'écran `/chat`) rend la MÊME promesse,
 *    mais appelle `onDelta`/`onStep` AU FUR ET À MESURE que le texte arrive.
 *
 * Ce qui est délibérément SIMPLIFIÉ par rapport à `apiFetch`, et pourquoi
 * c'est sans risque ICI : le repli d'origine (passerelle d'entreprise qui
 * bloque le domaine direct) ne rejoue jamais un POST de toute façon
 * (`isSafeMethod` dans `api-origin.ts` l'exclut — rejouer une écriture après
 * un échec réseau pourrait l'envoyer deux fois) ; seul `apiBase()` compte, et
 * il reflète déjà un repli armé par un appel GET antérieur sur le même écran
 * (l'historique du fil, chargé à l'ouverture). Le rafraîchissement de session
 * sur 401, lui, EST repris à l'identique via `refreshTokensOnce` (exporté par
 * `@/lib/api`) — la même fonction à jeton unique que tout le reste de l'app.
 */

/** Le chemin du TOUR — voir GA-237 ci-dessus. Une constante plutôt que deux
 *  gabarits de chaîne : la garde n'en lit qu'un, littéral, jamais recomposé. */
const CHAT_TURN_PATH = '/ia/chat'

/** Doit rester identique à `TAB_IDENTITY_HEADER` (`@/lib/api.ts`, non exporté
 *  — ce fichier a besoin du corps EN FLUX, qu'`apiFetch` ne rend jamais). */
const TAB_IDENTITY_HEADER = 'X-Bellum-User'

/** Un tour d'historique, tel que le serveur l'attend (`{role, content}`). */
type LauraTurnHistoryEntry = { role: 'user' | 'assistant'; content: string }

type LauraTurnRequest = {
  message: string
  /**
   * #4967 (lot L6) — l'identifiant du tour, tiré par l'écran AVANT l'envoi : « Arrêter » le désigne au
   * serveur (`POST /ia/chat/turns/:turnId/stop`) même quand la connexion d'origine est partie.
   */
  turnId?: string
  /**
   * #4967 (lot L6) — le tour vit EN ARRIÈRE-PLAN côté serveur : partir (autre écran, autre fil, onglet
   * fermé) ne l'annule plus, le serveur écrit la réponse dans le fil. Seul l'écran `/chat` le demande.
   */
  background?: boolean
  /** Le compte actif, ou `null`. Le serveur en résout le CONTENU lui-même. */
  accountId: string | null
  /** La clé de fil — espace de noms libre partagé avec la persistance. */
  conversationId: string
  history: readonly LauraTurnHistoryEntry[]
  /** Identifiants `rag_documents` joints à CE message. Trois au plus. */
  documentIds?: readonly string[]
  /**
   * #2148.16 — la pièce jointe de CONVERSATION (cas a) : du texte déjà
   * extrait (`POST /rag-documents/extract`, jamais ingéré), lu par Laura pour
   * CE tour et nulle part écrit. Distinct de `documentIds` (cas b, un geste
   * EXPLICITE d'ajout à la base) — les deux peuvent coexister.
   */
  attachedFiles?: readonly { name: string; text: string }[]
  /**
   * #2428.12 — l'identifiant CANONIQUE du collègue choisi dans le menu
   * « Mentionner un membre », jamais juste le texte « @Nom ». `null`/absent
   * = mention tapée à la main, ou aucune : le serveur retombe sur
   * l'heuristique par prénom.
   */
  mentionedUserId?: string | null
  /** Le §9.4 borne la clarification à un tour par conversation. */
  clarificationAsked?: boolean
  /**
   * Ce que l'écran DÉCLARE montrer (voir `laura-context.ts` des contrats).
   *
   * ⚠️ Absent ou `null` = **clé non envoyée**, donc corps de requête identique à
   * celui d'avant ce lot, donc prompt serveur byte-identique. C'est la même
   * discipline que `connected_families` côté `IaClient` : une clé omise n'est
   * pas une clé vide, et une clé vide n'est pas « rien à l'écran ».
   */
  pageContext?: LauraPageContext | null
  /**
   * #1951.2 / #1951.3 — le consultant ou le besoin sur lequel le fil est cadré :
   * une nature et un identifiant, jamais le nom. Le serveur relit la fiche dans
   * l'espace actif, comme il le fait pour `accountId`.
   *
   * ⚠️ Absent ou `null` = clé non envoyée : corps identique à celui d'avant.
   */
  scopeObject?: ChatScopeObject | null
  /**
   * #2453 — le mode de contexte du fil (« Contexte de travail »), choisi sous
   * le composeur. Le serveur le valide contre l'enum du contrat et le service
   * IA retire les couches exclues. Absent / `null` = clé non envoyée.
   */
  contextMode?: LauraContextMode | null
  /**
   * #3772.5 — l'EXCLUSION STRICTE des données de l'espace (portée « Sans les
   * données de l'espace »). `true` seulement sur ce choix explicite : le serveur
   * ne lit alors ni portefeuille, ni dossier, ni CRM. Absent / `false` = clé non
   * envoyée, corps identique à celui d'avant.
   */
  excludeWorkspaceData?: boolean
  /**
   * #2450.1 (reste partiel, épopée #2882) — le MODE DE RECHERCHE choisi
   * (`chat-research-mode.ts`) : `'auto'` ou absent = corps identique à celui
   * d'avant ce champ (l'heuristique habituelle décide) ; `'rapide'`/`'verifie'`/
   * `'approfondi'` force le PALIER DE MODÈLE côté service IA. Distinct de
   * `contextMode` juste au-dessus : celui-ci dit QUELLE PROFONDEUR de
   * recherche, pas QUELLES COUCHES personnelles entrent dans le raisonnement.
   */
  mode?: ChatResearchMode | null
  /**
   * #3708 — « Outils et sources » : les familles d'outils que la personne a
   * décochées pour ce fil. Le serveur retire leurs outils du catalogue du tour
   * (ce n'est pas une mention dans le texte). Vide / absent = clé non envoyée.
   */
  excludedToolFamilies?: readonly ToolFamily[] | null
  /**
   * #3708.fournisseur — les OUTILS décochés, par identifiant de connecteur. Le
   * serveur les recoupe avec le registre réel et filtre outil par outil ; exclure
   * le dernier d'une famille exclut la famille. Vide / absent = clé non envoyée.
   */
  excludedToolProviders?: readonly string[] | null
  /**
   * #3768 (BEL-LAU-1014) — le geste « retravailler cette réponse » : la réponse
   * source, sa forme, ses comptes et ses réserves. Absent = clé omise = corps
   * identique à celui d'avant ce champ (même discipline que `mode`).
   */
  replyTransform?: ReplyTransformRequest | null
  /**
   * #4397 (N1) — l'objet d'une suite cliquée (consultant du vivier). L'identifiant voyage ICI, jamais dans
   * le texte du message. Absent = clé omise = corps identique à celui d'avant ce champ.
   */
  followUpRef?: FollowUpRef | null
}

type LauraTurnReply = {
  /** La réponse, ou `null` quand le serveur n'en a rendu aucune — jamais une
   *  phrase de remplissage : c'est l'appelant qui connaît sa langue. */
  reply: string | null
  /** Le panneau de transparence (contexte / sources / non consulté). */
  context?: ChatResponseContext
  /**
   * #1916.24 — le TOUR de mémoire émis par le serveur à la fin du flux : les
   * éléments de mémoire envoyés à Laura pour cette réponse y sont tracés.
   * L'écran le renvoie avec la réponse enregistrée, qui les rattache à CE
   * message. ABSENT quand aucun élément n'est parti, ou quand la trace n'a pas
   * pu s'écrire — jamais une chaîne vide.
   */
  memoryTurnId?: string
  /**
   * #1952.10 — LE TOUR, tel que `withTurnCards` (`ia-proxy.controller.ts`) l'a
   * stampé sur l'événement terminal (`turn_id`). Moitié de la clé d'une carte
   * d'Action OS (`card:<turnId>:<rang>`) : c'est lui que l'écran renvoie avec
   * le message enregistré (`POST /ia/chat/messages`, `turnId`) pour que
   * `GET /ia/chat/messages` retrouve les cartes de ce tour au rechargement.
   * ABSENT quand le pont des cartes n'a pas tourné (module optionnel côté API,
   * réponse en échec) — jamais un identifiant deviné.
   */
  turnId?: string
}

/** Ce que l'événement terminal du flux porte — LA MÊME forme que l'ancienne
 *  enveloppe JSON bufferisée de `/ia/chat`. */
type ChatEnvelope = {
  success: boolean
  data: {
    reply?: string
    context?: ChatResponseContext
    memory_turn_id?: unknown
    turn_id?: unknown
    /** #4540 — posé par l'API quand le flux a cassé côté assistant. */
    failure?: unknown
  }
}

/** #1916.24 — le tour de mémoire, s'il en est un : une chaîne non vide, sinon rien. */
function memoryTurnOf(envelope: ChatEnvelope): { memoryTurnId?: string } {
  const value = envelope?.data?.memory_turn_id
  return typeof value === 'string' && value ? { memoryTurnId: value } : {}
}

/** #1952.10 — le tour de la réponse, s'il en est un : une chaîne non vide, sinon rien. */
function turnOf(envelope: ChatEnvelope): { turnId?: string } {
  const value = envelope?.data?.turn_id
  return typeof value === 'string' && value ? { turnId: value } : {}
}

/**
 * Les callbacks d'un tour DIFFUSÉ. Les deux sont optionnels : `askLaura` les
 * omet et se comporte donc comme un simple appel bufferisé.
 *
 * Non exportée : seul `askLauraStreaming` (dans ce fichier) la nomme —
 * `Chat.tsx` passe un littéral, dont la forme s'infère du paramètre. Un type
 * qui ne sert qu'à son propre fichier ne doit pas sortir (`pnpm
 * lint:exports:types`).
 */
type LauraTurnStreamHandlers = {
  /**
   * #1957.8 — le serveur a ACCEPTÉ le tour : les en-têtes du flux sont partis,
   * donc le plafond quotidien est passé. Appelé une fois, avant le premier
   * fragment ; jamais sur un refus (429, 401, 5xx) ni une panne de transport.
   * C'est le moment où l'écran peut écrire la question dans le fil.
   */
  onAccepted?: () => void
  /** Un fragment du texte final, dans l'ordre où Laura l'écrit. */
  onDelta?: (text: string) => void
  /** Une étape d'outil qui démarre (« Lecture de ta messagerie… »). */
  onStep?: (label: string) => void
}

/**
 * #1958.8 — la langue de l'INTERFACE, jamais devinée depuis le message.
 *
 * Décision de Louis (12/09/2026) : « langue de l'interface, tutoiement
 * fixe ». `i18n.language` EST la préférence déjà utilisée par tout le reste
 * de l'app (voir `i18n.language === 'en' ? …` dans une douzaine d'écrans) —
 * la reprendre ici évite un second concept de langue qui pourrait diverger de
 * ce que l'interface montre à l'écran au même instant.
 *
 * Toujours "fr" ou "en" en pratique (`supportedLngs` + `load: 'languageOnly'`
 * dans `i18n/index.ts`) ; `isSupportedLanguage` retombe sur "fr" si jamais ce
 * n'était pas le cas — jamais une valeur tierce envoyée au serveur.
 */
function interfaceLanguage(): 'fr' | 'en' {
  return isSupportedLanguage(i18n.language) ? i18n.language : 'fr'
}

function chatRequestBody(request: LauraTurnRequest): Record<string, unknown> {
  return {
    message: request.message,
    accountId: request.accountId,
    conversationId: request.conversationId,
    history: request.history,
    documentIds: request.documentIds ?? [],
    attachedFiles: request.attachedFiles ?? [],
    clarificationAsked: request.clarificationAsked ?? false,
    // Clé OMISE quand il n'y a pas de contexte : voir le docblock du champ.
    ...(request.pageContext ? { pageContext: request.pageContext } : {}),
    // #1951.2 — clé OMISE sans portée objet (même discipline que `pageContext`).
    ...(request.scopeObject ? { scopeObject: request.scopeObject } : {}),
    // #2428.12 — clé OMISE sans mention (même discipline).
    ...(request.mentionedUserId ? { mentionedUserId: request.mentionedUserId } : {}),
    // #2453 — clé OMISE sans mode (même discipline).
    ...(request.contextMode ? { contextMode: request.contextMode } : {}),
    // #3772.5 — clé OMISE hors exclusion stricte (même discipline).
    ...(request.excludeWorkspaceData ? { excludeWorkspaceData: true } : {}),
    // #2450.1 — clé OMISE sur `'auto'`/absent : corps identique à celui d'avant
    // ce champ (même discipline que `contextMode` juste au-dessus).
    ...(request.mode && request.mode !== 'auto' ? { mode: request.mode } : {}),
    // #3708 — clé OMISE sans exclusion (corps byte-identique à avant).
    ...(request.excludedToolFamilies?.length ? { excludedToolFamilies: request.excludedToolFamilies } : {}),
    ...(request.excludedToolProviders?.length ? { excludedToolProviders: request.excludedToolProviders } : {}),
    // #3768 — clé OMISE hors geste de transformation (même discipline).
    ...(request.replyTransform ? { replyTransform: request.replyTransform } : {}),
    // #4397 (N1) — clé OMISE hors suite cliquée (même discipline).
    ...(request.followUpRef ? { followUpRef: request.followUpRef } : {}),
    // #4967 — clés OMISES hors de l'écran `/chat` (corps byte-identique pour la bulle).
    ...(request.turnId ? { turnId: request.turnId } : {}),
    ...(request.background ? { background: true } : {}),
    interfaceLanguage: interfaceLanguage(),
  }
}

/**
 * Ouvre le flux — auth (cookies HttpOnly + identité d'onglet), un seul
 * rafraîchissement sur 401 (comme `apiFetch`), puis un refus HTTP devient une
 * `ApiError` AVANT toute lecture du corps en flux.
 *
 * #1953.1 / #1953.2 — `signal`, quand fourni, est posé sur LA requête HTTP :
 * un arrêt déclenché pendant le flux (bouton « Arrêter » de l'écran `/chat`)
 * fait rejeter `fetch`/la lecture du flux avec une `AbortError`, jamais un
 * succès inventé. Clé OMISE = comportement identique à avant ce lot.
 */
async function openChatStream(request: LauraTurnRequest, signal?: AbortSignal): Promise<Response> {
  const identity = readTabIdentity()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...(identity ? { [TAB_IDENTITY_HEADER]: identity } : {}),
  }
  const init: RequestInit = {
    method: 'POST',
    headers,
    body: JSON.stringify(chatRequestBody(request)),
    credentials: 'include',
    ...(signal ? { signal } : {}),
  }

  let res = await fetch(`${apiBase()}${CHAT_TURN_PATH}`, init)
  // Un seul rafraîchissement, à jeton unique avec tout le reste de l'app —
  // `/ia/chat` n'est pas `/auth/*`, donc la même règle qu'`apiFetch` s'applique.
  if (res.status === 401 && hasLoggedInCookie()) {
    const refreshed = await refreshTokensOnce()
    if (refreshed) res = await fetch(`${apiBase()}${CHAT_TURN_PATH}`, init)
  }
  if (!res.ok) {
    const { message, code, details } = await extractError(res)
    throw new ApiError(message, res.status, code, details)
  }
  if (!res.body) {
    // Un serveur ou un proxy qui n'aurait rendu aucun corps de flux — distinct
    // du cas « le flux casse en cours », couvert plus bas.
    throw new ApiError('Réponse vide du serveur.', res.status)
  }
  return res
}

/**
 * Lit le flux jusqu'à son événement terminal, en relayant `delta`/`step` à
 * `handlers` AU FUR ET À MESURE. Le repli : un flux qui casse en cours (idle
 * timeout, connexion perdue) ou qui se termine SANS jamais émettre `done`
 * rejette — jamais un succès inventé, jamais un accrochage silencieux.
 */
async function consumeChatStream(res: Response, handlers: LauraTurnStreamHandlers): Promise<ChatEnvelope> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let terminal: ChatEnvelope | null = null

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // Les frames SSE sont séparées par une ligne vide.
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const dataLine = frame.split('\n').find(line => line.startsWith('data:'))
        if (!dataLine) continue // ligne de garde (keepalive) — pas de `data:`
        const payload = dataLine.slice('data:'.length).trim()
        if (!payload) continue
        let event: { type?: unknown; text?: unknown; label?: unknown; success?: unknown; data?: unknown }
        try {
          event = JSON.parse(payload)
        } catch {
          continue // une frame illisible n'est jamais fatale — on continue de lire
        }
        if (event.type === 'delta' && typeof event.text === 'string') {
          handlers.onDelta?.(event.text)
        } else if (event.type === 'step' && typeof event.label === 'string') {
          handlers.onStep?.(event.label)
        } else if (event.type === 'done') {
          const data = event.data && typeof event.data === 'object' ? (event.data as ChatEnvelope['data']) : {}
          terminal = { success: Boolean(event.success), data }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (!terminal) {
    // Le flux s'est arrêté sans jamais dire qu'il avait fini — une coupure,
    // jamais un succès silencieux.
    // ⚠️ Ce message ne NOMME pas le copilote : la marque est configurable
    // (marque blanche) et ce module n'est pas un composant, donc `useBrand()`
    // n'y est pas disponible. GA-253 refuse un nom de marque écrit en dur.
    throw new ApiError('La réponse s’est interrompue avant la fin. Réessaie dans un instant.', 0)
  }
  return terminal
}

/**
 * Poser une question à Laura — bufferisé (attend la réponse ENTIÈRE).
 *
 * Rejette comme avant : un refus expliqué par le serveur (plafond, palier)
 * remonte tel quel dans une `ApiError`, et c'est `chatErrorMessage` qui décide
 * quoi en montrer. Traduire l'erreur ICI ferait deux phrases pour un refus.
 */
export async function askLaura(request: LauraTurnRequest): Promise<LauraTurnReply> {
  const res = await openChatStream(request)
  const envelope = await consumeChatStream(res, {})
  // Optional chaining obligatoire sur une réponse distante : une enveloppe
  // inattendue rend `null`, jamais un `undefined` qui casse l'écran.
  return {
    reply: envelope?.data?.reply || null,
    context: envelope?.data?.context,
    ...memoryTurnOf(envelope),
    ...turnOf(envelope),
  }
}

/**
 * Variante DIFFUSÉE de `askLaura` — LE MÊME contrat final, mais
 * `handlers.onDelta`/`onStep` sont appelés au fur et à mesure que le texte de
 * Laura s'écrit, avant que la promesse ne se résolve. Réservée à l'écran
 * `/chat` (`features/chat/view/Chat.tsx`) : la bulle flottante garde
 * `askLaura`, sans aucun changement de comportement pour elle.
 *
 * #1953.1 / #1953.2 — `signal` optionnel : l'écran `/chat` y pose l'
 * `AbortSignal` de son bouton « Arrêter ». Omis = comportement inchangé.
 */
export async function askLauraStreaming(
  request: LauraTurnRequest,
  handlers: LauraTurnStreamHandlers = {},
  signal?: AbortSignal,
): Promise<LauraTurnReply> {
  const res = await openChatStream(request, signal)
  // #1957.8 — `openChatStream` ne rend la main qu'à un flux OUVERT : un refus
  // est déjà une `ApiError` levée au-dessus.
  handlers.onAccepted?.()
  const envelope = await consumeChatStream(res, handlers)
  // #4540 — un échec côté assistant (marqueur posé par l'API) n'est PAS une réponse : il rejette, comme
  // une coupure, pour que l'écran propose de relancer la MÊME question au lieu d'afficher (et d'enregistrer)
  // une phrase d'excuse. Une réponse partielle (`success: false` AVEC texte, sans marqueur) reste rendue.
  if (envelope?.data?.failure === 'assistant_stream') {
    throw new ApiError('La réponse s’est interrompue avant la fin. Réessaie dans un instant.', 0)
  }
  return {
    reply: envelope?.data?.reply || null,
    context: envelope?.data?.context,
    ...memoryTurnOf(envelope),
    ...turnOf(envelope),
  }
}
