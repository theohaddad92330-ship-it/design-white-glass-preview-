import type {
  ChatBranchKind,
  ChatConversationAuditSnapshot,
  ChatConversationDetail,
  ChatConversationVersion,
  ChatPresenceMember,
  EntryStrategy,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { downloadDocument } from '@/features/documents/api'
import { i18n } from '@/i18n'
import { isSupportedLanguage } from '@/i18n/config'
import type { PersistedChatContext, PersistedChatImage, ReplyBlock } from '@bellum/contracts'
import type { SentImageVision } from '../lib/image-vision'
import type { CopilotCardWire } from './copilotCardsApi'

/**
 * Persistance des fils du copilote (`/ia/chat/messages`, `/ia/chat/history`) —
 * workspace-scopée côté API, table `chat_messages`.
 *
 * Ce client vivait sous `contact-engagement/` parce que le widget flottant en
 * était l'unique consommateur. Il a suivi le copilote : c'est la même API, au
 * bon endroit — pas un second client.
 *
 * `conversationId` est une clé de fil LIBRE (« general », « account-<uuid> », ou
 * l'UUID tiré jadis par le widget), le même espace de noms que celui envoyé à
 * `/ia/chat`. Voir la migration `1786500000000-ChatMessageConversationIdText`.
 */
type AgentChatRole = 'user' | 'assistant'

/**
 * #1940.4 — qui a écrit un message, dans un fil d'équipe : un prénom et un
 * avatar (https, ou `null` → initiales). Jamais l'adresse e-mail ni
 * l'identifiant. Résolu par l'API parmi les membres de l'espace.
 */
export type ChatMessageAuthor = { firstName: string; avatarUrl: string | null }

type AgentChatMessage = {
  id: string
  account_id: string | null
  conversation_id: string | null
  role: AgentChatRole
  content: string
  created_at: string
  /**
   * #1940.4 — `null` : réponse de Laura, compte effacé, ancien message.
   * Optionnel : une API antérieure au champ ne le sert pas — l'écran le traite
   * alors comme `null`, jamais comme « moi ».
   */
  author?: ChatMessageAuthor | null
  /**
   * #1916.24 — sur une réponse de Laura : combien d'éléments de mémoire étaient
   * dans le contexte qui lui a été envoyé. ABSENT = non mesuré (API antérieure,
   * lecture ratée, question de la personne) — jamais lu comme « 0 ».
   */
  memory_uses?: number
  /**
   * #1939 (9.3) — l'identifiant de l'enregistrement d'un message DICTÉ, encore
   * conservé : c'est ce qui fait apparaître « Réécouter ». Jamais un chemin.
   * Optionnel : une API antérieure au message vocal ne le sert pas.
   */
  voice_object_id?: string | null
  /**
   * #1998 — les cartes d'Action OS du TOUR de ce message, avec l'état où elles
   * en sont MAINTENANT (`GET /ia/chat/messages` les relit par `turn_id`, cf.
   * `ia-proxy.controller.ts` → `listForThread`). C'est cette porte-là qui fait
   * qu'un geste validé est encore validé après un rechargement de page : sans
   * elle, l'écran repartirait d'un état neuf à chaque montage.
   *
   * Optionnel : une API antérieure au champ ne le sert pas — aucune carte
   * n'apparaît alors, jamais une carte inventée.
   */
  cards?: CopilotCardWire[]
  /**
   * #1953.22 — CETTE réponse a été REMPLACÉE par une branche, et quand.
   * Absent ou `null` = elle ne l'a pas été. C'est ce qui fait survivre au
   * rechargement l'étiquette « Réponse remplacée à HH:MM — conservée pour
   * mémoire » : avant ce champ, la marque disparaissait au rechargement (défaut
   * mesuré en production le 16/09/2026).
   */
  superseded_at?: string | null
  /**
   * #1953.11 — la réponse dont CELLE-CI repart, et la nature de la branche
   * (`retry` / `angle` / `edit`). Absents = ce message n'est la réédition de
   * rien. Optionnels : une API antérieure au champ ne les sert pas — l'écran
   * n'affiche alors aucune provenance, jamais une provenance devinée.
   */
  branch_of_message_id?: string | null
  branch_kind?: string | null
  /**
   * #1914.14 — le CONTEXTE de cette réponse, tel que le serveur l'a gardé : ce
   * qui a servi, les sources citées, ce qui n'a PAS été consulté, la question de
   * précision et ses options. C'est ce qui fait qu'un fil relu retrouve ses
   * composants au lieu de retomber sur du texte nu.
   *
   * ⚠️ Une LISTE BLANCHE (`persistedChatContext`, `@bellum/contracts`) : les
   * propositions brutes du modèle (D65), les droits du lecteur et les cartes
   * n'y sont JAMAIS — les cartes arrivent par leur propre porte (`cards`).
   *
   * ABSENT ou `null` : aucun contexte gardé (message tapé, réponse scriptée,
   * message d'avant ce lot, API antérieure) — aucun panneau, jamais un inventé.
   */
  context?: PersistedChatContext | null
  /**
   * #2276.62 — le job composite de Laura né de CE tour, dans l'état où il en
   * est MAINTENANT (`GET /ia/chat/messages` le relit par `turn_id`). `unknown` :
   * `LauraJobCard` le valide contre le contrat avant tout rendu. Absent = pas de
   * job pour ce tour (ou API antérieure) — jamais un job inventé.
   */
  laura_job?: unknown
  /**
   * #2429.9 (épopée #2852) — l'enveloppe de la réponse : chaque artefact dit sa
   * `version` (1 = le texte du message, N = la N-ième modification humaine).
   * Absente = API antérieure, tout se lit en version 1.
   */
  envelope?: { artifacts?: Array<{ id: string; version: number; block: ReplyBlock }> }
  /**
   * #2494 — les pièces jointes ENVOYÉES avec ce message : leur identifiant et
   * leur nom, retrouvés côté serveur dans l'espace de l'appelant. `null` /
   * absent = aucune pièce jointe (message tapé sans document, ou API
   * antérieure au champ) — jamais une pièce inventée.
   */
  attachments?: { id: string; name: string }[] | null
  /**
   * #2876 (#2433.4) — les IMAGES de conversation ENVOYÉES avec ce message :
   * leur identifiant `storage_objects` (domaine `chat_image_attachment`) et
   * leur nom, retrouvés côté serveur dans l'espace de l'appelant. Distinct
   * d'`attachments` ci-dessus (`rag_documents`, cas b) — une image de
   * conversation (cas a, éphémère) n'y a jamais eu d'id. `null` / absent =
   * aucune image jointe (message tapé, ou API antérieure au champ) — jamais
   * une image inventée.
   */
  image_attachments?: PersistedChatImage[] | null
}

export type AgentChatHistoryItem = {
  id: string
  account_id: string | null
  conversation_id: string | null
  /**
   * Le titre du fil : celui qu'une personne a saisi ou que Laura a rédigé
   * (#1911.1), sinon le PREMIER message — stable d'un échange à l'autre.
   */
  title: string
  /**
   * Qui a écrit ce titre. `null` = aucun titre stocké, le titre est le premier
   * message. Optionnel : une API antérieure au titre ne le sert pas.
   */
  title_source?: 'laura' | 'user' | null
  /** Ouverture du fil. */
  created_at: string
  /** Dernière activité — sert au classement. Optionnel : une API antérieure au
   *  regroupement par compte ne la sert pas, on retombe sur `created_at`. */
  last_message_at?: string
  /** #1911.4 — celui qui a OUVERT le fil. Optionnel pour la même raison. */
  author?: ChatMessageAuthor | null
  /**
   * #1911.10 — le NOM du compte du fil, lu dans l'espace. `null` = aucun nom
   * lisible (compte effacé, nom blanc) ; jamais l'identifiant à la place.
   * Optionnel : une API antérieure au regroupement par compte ne le sert pas.
   */
  account_name?: string | null
  /**
   * #1911.5 — QUI A PARLÉ EN DERNIER dans ce fil, et c'est de là que son statut
   * se dérive (`thread-status.ts`) : `user` = j'ai écrit, Laura n'a pas encore
   * répondu ; `assistant` = elle a répondu.
   *
   * Cette clé est le VRAI travail du point : avant elle, l'objet d'historique
   * ne portait pas le rôle du dernier message, donc il n'y avait rien à dériver
   * honnêtement — et un statut deviné d'une date aurait dit « en attente » d'un
   * fil auquel Laura venait de répondre.
   *
   * Optionnel : une API antérieure au champ ne le sert pas. Aucun statut ne
   * s'affiche alors — jamais un statut inventé.
   */
  last_message_role?: 'user' | 'assistant' | null
}

export async function listAgentChatMessages(args: {
  accountId: string | null
  conversationId: string | null
  /** #2430.4 — lire une version figée partagée (`?version=` du lien). */
  version?: number | null
  /**
   * #1944.20 — le curseur de PAGINATION vers le haut d'un fil VIVANT : la date
   * du plus ancien message déjà à l'écran. Distinct de `version` (un lien
   * FIGÉ) — deux clés, même si les deux se traduisent en date de coupure côté
   * service.
   */
  before?: Date | null
}): Promise<AgentChatMessage[]> {
  const query = buildMessagesQuery(args)
  const response = await apiFetch<{ messages: AgentChatMessage[] }>({ path: `/ia/chat/messages${query}` })
  // Réponse inattendue → liste vide, jamais `undefined` : l'appelant rend
  // directement le résultat, et un `undefined` ici faisait planter l'écran
  // entier (règle repo : optional chaining + fallback sur données distantes).
  return response?.messages ?? []
}

export async function createAgentChatMessage(args: {
  accountId: string | null
  conversationId: string | null
  role: AgentChatRole
  content: string
  /** #1916.24 — le tour de mémoire rendu par la fin du flux (réponse de Laura seulement). */
  memoryTurnId?: string
  /**
   * #1952.10 — le TOUR de la réponse (`askLauraStreaming`/`askLaura`, `turnId`),
   * qui rattache les cartes d'Action OS à CE message : `GET /ia/chat/messages`
   * les retrouve ensuite par ce tour (`listForThread`). Omis pour un message
   * tapé (l'utilisateur, ou une API antérieure) — jamais une clé envoyée vide.
   */
  turnId?: string
  /**
   * #1939.13 / #1939.14 — l'enregistrement d'un message DICTÉ, tel que
   * `POST /ia/chat/voice/transcribe` l'a rendu. Il voyage par CETTE porte, celle
   * de tous les messages : le serveur vérifie qu'il appartient à l'appelant.
   */
  voiceObjectId?: string | null
  /**
   * #1953.11 / #1953.22 — cette réponse repart d'une AUTRE : laquelle
   * (l'identifiant que le serveur a rendu à l'écriture de cette réponse-là), et
   * comment. Les deux vont ensemble ; le serveur n'écrit la paire qu'après
   * avoir retrouvé la réponse d'origine dans l'espace de l'appelant, et
   * estampille du même geste « remplacée ».
   *
   * Omis pour tout message ordinaire : corps identique à celui d'avant ce lot.
   */
  branchOfMessageId?: string
  branchKind?: ChatBranchKind
  /**
   * #1914.14 — le contexte du tour, RÉDUIT ici par `persistedChatContext` avant
   * de partir : ce que la liste blanche refuse (proposition brute du modèle,
   * droits du lecteur, cartes) ne voyage même pas. Le serveur la ré-applique de
   * son côté — c'est la MÊME fonction, pas une seconde règle.
   */
  context?: PersistedChatContext | null
  /**
   * #2494 — les documents ENVOYÉS avec ce message (identifiants `rag_documents`) :
   * c'est ce qui fait que le nom de la pièce jointe survit à un rechargement du
   * fil. Le serveur les RETROUVE dans l'espace de l'appelant avant d'écrire un
   * nom — jamais celui envoyé ici.
   */
  documentIds?: string[]
  /**
   * #2876 (#2433.4) — les images de conversation ENVOYÉES avec ce message
   * (identifiants `storage_objects`) : c'est ce qui fait que la preuve
   * visuelle survit à un rechargement du fil. Le serveur les RETROUVE dans
   * l'espace de l'appelant avant d'écrire un nom — jamais celui envoyé ici.
   */
  imageObjectIds?: string[]
  /**
   * #2433.4 / #2433.12 (lot W8) — les zones lues et les objets mesurés de ces
   * images : ce qui fait que la preuve visuelle est RELUE à la réouverture du
   * fil. Le serveur revalide tout (zone invalide écartée, jamais corrigée).
   */
  imageVision?: SentImageVision[]
}): Promise<AgentChatMessage> {
  const { voiceObjectId, context, documentIds, imageObjectIds, imageVision, ...message } = args
  // Clés OMISES pour un message tapé : corps identique à celui d'avant le vocal,
  // le contexte persisté et les pièces jointes — un message sans rien de plus
  // n'envoie rien de plus qu'il n'envoyait.
  const withContext = context ? { ...message, context } : message
  const withDocuments = documentIds?.length ? { ...withContext, documentIds } : withContext
  const withImages = imageObjectIds?.length ? { ...withDocuments, imageObjectIds } : withDocuments
  const withVision = imageVision?.length ? { ...withImages, imageVision } : withImages
  const body = voiceObjectId ? { ...withVision, voiceObjectId } : withVision
  const response = await apiFetch<{ message: AgentChatMessage }, typeof body>({
    path: '/ia/chat/messages',
    method: 'POST',
    body,
  })
  return response.message
}

export async function listAgentChatHistory(archived = false): Promise<AgentChatHistoryItem[]> {
  const response = await apiFetch<{ items: AgentChatHistoryItem[] }>({
    path: archived ? '/ia/chat/history?archived=true' : '/ia/chat/history',
  })
  return response?.items ?? []
}

/** Le fil visé — `conversationId` quand il en porte un, sinon son compte (#1120). */
type ChatThreadTarget = { conversationId: string | null; accountId: string | null }

/**
 * Ranger un fil, ou le ressortir (#1120).
 *
 * « Faudrait pouvoir archiver ou supprimer les conversations. »
 * Ranger n'est pas supprimer : le fil sort de la liste et se retrouve dans le
 * tiroir. C'est ce qu'on propose en premier.
 */
export async function setAgentChatThreadArchived(target: ChatThreadTarget, archived: boolean): Promise<void> {
  await apiFetch<{ messages: number }, ChatThreadTarget & { archived: boolean }>({
    path: '/ia/chat/threads/archive',
    method: 'POST',
    body: { ...target, archived },
  })
}

/**
 * Renommer un fil (#1911.12, #1955.1).
 *
 * Le titre saisi GAGNE : Laura ne rédige un titre que là où aucun n'existe, et
 * ne réécrira jamais celui-ci. Le serveur rend le titre tel qu'il l'a enregistré
 * (blancs repliés) — c'est lui que l'écran affiche, pas la saisie brute.
 */
export async function renameAgentChatThread(target: ChatThreadTarget, title: string): Promise<{ title: string }> {
  const response = await apiFetch<{ title: string; title_source: 'user' }, ChatThreadTarget & { title: string }>({
    path: '/ia/chat/threads/title',
    method: 'PATCH',
    body: { ...target, title },
  })
  return { title: typeof response?.title === 'string' ? response.title : title.replace(/\s+/g, ' ').trim() }
}

/**
 * « Retirer » un fil (#1120), confirmé à l'écran. #2430.9 (20/09/2026) : la
 * route `chat/threads/delete` ARCHIVE désormais ses messages (ils restent
 * lisibles via « Voir les conversations rangées ») ; seuls son titre et ses
 * documents joints partent pour de bon. Nom de fonction et route inchangés :
 * l'appelant, lui, ne change pas — voir `ConversationsPanel.tsx`, bouton
 * `sidebarThreads.delete` (« Retirer »/« Remove »), plus « Supprimer ».
 */
export async function deleteAgentChatThread(target: ChatThreadTarget): Promise<void> {
  await apiFetch<{ messages: number }, ChatThreadTarget>({
    path: '/ia/chat/threads/delete',
    method: 'POST',
    body: target,
  })
}

/**
 * #1955.2 / #1911.11 — CHERCHER UN FIL DANS TOUT L'HISTORIQUE, pas dans la page
 * chargée.
 *
 * Les deux lots ont écrit cette fonction, chacun de son côté ; l'intégration
 * n'en garde qu'UNE (GA-26). Celle-ci, parce qu'elle borne `limit`, refuse une
 * requête vide avant de partir et documente pourquoi les deux corpus diffèrent.
 *
 * `filterThreads` (`lib/conversation.ts`) ne voit que les fils déjà rendus par
 * `GET /ia/chat/history` — 20 par défaut : chercher « PAYFIT » ne rendait rien
 * sur le 21e fil, et le vide se lisait « ce fil n'existe pas ». Cette route
 * parcourt jusqu'à 500 fils classés par récence côté serveur AVANT de filtrer,
 * sur le même triplet que l'écran (titre, nom du compte, prénom de l'auteur).
 *
 * ⚠️ Elle ne REMPLACE pas le filtre local, elle le COMPLÈTE, et pour une raison
 * mesurée dans `ChatMessagesService.searchThreads` : le serveur filtre sur le
 * PREMIER MESSAGE du fil et n'y substitue le titre STOCKÉ qu'APRÈS le filtrage.
 * Un fil renommé à la main pour contenir le mot cherché est donc trouvé par
 * l'écran et manqué par le serveur. Aucune des deux listes n'est incluse dans
 * l'autre : `ConversationList` les réunit.
 *
 * Une requête vide ne part pas — le serveur la refuserait (`q` min. 1).
 */
export async function searchAgentChatThreads(query: string, archived = false): Promise<AgentChatHistoryItem[]> {
  const needle = query.trim()
  if (!needle) return []
  const params = new URLSearchParams({ q: needle, limit: String(THREAD_SEARCH_LIMIT) })
  if (archived) params.set('archived', 'true')
  const response = await apiFetch<{ items: AgentChatHistoryItem[] }>({
    path: `/ia/chat/threads/search?${params.toString()}`,
  })
  // Réponse inattendue → liste vide, jamais `undefined` : l'appelant la fusionne
  // avec le filtre local, et un `undefined` ferait planter l'écran entier.
  return response?.items ?? []
}

/** Le plafond du serveur (`searchChatThreadsSchema`, `limit` ≤ 50). */
const THREAD_SEARCH_LIMIT = 50

/**
 * #1955.8 — DUPLIQUER un fil : « un fil dupliqué apparaîtra comme un nouveau fil
 * indépendant ».
 *
 * Le serveur recopie chaque message sous une `conversation_id` NEUVE : rien
 * n'est partagé avec l'original — l'archiver, le renommer ou le supprimer
 * ensuite ne touche jamais l'autre, et le fil SOURCE n'est pas modifié par ce
 * geste. Rien n'écrit tout seul : c'est un clic, jamais une copie automatique.
 */
export async function duplicateAgentChatThread(
  target: ChatThreadTarget,
): Promise<{ conversationId: string; accountId: string | null; messages: number }> {
  return await apiFetch<{ conversationId: string; accountId: string | null; messages: number }, ChatThreadTarget>({
    path: '/ia/chat/threads/duplicate',
    method: 'POST',
    body: target,
  })
}

/**
 * Les trois formats d'export d'un fil : `.md` pour relire (#1955.15), `.pdf`
 * pour transmettre (#1955.16), `.json` pour reprendre ailleurs (#1955.17).
 */
export type ChatThreadExportFormat = 'md' | 'pdf' | 'json'
/** #3895.1 — « Extrait » (les derniers messages) ou « Fil complet » (défaut du serveur). */
export type ChatThreadExportScope = 'extract' | 'full'

/**
 * #1955.7 / #1955.15 à #1955.23 — EXPORTER un fil vers un fichier.
 *
 * ⚠️ Passe par `downloadDocument` (`features/documents/api.ts`), le téléchargeur
 * DÉJÀ livré de l'app — pas par un `<a href>`, pas par une troisième mécanique :
 *  · l'API vit sur un autre hôte que la SPA en production, un lien nu
 *    n'emporterait pas la session ;
 *  · le nom du fichier vient de l'en-tête `Content-Disposition`, que le serveur
 *    construit à partir du TITRE du fil (`safeFileName`) — le deviner ici
 *    donnerait deux noms pour le même export.
 *
 * Le nom de repli ne sert que si le serveur n'en sert aucun.
 */
export async function exportAgentChatThread(
  target: ChatThreadTarget,
  format: ChatThreadExportFormat,
  scope: ChatThreadExportScope = 'full',
): Promise<void> {
  const params = new URLSearchParams()
  if (target.conversationId) params.set('conversationId', target.conversationId)
  if (target.accountId) params.set('accountId', target.accountId)
  // #1955.18 — même dérivation que `workspace-lexicon.ts`/`laura-turn.ts` :
  // la langue AFFICHÉE à l'écran, jamais un second concept qui pourrait
  // diverger. Sert uniquement à choisir la locale de la DATE dans l'export
  // (.md/.pdf) — le `.json` garde ses dates en ISO, format machine.
  params.set('interfaceLanguage', isSupportedLanguage(i18n.language) ? i18n.language : 'fr')
  params.set('scope', scope)
  const query = params.toString()
  await downloadDocument(`/ia/chat/threads/export.${format}${query ? `?${query}` : ''}`, `conversation.${format}`)
}

function buildMessagesQuery(args: {
  accountId: string | null
  conversationId: string | null
  version?: number | null
  before?: Date | null
}): string {
  const params = new URLSearchParams()
  if (args.accountId) params.set('accountId', args.accountId)
  if (args.conversationId) params.set('conversationId', args.conversationId)
  // #2430.4 — une version FIGÉE : le même fil, borné par le serveur.
  if (args.version) params.set('version', String(args.version))
  // #1944.20 — le curseur de pagination, distinct de `version` ci-dessus.
  if (args.before) params.set('before', args.before.toISOString())
  const query = params.toString()
  return query ? `?${query}` : ''
}

/* ──────────────────────────────────────────────────────────────────────────
 * #2430 — L'OBJET CONVERSATION (`/ia/chat/conversations/*`) : propriétaire,
 * branche, rattachement, conservation légale, versions figées. L'espace est
 * résolu par le serveur depuis le jeton, jamais envoyé d'ici.
 * ────────────────────────────────────────────────────────────────────────── */

export type ChatConversationDetailView = ChatConversationDetail & { canManage: boolean }

export function getChatConversation(conversationId: string): Promise<ChatConversationDetailView> {
  return apiFetch<ChatConversationDetailView>({
    path: `/ia/chat/conversations/detail?${new URLSearchParams({ conversationId }).toString()}`,
  })
}

/** #2430.2 — explorer une autre hypothèse dans un fil NEUF, relié à celui-ci. */
export function branchChatConversation(fromConversationId: string): Promise<{ conversationId: string }> {
  return apiFetch<{ conversationId: string }, { fromConversationId: string }>({
    path: '/ia/chat/conversations/branch',
    method: 'POST',
    body: { fromConversationId },
  })
}

/** #2430.12 — transférer la conversation à un membre de l'espace. */
export function setChatConversationOwner(conversationId: string, ownerUserId: string): Promise<unknown> {
  return apiFetch<unknown, { conversationId: string; ownerUserId: string }>({
    path: '/ia/chat/conversations/owner',
    method: 'POST',
    body: { conversationId, ownerUserId },
  })
}

/** #2430.12 — rattacher la conversation à un compte (ou la détacher, `null`). */
export function attachChatConversation(conversationId: string, accountId: string | null): Promise<unknown> {
  return apiFetch<unknown, { conversationId: string; accountId: string | null }>({
    path: '/ia/chat/conversations/attach',
    method: 'POST',
    body: { conversationId, accountId },
  })
}

/**
 * #2075.29 / #2075.30 — poser le snapshot audit à l'ouverture du fil depuis
 * l'audit commercial (« Demander à… »). Une fois : ce que l'audit disait à cet
 * instant, jamais réécrit par une régénération ultérieure.
 */
export function attachChatConversationAuditSnapshot(
  conversationId: string,
  snapshot: Omit<ChatConversationAuditSnapshot, 'takenAt'>,
): Promise<unknown> {
  return apiFetch<
    unknown,
    { conversationId: string; auditVersion: number | null; strategy: EntryStrategy | null } & Pick<
      ChatConversationAuditSnapshot,
      'firstActions' | 'unknowns'
    >
  >({
    path: '/ia/chat/conversations/audit-snapshot',
    method: 'POST',
    body: {
      conversationId,
      auditVersion: snapshot.auditVersion,
      strategy: snapshot.strategy,
      firstActions: snapshot.firstActions,
      unknowns: snapshot.unknowns,
    },
  })
}

/**
 * #2430.10 / #2439.13 — poser ou lever la conservation légale (gérant de
 * l'espace). `reason` est REQUIS pour poser : une conservation qui n'explique
 * pas pourquoi est un blocage muet — le contrat (`chatConversationLegalHoldSchema`)
 * refuse la requête sans elle. `reviewBy` (délai de revue) est OPTIONNEL,
 * DÉCLARÉ par qui pose la conservation, jamais deviné par l'écran.
 */
export function setChatConversationLegalHold(
  conversationId: string,
  hold: boolean,
  reason?: string,
  reviewBy?: string,
): Promise<unknown> {
  return apiFetch<unknown, { conversationId: string; hold: boolean; reason?: string; reviewBy?: string }>({
    path: '/ia/chat/conversations/legal-hold',
    method: 'POST',
    body: { conversationId, hold, reason, reviewBy },
  })
}

/** #2430.4 — figer une version à partager : une borne, jamais une copie. */
export function snapshotChatConversation(conversationId: string): Promise<ChatConversationVersion> {
  return apiFetch<ChatConversationVersion, { conversationId: string }>({
    path: '/ia/chat/conversations/snapshot',
    method: 'POST',
    body: { conversationId },
  })
}

/**
 * #1940.7 — attribuer une carte d'action de Laura à un collègue (sélecteur
 * « assigner à », `PendingActions.tsx`, relié à `useWorkspaceMembers`).
 *
 * Le résumé envoyé est celui déjà lu par l'utilisateur (`describe(action, t,
 * language)`) — jamais recalculé côté serveur. Le fil visé est le même couple
 * que `ChatThreadTarget` (conversationId, ou le compte pour un fil ancien) :
 * c'est vers lui que la notification du collègue renvoie.
 */
export function assignPendingAction(
  target: ChatThreadTarget,
  summary: string,
  assigneeUserId: string,
): Promise<{ assignedTo: string }> {
  return apiFetch<{ assignedTo: string }, ChatThreadTarget & { summary: string; assigneeUserId: string }>({
    path: '/ia/chat/actions/assign',
    method: 'POST',
    body: { ...target, summary, assigneeUserId },
  })
}

/* ──────────────────────────────────────────────────────────────────────────
 * #3086 — PRÉSENCE SUR CE FIL : qui d'autre, dans l'espace, l'a ouvert
 * MAINTENANT. L'espace est résolu par le serveur depuis le jeton, comme le
 * reste du fil ; `accountId`/`conversationId` désignent le fil comme partout
 * ailleurs (`ChatThreadTarget`).
 * ────────────────────────────────────────────────────────────────────────── */

type ChatPresenceRef = { accountId?: string | null; conversationId?: string | null }

/** Signale que ce fil est ouvert ICI. À rappeler tant qu'il le reste — voir `useChatPresence`. */
export function sendChatPresenceHeartbeat(ref: ChatPresenceRef): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }, ChatPresenceRef>({ path: '/ia/chat/presence', method: 'POST', body: ref })
}

/** Les AUTRES membres actifs sur ce même fil — jamais l'appelant lui-même. */
export function fetchChatPresence(ref: ChatPresenceRef): Promise<{ members: ChatPresenceMember[] }> {
  const params = new URLSearchParams()
  if (ref.accountId) params.set('accountId', ref.accountId)
  if (ref.conversationId) params.set('conversationId', ref.conversationId)
  const query = params.toString()
  return apiFetch<{ members: ChatPresenceMember[] }>({ path: `/ia/chat/presence${query ? `?${query}` : ''}` })
}
