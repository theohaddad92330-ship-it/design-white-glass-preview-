import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react'
import { ReplyFamilyRetry } from './reply-blocks/ReplyFamilyRetry'
import { useFittedChipCount } from './fit-suggestion-chips'
import { composeAssumptions } from './clarification-assumptions'
import { chatPlainText } from './verdict-codes'
import { searchWhileOnChat } from '../lib/search-while-on-chat'
import { supersededCardKeys } from '../lib/superseded-cards'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { declaredIncidentMessage } from '@/features/banners/declared-incident'
import { useActiveBanners } from '@/features/banners/useBanners'
import { CommandDrawerButton } from '@/features/chat-commands/view/CommandDrawerButton'
import { requestReport } from '@/features/feedback/reportLink'
import {
  registerTurnController,
  releaseTurnController,
  stopTurn,
  useBackgroundTurnsStore,
} from '@/features/chat/lib/background-turns'
import { useServerRunningTurn } from '@/features/chat/lib/server-running-turn'
import { clearLeftWhileRunning, markLeftWhileRunning } from '@/features/chat/lib/laura-return'
import { contextModeFor, useContextModeStore } from '@/features/work-contexts/contextModeStore'
import { useFirstName } from '@/hooks/useFirstName'
import type { TFunction } from 'i18next'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  AtSign,
  BookOpen,
  Bug,
  Camera,
  Paperclip,
  Plug,
  Plus,
  RotateCcw,
  Search,
  SendHorizonal,
  Sparkles,
  ListPlus,
  Square,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  EntityAvatar,
  LauraFace,
  Text,
  cn,
} from '@bellum/ui'
import { useIsInstalled, useIsMobile } from '@/features/mobile/useIsMobile'
import { useVisualViewportInset } from '@/features/mobile/useVisualViewportInset'
import { InstallPromptBanner } from '@/features/mobile/InstallPromptBanner'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useConnectedCapabilities } from '@/features/chat/hooks/useConnectedCapabilities'
import { useReadPreferences } from '@/features/preferences/preferences-provider'
import { ComposerDisclaimer } from '@/features/chat/view/ComposerDisclaimer'
import { useMemoryScopeOptions } from '@/features/memory/hooks/useMemoryScopeOptions'
import { ConversationsPanel } from '@/features/chat/view/ConversationsPanel'
import { ConversationsDrawer } from '@/features/chat/view/ConversationsDrawer'
import { ScopeDialog } from '@/features/chat/scope/ScopeDialog'
import {
  mergeScopeRows,
  resolveScopeAccountName,
  useScopeAccountLookup,
} from '@/features/chat/scope/use-scope-account-lookup'
import { AttachmentPreviewDialog } from '@/features/chat/view/AttachmentPreviewDialog'
import { newConversationId } from '@/features/chat/lib/conversation'
import { researchModeFor, useResearchModeStore } from '@/features/chat/researchModeStore'
import {
  excludedFamilies,
  excludedProviderIds,
  excludedProvidersFor,
  useToolSourcesStore,
} from '@/features/chat/toolSourcesStore'
import { ResearchModeSelector } from '@/features/chat/view/ResearchModeSelector'
import { isChatImage, preprocessChatImage } from '@/features/chat/lib/image-preprocess'
import { imageVisionToSend, savedImageAsAttachment, type SentImageVision } from '@/features/chat/lib/image-vision'
import { SendQueueBlock } from '@/features/chat/queue/SendQueueBlock'
import { useSendQueue, type SendQueue } from '@/features/chat/queue/useSendQueue'
import { SEND_QUEUE_MAX } from '@/features/chat/queue/send-queue'
import { clearChatDraftAfterSend, useChatComposerDraft, writeChatDraft } from '@/features/chat/lib/composer-draft'
import { handleComposerKeyDown, useEnterFallback } from '@/features/chat/lib/composer-keys'
import { ComposerSendHint } from '@/features/chat/view/ComposerSendHint'
import { useSession } from '@/lib/hooks/use-session'
import {
  LAURA_OPENER_DELAY_MS,
  lauraOpener,
  lauraOpenerPersists,
  type LauraOpenerInput,
} from '@/features/chat/lib/laura-opener'
import { isLauraSilenced } from '@/features/laura/laura-silence-signal'
import { browserTimeZone, readMorningBrief } from '@/features/briefing/api'
// #2428.9 — un seul formatage de poids de fichier dans l'app (GA-26) : celui du
// dépôt de notes de frais, qui affiche déjà la même donnée (`File.size`) avant
// envoi.
import { formatBytes } from '@/features/expenses/presentation'
import {
  CHAT_ATTACHMENT_CATEGORY,
  CHAT_RESEARCH_MODES,
  classifyDocumentByName,
  connectedMailboxName,
  // #1914.14 — la liste blanche de ce qu'on garde d'un tour, à UN seul endroit.
  persistedChatContext,
  type ChatImageCitation,
  type ChatImageObjects,
  type ChatResearchMode,
  type ChatVoiceTranscription,
  type ConnectedClientTool,
  type DocumentProbableType,
  type MemoryScopeOffer,
  type PersistedChatContext,
  type PersistedChatImage,
  type RagDocumentScope,
  type ReplyBlock,
  type FollowUpRef,
  type ReplyTransformRequest,
  type ToolFamily,
  type WritableImportObject,
  RAG_UPLOAD_CHAT_EXTENSIONS,
  RAG_UPLOAD_MAX_BYTES,
  chatScopeObjectFromParam,
  chatScopeObjectParam,
  ragUploadExtension,
  validateRagUpload,
} from '@bellum/contracts'
import { AiDisclosure } from '@/features/laura/AiDisclosure'
import { ScopeButton } from '@/features/chat/scope/ScopeButton'
import { entryPageContext } from '@/features/chat/view/entry-page-context'
import { ComposerLauncher, RunDuration } from '@/features/launcher/ComposerLauncher'
import { LauncherExamples } from '@/features/launcher/LauncherExamples'
import { ChatTopSlot } from './chat-top-slot'
import { useLauncherArm } from '@/features/launcher/LauncherProvider'
import { useDisarmOnThreadChange } from '@/features/launcher/useDisarmOnThreadChange'
import {
  composerCanSubmit,
  composerDisabledReasonKey,
  composerPlaceholderKey,
  composerSubmitMode,
} from '@/features/launcher/launcher-arm'
import { needsEntityExtraction, resolveEntity } from '@/features/launcher/launcher-entity-resolution'
import { isQuestionForLaura } from '@/features/launcher/launcher-intent'
import {
  NO_ACCOUNT_SCOPE,
  STRICT_NO_DATA_SCOPE,
  isStrictScope,
  PORTFOLIO_SCOPE,
  chatScopeFromObject,
  isObjectScope,
  scopeAccountsFrom,
  scopeObjectOf,
  type ChatScope,
  type ObjectChatScope,
  type ScopeAccount,
} from '@/features/chat/scope/chat-scope'
// #1951.17 / #1951.18 / #1951.21 — le fil d'Ariane des périmètres, et l'annonce
// du changement. Deux modules : la pile est PURE et testée à part de l'écran.
import { ScopeChangeNotice } from '@/features/chat/scope/ScopeChangeNotice'
import {
  previousStep,
  pushStep,
  returnToPrevious,
  scopeChangeOf,
  type ScopeChange,
  type ScopeTrail,
} from '@/features/chat/scope/scope-trail'
import { trackAssistantQuestionSent, trackSuggestionClicked } from '@/lib/product-tracker'
import { chatErrorMessage, chatFailureIsRetryable } from '@/features/chat/chat-error'
import { chatQuotaReachedText } from '@/features/chat/lib/chat-quota-text'
import { ChatQuotaNote } from '@/features/chat/view/ChatQuotaNote'
import { askLauraStreaming } from '@/features/chat/api/laura-turn'
import { toast } from 'sonner'
import { TOAST_PROBLEM_MS, TOAST_SUCCESS_MS } from '@/lib/toast-duration'
import { useIngestRagDocument } from '@/features/rag/hooks/useIngestRagDocument'
import { useIngestRagZip } from '@/features/rag/hooks/useIngestRagZip'
import { useExtractRagFile } from '@/features/rag/hooks/useExtractRagFile'
import { useDeleteRagDocument } from '@/features/rag/hooks/useDeleteRagDocument'
import { useUpdateRagDocumentScope } from '@/features/rag/hooks/useUpdateRagDocumentScope'
import { attachScopesFor, ragScopePlacement } from '@/features/rag/scope-placement'
import type { IngestInput } from '@/features/rag/api'
import { ApiError } from '@/lib/api-error'
import {
  createAgentChatMessage,
  listAgentChatHistory,
  listAgentChatMessages,
  type AgentChatHistoryItem,
} from '../api/agentChatApi'
import type { CopilotCardWire } from '../api/copilotCardsApi'
import { CopilotCards } from './CopilotCards'
import { demoReplyTransformTurn, demoSuggestions, demoTurn, demoTurnLinksContacts } from '../api/demo-turn'
import { demoContactIdByName } from '@/features/demo/demo-contact-ids'
import { LauraJobCard } from './LauraJobCard'
import { TurnStepIndicator } from './work/TurnStepIndicator'
import { DeepenJobResumeBanner } from './DeepenJobResumeBanner'
import {
  LAURA_HOME_MARKET_MEMORY_AVAILABLE,
  MAX_COMPOSER_SUGGESTIONS,
  resolveLauraHomeSuggestions,
  useLauraHomeContext,
  type LauraHomeContext,
} from './laura-home-suggestions'
import { HomeSuggestionGrid } from './laura-home-grid'
import { OPEN_COMMANDS_EVENT, requestOpenCommands } from './commands-drawer-request'
import { DemoBarChart } from '@/features/demo/view/DemoBarChart'
import { DEMO_MAX_VISIBLE_SUGGESTIONS, type DemoChart } from '@/features/demo/demo-chat-script'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { type ChatResponseContext, type ClarificationOption } from './ContextDisclosure'
import { ToolsSourcesMenu } from './ToolsSourcesMenu'
import { ComposerProfileControl } from './ComposerProfileControl'
import { ComposerProfileMenu } from './ComposerProfileMenu'
import { ComposerToolChips } from './ComposerToolChips'
import { ComposerToolsChecklist } from './ComposerToolsChecklist'
import { PendingActions } from './PendingActions'
import { ReplyHeader } from './reply-kit'
import { StructuredReply, type ArtifactVersionOverrides } from './StructuredReply'
import { ReplyActions } from './ReplyActions'
import { dedupeReplyOptionGroups } from './reply-options-dedupe'
import { DiscoverHandoff, discoverCriteriaOfReply } from './discover-handoff'
import { ReplyConversation } from './reply-conversation'
import { ReplyFollowUpProvider } from './reply-follow-up'
import { replyPlainText } from './reply-blocks/plain-text'
import { extractReplyAside } from './reply-aside'
import { ReplyFooter } from './ReplyFooter'
import { ReplyTransformProvider } from './reply-transform-context'
import { CopyQuestion } from './CopyQuestion'
import { mainThreadSources } from '@/features/chat/lib/summary-sources'
import { threadMailboxRead } from '@/features/chat/lib/mailbox-read'
import { hasRestrictedSource } from '@/features/chat/lib/restricted-source'
import { FrozenVersionBanner, frozenVersionFrom } from './FrozenVersionBanner'
import {
  angleVariant,
  applyPendingBranch,
  precedingUserText,
  resolveSavedBranches,
  type BranchKind,
  type BranchOf,
  type DataOrigin,
  type PendingBranch,
} from './reply-branch'
import { ConversationHeaderMenu } from './ConversationHeaderMenu'
import { SharedConversationState } from './SharedConversationState'
import { MessageAuthor } from './MessageAuthor'
import type { ChatMessageAuthor } from '@/features/chat/api/agentChatApi'
import { useSelfChatAuthor } from '@/features/chat/hooks/useSelfChatAuthor'
import { bubbleAuthor, isOwnTurn } from '@/features/chat/lib/chat-author'
import { VoiceConversation } from '@/features/chat/voice/VoiceConversation'
import { VoiceInput } from '@/features/chat/voice/VoiceInput'
import { useVoiceAvailability } from '@/features/chat/voice/useVoiceAvailability'
import { VoiceReplay } from '@/features/chat/voice/VoiceReplay'
import { CHAT_SURFACE, chatMotion, staggered } from './chat-surface'
import { shouldAutoScroll, shouldLoadOlderMessages } from './should-auto-scroll'
import { followBottom } from './follow-bottom'
import { NewRepliesPill } from './NewRepliesPill'
import { PastedNetworkPostSignal } from './PastedNetworkPostSignal'
import { setLauraChatSlot } from '@/features/laura/chat-slot'
import { guideAnchorProps } from '@/features/guide/guide-anchors'
import { useIndexedCallback } from './use-indexed-callback'
import { useMessageWindow } from './use-message-window'
import { MessageWindowItem } from './MessageWindowItem'

/** Le MOTIF de route du catalogue des écrans (`PRODUCT_SCREENS`), jamais un
 *  identifiant de conversation : l'analytique produit mesure un écran. */
const CHAT_SCREEN = '/chat'

/**
 * #1944.20 — miroir du défaut serveur (`listChatMessagesSchema.limit`, 50) :
 * sert UNIQUEMENT à l'heuristique « reste-t-il des messages plus anciens ? »
 * (une page plus courte que ce nombre veut dire qu'on a atteint le début du
 * fil). Jamais envoyé explicitement — le serveur applique déjà ce défaut.
 */
const CHAT_HISTORY_PAGE_SIZE = 50

/**
 * #3506 — le fil sans la bulle d'échec qu'on relance et, quand la question
 * envoyée y était restée (`questionKept`), sans cette question : la relance la
 * remet elle-même, une seule fois.
 */
function withoutRelaunchedTurn(messages: ChatMessage[], relaunched: ChatMessage | undefined): ChatMessage[] {
  if (!relaunched) return messages
  const index = messages.indexOf(relaunched)
  if (index < 0) return messages
  const dropKeptQuestion = relaunched.failedTurn?.questionKept && messages[index - 1]?.role === 'user'
  return messages.filter((_entry, position) => position !== index && !(dropKeptQuestion && position === index - 1))
}

/**
 * #2519 — la question qu'une bulle d'ÉCHEC n'a pas obtenue.
 *
 * `questionSaved` : le serveur avait ACCEPTÉ le tour (plafond passé, flux
 * ouvert) ET la question a été enregistrée avant la coupure. Relancer ne
 * l'enregistre alors pas une seconde fois — le plafond quotidien compte les
 * questions enregistrées, et le fil relu ne doit la montrer qu'une fois.
 */
type FailedTurn = {
  question: string
  documentIds: string[]
  /** #2148.16 — les pièces de CONVERSATION (cas a) de la question échouée,
   *  déjà extraites : « Relancer » les renvoie SANS redemander le fichier. */
  attachedFiles: { name: string; text: string }[]
  /** #2876 (#2433.4) — les images déjà RANGÉES côté serveur pour la question
   *  échouée : « Relancer » les rattache SANS redemander le stockage. */
  imageObjectIds: string[]
  /** #2433.4 / #2433.12 (lot W8) — leur vision mesurée, renvoyée avec « Relancer ». */
  imageVision?: SentImageVision[]
  questionSaved: boolean
  /** #3506 — le serveur a ACCEPTÉ le tour : la question envoyée est restée dans le
   *  fil, juste avant cette bulle. « Relancer » la remplace au lieu de la doubler. */
  questionKept?: boolean
  /** `chatFailureIsRetryable` — le bouton « Relancer » ne s'offre que là où il peut aboutir. */
  retryable: boolean
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp?: Date
  /**
   * #2519 — présent sur une bulle d'ÉCHEC, et seulement là. Jamais persisté,
   * jamais relu par Laura comme une de ses réponses (retiré de l'historique).
   */
  failedTurn?: FailedTurn
  /** Transparency object attached to an assistant reply (contexte / sources /
   *  non consulté), resolved server-side. */
  context?: ChatResponseContext
  /**
   * #1320 — le petit graphe en barres d'une réponse SCRIPTÉE.
   *
   * Il ne vient que de l'espace de démonstration : le vrai copilote rend du
   * texte structuré, pas des séries. Louis a demandé que `DemoBarChart` survive
   * à la disparition de `DemoChat` — il vit donc ici, dans le rendu de réponse
   * de la coque réelle, plutôt que dans une coque parallèle.
   */
  chart?: DemoChart
  /**
   * LOT STREAM (12/09/2026) — l'étape en cours pendant qu'un outil tourne
   * (« Lecture de ta messagerie… »), affichée tant que `content` est encore
   * vide. Jamais persisté : purement l'état d'un tour EN COURS, effacé dès
   * qu'un premier fragment de texte arrive ou que le tour se termine.
   */
  pendingStep?: string
  /**
   * #1940.4 — qui a écrit cette bulle. ABSENT = tapée dans cet onglet, donc par
   * la personne connectée ; `null` = relue sans auteur (compte effacé, ancien
   * message, API antérieure). `toChatMessage` pose toujours le champ sur une
   * bulle relue. Voir `bubbleAuthor`.
   */
  author?: ChatMessageAuthor | null
  /**
   * #1916.24 — l'identifiant de la réponse ENREGISTRÉE (relue, ou écrite après le
   * flux). #1939 (9.3) — c'est aussi lui que « Réécouter » désigne.
   */
  id?: string
  /**
   * #1916.24 — combien d'éléments de mémoire étaient dans le contexte envoyé à
   * Laura pour cette réponse, servi par l'API. ABSENT = non mesuré.
   */
  memoryUses?: number
  /** #1939 (9.3) — l'enregistrement encore conservé d'une question dictée, ou `null`. */
  voiceObjectId?: string | null
  /**
   * #1998 — les cartes d'Action OS de cette réponse.
   *
   * Elles arrivent par DEUX portes, et le champ les réunit ici pour que le rendu
   * n'ait qu'un endroit à lire : `context.cards` à la fin d'un tour, et
   * `message.cards` à la relecture du fil (`GET /ia/chat/messages`). La seconde
   * est la raison d'être de la persistance — c'est elle qui fait qu'un geste
   * validé est encore validé après un rechargement de page.
   */
  cards?: CopilotCardWire[]
  /**
   * #2276.62 — le job composite de Laura né de cette réponse, tel que l'API le
   * relit au rechargement du fil (`message.laura_job`). À la fin d'un tour, il
   * arrive par `context.laura_job` ; le rendu lit l'un ou l'autre. `unknown` :
   * `LauraJobCard` le valide contre le contrat avant tout rendu.
   */
  lauraJob?: unknown
  /**
   * #2429.9 (épopée #2852, lot P07) — la version la plus récente des artefacts
   * MODIFIÉS de cette réponse, par adresse (`envelope.artifacts`, version ≥ 2).
   * ABSENT = tout se lit en version 1, le texte du message tel quel.
   */
  artifactVersions?: ArtifactVersionOverrides
  /**
   * #2494 — les pièces jointes ENVOYÉES avec ce message : sans ce champ, un
   * CV déposé dans le composeur disparaissait de l'écran dès l'envoi — le
   * dépôt donnait l'impression de n'avoir servi à rien. ABSENT = aucune pièce
   * jointe à ce message (tapé sans document, ou API antérieure au champ).
   */
  attachments?: {
    id: string
    name: string
    /**
     * #2876 (#2433.4) — présent SEULEMENT pour une image de CONVERSATION
     * (ephemeral), et SEULEMENT tant que cet onglet vit : une URL `blob:`
     * locale, jamais envoyée au serveur. Cliquer la pièce rouvre alors
     * l'image SOURCE — la preuve visuelle derrière ce que Laura en a cité,
     * plutôt que la seule extraction texte déjà offerte. `undefined` pour
     * tout le reste (document non-image, pièce durable) — ou pour une image
     * de message DÉJÀ ENVOYÉ relue depuis un fil rechargé, qui porte
     * `imageObjectId` à la place (voir ci-dessous).
     */
    imageUrl?: string
    /**
     * #2876 (#2433.4) — l'identifiant `storage_objects` d'une image de
     * conversation persistée (domaine `chat_image_attachment`, 30 jours,
     * décision du 28/09/2026 par analogie avec `chat_voice_message`) : ce qui
     * fait qu'un message ENVOYÉ garde sa preuve visuelle au-delà de cet
     * onglet — rechargement du fil, ou relecture par un collègue de l'espace.
     * `AttachmentPreviewDialog` résout l'URL signée au clic. `undefined` pour
     * tout message d'AVANT la colonne, ou sans image.
     */
    imageObjectId?: string
    /** #2433.4 (lot M10) — où chaque ligne a été lue dans l'image, pour CETTE session. */
    citations?: ChatImageCitation[]
    /** #2433.12 (lot P02) — bords du document et grille d'un tableau, pour CETTE session. */
    objects?: ChatImageObjects
  }[]
  /**
   * #2254 (défaut mesuré en prod le 17/09) — les connecteurs posés dans CETTE
   * question, dans l'ordre où ils ont été posés : sans ce champ, « Google
   * Calendar Quels sont mes 3 prochains rendez-vous ? » s'affichait en texte
   * brut fusionné. ⚠️ Vit UNIQUEMENT en mémoire de cet onglet — `content` ne
   * porte plus les marqueurs qui délimitaient un bloc une fois envoyé, donc un
   * fil RECHARGÉ ne peut pas redistinguer un connecteur du reste de la phrase.
   */
  connectors?: string[]
  /**
   * #1953.3 — cette bulle a été ARRÊTÉE en cours de génération (bouton
   * « Arrêter », #1953.1). Le texte déjà reçu reste affiché tel quel ;
   * ce drapeau ne fait qu'ajouter la mention « réponse arrêtée » sous la
   * bulle. Jamais persisté — purement l'état d'un tour interrompu dans
   * CETTE session.
   */
  stopped?: boolean
  /**
   * #3809.1 — ce tour a été ABANDONNÉ par un changement de fil pendant que
   * Laura répondait encore : jamais enregistré (voir `interruptedThreadsRef`
   * dans `Chat.tsx`), donc synthétisé ICI, au retour sur ce fil, PENDANT la
   * même session seulement. Jamais persisté.
   */
  interruptedByNavigation?: boolean
  /**
   * #1953.14 — cette réponse appartient à une branche ABANDONNÉE : quelqu'un a
   * demandé mieux (réessai, autre angle, question modifiée) et une nouvelle
   * branche est repartie d'ici. Elle reste affichée telle quelle — on archive,
   * on ne supprime pas — mais ses propositions (`context.pending_actions`)
   * deviennent obsolètes : `PendingActions` lit ce champ pour ne plus les
   * offrir à la confirmation (voir `PendingActionCard`, `obsolete`).
   */
  supersededAt?: Date
  /**
   * #1953.12 / #1953.22 — d'où repart cette réponse, et pourquoi : la
   * PROVENANCE de la branche. `previousTimestamp` est l'heure de la réponse
   * abandonnée, gardée visible plutôt qu'effacée.
   */
  branchOf?: BranchOf
  /**
   * #1953.21 — cette réponse a-t-elle réutilisé les mêmes données que la
   * branche précédente, ou relancé une recherche ? Calculé (jamais deviné) par
   * `computeDataOrigin` à partir des VRAIES sources des deux réponses.
   * `undefined` hors d'une branche ; `null` quand la comparaison n'est pas
   * mesurable (un des deux tours n'a pas de panneau de transparence).
   */
  dataOrigin?: DataOrigin | null
}

type SidebarAccount = {
  id: string
  company_name: string | null
  priority_score: number | null
  /** Logo réel Apollo (`accounts.logo_url`) — déjà servi par `GET /accounts`. */
  logo_url: string | null
  /** Site du compte, uniquement pour le fallback favicon de `CompanyAvatar`. */
  website: string | null
  /**
   * ⚠️ Les quatre champs qui suivent servent à DÉRIVER l'état montré dans la
   * modale de portée (`accountState`). Ils étaient servis par `GET /accounts` et
   * jetés par la projection — la modale aurait donc annoncé « jamais analysé »
   * sur TOUS les comptes, y compris ceux analysés la veille.
   *
   * C'est la famille de défauts « un normaliseur avale les champs neufs » : le
   * champ existe côté API, il existe côté écran, et la projection au milieu le
   * perd sans que rien ne tombe. Ajouter un champ à `ScopeAccount` sans l'ajouter
   * ICI le referait.
   */
  status: string | null
  commercial_status: string | null
  last_analyzed_at: string | null
  signal_preview: { label: string } | null
}

/*
 * #1947 — il n'y a plus de fil PAR DÉFAUT. `/chat` nu désignait le fil
 * « general », toujours le même : « chaque fois que je clique sur "demander à
 * laura" […] pas systématiquement la même en mémoire ». Une arrivée sans fil
 * désigné tire désormais un fil NEUF ; « general » reste atteignable par sa clé
 * (`?conversationId=general`), qui est ce que pose la liste des conversations.
 */

/**
 * Une amorce du copilote : une PASTILLE courte et la requête complète qu'elle
 * envoie.
 *
 * Les amorces étaient la requête elle-même — « Quels comptes prioriser cette
 * semaine ? » — c'est-à-dire des questions qu'on peut poser à n'importe quel
 * chat. L'addendum (p9) demande l'inverse : des requêtes qui démontrent ce que
 * Bellum sait faire et enseignent un usage exécutable. Ces requêtes-là sont
 * longues ; les afficher entières transformerait l'écran d'accueil en mur de
 * texte. D'où la séparation : on montre l'intention, on envoie la commande.
 */
type ChatSuggestion = { label: string; prompt: string }

/** Les 8 familles d'usage (p9), déclinées sur le portefeuille quand aucun
 *  compte n'est actif. */
/**
 * #1909.8 / #1909.9 — les amorces qui supposent un outil BRANCHÉ.
 *
 * « Ne jamais proposer […] préparation de rendez-vous si aucun agenda […] écriture
 * CRM si aucun CRM ne peut être utilisé » ; #1902 : « aucune suggestion connue
 * comme impossible ne doit être visible ». La clé est celle du catalogue de
 * traduction — c'est elle qui dit ce que l'amorce demande. Pendant la lecture du
 * registre des outils, la liste est vide : l'amorce attend d'être vraie.
 */
const PROMPT_REQUIRES: Partial<Record<string, ToolFamily>> = {
  general4: 'crm',
  general5: 'calendar',
  account5: 'calendar',
  account7: 'crm',
  analysis3: 'crm',
}

function promptsAvailable(
  prefix: 'general' | 'account' | 'analysis',
  count: number,
  families: readonly ToolFamily[],
): number[] {
  return Array.from({ length: count }, (_, index) => index + 1).filter(n => {
    const needs = PROMPT_REQUIRES[`${prefix}${n}`]
    return !needs || families.includes(needs)
  })
}

function promptsGeneral(t: TFunction<'chat'>, families: readonly ToolFamily[]): ChatSuggestion[] {
  return promptsAvailable('general', 8, families).map(n => ({
    label: t(`prompts.general${n}.label`),
    prompt: t(`prompts.general${n}.prompt`),
  }))
}

function analysisActions(t: TFunction<'chat'>, families: readonly ToolFamily[]): ChatSuggestion[] {
  return promptsAvailable('analysis', 3, families).map(n => ({
    label: t(`prompts.analysis${n}.label`),
    prompt: t(`prompts.analysis${n}.prompt`),
  }))
}

/**
 * Le copilote partagé. Il EST l'écran `/chat` : surface pleine hauteur,
 * toujours ouverte.
 *
 * L'ancien mode flottant (panneau ancré, lanceur, fermeture vers une page
 * blanche) a été retiré avec le widget « Demandez à Bellum » : deux surfaces de
 * chat pour un même backend divergeaient — seule celle-ci sait scoper un compte,
 * tenir un fil de mémoire longue et montrer son contexte. Le point d'entrée
 * global est l'item « Copilote IA » de la barre latérale, qui route ici.
 *
 * Le scoping compte reste piloté par `?accountId=…` (lu plus bas) : tout appelant
 * peut ouvrir le copilote déjà cadré sur un compte.
 */
export function Chat() {
  const { t, i18n: chatI18n } = useTranslation('chat')
  /**
   * #1960.13 — L'INCIDENT DÉCLARÉ, s'il y en a un.
   *
   * Lu depuis les bannières que l'opérateur pose lui-même (`useActiveBanners`,
   * déjà interrogées par l'app) : rien n'est déduit d'un taux d'erreur ni d'un
   * 5xx. Sans drapeau posé, `declaredIncidentMessage` rend `null` et les refus
   * de cet écran ne changent pas d'un octet.
   */
  const { data: activeBanners } = useActiveBanners()
  const incidentMessage = declaredIncidentMessage(activeBanners, chatI18n.language)
  // Notre phrase d'ouverture est à NOUS (donc traduite, donc bilingue), le
  // texte qui suit est celui de l'opérateur : le refus dit qu'on sait, puis il
  // dit quoi.
  const knownIncident = incidentMessage ? t('messages.knownIncident', { message: incidentMessage }) : null
  // #1953.15-.18 — l'utilisateur courant, pour isoler le brouillon de saisie
  // (voir `composer-draft.ts` : jamais un brouillon visible par un autre compte).
  const { user } = useSession()
  /**
   * #1320 — en espace de démonstration, c'est le MOTEUR qui change, pas l'écran.
   *
   * La route faisait `isDemo ? <DemoChat /> : <Chat />` — deux cent six lignes
   * de coque parallèle, et un prospect qui voyait une bulle et une saisie grisée
   * là où le produit a une colonne de conversations, une portée, une mémoire, de
   * la transparence et des actions. Le drapeau descend donc ICI, où il ne
   * commande plus qu'une chose : d'où vient la réponse.
   */
  const isDemo = useIsDemo()
  const liveLocation = useLocation()
  /**
   * #3452 — PENDANT que le routeur charge l'écran suivant (clic « Découvrir »),
   * `useLocation` porte déjà l'adresse d'ARRIVÉE alors que ce composant est
   * encore monté : sans `conversationId`, l'effet de suivi d'URL tirait un fil
   * NEUF et le reflet #3367 renavigait vers `/chat?conversationId=<neuf>` 4 s
   * plus tard. Hors de `/chat`, on garde donc la dernière recherche vue ici.
   */
  const chatSearchRef = useRef(liveLocation.search)
  const location = {
    ...liveLocation,
    search: (chatSearchRef.current = searchWhileOnChat(liveLocation, chatSearchRef.current)),
  }
  const navigate = useNavigate()
  // #3939.3 — `?account=` est l'alias d'`?accountId=` : les deux cadrent le fil sur le compte.
  const initialAccountId =
    searchParamsFromRecord(location.search).get('accountId') ||
    searchParamsFromRecord(location.search).get('account') ||
    null
  // `?prompt=` pré-remplit la saisie SANS envoyer : le copilote ne part jamais
  // sur une question que le commercial n'a pas relue.
  const initialPrompt = searchParamsFromRecord(location.search).get('prompt') || ''
  // #2123.56 — le contexte du dossier qui a ouvert Laura (section, périmètre,
  // sources). Lu BRUT : c'est un objet, que `searchParamsFromRecord` aplatirait.
  const entryContext = (location.search as Record<string, unknown>).context
  /**
   * `?ask=` ENVOIE, et c'est la seule différence avec `?prompt=`.
   *
   * La distinction n'est pas cosmétique. `?prompt=` vient d'un autre écran et
   * propose une question que l'utilisateur n'a pas formulée : il la relit. `?ask=`
   * vient de la bibliothèque de commandes, où la phrase envoyée est affichée
   * SOUS le libellé au moment du clic — la relecture a déjà eu lieu, et
   * redemander une validation ferait de la bibliothèque un pré-remplissage de
   * plus, ce que le §9 du PDF 6 désigne précisément comme le défaut à corriger.
   */
  const initialAsk = searchParamsFromRecord(location.search).get('ask') || ''
  // #3809.1 — chargement et échec transmis à `ScopeDialog` : sans eux, son
  // onglet « compte » ne pouvait rendre QUE la liste ou rien, jamais dire
  // POURQUOI elle est vide (en cours de lecture, ou la requête a échoué).
  const {
    data: accountsData,
    isLoading: accountsLoading,
    isError: accountsError,
  } = useAccounts({
    status: 'completed',
  })
  const accounts = useMemo(() => buildSidebarAccounts(accountsData), [accountsData])
  /**
   * TOUS les comptes chargés — sans la coupe à 20 du panneau de gauche.
   *
   * ⚠️ La modale de portée annonce une recherche « dans les comptes » ; la lui
   * servir depuis `accounts` la limiterait aux vingt premiers, et un compte
   * cherché puis introuvable se lirait « ce compte n'existe pas » alors qu'il
   * est simplement au-delà de la coupe. Une recherche qui ment est pire qu'une
   * recherche absente.
   *
   * La coupe reste pour le PANNEAU, où elle protège le rendu d'une liste longue.
   */
  const allLoadedAccounts = useMemo(() => buildScopeAccountSource(accountsData), [accountsData])
  /**
   * #3766 Reste (lot K06 07/10) — le compte RÉEL derrière chaque jeton
   * `accountHref()` qu'une réponse scriptée de démonstration écrit
   * (`demo-chat-script.ts`) : l'UUID assigné par le semis varie par salle, et
   * ce nom → id est déjà chargé ici, sans appel réseau de plus.
   */
  const demoAccountIdByCompanyName = useMemo(
    () =>
      new Map(
        allLoadedAccounts
          .filter((account): account is typeof account & { company_name: string } => Boolean(account.company_name))
          .map(account => [account.company_name, account.id]),
      ),
    [allLoadedAccounts],
  )
  /**
   * Le nombre de comptes du portefeuille, tel que le SERVEUR le compte.
   *
   * `null` tant quaucune page nest arrivée : sans lui, le bouton de portée
   * affichait « 0 compte » pendant le chargement — un zéro qui dit exactement
   * le contraire du vrai à quelquun qui en a vingt.
   *
   * ⚠️ Ce que ce nombre compte EXACTEMENT : les comptes dont lANALYSE est
   * terminée (`status: 'completed'`, ci-dessus) — cest le périmètre que Laura
   * peut réellement lire, et cest volontaire. Ce nest PAS la population
   * « comptes suivis » de `/accounts`
   * (`commercial_status IN ('watching','opportunity','customer')`), qui a sa
   * propre définition côté serveur. Le libellé le dit désormais : « Tout le
   * portefeuille · N comptes analysés ». Il disait « N comptes », et la recette
   * du 29/08/2026 a lu deux nombres différents sous deux mots identiques.
   * Garde GA-70.
   */
  const portfolioCount = accountsData?.pages[0]?.pagination?.totalItems ?? null
  /**
   * `?conversationId=` ouvre un fil PRÉCIS — c'est ce que « Partager » colle.
   *
   * ⚠️ Sans ce paramètre, un lien ne pouvait désigner qu'un COMPTE, donc son fil
   * par défaut : la personne qui recevait le lien tombait sur une conversation
   * vide en croyant lire celle dont on lui parlait. Le compte reste dans l'URL
   * parce qu'il porte la PORTÉE, et que le fil seul ne la dit pas.
   *
   * Aucune permission nouvelle : le fil du copilote est team-scopé côté serveur
   * depuis la phase 2 multi-utilisateur (« chat is team-scoped »), et le lien ne
   * fait qu'atteindre ce que l'API sert déjà à tout membre de l'espace. C'est
   * distinct de D65, qui protège le corps des messages de MESSAGERIE dans la
   * timeline — un autre objet, une autre règle.
   */
  const sharedConversationId = searchParamsFromRecord(location.search).get('conversationId') || null
  // #2430.4 — `?version=` : un lien FIGÉ. Il ne borne que LE fil qu'il désigne
  // (effet de relecture plus bas) — changer de fil rend la lecture vivante.
  const sharedVersion = frozenVersionFrom(searchParamsFromRecord(location.search).get('version'))
  const initialConversationId =
    sharedConversationId ?? (initialAccountId ? conversationIdForAccount(initialAccountId) : null)

  /* Les deux mêmes valeurs, relues à CHAQUE rendu — c'est ce qui permet de
     suivre une navigation vers la même route (voir l'effet plus bas). */
  const urlAccountId = initialAccountId
  const urlConversationId = sharedConversationId
  const urlNew = searchParamsFromRecord(location.search).get('new') || null
  const urlFresh = searchParamsFromRecord(location.search).get('fresh') || null
  // #1921.9 — l'accueil de fin d'onboarding passe la main à Laura (`/chat?from=welcome`).
  const urlFromWelcome = searchParamsFromRecord(location.search).get('from') === 'welcome'
  /**
   * Théo L1 — sélecteur avancé — `?scope=<nature>:<id>` : LE DOSSIER PRÉCIS
   * CHOISI, dans l'adresse — un lien partageable (décision Louis 22/10/2026).
   *
   * Relu par le MÊME schéma que le corps d'un tour (`chatScopeObjectFromParam`) :
   * une nature inconnue ou un identifiant invalide ne cadrent RIEN, jamais une
   * portée devinée. La clé canonique sert à la comparaison d'URL plus bas.
   */
  const urlScopeObject = chatScopeObjectFromParam(searchParamsFromRecord(location.search).get('scope'))
  const urlScopeKey = urlScopeObject ? chatScopeObjectParam(urlScopeObject) : ''

  const [savedThreads, setSavedThreads] = useState<AgentChatHistoryItem[]>([])

  // #1947 — sans fil désigné, un fil NEUF (initialiseur paresseux : tiré une fois).
  const [activeConversationId, setActiveConversationId] = useState(() => initialConversationId ?? newConversationId())
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(initialAccountId)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState(initialPrompt)
  /**
   * #1953.15-.18 — la PORTÉE du brouillon de saisie, volontairement DIFFÉRENTE
   * d'`activeConversationId`.
   *
   * ⚠️ `activeConversationId` tire un UUID ALÉATOIRE à chaque montage pour un
   * fil neuf sans compte ni `?conversationId=` (`newConversationId()`, plus
   * bas) : un brouillon collé à cet identifiant serait introuvable au
   * rafraîchissement — exactement le cas le plus fréquent en recette (écrire
   * sur `/chat` nu, appuyer sur F5). Cette clé retombe donc sur ce qui SURVIT
   * au rechargement : le fil partagé de l'URL, sinon le compte actif, sinon un
   * panier commun (`'new'`) pour un fil neuf sans portée. Voir le docblock de
   * `composer-draft.ts` pour le détail et le compromis accepté (deux onglets
   * ouverts chacun sur un fil neuf SANS compte ne partagent PLUS ce panier : #6, il est propre à l'onglet).
   */
  const draftThreadId = urlConversationId ?? (selectedAccountId ? conversationIdForAccount(selectedAccountId) : 'new')
  /**
   * Les fichiers joints au PROCHAIN message.
   *
   * Ils sont vidés dès l'envoi : leurs identifiants accompagnent la question
   * qui les porte. #1954 — un document « pour cette conversation » reste
   * pourtant lu par TOUTES les questions suivantes du fil : le service IA le
   * retrouve par le fil (`fetch_documents_by_ids`, budget borné), sans que
   * l'écran renvoie ses identifiants à chaque message.
   */
  const [attachedDocs, setAttachedDocs] = useState<AttachedDoc[]>([])
  /**
   * #2668.1 — Louis, 20/09/2026 : « faut pas que ça l'écrive de manière
   * textuelle, juste la pastille au dessus suffit ». Les connecteurs choisis
   * pour CETTE question vivent ICI, à part de `input` — jamais une
   * transformation du texte tapé (le bloc à marqueurs de #2254 l'écrivait
   * encore, lisible). `handleSend` les accole à la question ENVOYÉE : le
   * libellé voyage par la pastille, pas par une saisie textuelle.
   */
  const [connectorLabels, setConnectorLabels] = useState<string[]>([])
  /**
   * #2428.12 — le collègue choisi au clic (menu « Mentionner un membre »),
   * id compris. `handleSend` ne le transmet que si son nom est ENCORE dans
   * ce qui part : éditer ou effacer le « @Nom » après le clic ne doit jamais
   * envoyer un id qui ne correspond plus à ce que dit le texte.
   */
  const [mentionedMember, setMentionedMember] = useState<MentionedMember | null>(null)
  const [sendingHere, setSending] = useState(false)
  /**
   * #4967 — l'écran est-il encore monté ? Un tour lancé ici peut finir après le démontage :
   * « le fil actif » ne dit alors plus rien de ce que la personne regarde.
   */
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  /**
   * #4967.2 — un tour de CE fil lancé par un écran déjà quitté tourne encore : « Laura cherche… »
   * reprend (et « Arrêter » l'atteint par le magasin). Quand il se termine, le fil persisté est relu
   * — UNE source de vérité, aucun texte gardé dans le magasin.
   */
  const backgroundState = useBackgroundTurnsStore(state => state.turns[activeConversationId])
  // Les fils dont CETTE instance a lancé le tour : `begin` notifie le magasin avant que `setSending`
  // soit appliqué — sans ceci, son propre tour passerait un instant pour un tour « d'arrière-plan ».
  const ownTurnsRef = useRef(new Set<string>())
  // #4967 (lot L6) — la recherche vit côté SERVEUR : au retour sur ce fil (autre écran, autre fil,
  // rechargement), le serveur dit si un tour y tourne encore ; à sa fin, le fil est relu.
  const serverTurn = useServerRunningTurn(activeConversationId, !isDemo)
  const serverTurnRef = useRef(serverTurn)
  serverTurnRef.current = serverTurn
  // #4967 (L14) — ouvrir un fil, c'est voir sa réponse : la marque « quitté en cours » s'efface ; la quitter
  // pendant qu'un tour y tourne la repose, pour que le retour sur /chat nu y ramène une fois fini.
  const returnUserId = user?.id ?? null
  useEffect(() => {
    if (isDemo || !returnUserId || !activeConversationId) return
    clearLeftWhileRunning(returnUserId, activeConversationId)
    const id = activeConversationId
    return () => {
      if (useBackgroundTurnsStore.getState().turns[id] === 'running' || serverTurnRef.current !== null)
        markLeftWhileRunning(returnUserId, id)
    }
  }, [isDemo, returnUserId, activeConversationId])
  const backgroundRunning =
    (backgroundState === 'running' || serverTurn !== null) &&
    !sendingHere &&
    !ownTurnsRef.current.has(activeConversationId)
  const sending = sendingHere || backgroundRunning
  const [backgroundTick, setBackgroundTick] = useState(0)
  const wasBackgroundRunning = useRef(false)
  useEffect(() => {
    if (wasBackgroundRunning.current && !backgroundRunning) setBackgroundTick(tick => tick + 1)
    wasBackgroundRunning.current = backgroundRunning
  }, [backgroundRunning])
  useEffect(() => {
    // La réponse prête est là, sous les yeux : elle n'est plus « à lire » ailleurs.
    if (backgroundState === 'ready') useBackgroundTurnsStore.getState().acknowledge(activeConversationId)
  }, [activeConversationId, backgroundState])
  /**
   * #1953.1 / #1953.2 — le contrôleur du tour DIFFUSÉ en vol, pour le bouton
   * « Arrêter ». Une ref, pas un state : l'aborter n'a pas besoin de
   * déclencher un rendu, et un state serait de toute façon périmé dans la
   * fermeture de `handleSend` capturée au moment de l'envoi.
   */
  const abortControllerRef = useRef<AbortController | null>(null)
  /**
   * #3809.1 (vu en passant, lot F03 09/10) — les fils dont le dernier tour a
   * été ABANDONNÉ par un CHANGEMENT DE FIL (jamais un « Arrêter » volontaire,
   * voir `stillHere` plus bas) : `persistTurn` n'enregistre que les tours
   * terminés, donc la réponse de Laura n'arrive jamais pour ce tour-là — le
   * fil resterait « En attente » indéfiniment, sans qu'on dise pourquoi. Une
   * ref de SESSION, jamais persistée : au retour sur ce fil PENDANT cette
   * même session, la relecture consomme l'entrée et ajoute une bulle qui NOMME
   * l'interruption plutôt que de laisser croire qu'aucune réponse n'a jamais
   * été tentée. Un rechargement complet de page perd ce souvenir — limite
   * ASSUMÉE : rien ne peut dire après coup qu'un tour a été abandonné sans
   * que le serveur l'enregistre lui-même (hors budget de ce lot).
   */
  const interruptedThreadsRef = useRef<Set<string>>(new Set())
  /**
   * #1953.12 — la branche en attente d'un envoi qu'on n'a pas encore lancé,
   * posée par `runBranch` juste avant d'appeler `handleSend`. Une ref, pas un
   * state : elle est consommée une seule fois, à l'intérieur de `handleSend`
   * lui-même (voir `pendingBranch` plus bas) — jamais lue par un rendu.
   */
  const pendingBranchRef = useRef<PendingBranch | null>(null)
  /**
   * #2519 — la bulle d'échec que le prochain envoi RELANCE, posée par
   * `relaunchFailedTurn` juste avant `handleSend` et consommée une seule fois
   * par lui (même discipline que `pendingBranchRef`).
   */
  const pendingRelaunchRef = useRef<{ message: ChatMessage; clearsDraft: boolean } | null>(null)
  // #3768 — le geste « retravailler cette réponse » en attente de son envoi.
  const pendingTransformRef = useRef<ReplyTransformRequest | null>(null)
  // #4397 (N1) — l'objet d'une suite cliquée, déposé par `handleComposerSend`, consommé UNE fois par `handleSend`.
  const pendingFollowUpRefRef = useRef<FollowUpRef | null>(null)
  /**
   * #1939.4 / #1939.13 — l'enregistrement de la question DICTÉE en cours de relecture.
   * Il part avec le prochain envoi de la saisie, puis s'efface ; il ne suit ni un
   * autre fil, ni une saisie vidée à la main.
   */
  const [pendingVoiceObjectId, setPendingVoiceObjectId] = useState<string | null>(null)
  // V13.3 (recette prod 08/10) — `ready` ferme la course au chargement :
  // tant qu'elle vaut `false`, le composer reste désactivé (plus bas) pour
  // qu'aucune frappe ne tombe dans la fenêtre où `setInput(stored)` peut
  // encore l'écraser ou produire des caractères parasites.
  const { ready: composerReady } = useChatComposerDraft(user?.id ?? null, draftThreadId, input, setInput, {
    // `?prompt=` est un pré-remplissage EXPLICITE déposé par un autre écran : il
    // gagne sur un brouillon local, une fois, au tout premier montage.
    skipInitialRestore: Boolean(initialPrompt),
    // #1953.16 — l'envoi vide la saisie avant la réponse : ce vide-là ne doit pas
    // effacer le brouillon stocké tant que le serveur n'a pas accepté le message.
    keepStoredWhileEmpty: sending,
    // #3648 — la frappe faite avant que la portée (compte) ne soit connue suit le fil.
    carryFromThread: 'new',
  })
  /**
   * #1947 / #1908 — la première prise de parole de Laura sur un fil vierge.
   * Locale tant que personne ne répond : une amorce abandonnée ne laisse aucune
   * trace en base (`handleSend` l'écrit AVEC le premier message).
   */
  const [opener, setOpener] = useState<string | null>(null)
  /**
   * #3773.1 — la salutation d'interface (« Bonjour Louis. Sur quoi avance-t-on ? ») n'est pas un
   * message du fil : elle ne s'écrit pas à l'envoi et ne part pas au modèle. Seules les prises de
   * parole qui posent une question rattachée à la réponse (brief du jour, passage de main,
   * « tu veux que je choisisse ? ») restent des messages — `lauraOpenerPersists`.
   */
  const [openerPersists, setOpenerPersists] = useState(false)
  /**
   * #2435.12 — un LIEN PARTAGÉ (`?conversationId=…`) dont le fil relu revient
   * VIDE : la conversation visée n'existe plus, ou n'est plus accessible
   * (espace différent, suppression). Volontairement à PART de `opener` — un
   * texte qui expliquerait l'accès perdu ne doit ni se persister comme une
   * vraie réponse de Laura (`handleSend` écrit `opener` AVEC le premier
   * message), ni partir dans l'historique envoyé au modèle.
   */
  const [deepLinkInaccessible, setDeepLinkInaccessible] = useState(false)
  /** #1944.18 — ce que le lecteur d'écran annonce à la fin d'un tour (vidé au départ du suivant). */
  const [announcement, setAnnouncement] = useState('')
  /** Le fil dont la relecture a abouti — l'amorce ne s'arme que sur un fil LU. */
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null)
  /** Le fil dont la relecture est TERMINÉE, lue ou en échec — `?ask` n'envoie qu'après. */
  const [settledConversationId, setSettledConversationId] = useState<string | null>(null)
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false)
  /**
   * « Sans compte » plutôt que « tout le portefeuille ».
   *
   * Côté API les deux sont l'ABSENCE de `accountId` — c'est pourquoi cet état
   * vit ici et non dans l'URL : ajouter un troisième état au contrat obligerait
   * chaque appelant historique de `?accountId=` à choisir, alors que la
   * distinction n'existe que pour l'interface. Voir `scopeAccountId`.
   */
  const [noAccountScope, setNoAccountScope] = useState(false)
  // #3772.5 — « sans dossier ciblé » ET exclusion stricte des données de l'espace.
  const [strictScope, setStrictScope] = useState(false)
  // #1951.2 / #1951.3 — un consultant ou un besoin.
  // Théo L1 — sélecteur avancé — désormais DANS l'URL (`?scope=`) : relu au montage.
  const [objectScope, setObjectScope] = useState<ObjectChatScope | null>(() =>
    urlScopeObject ? chatScopeFromObject(urlScopeObject) : null,
  )
  /**
   * #1951.18 / #1951.21 — LES PÉRIMÈTRES VISITÉS DANS CETTE SESSION, avec leur
   * fil. Ils vivent ICI et non dans `ScopeDialog` : c'est `Chat` qui APPLIQUE un
   * périmètre, et un fil d'Ariane tenu par la modale serait vide à chaque
   * réouverture. La pile ne persiste pas — voir `scope-trail.ts`.
   */
  const [scopeTrail, setScopeTrail] = useState<ScopeTrail>([])
  /** #1951.17 — le dernier changement, tant qu'il n'a pas été vu. */
  const [scopeChange, setScopeChange] = useState<ScopeChange | null>(null)

  const messagesBoxRef = useRef<HTMLDivElement>(null)
  // #2441.12 — vrai tant que la personne n'a pas remonté lire un message plus
  // haut dans le fil ; l'auto-scroll ne resaute en bas QUE si elle y était déjà.
  const wasNearBottomRef = useRef(true)
  /**
   * #1944.20 — L'HISTORIQUE PAR PAGES, vers le haut d'un fil VIVANT.
   *
   * Mesuré le 24/09/2026 (registre #1944.20) : le backend portait déjà
   * `before` (curseur de pagination, distinct de `version` — un lien FIGÉ)
   * mais aucun appelant ne le passait — un fil de plus de 50 messages avait
   * ses premiers échanges définitivement inatteignables depuis l'écran.
   *
   * Des REFS, pas des états : rien ici ne pilote un rendu (aucun indicateur
   * visible), et un `useCallback` qui listerait `messages` en dépendance
   * rebrancherait l'écouteur de scroll à CHAQUE token reçu pendant un flux.
   */
  const messagesRef = useRef(messages)
  const hasOlderMessagesRef = useRef(true)
  const loadingOlderMessagesRef = useRef(false)
  /** La géométrie du conteneur juste AVANT de préposer une page plus ancienne — sert à recaler `scrollTop` après coup, pour que le fil ne saute pas sous les yeux (voir l'effet `useLayoutEffect` plus bas). */
  const pendingOlderScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  /**
   * #1951.17 / #1951.21 — les trois valeurs que les deux gestes de portée
   * lisent, en RÉFÉRENCE et non en dépendance.
   *
   * `applyScope` et `returnToPreviousScope` sont passés en props à
   * `ScopeDialog` et à `ChatMain` ; les mettre en dépendance recréerait ces
   * fonctions à chaque changement de portée, donc remonterait les composants qui
   * les reçoivent — au moment précis où l'on vient de changer de portée. Elles
   * sont réassignées à chaque rendu, sous la portée calculée.
   */
  const scopeRef = useRef<ChatScope>(PORTFOLIO_SCOPE)
  const conversationRef = useRef(activeConversationId)
  const trailRef = useRef<ScopeTrail>([])
  // #3864-bis (recette RQ1 09/10) — la SAISIE en cours, lue par `applyScope`
  // au moment de confirmer un dossier, même patron que les trois références
  // ci-dessus.
  const inputDraftRef = useRef(input)

  /** #1939.9 — une saisie vidée à la main n'est plus la question dictée. */
  const handleInputChange = useCallback((value: string) => {
    setInput(value)
    if (!value.trim()) setPendingVoiceObjectId(null)
  }, [])

  /**
   * #1939.4 — la transcription arrive DANS la saisie, à la suite d'un brouillon
   * déjà tapé (jamais à sa place), et rien ne part : l'envoi reste le clic (#1939.10).
   */
  const handleVoiceTranscribed = useCallback(({ text, voiceObjectId }: ChatVoiceTranscription) => {
    setInput(current => (current.trim() ? `${current.trimEnd()} ${text}` : text))
    setPendingVoiceObjectId(voiceObjectId)
    textareaRef.current?.focus()
  }, [])

  // #1939.8 — un enregistrement appartient au fil où il a été dicté.
  useEffect(() => {
    setPendingVoiceObjectId(null)
  }, [activeConversationId])

  // V13.3 (recette prod 08/10) — le focus se pose UNE fois prêt, jamais avant :
  // la personne qui navigue vers /chat et tape tout de suite retrouve le
  // clavier au bon endroit dès que le champ s'active, sans avoir à cliquer
  // dedans.
  useEffect(() => {
    if (composerReady) textareaRef.current?.focus()
  }, [composerReady])

  /**
   * Suivre l'URL quand elle change — pas seulement au montage.
   *
   * ⚠️ Trouvé en recette : cliquer un fil dans la barre latérale posait bien
   * `?accountId=…&conversationId=…` dans la barre d'adresse, et l'écran ne
   * bougeait pas. `initialAccountId` est lu à l'initialisation d'un `useState`,
   * or naviguer vers la MÊME route ne remonte pas le composant : le fil restait
   * celui d'avant, avec une portée qui annonçait « tout le portefeuille » alors
   * que l'URL désignait un compte. Un lien qui mène quelque part sans que
   * l'écran suive est pire qu'un lien absent — on croit avoir changé de fil.
   *
   * La garde est la COMPARAISON : on ne réagit qu'à un changement RÉEL des
   * paramètres. Sans elle, l'effet se rejouerait à chaque rendu et écraserait la
   * portée choisie dans la modale, qui ne passe délibérément pas par l'URL.
   */
  // Théo L1 — la clé porte aussi le dossier précis (`?scope=`) : un lien vers une
  // autre offre est un changement RÉEL, une réécriture de la même n'en est pas un.
  const lastUrlKey = useRef(urlKeyOf(initialAccountId, sharedConversationId, urlScopeKey))
  /** #3477 — le fil désigné par la dernière URL absorbée, tant que l'état ne l'a pas rattrapé. */
  const urlDrivenConversationRef = useRef<string | null>(sharedConversationId)
  useEffect(() => {
    const key = urlKeyOf(urlAccountId, urlConversationId, urlScopeKey)
    if (key === lastUrlKey.current) return
    lastUrlKey.current = key
    // #3477 — le fil que CETTE URL vient de désigner : `activeConversationId`
    // ne le porte qu'au rendu SUIVANT (voir l'effet de reflet d'URL plus bas).
    urlDrivenConversationRef.current = urlConversationId
    // `?fresh=` possède cette transition (effet plus bas) : la suivre ici tirerait
    // DEUX fils neufs pour un seul clic.
    if (urlFresh) return
    setSelectedAccountId(urlAccountId)
    setNoAccountScope(false)
    setStrictScope(false)
    // Théo L1 — le dossier précis que l'adresse désigne, ou aucun.
    setObjectScope(urlScopeObject ? chatScopeFromObject(urlScopeObject) : null)
    setActiveConversationId(
      urlConversationId ?? (urlAccountId ? conversationIdForAccount(urlAccountId) : newConversationId()),
    )
    // `urlScopeObject` se déduit de `urlScopeKey` (même valeur, objet recréé à chaque rendu).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlAccountId, urlConversationId, urlFresh, urlScopeKey])

  /**
   * `?new=` — « Nouvelle conversation », d'où qu'on clique.
   *
   * ⚠️ Le bouton de la barre latérale pointait sur `/chat`. Depuis l'écran
   * `/chat` nu, l'URL ne changeait pas : aucun rendu, RIEN ne se passait, et le
   * bouton avait l'air cassé. Depuis un fil ouvert, il faisait pire — il
   * ramenait sur `general`, un fil DÉJÀ écrit, en laissant croire qu'on
   * repartait de zéro.
   *
   * #4539 (recette prod 25/10) — il ouvre DIRECTEMENT un fil vierge (portefeuille)
   * sur le composeur focalisé, SANS modale : une modale qui s'ouvre d'elle-même
   * captait la frappe immédiate et le texte déjà tapé se perdait. Le dossier est
   * OPTIONNEL, il se choisit ensuite par le bouton de portée (geste explicite).
   * Le fil vierge passe par `applyScope` : le brouillon suit le fil qui s'ouvre.
   *
   * Le paramètre est retiré de l'URL dès qu'il est consommé. C'est ce qui rend
   * le bouton rejouable : sans ce nettoyage, le second clic écrirait la même
   * URL que le premier et ne déclencherait rien — exactement le défaut qu'on
   * corrige.
   */

  /**
   * #3469 / #3482.2 — le champ a le focus dès le montage, et le reprend quand le
   * choix de portée se referme. Recette prod du 01/10 sur `/chat?new=1` : AUCUNE
   * modale, `document.activeElement = BODY`, donc la frappe immédiate partait
   * dans le vide (« ésenter notre modèle… »). Le focus n'est jamais volé : il
   * n'est posé que s'il est libre (`body`) — une modale ouverte garde le sien.
   *
   * Vu en passant (lot V10, 08/10, recette prod Q #3899) — ce correctif
   * différait TOUJOURS le focus d'un tour (`setTimeout(…, 0)`), y compris au
   * montage SANS modale : exactement la fenêtre qu'il visait à fermer,
   * rouverte plus courte. Le délai n'a de raison d'être qu'à la FERMETURE de
   * la modale (elle rend encore son focus à `body` juste après cet effet) ;
   * au montage (ou à tout changement qui n'est pas une fermeture), rien ne
   * dispute le focus : le poser tout de suite évite la fenêtre.
   */
  const scopeDialogWasOpenRef = useRef(false)
  // R10C-FIX — verrou d'idempotence de `applyScope` (un geste = un fil).
  const scopeAppliedForOpenRef = useRef(false)
  useEffect(() => {
    if (scopeDialogOpen) {
      scopeAppliedForOpenRef.current = false
      scopeDialogWasOpenRef.current = true
      return
    }
    const focusFieldIfFree = () => {
      const field = textareaRef.current
      if (!field || field.disabled) return
      const active = document.activeElement
      const focusIsFree = !active || active === document.body || !active.isConnected
      if (focusIsFree) field.focus({ preventScroll: true })
    }
    if (!scopeDialogWasOpenRef.current) {
      focusFieldIfFree()
      return
    }
    scopeDialogWasOpenRef.current = false
    // Différé d'un tour : à la fermeture, la modale rend encore son focus à `body`
    // (rien ne l'a ouverte) juste après cet effet.
    const timer = window.setTimeout(focusFieldIfFree, 0)
    return () => window.clearTimeout(timer)
  }, [scopeDialogOpen])

  /**
   * `?fresh=` — « Demander à Laura » (#1947) : une NOUVELLE discussion, tout de
   * suite, sur le portefeuille. Sans la modale de « Nouvelle conversation »
   * (#1131) : « directement », dit le retour, et la portée affichée dans
   * l'en-tête se change ensuite d'un clic.
   *
   * Même patron que `?new=` : consommé, puis retiré de l'URL — sans quoi le clic
   * suivant écrirait la même adresse et ne ferait rien, y compris sur un fil nu
   * déjà entamé, dont la clé n'est pas dans l'adresse.
   *
   * ⚠️ Arrivé AVEC `?fresh=` depuis un autre écran, le fil du montage peut
   * déjà être neuf : en tirer un second relirait un fil vide pour rien.
   * `freshAtMount` l'évite une fois, puis s'efface.
   *
   * #3939.3 (recette prod 14/10, Sanofi) — ⚠️ ce n'est vrai QUE sans compte ni
   * fil partagé dans l'URL. Avec un `accountId`, `initialConversationId`
   * (plus haut) résout sur `conversationIdForAccount(accountId)` : le fil
   * DÉTERMINISTE — donc EXISTANT — du compte, jamais un fil neuf. Croire le
   * montage « déjà neuf » dans ce cas laissait `?fresh=1&accountId=<id>`
   * rouvrir le fil du compte au lieu d'en ouvrir un.
   */
  const mountAlreadyOpenedAFreshThread = Boolean(urlFresh) && !initialAccountId && !sharedConversationId
  const freshAtMount = useRef(mountAlreadyOpenedAFreshThread)
  useEffect(() => {
    if (!urlFresh) return
    // #3939.3 (R13, prod 15/10) — avec un compte, le fil neuf DOIT voyager dans l'adresse : si l'écran
    // est remonté après le retrait de `fresh`, `initialConversationId` résout `account-<id>` (le fil
    // EXISTANT) et l'ancien contenu revenait. `conversationId=<nouvel id>` survit au remontage.
    let freshThreadForAccount: string | null = null
    if (freshAtMount.current) {
      freshAtMount.current = false
    } else {
      // #3215.4 — `?fresh=1&accountId=<id>` (« Demander à Laura » depuis la fiche d'un
      // compte) cadre le fil neuf SUR ce compte ; sans `accountId`, le portefeuille.
      setSelectedAccountId(urlAccountId)
      setNoAccountScope(false)
      setStrictScope(false)
      setObjectScope(null)
      const freshId = newConversationId()
      if (urlAccountId) {
        freshThreadForAccount = freshId
        // L'adresse réécrite désigne ce fil : l'effet de suivi d'URL ne doit pas y voir un changement.
        lastUrlKey.current = urlKeyOf(urlAccountId, freshId, '')
        urlDrivenConversationRef.current = freshId
      }
      setActiveConversationId(freshId)
    }
    // #3215.4 — seul `fresh` est retiré : retirer aussi `accountId` faisait
    // retomber la portée sur « Tout mon espace » (recette prod du 05/10).
    void navigate({
      to: '/chat',
      search: urlAccountId
        ? freshThreadForAccount
          ? { accountId: urlAccountId, conversationId: freshThreadForAccount }
          : { accountId: urlAccountId }
        : {},
      replace: true,
    })
  }, [urlFresh, urlAccountId, navigate])

  /**
   * #1921.9 — `?from=welcome` : l'accueil de fin d'onboarding passe la main à
   * Laura, qui prend la parole avec la phrase de relais (`justOnboarded`) au
   * lieu de l'amorce générique.
   *
   * Même patron que `?fresh=` : consommé, puis retiré de l'URL — un
   * rechargement ne rejoue pas un passage de main déjà fait. Une référence et
   * non un état : l'amorce la lit quand son minuteur échoit, et un état de plus
   * en dépendance relancerait ce minuteur.
   */
  const justOnboarded = useRef(false)
  useEffect(() => {
    if (!urlFromWelcome) return
    justOnboarded.current = true
    void navigate({ to: '/chat', search: {}, replace: true })
  }, [urlFromWelcome, navigate])

  // Amener la vue sur le dernier message. Voir `MessagesArea` : le défilement
  // doux est un no-op sur ce conteneur, seule l'affectation directe agit.
  //
  // #2441.12 — SAUF si la personne a remonté lire un message plus haut : un
  // nouveau token/message ne doit pas lui arracher la lecture en cours.
  useEffect(() => {
    const box = messagesBoxRef.current
    if (!box) return
    if (!wasNearBottomRef.current) return
    followBottom(box)
  }, [messages, sending])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  /**
   * #1944.20 — CHARGE LA PAGE PLUS ANCIENNE, à partir du plus ancien message
   * déjà à l'écran. Référence STABLE (dépend seulement du fil ouvert, jamais
   * de `messages` — voir la doc des refs ci-dessus) : le scroll listener plus
   * bas peut donc rester monté pendant tout un flux sans se rebrancher.
   *
   * Recale `scrollTop` après coup (voir l'effet `useLayoutEffect` plus bas) :
   * préposer des messages plus haut grandit le conteneur PAR LE HAUT, et sans
   * ce recalage la vue saute vers le bas d'exactement la hauteur ajoutée.
   */
  const loadOlderMessages = useCallback(() => {
    if (loadingOlderMessagesRef.current || !hasOlderMessagesRef.current) return
    const oldest = messagesRef.current[0]
    if (!oldest?.timestamp) return
    const box = messagesBoxRef.current
    if (box) pendingOlderScrollRef.current = { scrollHeight: box.scrollHeight, scrollTop: box.scrollTop }
    loadingOlderMessagesRef.current = true
    void listAgentChatMessages({
      accountId: selectedAccountId,
      conversationId: activeConversationId,
      before: oldest.timestamp,
    })
      .then(saved => {
        if (saved.length === 0) {
          hasOlderMessagesRef.current = false
          return
        }
        const branches = resolveSavedBranches(saved)
        setMessages(previous => [
          ...saved.map(row => ({ ...toChatMessage(row), ...(row.id ? (branches.get(row.id) ?? {}) : {}) })),
          ...previous,
        ])
        if (saved.length < CHAT_HISTORY_PAGE_SIZE) hasOlderMessagesRef.current = false
      })
      .catch(error => {
        // Un échec n'épuise pas l'historique : nouvelle tentative au prochain défilement.
        console.error('[Chat history:older]', error)
        pendingOlderScrollRef.current = null
      })
      .finally(() => {
        loadingOlderMessagesRef.current = false
      })
  }, [selectedAccountId, activeConversationId])

  /**
   * #2441.12 / #1944.20 — écoute le scroll MANUEL de la personne : savoir, au
   * prochain message, si elle était déjà en bas (`shouldAutoScroll`), et
   * charger la page plus ancienne quand elle remonte près du haut
   * (`shouldLoadOlderMessages`) — deux décisions pures, testées en isolation,
   * jsdom ne calculant jamais de vraie hauteur.
   */
  useEffect(() => {
    const box = messagesBoxRef.current
    if (!box) return
    const onScroll = () => {
      const geometry = { scrollTop: box.scrollTop, scrollHeight: box.scrollHeight, clientHeight: box.clientHeight }
      wasNearBottomRef.current = shouldAutoScroll(geometry)
      if (shouldLoadOlderMessages(geometry)) loadOlderMessages()
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => box.removeEventListener('scroll', onScroll)
  }, [loadOlderMessages])

  // #1944.20 — RECALE `scrollTop` après une page plus ancienne préposée, pour
  // que le fil ne saute pas sous les yeux (avant peinture : `useLayoutEffect`,
  // jamais `useEffect`, qui laisserait le saut s'afficher une frame).
  useLayoutEffect(() => {
    const pending = pendingOlderScrollRef.current
    if (!pending) return
    pendingOlderScrollRef.current = null
    const box = messagesBoxRef.current
    if (!box) return
    box.scrollTop = box.scrollHeight - pending.scrollHeight + pending.scrollTop
  }, [messages])

  // Relecture du fil actif. C'est LA capacité que seul le widget flottant avait :
  // le copilote repartait d'un `useState([])` à chaque montage et perdait tout au
  // rechargement. Le fil est workspace-scopé côté API — on ne relit que le sien.
  // Le jeton de course évite qu'une réponse lente d'un fil quitté n'écrase le fil
  // courant (l'utilisateur peut enchaîner les conversations plus vite que le réseau).
  const loadedHistoryKeyRef = useRef<string | null>(null)
  /**
   * #3769 (lot Q02, recette prod 09/10 soir) — le fil dont la relecture est EN VOL. Le premier envoi
   * après une navigation était perdu (texte effacé, rien envoyé, 3 fois sur 4) : l'envoi écrit le fil,
   * `threadsVersion` avance, l'écran pose `?conversationId=` dans l'adresse, `sharedConversationId`
   * change — l'effet ci-dessous repartait alors (clé inchangée mais relecture pas encore revenue, donc
   * `loadedHistoryKeyRef` encore vide), ABOLISSAIT le tour en vol et VIDAIT la liste. Une relecture déjà
   * lancée pour CETTE clé n'est jamais relancée.
   */
  const pendingHistoryKeyRef = useRef<string | null>(null)
  useEffect(() => {
    // #3367 — quand c'est l'écran lui-même qui pose la clé du fil écrit dans
    // l'URL, `sharedConversationId` avance SANS que le fil change : relire
    // viderait la réponse affichée pour la remplacer par l'historique serveur.
    const version = activeConversationId === sharedConversationId ? sharedVersion : null
    const historyKey = `${selectedAccountId ?? ''}|${activeConversationId}|${version ?? ''}|${backgroundTick}`
    if (loadedHistoryKeyRef.current === historyKey) return
    if (pendingHistoryKeyRef.current === historyKey) return
    loadedHistoryKeyRef.current = null
    pendingHistoryKeyRef.current = historyKey
    // #3809 (ajout, call bêta 08/10) — un tour encore en vol sur le fil qu'on
    // QUITTE (ex. « Nouvelle conversation » cliquée pendant que Laura répond
    // encore) abolissait son propre signal, DONC JAMAIS celui de ce fil : la
    // réponse continuait d'arriver en fond, et `sending` restait vrai jusqu'à
    // sa fin — le composeur du fil NEUF se lisait bloqué. Changer de fil
    // ABOLIT maintenant le tour laissé derrière, exactement comme le bouton
    // « Arrêter » (même signal, même traitement : la bulle partielle n'est pas
    // perdue si le serveur l'avait déjà acceptée, voir `handleSend`).
    abortControllerRef.current?.abort()
    // Plus de `let current` fermé sur l'exécution : le nettoyage de l'effet tournait aussi quand la
    // clé n'avait pas changé et rendait la relecture en vol « périmée ». Elle l'est quand une AUTRE
    // clé a pris sa place.
    const isCurrent = () => pendingHistoryKeyRef.current === historyKey
    setMessages([])
    setOpener(null)
    setDeepLinkInaccessible(false)
    setLoadedConversationId(null)
    setSettledConversationId(null)
    // #1944.20 — un fil neuf repart avec la question ouverte : « peut-être »
    // encore des messages plus anciens, tant que la première page ne l'a pas
    // tranchée (voir le `.then` ci-dessous).
    hasOlderMessagesRef.current = true
    loadingOlderMessagesRef.current = false
    pendingOlderScrollRef.current = null
    void listAgentChatMessages({
      accountId: selectedAccountId,
      conversationId: activeConversationId,
      version,
    })
      .then(saved => {
        if (!isCurrent()) return
        loadedHistoryKeyRef.current = historyKey
        // Recette du 13/09 — ?ask sur un fil vierge : la lecture du fil écrasait la question
        // (puis la réponse, qui remplaçait le « dernier » message d'une liste vide).
        // Ce qui a été ajouté À L'ÉCRAN pendant la lecture — envoi tapé avant la fin
        // du chargement, `?prompt` puis Entrée, carte qui envoie — vient APRÈS le fil
        // relu : la liste est vidée au changement de fil, donc hors envoi précoce
        // `previous` est vide et ceci reste un remplacement.
        // #1953.11 / #1953.22 — la provenance des branches, résolue sur le fil
        // ENTIER : l'heure de la réponse dont une réédition repart est celle
        // d'un AUTRE message de la liste, donc le calcul ne peut pas se faire
        // bulle par bulle. Sans cette ligne, un rechargement remettait les deux
        // échanges côte à côte sans dire que le second rejouait le premier.
        const branches = resolveSavedBranches(saved)
        const savedMessages = saved.map(row => ({
          ...toChatMessage(row),
          ...(row.id ? (branches.get(row.id) ?? {}) : {}),
        }))
        // #3809.1 — retour sur un fil qu'on a quitté pendant que Laura répondait
        // encore : rien n'a jamais été enregistré pour ce tour (voir le docstring
        // d'`interruptedThreadsRef`), donc la dernière ligne relue reste celle de
        // la PERSONNE. Consommé une fois (`.delete` rend `true` une seule fois) :
        // un envoi réussi depuis sur ce même fil ne redit plus l'interruption.
        const interrupted = interruptedThreadsRef.current.delete(activeConversationId)
        const lastSaved = savedMessages[savedMessages.length - 1]
        setMessages(previous => [
          ...savedMessages,
          ...(interrupted && lastSaved?.role === 'user'
            ? [{ ...assistantMessage(''), interruptedByNavigation: true }]
            : []),
          ...previous,
        ])
        // #2435.12 — un LIEN PARTAGÉ (`?conversationId=`, jamais un fil ouvert
        // par la colonne ou un fil neuf) dont la relecture revient VIDE : la
        // conversation visée n'existe plus dans CET espace. Un partage ne
        // pointe jamais sur un fil qui n'a encore aucun message — le premier
        // message d'un fil partagé existait forcément au moment du partage
        // (`ReplyRetryMenu.share`) — donc vide ICI veut dire perdu, jamais
        // « conversation qui vient de naître ».
        if (sharedConversationId && sharedConversationId === activeConversationId && saved.length === 0) {
          setDeepLinkInaccessible(true)
        }
        // #1947 — l'amorce ne s'arme que sur un fil LU : un fil déjà écrit mais
        // lent à charger se serait vu servir un « Bonjour » par-dessus.
        setLoadedConversationId(activeConversationId)
        setSettledConversationId(activeConversationId)
        // #1944.20 — une PREMIÈRE page plus courte que le défaut serveur
        // (`CHAT_HISTORY_PAGE_SIZE`) veut dire qu'il n'y a rien de plus ancien :
        // aucun défilement ne doit alors partir chercher une page vide.
        if (saved.length < CHAT_HISTORY_PAGE_SIZE) hasOlderMessagesRef.current = false
      })
      .catch(error => {
        // Un fil illisible ne doit pas bloquer l'écran : on reste sur l'état vide,
        // l'utilisateur peut écrire malgré tout.
        console.error('[Chat history]', error)
        // #1955.12 — un fil partagé qui cite un compte hors du portefeuille du
        // lecteur est REFUSÉ par le serveur (403) : l'écran le dit, plutôt
        // qu'un fil vide qui se lirait « cette conversation n'existe pas ».
        if (isCurrent() && error instanceof ApiError && error.status === 403) toast.error(t('share.forbidden'))
        // `?ask` part quand même, sur un fil supposé vierge : la question que la
        // bibliothèque a envoyée ne se perd pas parce que la relecture a échoué.
        // L'amorce, elle, reste désarmée — elle ne parle que sur un fil LU.
        if (isCurrent()) {
          // Une relecture ÉCHOUÉE n'est plus « en vol » : le prochain changement de dépendance peut la retenter.
          pendingHistoryKeyRef.current = null
          setSettledConversationId(activeConversationId)
        }
      })
    // Les deux changent toujours ENSEMBLE (une conversation porte son compte),
    // dans le même gestionnaire : React les regroupe, donc une seule relecture.
    // #2430.4 — la version figée relit aussi : passer du lien figé au fil vivant.
  }, [activeConversationId, selectedAccountId, sharedConversationId, sharedVersion, backgroundTick])

  /**
   * La version de la liste des fils — elle avance quand un tour vient d'être
   * ENREGISTRÉ, pour que la colonne « Conversations » se relise. Trouvé en
   * recette du lot 1 (#1947) : un fil neuf par clic, et la colonne ne le
   * montrait qu'au rechargement.
   */
  const [threadsVersion, setThreadsVersion] = useState(0)
  /**
   * #3493 — QUEL fil vient de s'écrire. `threadsVersion` dit seulement « un fil
   * a été écrit dans cette session » : sans ceci, un fil NEUF (encore vide)
   * ouvert ensuite était posé dans l'URL, puis relu vide = « conversation
   * plus accessible », message perdu.
   */
  const writtenConversationRef = useRef<string | null>(null)
  const refreshSavedThreads = useCallback(() => {
    void listAgentChatHistory()
      .then(setSavedThreads)
      .catch(error => console.error('[Chat threads]', error))
  }, [])

  useEffect(() => refreshSavedThreads(), [refreshSavedThreads])

  /**
   * #3367 — LE FIL VIENT DE S'ÉCRIRE POUR DE VRAI : L'ADRESSE LE PORTE.
   *
   * Constat de recette (29/09/2026) : un fil frais (`newConversationId()`,
   * tiré par #1947, jamais posé dans l'URL par construction — voir l'effet
   * de portée plus haut) ne survivait qu'en état React. Un rechargement de
   * `/chat` perdait donc sa clé, en tirait une AUTRE (comportement voulu pour
   * une arrivée neuve, #1947), et le fil abandonné restait certes dans la
   * base — mais sa seule porte de retour, un clic depuis la liste, menait à
   * une adresse que l'écran n'avait jamais vue : rien ne le distinguait d'un
   * fil qu'on n'a pas encore ouvert cette session.
   *
   * `threadsVersion` n'avance qu'APRÈS une écriture serveur RÉUSSIE (jamais
   * avant, jamais sur un brouillon abandonné) : c'est la garde qui évite de
   * poser dans l'URL un fil encore vide, contrairement à #1947 qui refuse
   * justement ça pour un fil neuf. Une fois écrit, le reflet inverse devient
   * légitime — l'adresse doit dire ce qui est déjà en base, pas avant.
   *
   * `replace: true` : on ne remplit pas l'historique du navigateur d'une
   * entrée par échange, seulement l'adresse courante.
   */
  useEffect(() => {
    if (threadsVersion === 0) return
    // #3939.3 — `?fresh=` possède la transition : `activeConversationId` est encore le fil
    // ÉCRIT du compte dans ce rendu, le refléter re-posait `conversationId=account-<id>`
    // et l'effet de suivi d'URL rouvrait l'ancien fil.
    if (urlFresh) return
    if (writtenConversationRef.current !== activeConversationId) return
    if (urlConversationId === activeConversationId) {
      // L'état a rattrapé l'URL : la demande du clic est soldée.
      urlDrivenConversationRef.current = null
      return
    }
    // #3477 — un clic dans la colonne vient de changer l'URL ; l'effet qui la
    // suit a déjà demandé ce fil, mais `activeConversationId` est périmé dans
    // CE rendu : renaviguer ici défaisait le clic (« rien n'apparaît »).
    if (urlConversationId && urlConversationId === urlDrivenConversationRef.current) return
    // Théo L1 — le dossier précis reste dans l'adresse une fois le fil écrit : un
    // rechargement ou un lien collé retrouve le fil ET ce que Laura y lit.
    const scopeParam = scopeParamOf(objectScope)
    lastUrlKey.current = urlKeyOf(selectedAccountId, activeConversationId, scopeParam)
    void navigate({
      to: '/chat',
      search: {
        ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
        conversationId: activeConversationId,
        ...(scopeParam ? { scope: scopeParam } : {}),
      },
      replace: true,
    })
  }, [threadsVersion, activeConversationId, selectedAccountId, objectScope, urlConversationId, urlFresh, navigate])

  /**
   * #1954 — un document « pour cette conversation » n'est lu que par SON fil.
   * Laissé dans la saisie d'un autre fil, il partirait avec la question et Laura
   * répondrait « je n'ai reçu aucun fichier » sous une pièce affichée. Changer de
   * fil le retire donc de la saisie ; le document reste rattaché à son fil.
   */
  useEffect(() => {
    setAttachedDocs(previous => {
      const kept = previous.filter(doc => doc.scope !== 'conversation' || doc.conversationId === activeConversationId)
      return kept.length === previous.length ? previous : kept
    })
  }, [activeConversationId])

  const deleteDocument = useDeleteRagDocument()
  /**
   * #1954.20 — « retirer » une pièce jointe SUPPRIME le document ingéré (Louis,
   * 12/09/2026) : la décrocher de l'écran le laissait dans la base. La pièce ne
   * quitte la saisie qu'une fois le document supprimé ; un échec se DIT et la
   * pièce reste pour qu'on réessaie. Un 404 veut dire « déjà parti ».
   */
  const removeAttachment = async (id: string) => {
    const doc = attachedDocs.find(entry => entry.id === id)
    const name = doc?.name ?? ''
    // #2148.16 — une pièce ÉPHÉMÈRE (cas a) n'a aucune ligne à supprimer :
    // rien n'a jamais été écrit, donc rien à demander au serveur.
    if (doc?.ephemeral) {
      // #2876 (#2433.4) — une pièce retirée AVANT l'envoi n'a jamais rejoint
      // un message : son URL locale ne sert plus à rien, on la libère.
      if (doc.imageUrl) URL.revokeObjectURL(doc.imageUrl)
      setAttachedDocs(previous => previous.filter(entry => entry.id !== id))
      return
    }
    try {
      await deleteDocument.mutateAsync(id)
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        console.error('[Chat attach remove]', error)
        toast.error(t('attach.removeFailed', { name }), { duration: TOAST_PROBLEM_MS })
        return
      }
    }
    setAttachedDocs(previous => previous.filter(doc => doc.id !== id))
  }

  const updateAttachmentScope = useUpdateRagDocumentScope()
  /**
   * #1954.22 puis #2779 — changer la portée d'un document DÉJÀ attaché, vers
   * N'IMPORTE LAQUELLE des cinq portées du contrat (`attachScopesFor`, la
   * MÊME liste qu'à l'ajout — #2779 les avait laissées à deux). `conversation`
   * porte le fil ACTIF, `account` porte le compte du fil : un document ne peut
   * pas se resserrer sur une cible qui n'existe pas. Un échec se DIT et la
   * carte garde son ancienne portée (pas d'optimisme non confirmé, même
   * discipline que `removeAttachment`).
   */
  const changeAttachmentScope = async (id: string, nextScope: RagDocumentScope) => {
    const doc = attachedDocs.find(entry => entry.id === id)
    if (!doc || doc.scope === nextScope) return
    if (nextScope === 'conversation' && !activeConversationId) return
    if (nextScope === 'account' && !selectedAccountId) return
    const placement = ragScopePlacement(nextScope, {
      conversationId: activeConversationId,
      accountId: selectedAccountId,
    })
    try {
      await updateAttachmentScope.mutateAsync({ id, ...placement })
    } catch (error) {
      console.error('[Chat attach scope]', error)
      toast.error(t('attach.scope.changeFailed', { name: doc.name }), { duration: TOAST_PROBLEM_MS })
      return
    }
    setAttachedDocs(previous =>
      previous.map(entry =>
        entry.id === id ? { ...entry, scope: nextScope, conversationId: placement.conversationId ?? null } : entry,
      ),
    )
  }

  // #1954.19 — PRÉVISUALISER une pièce déjà attachée : un clic ouvre un aperçu
  // de son contenu. `null` = fermée ; le nom voyage à part du contenu (rendu
  // tout de suite, avant que la requête réponde).
  const [previewAttachment, setPreviewAttachment] = useState<{
    id: string
    name: string
    /** #2148.16 — texte déjà connu d'une pièce ÉPHÉMÈRE (cas a) : `undefined`
     *  pour une pièce durable (cas b), qui reste lue par son `id` serveur. */
    content?: string
    /** #2876 (#2433.4) — l'URL locale de l'image SOURCE, quand la pièce en est
     *  une : la preuve visuelle, montrée à côté (ou à la place) du texte lu. */
    imageUrl?: string
    /** #2876 (#2433.4) — l'identifiant `storage_objects` d'une image de message
     *  DÉJÀ ENVOYÉ, quand `imageUrl` n'est pas déjà connu de cet onglet. */
    imageObjectId?: string
    /** #2433.4 (lot M10) — les zones de lecture de l'image, surlignées dans l'aperçu. */
    citations?: ChatImageCitation[]
    /** #2433.12 (lot P02) — recadrage proposé et tableau lu, rendus dans l'aperçu. */
    objects?: ChatImageObjects
  } | null>(null)
  const previewAttachedDocument = (id: string) => {
    const doc = attachedDocs.find(entry => entry.id === id)
    if (!doc) return
    setPreviewAttachment({
      id: doc.id,
      name: doc.name,
      content: doc.ephemeral ? (doc.text ?? '') : undefined,
      imageUrl: doc.imageUrl,
      imageObjectId: doc.imageObjectId,
      citations: doc.citations,
      objects: doc.objects,
    })
  }
  // #2876 (#2433.4) — rouvrir la pièce jointe d'un message DÉJÀ ENVOYÉ : la
  // preuve visuelle vient directement de la bulle (`message.attachments`),
  // jamais d'une recherche dans `attachedDocs` (vidé après l'envoi, #1274).
  // `imageUrl` (session en cours) ou `imageObjectId` (fil rechargé, ou relu
  // par un collègue) — au moins l'un des deux fait la pièce cliquable.
  const openSentAttachment = (attachment: {
    id: string
    name: string
    imageUrl?: string
    imageObjectId?: string
    citations?: ChatImageCitation[]
    objects?: ChatImageObjects
  }) => {
    if (!attachment.imageUrl && !attachment.imageObjectId) return
    setPreviewAttachment({
      id: attachment.id,
      name: attachment.name,
      imageUrl: attachment.imageUrl,
      imageObjectId: attachment.imageObjectId,
      citations: attachment.citations,
      objects: attachment.objects,
    })
  }

  // #4066.1 — la file d'attente : un message tapé PENDANT la réponse attend son tour ici
  // (jamais envoyé au serveur avant), une file par fil, retrouvée au rechargement (#4066.5).
  const queueDispatchRef = useRef<(text: string) => boolean>(() => false)
  const sendQueue = useSendQueue({
    storageKey: user?.id ? `chat:${user.id}:${draftThreadId}` : null,
    busy: sending,
    dispatch: text => queueDispatchRef.current(text),
  })
  const suspendQueue = sendQueue.suspend

  const handleSend = useCallback(
    async (text?: string) => {
      // #2519 — la bulle d'échec que CET envoi relance, consommée une fois
      // (avant la garde : une relance refusée ne doit pas fuir sur l'envoi suivant).
      const relaunch = pendingRelaunchRef.current
      pendingRelaunchRef.current = null
      // #3768 — le geste « retravailler cette réponse » déposé par `handleTransform`,
      // consommé UNE fois ici (comme `relaunch`) : un envoi refusé par une garde
      // plus bas ne le laisse jamais fuir sur la question suivante.
      const replyTransform = pendingTransformRef.current
      pendingTransformRef.current = null
      // #4397 (N1) — consommé ici, comme `replyTransform` : il ne fuit jamais sur la question suivante.
      const followUpRef = pendingFollowUpRefRef.current
      pendingFollowUpRefRef.current = null
      const failedTurn = relaunch?.message.failedTurn
      const rawInput = text ?? input
      const typed = rawInput.trim()
      // #2668.1 — les connecteurs choisis DANS LE COMPOSER n'appartiennent
      // qu'à la saisie vivante : un `text` donné en override (relance, amorce,
      // `?ask=`) ne les porte jamais, ils resteront posés pour la PROCHAINE
      // question tapée.
      const pendingConnectors = text === undefined ? connectorLabels : []
      // #2428.12 — même garde que `pendingConnectors` (un `text` donné en
      // override, relance/amorce/`?ask=`, ne porte jamais la mention DE LA
      // SAISIE) — PLUS une revalidation : `mentionedMember.name` doit encore
      // être dans ce qui part, sinon éditer ou effacer le « @Nom » après le
      // clic enverrait un id qui ne correspond plus au texte.
      const pendingMentionedUserId =
        text === undefined && mentionedMember && rawInput.includes(`@${mentionedMember.name}`)
          ? mentionedMember.id
          : null
      if ((!typed && pendingConnectors.length === 0) || sending) return
      // #2435.7 / #2435.8 — `navigator.onLine` relu ICI, à L'INSTANT de
      // l'envoi, jamais une valeur mise en cache plus tôt dans le rendu :
      // c'est ce qui fait qu'une reconnexion ne « débloque » rien toute
      // seule (#2435.8) — le prochain essai revalide le réseau par ce MÊME
      // contrôle, il ne rejoue pas un état mémorisé pendant la coupure.
      // Placé AVANT toute écriture (bulle optimiste, persistance, appel au
      // modèle) : hors-ligne, rien ne part, donc aucun crédit n'est débité.
      if (!window.navigator.onLine) {
        toast.error(t('offline.sendBlocked'))
        return
      }
      // Le libellé cliqué voyage par la question ENVOYÉE, jamais par le champ
      // lui-même (Louis, 20/09/2026 — « la pastille au dessus suffit ») : sans
      // ce chemin, Laura ne saurait plus rien du connecteur choisi.
      const trimmed = pendingConnectors.length ? [typed, ...pendingConnectors].filter(Boolean).join(' ') : typed

      // #1946.1 — le repère de départ du délai jusqu'au premier résultat utile.
      // L'ÉCRAN, jamais la question : le traceur n'émet que pour la PREMIÈRE
      // question d'une session et rien pour les suivantes, si bien qu'aucun
      // volume de messages ne se reconstruit depuis ces lignes. Posé après la
      // garde : une saisie vide, ou un envoi déjà en vol, n'est pas une question.
      trackAssistantQuestionSent(CHAT_SCREEN)

      const userMessage: ChatMessage = {
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
        // #2494 — la bulle affiche la pièce jointe dès l'envoi, avant même que
        // la persistance ait répondu : le nom vient d'ici, pas d'un aller-retour
        // réseau. Clé omise sans document — un message tapé sans pièce jointe
        // ne change pas d'un octet.
        ...(attachedDocs.length
          ? {
              attachments: attachedDocs.map(doc => ({
                id: doc.id,
                name: doc.name,
                imageUrl: doc.imageUrl,
                imageObjectId: doc.imageObjectId,
                // #2433.4 (lot M10) — les zones de lecture voyagent avec la bulle de CETTE session.
                ...(doc.citations?.length ? { citations: doc.citations } : {}),
                // #2433.12 (lot P02) — le recadrage proposé et le tableau lu, idem.
                ...(doc.objects ? { objects: doc.objects } : {}),
              })),
            }
          : {}),
        // #2254 / #2668.1 — les connecteurs CLIQUÉS pour cette question, pour
        // que la bulle les rende en puce séparée du texte. ⚠️ Affichage de
        // CETTE session seulement : `content` (envoyé à Laura et persisté) ne
        // porte que le libellé lisible, donc un fil RECHARGÉ ne peut pas le
        // redistinguer — la question ouverte de cette limite est rapportée.
        ...(pendingConnectors.length ? { connectors: pendingConnectors } : {}),
      }
      // #1947 — l'amorce entre dans le fil AVEC la première réponse : Laura doit
      // la relire (« choisis pour moi » n'a de sens qu'après sa question), et le
      // fil relu plus tard doit la montrer.
      const openerTurn = messages.length === 0 && opener && openerPersists ? assistantMessage(opener) : null
      // #2519 — une bulle d'échec n'est pas une réponse de Laura : elle ne part
      // jamais dans l'historique (sinon Laura relirait « Connexion perdue »
      // comme sa propre réponse), et celle qu'on relance quitte le fil.
      const history = [...(openerTurn ? [openerTurn] : []), ...messages]
        .filter(message => !message.failedTurn)
        .map(message => ({
          role: message.role,
          content: message.content,
        }))
      setMessages(previous => [
        ...(openerTurn ? [openerTurn] : []),
        ...withoutRelaunchedTurn(previous, relaunch?.message),
        userMessage,
      ])
      setOpener(null)
      // Capturé AVANT d'être vidé : les identifiants accompagnent CETTE
      // question. Les questions suivantes relisent les documents du fil par le
      // fil lui-même (#1954), pas en renvoyant ces identifiants.
      // #2519 — une relance renvoie les documents de la question ÉCHOUÉE, et
      // laisse intacts ceux que la saisie porte déjà pour la suivante.
      // #2148.16 — une pièce ÉPHÉMÈRE (cas a) n'a pas d'`id` serveur : jamais
      // dans `documentIds` (persisté / relu par Laura via `rag_documents`),
      // son texte part à part dans `attachedFiles`.
      const sentDocumentIds = failedTurn
        ? failedTurn.documentIds
        : attachedDocs.filter(doc => !doc.ephemeral).map(doc => doc.id)
      const sentAttachedFiles = failedTurn
        ? failedTurn.attachedFiles
        : attachedDocs.filter(doc => doc.ephemeral).map(doc => ({ name: doc.name, text: doc.text ?? '' }))
      // #2876 (#2433.4) — les images RANGÉES par le serveur (`extract`,
      // best-effort) parmi les pièces de CETTE question : c'est ce qui fait
      // que la preuve visuelle survit à l'envoi. `undefined` sur une image que
      // le stockage n'a pas pu ranger — la pièce part quand même, sans preuve
      // persistée (comportement identique à avant cette colonne).
      const sentImageObjectIds = failedTurn
        ? failedTurn.imageObjectIds
        : attachedDocs.flatMap(doc => (doc.imageObjectId ? [doc.imageObjectId] : []))
      // #2433.4 / #2433.12 (lot W8) — les zones lues et objets mesurés de ces images,
      // pour qu'elles soient relues à la réouverture du fil (plus seulement le nom).
      const sentImageVision = failedTurn?.imageVision ?? imageVisionToSend(attachedDocs)
      // #1953.15 — seule une question TAPÉE vide la saisie. `text` arrive de
      // `?ask=`, d'une option de clarification ou d'une amorce de démonstration :
      // la saisie peut alors porter un brouillon qui n'a rien à voir, et le vider
      // (puis effacer sa copie stockée à l'acceptation) le détruisait.
      const fromComposer = text === undefined
      // #1939.13 — l'enregistrement dicté accompagne la question de la SAISIE, et
      // elle seule (jamais `?ask=` ni une option cliquée) ; il ne resservira pas.
      const sentVoiceObjectId = fromComposer ? pendingVoiceObjectId : null
      if (fromComposer) setPendingVoiceObjectId(null)
      if (fromComposer) setInput('')
      // #2668.1 — consommés par CET envoi (`pendingConnectors` ci-dessus) :
      // repartent à vide pour la prochaine question. Une relance (`text`
      // défini) ne les avait pas pris — ils restent posés, intacts.
      if (fromComposer) setConnectorLabels([])
      // #2428.12 — consommé par CET envoi (`pendingMentionedUserId` ci-dessus),
      // qu'il ait ou non fini par partir (texte édité entre-temps).
      if (fromComposer) setMentionedMember(null)
      if (!failedTurn) setAttachedDocs([])
      // #3551 — une personne qui ENVOIE veut voir la réponse : on suit le bas, même si elle
      // avait remonté lire plus haut avant d'écrire.
      wasNearBottomRef.current = true
      setSending(true)
      setAnnouncement('')
      // Best-effort : la persistance est du confort, la conversation en cours
      // reste affichée même si l'écriture échoue (elle est déjà rendue en local).
      // L'amorce est écrite AVANT la question, la question avant la réponse :
      // lancées ensemble, deux écritures peuvent s'inverser dans le fil relu.
      //
      // #1957.8 — et RIEN ne s'écrit avant que le serveur ait ACCEPTÉ le tour
      // (plafond passé, flux ouvert). Écrite au clic, une question refusée au
      // plafond restait en base : elle revenait au rechargement à côté de sa
      // version renvoyée, et comptait contre ce même plafond — chaque essai
      // repoussait la réouverture que le refus venait d'annoncer.
      const acceptance: { resolve?: () => void } = {}
      // #2519 — le serveur a-t-il ACCEPTÉ le tour avant l'échec ? Décide ce que
      // la bulle d'échec dit, et si la relance réenregistre la question.
      let turnAccepted = false
      const accepted = new Promise<void>(resolve => {
        acceptance.resolve = resolve
      })
      const openerWritten = accepted.then(() =>
        openerTurn
          ? persistTurn({
              accountId: selectedAccountId,
              conversationId: activeConversationId,
              role: 'assistant',
              content: openerTurn.content,
              isDemo,
            })
          : undefined,
      )
      // #2519 — une question déjà enregistrée avant la coupure ne l'est pas deux fois.
      const userWritten = openerWritten.then(() =>
        failedTurn?.questionSaved
          ? null
          : persistTurn({
              accountId: selectedAccountId,
              conversationId: activeConversationId,
              role: 'user',
              content: trimmed,
              // #1939.14 — par la persistance EXISTANTE, clé omise pour un message tapé.
              ...(sentVoiceObjectId ? { voiceObjectId: sentVoiceObjectId } : {}),
              // #2494 — les mêmes identifiants que ceux envoyés à Laura : c'est ce
              // qui fait que le nom de la pièce jointe survit à un rechargement du
              // fil. Clé omise sans document — corps identique à avant ce lot.
              ...(sentDocumentIds.length ? { documentIds: sentDocumentIds } : {}),
              // #2876 (#2433.4) — même raison, pour l'image de conversation.
              ...(sentImageObjectIds.length ? { imageObjectIds: sentImageObjectIds } : {}),
              ...(sentImageVision.length ? { imageVision: sentImageVision } : {}),
              isDemo,
            }),
      )
      /**
       * #1939 (9.3) — « Réécouter » sur la question qui VIENT de partir, sans
       * relire le fil : la bulle affichée reçoit l'id que la persistance a rendu,
       * et l'enregistrement que le SERVEUR a rattaché (jamais celui que l'écran
       * croyait envoyer — un rattachement refusé ne promet pas de réécoute).
       * La bulle est retrouvée par IDENTITÉ : un fil quitté entre-temps, ou un
       * envoi échoué qui l'a retirée, ne la contient plus et rien ne change.
       */
      if (sentVoiceObjectId) {
        void userWritten.then(saved => {
          const savedId = saved?.id
          const savedVoiceObjectId = saved?.voice_object_id
          if (!savedId || !savedVoiceObjectId) return
          setMessages(previous =>
            previous.map(entry =>
              entry === userMessage ? { ...entry, id: savedId, voiceObjectId: savedVoiceObjectId } : entry,
            ),
          )
        })
      }

      try {
        // Context Resolver (Théo §4/§13) : le backend résout profil + compte +
        // contacts + plan côté serveur depuis le JWT + accountId. Le front
        // n'envoie que l'intention — plus de profileData/accountData/… (le DTO
        // API les rejetait déjà ; on supprime les fetch clients devenus morts).
        // ⚠️ Le corps de la requête n'est plus écrit ici : il vit dans
        // `askLauraStreaming` (`features/chat/api/laura-turn.ts`), la SEULE
        // porte du navigateur vers `POST /ia/chat`. La bulle flottante en est
        // une seconde surface (elle garde `askLaura`, bufferisée), et le jour
        // où une deuxième surface arrive, recopier ces vingt lignes est plus
        // rapide que d'extraire une fonction — c'est ainsi qu'on obtient deux
        // assistantes. GA-237 refuse désormais ce chemin.
        // #1320 — `isDemo` choisit le MOTEUR, plus l'écran. En espace de
        // démonstration la réponse est scriptée et AUCUN appel ne part : le
        // lien de démo va à des inconnus, et chaque message libre serait un
        // appel Claude facturé sur un espace que personne ne surveille.
        // Tout le reste — la coque, la persistance du fil, la portée, la
        // mémoire — est celui du produit.
        // #4610.5 — les fiches des contacts que la réponse scriptée cite (SNCF), lues seulement quand elle en cite.
        const demoContactIds =
          isDemo && !replyTransform && demoTurnLinksContacts(trimmed)
            ? await demoContactIdByName(demoAccountIdByCompanyName.get('SNCF'))
            : undefined
        const demo = isDemo
          ? replyTransform
            ? demoReplyTransformTurn(replyTransform, t)
            : demoTurn(trimmed, t('demo.offScript'), demoAccountIdByCompanyName, selectedAccountName, demoContactIds)
          : null
        let turn: Awaited<ReturnType<typeof askLauraStreaming>>
        if (demo) {
          turn = demo
          // #2433.12 (lot P02 09/10) — la capture semée de la salle rejoint la
          // bulle de la QUESTION, comme une pièce jointe : son aperçu est le vrai.
          const capture = demo.imageCapture
          if (capture) {
            setMessages(previous =>
              previous.map(entry =>
                entry === userMessage
                  ? {
                      ...entry,
                      attachments: [
                        ...(entry.attachments ?? []),
                        {
                          id: 'demo:capture',
                          name: capture.name,
                          imageUrl: capture.imageUrl,
                          objects: capture.objects,
                        },
                      ],
                    }
                  : entry,
              ),
            )
          }
        } else {
          // LOT STREAM (12/09/2026) — une bulle VIDE part tout de suite ; le
          // texte de Laura la remplit AU FUR ET À MESURE (`onDelta`), et le
          // libellé d'un outil en cours s'y affiche tant qu'aucun texte n'est
          // encore arrivé (`onStep`). C'est la MÊME conversation qu'avant —
          // seul le MOMENT où l'utilisateur voit quelque chose change.
          // #2428.21 — gardée par RÉFÉRENCE : une annulation encore LOCALE (le
          // serveur n'a pas ACCEPTÉ le tour) la retire par identité, plus bas.
          const assistantPlaceholder: ChatMessage = { role: 'assistant', content: '', timestamp: new Date() }
          setMessages(previous => [...previous, assistantPlaceholder])
          // #1953.1 / #1953.2 — un contrôleur par tour : le bouton « Arrêter »
          // (rendu tant que `sending` est vrai) appelle `handleStop`, qui
          // aboli CE signal. `laura-turn.ts` le pose sur `fetch` ; un arrêt en
          // vol rejette donc avec une `AbortError`, capturée plus bas.
          const controller = new AbortController()
          abortControllerRef.current = controller
          // #4967 (lot L6) — l'identifiant du tour, tiré ICI : « Arrêter » le désigne au serveur, qui
          // garde le tour en vie quand l'écran s'en va. Sans `randomUUID` (contexte non sécurisé), le
          // serveur en tire un — « Arrêter » le retrouve alors par le fil (`useServerRunningTurn`).
          const turnId = newTurnId()
          // #4967 — le tour vit AUSSI hors de l'écran : le magasin le sait, et « Arrêter » l'y retrouve.
          ownTurnsRef.current.add(activeConversationId)
          registerTurnController(activeConversationId, controller, turnId)
          useBackgroundTurnsStore.getState().begin(activeConversationId)
          try {
            turn = await askLauraStreaming(
              {
                message: trimmed,
                // #4967 (lot L6) — en arrière-plan côté serveur : partir n'annule plus la recherche.
                background: true,
                ...(turnId ? { turnId } : {}),
                accountId: selectedAccountId,
                // Thread key for long memory (Théo P2): the backend rolls a
                // per-conversation summary keyed by this id and feeds it back in.
                conversationId: activeConversationId,
                history,
                // Les fichiers déposés dans le composeur. Le serveur en charge le
                // contenu ; le front n'envoie que les identifiants. Liste vide =
                // corps identique à ce qu'il était.
                documentIds: sentDocumentIds,
                // #2148.16 — la pièce jointe de CONVERSATION (cas a) : le texte
                // est déjà là, rien à charger côté serveur.
                attachedFiles: sentAttachedFiles,
                // #2428.12 — l'id canonique du collègue mentionné, `null` = mention
                // tapée à la main ou aucune (le serveur retombe sur l'heuristique).
                mentionedUserId: pendingMentionedUserId,
                // Le §9.4 borne la clarification à UN tour par conversation. Le
                // drapeau part d'ici parce que l'écran est le seul à conserver les
                // cartes de clarification : l'historique transmis ne porte que
                // `{role, content}`, et déduire la borne du texte reviendrait à
                // chercher une tournure de phrase — un détecteur qui rate rouvre
                // exactement le tour qu'on interdit.
                clarificationAsked: messages.some(entry => Boolean(entry.context?.clarification)),
                // #1951.2 — nature + identifiant ; le serveur relit la fiche.
                scopeObject: objectScope ? scopeObjectOf(objectScope) : null,
                // #3772.5 — l'exclusion stricte part AU SERVEUR, pas seulement au badge.
                excludeWorkspaceData: isStrictScope(scopeRef.current),
                // #2453 / #2451.9 — le « Contexte de travail » choisi sous la
                // saisie pour CE fil ; le mode réglé par l'espace tant que rien
                // n'a été choisi (`ContextModeSelector` l'a lu au montage).
                contextMode: contextModeFor(
                  useContextModeStore.getState().modes,
                  activeConversationId,
                  useContextModeStore.getState().workspaceDefaultMode,
                ),
                // #2450.1 / #2448.1 (reste, épopée #2882) — le mode de recherche
                // choisi pour CE fil (`ResearchModeSelector`, magasin par fil comme
                // `contextMode` juste au-dessus). `'auto'` par défaut : l'heuristique
                // habituelle décide, `laura-turn.ts` omet la clé sur `'auto'`.
                mode: researchModeFor(useResearchModeStore.getState().modes, activeConversationId),
                // #3708 — « Outils et sources » : les familles dont TOUS les outils sont
                // décochés pour CE fil. Relu à l'instant de l'envoi (comme `mode`) : le
                // réglage visible est le réglage transmis. Clé omise sans exclusion.
                excludedToolFamilies: excludedFamilies(
                  sendConnectedTools,
                  excludedProvidersFor(useToolSourcesStore.getState().excluded, activeConversationId),
                ),
                // #3708.fournisseur — et les OUTILS décochés, un par un : décocher HubSpot
                // n'est plus « toute la famille CRM » quand un autre CRM reste coché.
                excludedToolProviders: excludedProviderIds(
                  sendConnectedTools,
                  excludedProvidersFor(useToolSourcesStore.getState().excluded, activeConversationId),
                ),
                // #2123.56 — le contexte du dossier d'origine, SEULEMENT tant que
                // la portée est ce compte ; clé omise sinon (`laura-turn.ts`).
                pageContext: entryPageContext(entryContext, selectedAccountId),
                // #3768 — le geste « retravailler cette réponse » : la réponse source
                // et ce qu'on en a lu, jamais une requête aveugle. Clé omise sinon.
                replyTransform,
                // #4397 (N1) — l'identifiant du consultant voyage ici, jamais dans le texte du message.
                followUpRef,
              },
              {
                onAccepted: () => {
                  turnAccepted = true
                  acceptance.resolve?.()
                },
                onDelta: text => {
                  // #3809 (ajout) — gardé par le fil ACTIF : un delta qui arrive
                  // après que la conversation a changé (switch pendant le flux)
                  // écrirait sinon dans la bulle du fil qu'on regarde maintenant.
                  if (conversationRef.current !== activeConversationId) return
                  setMessages(previous => {
                    const next = [...previous]
                    const last = next[next.length - 1]
                    if (!last || last.role !== 'assistant') return previous
                    next[next.length - 1] = { ...last, content: last.content + text, pendingStep: undefined }
                    return next
                  })
                },
                onStep: label => {
                  if (conversationRef.current !== activeConversationId) return
                  setMessages(previous => {
                    const next = [...previous]
                    const last = next[next.length - 1]
                    if (!last || last.role !== 'assistant') return previous
                    next[next.length - 1] = { ...last, pendingStep: label }
                    return next
                  })
                },
              },
              controller.signal,
            )
          } catch (error) {
            if (isAbortError(error)) {
              useBackgroundTurnsStore.getState().discard(activeConversationId)
              // #2428.21 — ANNULER encore LOCAL : le serveur n'a jamais
              // ACCEPTÉ ce tour (`onAccepted` — #1957.8, rien n'est écrit
              // avant lui), donc rien n'a été envoyé pour de vrai. La
              // question optimiste et la bulle vide se retirent comme si
              // l'envoi n'avait jamais eu lieu, et le texte tapé revient
              // dans le champ plutôt que d'être perdu — différent du cas
              // ci-dessous, où la question A été acceptée et RESTE affichée.
              // #3809 (ajout) — un arrêt déclenché par le CHANGEMENT de fil (voir
              // l'effet de relecture plus haut) retrouve ici le même traitement
              // qu'un « Arrêter » volontaire, SAUF l'affichage : le fil abandonné
              // n'est plus celui à l'écran, donc aucune bulle ne bouge ici — la
              // personne regarde déjà un autre fil, lui montrer le résultat d'un
              // tour qu'elle a quitté serait la même confusion que celle corrigée
              // plus haut (`onDelta`/`onStep`).
              const stillHere = conversationRef.current === activeConversationId
              if (!turnAccepted) {
                if (stillHere) {
                  setMessages(previous =>
                    previous.filter(entry => entry !== userMessage && entry !== assistantPlaceholder),
                  )
                  if (fromComposer) setInput(trimmed)
                  setAnnouncement(t('messages.cancelledAnnouncement'))
                } else if (fromComposer && user?.id) {
                  // #3769 chat envoi à froid — le fil a changé avant que le serveur accepte le tour : le
                  // texte tapé ne disparaît JAMAIS en silence. Il reste dans le brouillon du fil d'où il
                  // est parti, et un message le dit.
                  writeChatDraft(user.id, draftThreadId, trimmed)
                  toast.info(t('messages.notSentKept'))
                }
                return
              }
              // #1953.1 / #1953.2 / #1953.3 — un arrêt VOLONTAIRE n'est pas un
              // échec : la bulle garde le texte déjà reçu (`onDelta` l'a déjà
              // écrit), jamais retirée ni remplacée par un message d'erreur.
              // La réponse partielle n'est PAS enregistrée : elle est
              // incomplète, et `persistTurn` ne porte que des tours terminés.
              if (stillHere) {
                setMessages(previous => {
                  const next = [...previous]
                  const last = next[next.length - 1]
                  if (last?.role === 'assistant')
                    next[next.length - 1] = { ...last, pendingStep: undefined, stopped: true }
                  return next
                })
                setAnnouncement(t('messages.stoppedAnnouncement'))
              } else {
                // #3809.1 — ce n'est pas un « Arrêter » : la personne a changé
                // de fil pendant que Laura répondait encore sur CELUI-CI.
                // #4967 (lot L6) — le tour part `background` : le SERVEUR le
                // poursuit et écrit la réponse ; au retour, la relecture la
                // trouve, ou `useServerRunningTurn` le dit encore en cours. La
                // note d'interruption ne reste que le repli d'un tour que le
                // serveur a perdu (redémarrage) : la dernière ligne relue est
                // alors encore la question.
                interruptedThreadsRef.current.add(activeConversationId)
              }
              // La question, elle, A été posée : si le serveur l'avait déjà
              // acceptée (`onAccepted`), sa persistance tourne déjà en fond
              // (`userWritten`) — on la laisse aboutir avant de rafraîchir la
              // liste des fils, comme le chemin normal.
              await userWritten
              refreshSavedThreads()
              writtenConversationRef.current = activeConversationId
              setThreadsVersion(version => version + 1)
              return
            }
            // La bulle vide n'a pas lieu d'être : le `catch` extérieur va en
            // rendre une nouvelle avec le message d'erreur, à sa place.
            // #3809 (ajout) — jamais sur un fil qu'on a QUITTÉ depuis : `previous`
            // y désigne alors un AUTRE fil, et trancher sa dernière bulle à l'aveugle
            // casserait ce fil-là pour un échec qui ne le concerne pas.
            if (conversationRef.current === activeConversationId) {
              setMessages(previous => previous.slice(0, -1))
            }
            throw error
          } finally {
            abortControllerRef.current = null
            releaseTurnController(activeConversationId, controller)
            ownTurnsRef.current.delete(activeConversationId)
          }
        }
        // #1957.8 — une réponse arrivée vaut acceptation (tour scripté, ou porte
        // qui n'a pas signalé l'ouverture) ; sans effet si c'est déjà fait.
        acceptance.resolve?.()
        const reply = turn.reply || t('messages.noReply')
        // #1953.12 / #1953.21 / #1953.22 — la branche qu'on ferme en repartant
        // (réessai / autre angle / message modifié), consommée UNE fois : un
        // envoi normal (tapé, amorce, option cliquée) n'en a jamais posé, donc
        // `pendingBranch` y vaut toujours `null` et `finalMessage` ne gagne
        // aucun champ de branche.
        const pendingBranch = pendingBranchRef.current
        pendingBranchRef.current = null
        // #1916.24 — la version finale de la bulle, gardée par RÉFÉRENCE : une fois
        // la réponse enregistrée, c'est elle (et elle seule) qui reçoit son
        // identifiant et son compte de mémoire consultée.
        const finalMessage = applyPendingBranch(assistantMessage(reply, turn.context), pendingBranch)
        // #3809 (ajout) — la réponse ARRIVE toujours (persistée plus bas, pour
        // le fil quitté) ; seul l'AFFICHAGE s'arrête si on a changé de fil
        // depuis l'envoi — même raison que les gardes `onDelta`/`onStep`
        // ci-dessus : `messages` désignerait alors un fil qui n'a rien demandé.
        const stillOnThisThread = conversationRef.current === activeConversationId
        if (stillOnThisThread) setAnnouncement(t('messages.replied'))
        // #1957.6 — le brouillon PERSISTANT s'efface ici, quand le serveur a
        // ACCEPTÉ le message — jamais au clic (`setInput('')` plus haut n'est
        // que l'affichage optimiste). Un envoi qui échoue plus bas ne passe
        // jamais par cette ligne : le brouillon stocké survit à la panne.
        if ((fromComposer || relaunch?.clearsDraft) && user?.id) clearChatDraftAfterSend(user.id, draftThreadId) // #3769 — purge aussi le panier `new`
        if (stillOnThisThread) {
          if (demo) {
            setMessages(previous => [
              ...previous,
              // Le graphe n'existe que sur un tour scripté ; `askLauraStreaming`
              // n'en rend jamais, donc la clé reste absente sur le vrai chemin.
              // #1950 — les cartes d'un tour scripté (le plan de Laura de la salle),
              // rendues par le VRAI `CopilotCards` : clé omise quand il n'y en a pas.
              {
                ...applyPendingBranch(assistantMessage(reply, turn.context), pendingBranch),
                chart: demo.chart,
                ...(demo.cards?.length ? { cards: demo.cards } : {}),
              },
            ])
          } else {
            // Le vrai chemin : on REMPLACE la bulle diffusée par sa version
            // finale (texte + panneau de transparence), on ne la duplique pas.
            setMessages(previous => {
              const next = [...previous]
              next[next.length - 1] = finalMessage
              return next
            })
          }
        }
        // #1914.14 — LE `context` EST PERSISTÉ, réduit à sa liste blanche.
        // Il ne l'était pas : un fil relu retombait sur du texte nu, ses sources
        // citées, ce qui n'avait PAS été consulté et la question de précision
        // avaient disparu. Ce qui n'entre pas dans la colonne est nommé dans
        // `chat-message-context.ts` — d'abord les propositions brutes du modèle,
        // qui portent du texte libre écrit à partir de ce qu'il a lu (D65).
        // #1916.24 — la mémoire consultée : le tour rendu par la fin du flux
        // part avec la RÉPONSE (jamais avec la question), et rattache côté serveur
        // les éléments de mémoire envoyés à CE message.
        await userWritten
        const savedReply = await persistTurn({
          accountId: selectedAccountId,
          conversationId: activeConversationId,
          role: 'assistant',
          content: reply,
          ...(turn.memoryTurnId ? { memoryTurnId: turn.memoryTurnId } : {}),
          // #1952.10 — la carte EST un run, elle survit au rechargement : sans le
          // tour, `GET /ia/chat/messages` ne peut jamais retrouver les cartes que
          // `withTurnCards` a persistées pendant CE tour (`listForThread`, côté
          // API). Clé omise quand le pont des cartes n'a pas tourné.
          ...(turn.turnId ? { turnId: turn.turnId } : {}),
          // #1953.11 / #1953.22 — la branche dont CETTE réponse repart, écrite
          // avec elle. Les deux clés voyagent ENSEMBLE et seulement quand la
          // réponse abandonnée porte un identifiant enregistré : le serveur
          // écrit le lien ET estampille « remplacée » du même geste. Omises sur
          // un envoi normal — corps identique à celui d'avant ce lot.
          ...(pendingBranch?.previousMessageId
            ? { branchOfMessageId: pendingBranch.previousMessageId, branchKind: pendingBranch.kind }
            : {}),
          // #1914.14 — le panneau de transparence de CE tour, réduit à sa liste
          // blanche. `null` (aucun contexte, illisible, trop lourd) omet la clé :
          // le corps est alors celui d'avant ce lot.
          context: persistedChatContext(turn.context),
          isDemo,
        })
        if (savedReply && stillOnThisThread) {
          // La bulle vivante reçoit son identifiant enregistré et son compte : c'est
          // ce qui permet d'ouvrir sa mémoire consultée sans recharger le fil.
          setMessages(previous =>
            previous.map(entry => (entry === finalMessage ? withSavedReply(entry, savedReply) : entry)),
          )
        } else if (!isDemo) {
          // #R5-FIX (recette prod 14/10) — `persistTurn` ne rejette JAMAIS (voir
          // son docblock) : un échec d'écriture de CETTE réponse serait sinon
          // resté muet, et le fil serait resté « en attente » dans la barre
          // latérale (`threadStatusOf` lit `last_message_role` côté serveur)
          // sans que rien ne le dise — la bulle, déjà en état local, s'affiche
          // normalement, mais rien n'a été écrit.
          toast.error(t('messages.replyNotSaved'), { duration: TOAST_PROBLEM_MS })
        }
        refreshSavedThreads()
        // #3434 — en démo RIEN n'est écrit au serveur : poser le fil dans
        // l'URL le ferait relire vide (« perdu ») et viderait la réponse.
        if (!isDemo) {
          writtenConversationRef.current = activeConversationId
          setThreadsVersion(version => version + 1)
          // #4967 — la réponse est PERSISTÉE : si l'écran a été quitté pendant la recherche,
          // elle attend, prête, dans le fil ; sinon il n'y a rien à signaler.
          useBackgroundTurnsStore.getState().finish(activeConversationId, {
            visible: mountedRef.current && stillOnThisThread,
          })
        }
      } catch (error) {
        console.error('[Chat]', error)
        useBackgroundTurnsStore.getState().discard(activeConversationId)
        // Un refus expliqué par le serveur (plafond quotidien, palier) est
        // répété tel quel ; une panne garde la phrase générique. Voir
        // `chatErrorMessage`.
        // #2519 — coupée APRÈS acceptation, la question est partie : « rien n'a
        // été envoyé » serait faux, et la phrase générique n'apprend rien.
        const retryable = chatFailureIsRetryable(error)
        const cutAfterAcceptance = turnAccepted && retryable
        const failure = chatErrorMessage(error, {
          fallback: t(cutAfterAcceptance ? 'messages.replyCut' : 'messages.connectionError'),
          networkLost: t(cutAfterAcceptance ? 'messages.replyCut' : 'messages.networkLost'),
          sessionExpired: t('messages.sessionExpired'),
          quotaNote: t('messages.quotaExplainer'),
          // #1957.8 → .10 — au plafond : quand il se rouvre, ce qui reste utilisable, et le plan quand c'est lui qui borne.
          quotaReached: refusal => chatQuotaReachedText(t, refusal, { billingLink: true }),
          // #1960.13 — l'incident DÉCLARÉ par un opérateur, s'il y en a un. Sans
          // drapeau posé, `knownIncident` est `undefined` et ce refus est
          // byte-identique à celui d'avant (`declaredIncidentMessage`).
          knownIncident: knownIncident ?? undefined,
        })
        // #4066.4 — la réponse en cours a échoué : la file ATTEND (jamais d'envoi silencieux
        // de la suite) et l'échec est nommé dans le bandeau « Reprendre ».
        suspendQueue(failure)
        // #1957.6 — atteindre ce `catch` veut dire qu'AUCUNE réponse n'est
        // arrivée (`persistTurn` ci-dessus ne rejette jamais — voir sa
        // définition — donc un rejet ici ne peut venir que de l'appel au
        // modèle) : le message n'a donc pas été traité, quelle qu'en soit la
        // raison (plafond, réseau coupé, session morte, panne).
        //
        // On retire la bulle optimiste plutôt que de la laisser à côté d'un
        // texte rendu à la saisie : sans ce retrait, renvoyer produirait DEUX
        // bulles identiques dans le fil (l'échouée, puis la réussie) — c'est
        // le doublon que ce correctif doit éviter.
        // #2519 — la bulle d'échec garde SA question, pour « Relancer ». La
        // question est « enregistrée » seulement si le serveur l'a acceptée ET
        // que l'écriture a abouti (`persistTurn` rend `null` sur un échec) ;
        // sans acceptation, `userWritten` n'aboutit jamais — on ne l'attend pas.
        const savedQuestion = turnAccepted ? await userWritten : null
        const failedBubble: ChatMessage = {
          ...assistantMessage(failure),
          failedTurn: {
            question: trimmed,
            documentIds: sentDocumentIds,
            attachedFiles: sentAttachedFiles,
            imageObjectIds: sentImageObjectIds,
            ...(sentImageVision.length ? { imageVision: sentImageVision } : {}),
            questionSaved: Boolean(failedTurn?.questionSaved || savedQuestion?.id),
            // #3506 — acceptée = partie : sa bulle RESTE dans le fil.
            ...(turnAccepted ? { questionKept: true } : {}),
            retryable,
          },
        }
        // #3809 (ajout) — même garde : un échec sur un fil QUITTÉ depuis
        // n'affiche plus rien (la question, elle, reste enregistrée côté
        // serveur selon `turnAccepted`/`savedQuestion` ci-dessus, inchangé).
        if (conversationRef.current === activeConversationId) {
          setMessages(previous => {
            const last = previous[previous.length - 1]
            // #3506 — une question que le serveur a ACCEPTÉE reste dans le fil, même
            // si sa réponse a été coupée : la retirer la faisait « disparaître ».
            const withoutOptimisticTurn = last?.role === 'user' && !turnAccepted ? previous.slice(0, -1) : previous
            return [...withoutOptimisticTurn, failedBubble]
          })
          setAnnouncement(failure)
          // Rend le texte à la saisie — SAUF si l'utilisateur a déjà retapé
          // quelque chose pendant l'attente : une mise à jour FONCTIONNELLE lit
          // l'état le plus récent, jamais la fermeture capturée à l'envoi.
          // #3506 — sauf si le tour a été ACCEPTÉ : la question est partie et reste dans
          // le fil, la saisie ne doit pas garder l'ancien texte.
          if (!turnAccepted) setInput(current => (current === '' ? trimmed : current))
        }
      } finally {
        setSending(false)
      }
    },
    // `attachedDocs` manquait : joindre un document puis appuyer sur Entrée sans
    // retaper envoyait la question avec la liste d'AVANT le dépôt — donc sans lui.
    [
      activeConversationId,
      entryContext,
      attachedDocs,
      connectorLabels,
      draftThreadId,
      input,
      isDemo,
      mentionedMember,
      messages,
      objectScope,
      opener,
      openerPersists,
      pendingVoiceObjectId,
      refreshSavedThreads,
      user?.id,
      selectedAccountId,
      sending,
      suspendQueue,
      t,
    ],
  )

  // #4066.2 — le tour d'un message en attente passe par la MÊME porte (`handleSend`) ; hors-ligne,
  // il ne part pas (la file le remet en tête et se suspend, jamais perdu).
  queueDispatchRef.current = text => {
    if (!window.navigator.onLine) return false
    void handleSend(text)
    return true
  }

  /**
   * #4066.1 — « Envoyer » PENDANT une réponse met en attente. Le champ, les connecteurs et la
   * mention se vident comme pour un envoi ; une pièce jointe ne peut pas attendre (refus nommé,
   * le texte reste dans la saisie) et une file pleine (5) refuse de même.
   */
  const handleComposerSend = useCallback(
    (text?: string, followUpRef?: FollowUpRef) => {
      if (!sending && sendQueue.items.length === 0) {
        pendingFollowUpRefRef.current = followUpRef ?? null
        return handleSend(text)
      }
      const fromComposer = text === undefined
      const typed = (text ?? input).trim()
      const labels = fromComposer ? connectorLabels : []
      const queued = labels.length ? [typed, ...labels].filter(Boolean).join(' ') : typed
      if (!queued) return undefined
      if (fromComposer && attachedDocs.length > 0) {
        toast.info(t('queue.attachmentsRefused'))
        return undefined
      }
      if (!sendQueue.enqueue(queued)) {
        toast.info(t('queue.full', { max: SEND_QUEUE_MAX }))
        return undefined
      }
      if (fromComposer) {
        setInput('')
        setConnectorLabels([])
        setMentionedMember(null)
      }
      setAnnouncement(t('queue.queuedAnnouncement', { count: sendQueue.items.length + 1 }))
      return undefined
    },
    [attachedDocs.length, connectorLabels, handleSend, input, sendQueue, sending, t],
  )

  /**
   * #3768 (BEL-LAU-1014) — un geste « retravailler cette réponse » (approfondir,
   * synthétiser, plan d'action…) : le libellé cliqué part comme la question de la
   * personne, et la réponse source voyage avec le tour (`pendingTransformRef`,
   * consommé par `handleSend`). Même porte d'envoi que toute question : hors-ligne
   * ou tour en vol, rien ne part.
   */
  const handleTransform = useCallback(
    (request: ReplyTransformRequest, label: string) => {
      pendingTransformRef.current = request
      void handleSend(label)
    },
    [handleSend],
  )
  const replyTransformGate = useMemo(
    () => ({ onTransform: handleTransform, disabled: sending }),
    [handleTransform, sending],
  )

  /**
   * #1953.1 / #1953.2 — « Arrêter » : aboli le tour DIFFUSÉ en vol, s'il y en
   * a un. Sans effet hors d'un tour réel (fil de démonstration scripté,
   * appel déjà résolu) — `abortControllerRef.current` y vaut alors `null`.
   */
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
    // #4967 — un tour lancé par l'écran d'avant n'a plus sa ref ici : le magasin le retrouve par fil.
    // Lot L6 — et le SERVEUR l'arrête (abolir la connexion ne fait plus que le détacher), y compris
    // un tour qu'il dit encore en cours sur ce fil (rechargement, retour d'un autre fil).
    stopTurn(conversationRef.current, serverTurnRef.current?.turnId ?? null)
  }, [])

  /**
   * #1953.5 / #1953.7 / #1953.6 / #1953.11 — REPRENDRE UNE RÉPONSE, EN BRANCHE.
   *
   * Les trois actions (réessayer, autre angle, message modifié) convergent
   * ici : elles reposent une question par le chemin NORMAL du fil
   * (`handleSend`, la SEULE porte du navigateur vers Laura — voir le
   * commentaire au-dessus de son appel), jamais un second chemin. Ce qui les
   * distingue est fermé AVANT l'envoi :
   *
   *  1. la réponse qu'on abandonne est marquée `supersededAt` TOUT DE SUITE —
   *     ses propositions deviennent obsolètes (#1953.14, `PendingActions.tsx`)
   *     avant même que la nouvelle question soit partie ;
   *  2. `pendingBranchRef` porte la provenance de la branche (`kind`, l'heure
   *     de la réponse abandonnée, son contexte) — `handleSend` la consomme UNE
   *     fois pour décorer la réponse qui arrive (`applyPendingBranch`).
   *
   * Si `handleSend` échoue ou est arrêté, l'ancienne réponse reste
   * `supersededAt` : la personne a déjà exprimé qu'elle voulait mieux, et
   * l'ancienne reste lisible (« on archive, on ne supprime pas ») — elle peut
   * réessayer encore.
   */
  const runBranch = useCallback(
    (index: number, kind: BranchKind, text: string) => {
      const target = messages[index]
      if (!target || target.role !== 'assistant') return
      const supersededAt = new Date()
      setMessages(previous => previous.map((entry, i) => (i === index ? { ...entry, supersededAt } : entry)))
      pendingBranchRef.current = {
        kind,
        previousTimestamp: target.timestamp ?? null,
        previousContext: target.context,
        // #1953.11 — le lien qui PART EN BASE. Sans lui, la provenance mourait
        // avec l'onglet (défaut mesuré en production le 16/09/2026).
        previousMessageId: target.id ?? null,
      }
      void handleSend(text)
    },
    [messages, handleSend],
  )

  /** #1953.5 — reposer la MÊME question, verbatim : Laura décide ce qui change, pas nous. */
  const retryReply = useCallback(
    (index: number) => {
      const question = precedingUserText(messages, index)
      if (question) runBranch(index, 'retry', question)
    },
    [messages, runBranch],
  )

  /**
   * #2519 — « RELANCER » : la question que la bulle d'échec n'a pas obtenue
   * repart telle quelle, par la porte normale (`handleSend`), sans rien à
   * retaper. Si la saisie tient encore cette question (rendue par l'échec),
   * elle se vide : sinon un « Entrée » plus tard l'enverrait une seconde fois.
   */
  const relaunchFailedTurn = useCallback(
    (index: number) => {
      const target = messages[index]
      const failed = target?.failedTurn
      if (!target || !failed?.retryable || sending) return
      const composerHeldQuestion = input.trim() === failed.question
      if (composerHeldQuestion) setInput('')
      pendingRelaunchRef.current = { message: target, clearsDraft: composerHeldQuestion }
      void handleSend(failed.question)
    },
    [messages, sending, input, handleSend],
  )

  /** #1953.7 — la question ORIGINALE, plus la demande explicite d'un angle différent. */
  const askAlternativeAngle = useCallback(
    (index: number) => {
      const question = precedingUserText(messages, index)
      if (question) runBranch(index, 'angle', angleVariant(question, t('retry.angleSuffix')))
    },
    [messages, runBranch, t],
  )

  /**
   * #1953.6 / #1953.11 — « Modifier ma demande » : la question précédente part
   * dans la SAISIE, prête à être corrigée — jamais réenvoyée à sa place. La
   * branche n'est posée qu'ici, elle attend l'envoi RÉEL (le clic sur
   * Envoyer, `handleSend()` sans argument) : si la personne referme sans
   * envoyer, rien ne part et rien ne change d'autre que la réponse déjà
   * marquée obsolète — elle peut encore l'annuler en tapant autre chose.
   */
  const editLastMessage = useCallback(
    (index: number) => {
      const question = precedingUserText(messages, index)
      if (question === null) return
      const target = messages[index]
      if (!target) return
      const supersededAt = new Date()
      setMessages(previous => previous.map((entry, i) => (i === index ? { ...entry, supersededAt } : entry)))
      pendingBranchRef.current = {
        kind: 'edit',
        previousTimestamp: target.timestamp ?? null,
        previousContext: target.context,
        previousMessageId: target.id ?? null,
      }
      setInput(question)
      textareaRef.current?.focus()
    },
    [messages],
  )

  /**
   * Ouvre un fil VIERGE dans un groupe. La clé est tirée côté client et n'est
   * persistée qu'au premier message : une conversation ouverte puis abandonnée
   * ne laisse aucune trace en base.
   */

  /**
   * Théo L1 — sélecteur avancé — L'URL REFLÈTE LE DOSSIER PRÉCIS CHOISI.
   *
   * Un dossier précis (`?scope=<nature>:<id>`) s'écrit dans l'adresse : le lien
   * se partage, et un rechargement le retrouve. Quitter un dossier précis l'en
   * retire. Les autres portées gardent leur chemin d'avant — le compte choisi
   * dans la modale ne passe délibérément pas par l'URL (voir le suivi d'URL).
   *
   * La clé est posée AVANT la navigation : l'effet de suivi d'URL y lit alors
   * une adresse qu'il connaît déjà, et ne rouvre pas un second fil.
   */
  const urlScopeKeyRef = useRef(urlScopeKey)
  urlScopeKeyRef.current = urlScopeKey
  const reflectScopeInUrl = useCallback(
    (next: ChatScope) => {
      const nextKey = scopeParamOf(next)
      if (nextKey === urlScopeKeyRef.current) return
      lastUrlKey.current = urlKeyOf(null, null, nextKey)
      void navigate({ to: '/chat', search: nextKey ? { scope: nextKey } : {}, replace: true })
    },
    [navigate],
  )

  /**
   * Appliquer une portée choisie dans la modale.
   *
   * Elle OUVRE un fil neuf plutôt que de rescoper le fil courant, et c'est
   * délibéré : rescoper une conversation en cours laisserait au-dessus du champ
   * des questions et des réponses qui parlaient d'un autre périmètre, sans que
   * rien ne le signale. Le fil suivant hérite alors d'un contexte faux — la
   * méprise que la portée explicite existe précisément pour supprimer.
   *
   * ⚠️ Le fil est VIERGE et n'est persisté qu'au premier message : choisir une
   * portée puis fermer ne laisse aucune trace.
   *
   * #3864-bis (recette RQ1 09/10) — UNE SAISIE EN COURS SUIT LE FIL QUI S'OUVRE.
   *
   * Choisir un compte précis change la clé du brouillon (`draftThreadId`,
   * `Chat.tsx`) : le panier commun « new » cède la place au fil dédié à ce
   * compte. `useChatComposerDraft` relit alors le brouillon du fil
   * D'ARRIVÉE — vide, puisqu'il n'a jamais existé — et l'écrit PAR-DESSUS ce
   * qui vient d'être tapé. Le garde-fou `carryFromThread` du hook protège
   * déjà une course voisine (#3648, la portée qui se précise PENDANT le
   * chargement), mais seulement dans les 5 secondes qui suivent le montage —
   * largement dépassées le temps d'ouvrir la modale et de choisir un dossier.
   * On écrit donc ici, AVANT le changement de clé, le brouillon que le fil
   * d'arrivée va relire : il retrouve sa propre saisie au lieu d'un brouillon
   * vide.
   */
  const applyScope = useCallback(
    (next: ChatScope) => {
      // R10C-FIX 14/10 — IDEMPOTENCE : la modale se referme APRÈS `onConfirm`. Un second clic / « Entrée »
      // dans cette fenêtre créerait un second fil neuf (doublon dans la liste). Un geste = un fil ;
      // le verrou retombe à la prochaine ouverture de la modale (effet plus bas).
      if (scopeAppliedForOpenRef.current) return
      scopeAppliedForOpenRef.current = true
      const accountId = next.kind === 'account' ? next.accountId : null
      const opened = newConversationId()
      // #1951.17 — CE QUI VIENT DE CHANGER, dit à l'écran. Les deux références
      // portent l'état d'AVANT : `scope` est un `useMemo` déclaré plus bas, et le
      // mettre en dépendance de ce `useCallback` recréerait la fonction à chaque
      // changement de portée — donc `ScopeDialog` à chaque fois.
      const before = scopeRef.current
      const beforeConversationId = conversationRef.current
      setScopeChange(scopeChangeOf(before, next))
      // #1951.18 — le périmètre d'ORIGINE entre dans la pile au PREMIER
      // changement : sans ce semis, « revenir » n'aurait nulle part où ramener,
      // puisque rien n'aurait enregistré d'où l'on partait.
      setScopeTrail(trail =>
        pushStep(
          trail.length === 0 ? pushStep(trail, { scope: before, conversationId: beforeConversationId }) : trail,
          {
            scope: next,
            conversationId: opened,
          },
        ),
      )
      if (user?.id && inputDraftRef.current.trim() !== '') {
        const nextDraftThreadId = urlConversationId ?? (accountId ? conversationIdForAccount(accountId) : 'new')
        writeChatDraft(user.id, nextDraftThreadId, inputDraftRef.current)
      }
      setNoAccountScope(next.kind === 'none')
      setStrictScope(isStrictScope(next))
      setObjectScope(isObjectScope(next) ? next : null)
      setSelectedAccountId(accountId)
      setActiveConversationId(opened)
      reflectScopeInUrl(next)
      textareaRef.current?.focus()
    },
    [user?.id, urlConversationId, reflectScopeInUrl],
  )

  // `?new=` consommé ici (après `applyScope`, qu'il appelle) — voir le commentaire de `?new=` plus haut.
  const newConsumedRef = useRef(false)
  useEffect(() => {
    if (!urlNew) {
      newConsumedRef.current = false
      return
    }
    // Un `?new=` = un fil : les changements d'identité de `applyScope` ne rejouent pas le geste.
    if (newConsumedRef.current) return
    newConsumedRef.current = true
    scopeAppliedForOpenRef.current = false
    applyScope(PORTFOLIO_SCOPE)
    void navigate({ to: '/chat', search: {}, replace: true })
  }, [urlNew, navigate, applyScope])

  /**
   * #1951.21 — REVENIR AU PÉRIMÈTRE PRÉCÉDENT, avec SON fil.
   *
   * ⚠️ `setActiveConversationId(step.conversationId)` et non un fil neuf : c'est
   * toute la différence entre « retrouver son périmètre » et « retrouver sa
   * conversation ». Rouvrir un troisième fil vide sur ACME rendrait le
   * périmètre et perdrait le contexte — exactement ce que #1951.18 refuse.
   */
  const returnToPreviousScope = useCallback(() => {
    const back = returnToPrevious(trailRef.current)
    if (!back) return
    const target = back.step.scope
    setScopeTrail(back.trail)
    setNoAccountScope(target.kind === 'none')
    setStrictScope(isStrictScope(target))
    setObjectScope(isObjectScope(target) ? target : null)
    setSelectedAccountId(target.kind === 'account' ? target.accountId : null)
    setActiveConversationId(back.step.conversationId)
    setScopeChange(null)
    reflectScopeInUrl(target)
    textareaRef.current?.focus()
  }, [reflectScopeInUrl])

  const scope: ChatScope = useMemo(
    () =>
      objectScope ??
      (selectedAccountId
        ? { kind: 'account', accountId: selectedAccountId }
        : noAccountScope
          ? strictScope
            ? STRICT_NO_DATA_SCOPE
            : NO_ACCOUNT_SCOPE
          : PORTFOLIO_SCOPE),
    [objectScope, selectedAccountId, noAccountScope, strictScope],
  )

  // Les références déclarées plus haut suivent l'état de CE rendu.
  scopeRef.current = scope
  conversationRef.current = activeConversationId
  trailRef.current = scopeTrail
  inputDraftRef.current = input

  /**
   * Les comptes proposables comme portée, avec le nombre de fils de chacun.
   *
   * Le compte de conversations vient de `savedThreads` — la même source que le
   * panneau de gauche. Le recalculer autrement ferait qu'un compte annoncerait
   * « 3 conversations » dans la modale et en montrerait deux dans la liste.
   */
  // #3654.1 — un compte analysé hors de la première page (lien ou recherche).
  const [scopeQuery, setScopeQuery] = useState('')
  const lookedUpAccounts = useScopeAccountLookup({
    accountId: selectedAccountId,
    loadedIds: useMemo(() => allLoadedAccounts.map(account => account.id), [allLoadedAccounts]),
    query: scopeQuery,
  })
  /**
   * #3654 (KO recette 06/10) — le NOM du compte en portée vient aussi de la
   * lecture ciblée : un compte analysé hors de la première page (ou non suivi)
   * donnait l'en-tête « MP GEMS » mais l'accueil et les pastilles GLOBAUX,
   * car le nom n'était cherché que dans la première page.
   */
  const selectedAccountName: string | null = useMemo(
    () => resolveScopeAccountName(selectedAccountId, mergeScopeRows(accounts, lookedUpAccounts)),
    [accounts, lookedUpAccounts, selectedAccountId],
  )
  const scopeAccounts: ScopeAccount[] = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const thread of savedThreads) {
      if (thread.account_id) counts[thread.account_id] = (counts[thread.account_id] ?? 0) + 1
    }
    return scopeAccountsFrom(mergeScopeRows(allLoadedAccounts, lookedUpAccounts), counts)
  }, [allLoadedAccounts, lookedUpAccounts, savedThreads])

  /**
   * L'envoi automatique de `?ask=`, exactement UNE fois.
   *
   * La garde par référence est ce qui compte : sans elle, un re-rendu (un
   * compte qui se charge, une conversation qui s'ouvre) renverrait la même
   * question, consommerait un second message du plafond quotidien et
   * afficherait deux réponses à une question posée une fois.
   */
  const askedRef = useRef(false)
  useEffect(() => {
    if (!initialAsk || askedRef.current || sending) return
    // Recette du 13/09 — ?ask sur un fil vierge : la lecture du fil écrasait la question.
    // Même armement que l'amorce : on n'envoie qu'une fois la relecture du fil
    // TERMINÉE (lue, ou en échec — voir son `catch`), et Laura reçoit le fil relu.
    if (settledConversationId !== activeConversationId) return
    askedRef.current = true
    void handleSend(initialAsk)
  }, [activeConversationId, initialAsk, sending, handleSend, settledConversationId])

  /**
   * #1947 / #1908 — Laura prend la parole, trois secondes après l'ouverture d'un
   * fil VIERGE.
   *
   * Aucun appel au modèle, aucun message du plafond quotidien : la phrase est
   * composée à partir de ce qui est CHARGÉ (`lauraOpener`). Rien ne l'arme sur
   * un fil déjà écrit, ni quand un autre écran a déjà posé la question
   * (`?prompt=`, `?ask=`) : elle couperait la parole à quelqu'un qui en a une.
   *
   * ⚠️ Pas d'indicateur « Laura écrit… » pendant l'attente : aucun travail n'a
   * lieu, et une animation sans événement réel est ce que la grammaire du
   * mouvement refuse.
   *
   * Les entrées de la phrase passent par une référence : en dépendances, elles
   * relanceraient le minuteur à chaque rendu (un compte qui se charge, un vivier
   * qui arrive) — et l'amorce ne partirait jamais.
   *
   * #1936 — LA 1RE OUVERTURE DU JOUR, LAURA PARLE AVEC LE BRIEF.
   *
   * Au moment où l'amorce va RÉELLEMENT s'afficher — minuteur échu, fil vierge
   * et lu, aucune question posée par un autre écran, Laura pas occupée — et
   * seulement là, `readMorningBrief` demande au serveur si c'est la première
   * ouverture du jour. La réponse se CONSOMME : la demander plus tôt, sur un fil
   * déjà écrit ou sous un `?prompt=`, mangerait le brief sans qu'il ait été vu.
   *
   * - Un seul appel par montage : la promesse est gardée dans une référence, et
   *   le fil vierge suivant relit sa réponse au lieu d'en refaire une.
   * - Un brief lu mais pas affiché (fil quitté pendant la lecture) reste dû : le
   *   fil vierge suivant du même montage le reçoit.
   * - Un fil cadré sur un COMPTE garde l'amorce du compte et ne consomme rien :
   *   on est venu pour ce compte, le brief attend le prochain fil nu.
   */
  const firstName = useFirstName()
  const baseHomeContext = useLauraHomeContext(portfolioCount, accountsError)
  // Revient sur #3654 (#5042) : le compte ciblé ne change plus les amorces de l'accueil.
  const homeContext = baseHomeContext
  // #1936.11 — le rôle dans l'espace (déjà lu pour la saisie) change la VOIX du brief, jamais ses faits.
  const { team } = useTeam()
  const role = team?.workspace?.role ?? null
  const openerInputs = useRef({
    t,
    firstName,
    isDemo,
    selectedAccountId,
    selectedAccountName,
    portfolioCount,
    homeContext,
    role,
  })
  useEffect(() => {
    openerInputs.current = {
      t,
      firstName,
      isDemo,
      selectedAccountId,
      selectedAccountName,
      portfolioCount,
      homeContext,
      role,
    }
  })
  const openerBlocked = Boolean(initialPrompt || initialAsk)
  const morningBrief = useRef<ReturnType<typeof readMorningBrief> | null>(null)
  const morningBriefShown = useRef(false)
  useEffect(() => {
    // #2435.12 — un lien partagé inaccessible ne reçoit JAMAIS le « Bonjour »
    // par défaut : ce serait dire « fil vierge » sur un fil perdu.
    if (openerBlocked || opener || sending || messages.length > 0 || deepLinkInaccessible) return
    if (loadedConversationId !== activeConversationId) return
    let cancelled = false
    const speak = (voice: Pick<LauraOpenerInput, 'justOnboarded' | 'morningBrief'> = {}) => {
      if (cancelled) return
      // #2427.10 — l'amorce est une prise de parole PROACTIVE comme une autre :
      // désactivée (D49) ou en retrait (§5.3), Laura ne l'ouvre pas non plus.
      // Le verdict vient de `LauraCard` (montée globalement, qui a déjà
      // demandé son plan pour cet écran) via `laura-silence-signal.ts` — pas
      // d'appel réseau de plus, pas de second budget.
      if (isLauraSilenced()) return
      const inputs = openerInputs.current
      const openerInput: LauraOpenerInput = {
        firstName: inputs.firstName,
        isDemo: inputs.isDemo,
        accountName: inputs.selectedAccountName,
        portfolioCount: inputs.portfolioCount,
        hasVivier: inputs.homeContext.hasVivier,
        settled: inputs.homeContext.settled === true,
        ...voice,
      }
      setOpenerPersists(lauraOpenerPersists(openerInput))
      setOpener(lauraOpener(inputs.t, openerInput))
    }
    const timer = window.setTimeout(() => {
      // #1921.9 — le passage de main de l'onboarding passe AVANT le brief, et ne consomme pas le marqueur.
      if (justOnboarded.current) {
        justOnboarded.current = false
        speak({ justOnboarded: true })
        return
      }
      if (morningBriefShown.current || openerInputs.current.selectedAccountId) {
        speak()
        return
      }
      // #1936 — le marqueur « premier du jour » se consomme ICI, quand Laura parle — une fois par montage.
      if (!morningBrief.current) morningBrief.current = readMorningBrief(browserTimeZone())
      void morningBrief.current.then(read => {
        if (cancelled) return
        if (!read) {
          speak()
          return
        }
        morningBriefShown.current = true
        // #1936.1 — le brief REMPLACE l'amorce courte ; illisible, il le dit (`briefing: null`).
        speak({ morningBrief: { briefing: read.briefing, role: openerInputs.current.role } })
      })
    }, LAURA_OPENER_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    activeConversationId,
    deepLinkInaccessible,
    loadedConversationId,
    messages.length,
    opener,
    openerBlocked,
    sending,
  ])

  const fillPrompt = useCallback((prompt: string) => {
    // #3773.5 — « un exemple inséré dans la saisie ne doit pas écraser un brouillon existant » :
    // sur une saisie non vide, l'exemple se pose APRÈS le brouillon, sur une ligne à part.
    setInput(draft => (draft.trim() === '' ? prompt : `${draft.trimEnd()}\n\n${prompt}`))
    textareaRef.current?.focus()
  }, [])

  /**
   * CE QUE FAIT LE CLIC SUR UNE AMORCE — et pourquoi la démonstration diffère.
   *
   * Dans le produit, une amorce **pré-remplit** : elle propose une question que
   * le commercial n'a pas formulée, et il la relit avant d'envoyer. C'est la
   * même règle que `?prompt=`, et elle est délibérée.
   *
   * En démonstration, l'amorce EST la question, mot pour mot, et c'est la seule
   * chose qu'un prospect puisse cliquer pour voir Laura répondre. La faire
   * atterrir dans le champ ajouterait un second geste — « maintenant appuie sur
   * Entrée » — au moment précis où l'on cherche à montrer quelque chose. Elle
   * ENVOIE donc, exactement comme `?ask=` le fait déjà depuis la bibliothèque
   * de commandes, et pour la raison écrite là-bas : la phrase envoyée est sous
   * les yeux au moment du clic, la relecture a déjà eu lieu.
   *
   * ⚠️ Le champ reste ouvert dans les deux cas : la coque ne change pas.
   */
  const promptAction = isDemo ? handleSend : fillPrompt

  /**
   * Les amorces suivent la PORTÉE, et c'est un correctif autant qu'un déplacement.
   *
   * Les trois amorces « analyse » (`Signaux à traiter`, `Objections probables`,
   * `Prochaine action CRM`) vivaient dans le rail droit et s'affichaient
   * TOUJOURS — y compris sans compte en portée. Or elles disent toutes « ce
   * compte » / « cette analyse » : proposées sur un fil de portefeuille, elles
   * font poser une question dont le sujet n'existe pas, et Laura répond à côté
   * ou refuse. On ne le voyait pas parce que le rail était à l'autre bout de
   * l'écran et que personne n'y clique.
   *
   * Elles ne sont donc pas perdues : elles rejoignent le jeu d'un COMPTE, là où
   * elles sont vraies.
   */
  /**
   * #1321.2 — « afficher seulement 3 à 6 suggestions contextuelles ».
   *
   * Le jeu était DÉJÀ contextuel — huit propositions de portefeuille, ou onze
   * quand un compte est cadré — mais pas BORNÉ. Le reproche portait sur le
   * nombre : *« l'utilisateur ne doit pas voir 24 possibilités identiques en
   * permanence »*. Onze pastilles au-dessus d'un champ de saisie ne se lisent
   * pas ; on en survole trois et on tape sa question.
   *
   * Six, la borne haute que le retour donne lui-même. Rien n'est perdu : le
   * catalogue COMPLET vit dans le tiroir « Que puis-je demander ? », avec sa
   * recherche et ses catégories — c'est le point `.3` de la même issue, et il
   * est livré. Une pastille est un raccourci, pas un sommaire.
   *
   * ⚠️ La coupe garde les PREMIÈRES : elles sont ordonnées par utilité dans le
   * catalogue de traduction, et trier ici referait un classement qui existe
   * déjà ailleurs.
   */
  /**
   * ⚠️ #1320 — en démonstration, les amorces SONT le script.
   *
   * La coque est celle du produit, donc la saisie est ouverte ; mais seules les
   * questions du script ont une réponse écrite. Proposer les amorces habituelles
   * enverrait un prospect sur des questions auxquelles la démonstration répond
   * « je n'ai pas de réponse préparée » — une invitation à constater un vide.
   * Ce sont donc les questions du script qui s'affichent, et cliquer l'une
   * d'elles revient exactement à la taper : le composeur envoie du TEXTE, pas
   * un identifiant d'amorce, ce qui rend le script atteignable au clavier.
   */
  // #1909.2 — six au plus, là aussi : la borne de l'accueil ne valait que pour
  // l'écran vide, et un fil entamé en montrait huit — onze sur un compte. La
  // coupe garde les PREMIÈRES, déjà ordonnées par utilité dans le catalogue. La
  // démonstration garde son script entier (#1320).
  const { families: connectedFamilies, tools: sendConnectedTools } = useConnectedCapabilities()
  const suggestions = isDemo
    ? demoSuggestions()
    : (selectedAccountName
        ? [...promptsForAccount(selectedAccountName, t, connectedFamilies), ...analysisActions(t, connectedFamilies)]
        : promptsGeneral(t, connectedFamilies)
      ).slice(0, MAX_COMPOSER_SUGGESTIONS)

  /*
    DEUX bandes, et la première se replie.

    Les conversations ont fait l'aller-retour, et il faut les deux voyages pour
    comprendre où elles en sont. Elles vivaient dans un panneau à colonne DANS
    cet écran, à côté d'une barre latérale de 240 px : un demi-écran de
    navigation pour un écran dont le contenu EST une conversation. Elles sont
    donc remontées dans la barre latérale, sous le bouton « Demander à Laura ».

    Le 30/08/2026, Louis mesure l'effet de bord : « ce qui se passe sous le
    bouton laura prend trop de place […] sinon on voit plus bien le sidebar
    principal ». Vérifié en production le jour même, sur 861 px de haut — la
    liste occupait 510 px, et la navigation du produit n'avait plus qu'une
    fenêtre défilante de 135 px pour 278 px de contenu, soit 3 entrées sur 8
    entièrement lisibles.

    Elles redescendent donc ici, mais REPLIABLES cette fois — c'est la seule
    chose qui manquait au premier essai. La barre latérale récupère ses 510 px,
    et le fil récupère 240 px de plus dès qu'on referme la colonne.

    Le volet de contexte, lui, reste parti : son contenu a migré ailleurs (les
    comptes dans la PORTÉE, ses « actions rapides » dans les amorces, la mémoire
    et l'avertissement sous le fil), et ce qui restait — la liste des membres de
    l'espace — se lit dans Réglages › Équipe, où on la cherche vraiment.

    ⚠️ `min-w-0` sur la rangée : sans lui, un enfant de flex prend
    `min-width: auto`, donc la largeur de son contenu, et le fil pousse la page
    en défilement horizontal au lieu de tronquer.
  */
  const renderSurface = () => (
    <ReplyTransformProvider value={replyTransformGate}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-row">
        <ConversationsPanel refreshKey={threadsVersion} />
        <ChatMain
          accountId={selectedAccountId}
          conversationId={activeConversationId}
          input={input}
          messages={messages}
          threadsRefreshKey={threadsVersion}
          scope={scope}
          scopeAccounts={scopeAccounts}
          portfolioCount={portfolioCount}
          homeContext={homeContext}
          firstName={firstName}
          opener={opener}
          deepLinkInaccessible={deepLinkInaccessible}
          onOpenScope={() => setScopeDialogOpen(true)}
          // #1951.17 / #1951.21 — l'annonce du changement de périmètre et le
          // retour, passés au fil : ils vivent DANS le fil, là où l'on tape.
          scopeChange={scopeChange}
          previousScope={previousStep(scopeTrail)?.scope ?? null}
          onReturnToPreviousScope={returnToPreviousScope}
          onDismissScopeChange={() => setScopeChange(null)}
          sending={sending}
          // V13.3 — tant que `false`, le composeur reste désactivé : voir
          // `composer-draft.ts` (course entre la frappe et la session/le
          // brouillon résolus de façon asynchrone après le montage).
          suggestions={suggestions}
          textareaRef={textareaRef}
          messagesBoxRef={messagesBoxRef}
          onInputChange={handleInputChange}
          onVoiceTranscribed={handleVoiceTranscribed}
          onPrompt={promptAction}
          onSend={handleComposerSend}
          sendQueue={sendQueue}
          onStop={handleStop}
          onRetryReply={retryReply}
          onRelaunchFailedTurn={relaunchFailedTurn}
          onEditLastMessage={editLastMessage}
          onAlternativeAngle={askAlternativeAngle}
          attachedDocs={attachedDocs}
          onAttach={doc => {
            // #1954.3 — trois documents au plus par message ; le quatrième évinçait
            // le premier EN SILENCE. On le dit, avec le nom de celui qui part.
            // #2667.1 — la forme FONCTIONNELLE de `setAttachedDocs` n'est pas un
            // style : une archive .zip appelle `onAttach` PLUSIEURS fois de suite,
            // synchrones, pour ses entrées — lire `attachedDocs` (capturé au rendu)
            // au lieu du `previous` que React vient de tenir aurait fait GAGNER la
            // dernière entrée seule, les précédentes de CE même lot disparaissant
            // sans toast ni erreur (React 18 groupe ces appels avant de rerendre).
            setAttachedDocs(previous => {
              const next = [...previous.filter(d => d.id !== doc.id), doc]
              const evicted = next.length > ATTACH_MAX_COUNT ? next[0] : null
              if (evicted) {
                toast.info(t('attach.evicted', { max: ATTACH_MAX_COUNT, name: evicted.name }), {
                  duration: TOAST_PROBLEM_MS,
                })
              }
              return next.slice(-ATTACH_MAX_COUNT)
            })
          }}
          onRemoveAttachment={id => void removeAttachment(id)}
          onChangeAttachmentScope={(id, scope) => void changeAttachmentScope(id, scope)}
          onPreviewAttachment={previewAttachedDocument}
          onOpenAttachment={openSentAttachment}
          // #2668.1 — un connecteur cliqué s'ajoute ICI, jamais dans `input`.
          connectorLabels={connectorLabels}
          onRemoveConnector={index => setConnectorLabels(previous => previous.filter((_, i) => i !== index))}
          // #2428.12 — id CANONIQUE gardé jusqu'à l'envoi ; `handleSend` ne le
          // transmet que si le texte « @Nom » qui l'a posé est encore là.
          onMentionMember={setMentionedMember}
        />
        <ScopeDialog
          open={scopeDialogOpen}
          onOpenChange={setScopeDialogOpen}
          accounts={scopeAccounts}
          accountsLoading={accountsLoading}
          accountsError={accountsError}
          portfolioCount={portfolioCount}
          initialScope={scope}
          onConfirm={applyScope}
          onAccountQuery={setScopeQuery}
          // #3772.1 — LE MÊME panneau porte aussi la personnalisation (Mon
          // activité / Neutre) : plus de second accès, voir `ScopeDialog`.
          conversationId={activeConversationId}
          // #3772.1 RÉFUTÉ — même signal que `hasMessages` (plus bas, pour
          // `Composer`) : décide si le titre de la modale dit « Nouvelle
          // conversation » (fil vierge) ou « Changer ce que Laura lit »
          // (fil déjà écrit, rouvert depuis `ScopeButton` en-tête).
          threadStarted={messages.length > 0}
          disabled={sending}
          // #3697 (vu en passant, recette prod 09/10) — `applyScope` (ci-dessus)
          // focalise déjà le composer de façon SYNCHRONE à la confirmation ;
          // sans ceci, Radix reprenait ce focus pour le rendre au bouton qui a
          // ouvert la modale une fois l'animation de sortie terminée (GA-378),
          // et la première frappe tombait hors du champ.
          onCloseAutoFocus={event => {
            event.preventDefault()
            textareaRef.current?.focus()
          }}
        />
        <AttachmentPreviewDialog
          id={previewAttachment?.id ?? null}
          name={previewAttachment?.name ?? null}
          content={previewAttachment?.content}
          imageUrl={previewAttachment?.imageUrl}
          imageObjectId={previewAttachment?.imageObjectId}
          citations={previewAttachment?.citations}
          objects={previewAttachment?.objects}
          onOpenChange={open => {
            if (!open) setPreviewAttachment(null)
          }}
        />
      </div>
    </ReplyTransformProvider>
  )

  return (
    /*
      PLEIN ÉCRAN — plus de cadre, plus de bouton « fermer ».

      L'écran gardait la coque de l'ancien widget flottant : une carte à bordure
      arrondie posée sur la page, avec une croix qui renvoyait au tableau de
      bord. Résultat, une fenêtre DANS la fenêtre — et un écran qui a l'air d'un
      accessoire là où c'est la surface principale du produit.

      La croix part avec : « fermer » n'a de sens que pour un panneau flottant.
      Sur un écran plein, c'est la navigation qui fait sortir.

      ⚠️ `min-h-[520px]` retiré aussi : au-dessus de la hauteur utile d'un
      iPhone, il poussait la zone de saisie sous le pli. C'est le piège mobile
      n°3 du chantier du 23/08, resté ici.
    */
    // #3246-recette 10/10 (vu en passant) : `overflow-clip`, pas `overflow-hidden`. Un conteneur
    // `hidden` reste défilable PAR LE CODE (focus du composeur, `scrollIntoView` d'un bloc) : mesuré en
    // prod, `scrollTop` passait à 108 — en-tête décalé à y = -46 et bande vide de 118 px en bas.
    // `clip` interdit tout défilement, y compris programmatique ; seul le fil (`messagesBoxRef`) défile.
    <section
      aria-label={t('panel.aria')}
      className="flex h-full min-h-0 flex-1 flex-col overflow-clip bg-[var(--bellum-bg)] text-[var(--bellum-text-primary)]"
    >
      {renderSurface()}
      {/* #1944.18 — « annonce du chargement » : la réponse arrive fragment par
          fragment, et rien ne disait au lecteur d'écran qu'elle était finie. Une
          phrase courte plutôt que le texte entier, lu deux fois sinon. */}
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
    </section>
  )
}

function ChatMain({
  accountId,
  conversationId,
  input,
  messages,
  messagesBoxRef,
  threadsRefreshKey,
  scope,
  scopeAccounts,
  portfolioCount,
  homeContext,
  firstName,
  opener,
  deepLinkInaccessible,
  onOpenScope,
  scopeChange,
  previousScope,
  onReturnToPreviousScope,
  onDismissScopeChange,
  sending,
  sendQueue,
  suggestions,
  textareaRef,
  onInputChange,
  onPrompt,
  onSend,
  onStop,
  onRetryReply,
  onRelaunchFailedTurn,
  onEditLastMessage,
  onAlternativeAngle,
  onVoiceTranscribed,
  attachedDocs,
  onAttach,
  onRemoveAttachment,
  onChangeAttachmentScope,
  onPreviewAttachment,
  onOpenAttachment,
  connectorLabels,
  onRemoveConnector,
  onMentionMember,
}: {
  attachedDocs: AttachedDoc[]
  onAttach: (doc: AttachedDoc) => void
  onRemoveAttachment: (id: string) => void
  /** #1954.22 — change la portée d'une pièce déjà attachée. */
  onChangeAttachmentScope: (id: string, scope: RagDocumentScope) => void
  /** #1954.19 — ouvre l'aperçu d'une pièce déjà attachée. */
  onPreviewAttachment: (id: string) => void
  /** #2876 (#2433.4) — rouvre la pièce jointe (image) d'un message DÉJÀ ENVOYÉ. */
  onOpenAttachment: (attachment: { id: string; name: string; imageUrl?: string }) => void
  /** #2668.1 — les connecteurs cliqués pour la question en cours, à part du texte. */
  connectorLabels: string[]
  onRemoveConnector: (index: number) => void
  /** #2428.12 — le collègue choisi au clic, id compris — jamais juste un nom. */
  onMentionMember: (member: MentionedMember) => void
  /** #1939.4 — la transcription d'un message dicté, à poser dans la saisie. */
  onVoiceTranscribed: (result: ChatVoiceTranscription) => void
  accountId: string | null
  conversationId: string | null
  input: string
  messages: ChatMessage[]
  messagesBoxRef: RefObject<HTMLDivElement | null>
  /** #1944.4 — la version de la liste des fils, pour le tiroir mobile de l'en-tête. */
  threadsRefreshKey: number
  scope: ChatScope
  scopeAccounts: readonly ScopeAccount[]
  portfolioCount: number | null
  /** #1600 — les signaux de l'accueil, lus UNE fois par `Chat` (l'amorce les lit aussi). */
  homeContext: LauraHomeContext
  /** #1320.2 — le prénom du profil, lu une fois par `Chat`. */
  firstName: string
  /** #1947 / #1908 — la prise de parole de Laura sur un fil vierge, ou `null`. */
  opener: string | null
  /** #2435.12 — un lien partagé qui vise une conversation devenue inaccessible. */
  deepLinkInaccessible: boolean
  onOpenScope: () => void
  /** #1951.17 — le changement de périmètre à annoncer, ou `null`. */
  scopeChange: ScopeChange | null
  /** #1951.21 — le périmètre où revenir, ou `null` quand il n'y en a pas. */
  previousScope: ChatScope | null
  onReturnToPreviousScope: () => void
  onDismissScopeChange: () => void
  sending: boolean
  /** #4066 — la file des messages en attente, rendue sous le fil. */
  sendQueue: SendQueue
  /** V13.3 — `false` tant que la course au chargement du composeur n'est pas
   *  fermée (voir `composer-draft.ts`) : le champ reste désactivé. */
  suggestions: ChatSuggestion[]
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onInputChange: (value: string) => void
  onPrompt: (prompt: string) => void
  /** Envoie le texte donné, ou le contenu de la saisie quand il est omis. */
  onSend: (text?: string, followUpRef?: FollowUpRef) => void
  /** #1953.1 — interrompt le tour DIFFUSÉ en cours. */
  onStop: () => void
  /** #1953.5 — reposer la MÊME question sous une réponse donnée (son index dans `messages`). */
  onRetryReply: (index: number) => void
  /** #2519 — rejouer la question qu’une bulle d’ÉCHEC n’a pas obtenue (son index dans `messages`). */
  onRelaunchFailedTurn: (index: number) => void
  /** #1953.6 / #1953.11 — poser la question précédente dans la saisie, prête à corriger. */
  onEditLastMessage: (index: number) => void
  /** #1953.7 — reposer la question précédente en demandant explicitement un angle différent. */
  onAlternativeAngle: (index: number) => void
}) {
  const { t } = useTranslation('chat')
  // #2434.8/.9/.10/.12/.24/.30 — LE MODE CONVERSATION VOCALE lit la dernière
  // réponse RÉUSSIE de Laura (jamais une bulle d'échec, même filtre que
  // l'historique envoyé au tour suivant, `handleSend` ci-dessus).
  const lastAssistantText =
    [...messages].reverse().find(message => message.role === 'assistant' && !message.failedTurn)?.content ?? null
  // #2434.8/.9/.10/.12/.24/.30 — l'état « erreur » du mode conversation : le
  // dernier tour a échoué (bulle d'échec, `handleSend` ci-dessus), rien de
  // nouveau à lire — la conversation le dit puis réécoute, plutôt qu'un
  // silence qui laisserait croire que Laura n'a pas entendu.
  const lastTurnFailed = messages.length > 0 && Boolean(messages[messages.length - 1]?.failedTurn)
  return (
    /*
      `flex-1` — #1131, « la page s'ouvre et c'est pas tout à fait centré ».

      La chaîne de hauteur cassait ICI. `<section>` prend `h-full`, le conteneur
      de surface prend `flex-1`, et ce `<main>` — qui porte l'en-tête, le fil, la
      saisie et la mémoire — n'avait aucun grandissement. Un enfant de
      flex-colonne sans `flex-grow` vaut `flex-basis: auto`, donc la hauteur de
      son CONTENU : `align-items: stretch` n'étire que la largeur quand l'axe
      principal est vertical. Toute la colonne se tassait donc en haut, la zone
      de saisie flottait au milieu de l'écran, et le `min-h-full` de l'état vide
      — un pourcentage contre une hauteur indéfinie, donc `auto` — ne centrait
      plus rien.

      `min-h-0` reste son indispensable contrepartie : sans lui, le fil
      déborderait au lieu de défiler dans SA boîte (`MessagesArea`), et l'écran
      porterait deux conteneurs défilants imbriqués.
    */
    <main
      {...guideAnchorProps('laura.fil')}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bellum-bg)]"
      aria-label={t('main.aria')}
    >
      <ChatHeader
        accountId={accountId}
        conversationId={conversationId}
        threadsRefreshKey={threadsRefreshKey}
        scope={scope}
        scopeAccounts={scopeAccounts}
        portfolioCount={portfolioCount}
        onOpenScope={onOpenScope}
        messages={messages}
      />
      {/* #2435.11 — proposée seulement après un premier succès (au moins une
          réponse de Laura, jamais une bulle d'échec) : jamais sur un fil qui
          vient tout juste de s'ouvrir. Le composant sait lui-même se taire
          (bureau, déjà installée, navigateur qui n'a rien tiré à proposer) —
          voir `InstallPromptBanner.tsx`. */}
      <InstallPromptBanner
        hasFirstSuccess={messages.some(message => message.role === 'assistant' && !message.failedTurn)}
      />
      {/* #1951.17 — SOUS l'en-tête et AU-DESSUS du fil : c'est là que le regard
          passe entre « j'ai choisi » et « je tape ». Dans l'en-tête, l'annonce
          aurait partagé la ligne du bouton de portée et dit deux fois la même
          chose (loi 4 du tome 7) ; sous la saisie, personne ne l'aurait vue. */}
      <ScopeChangeNotice
        change={scopeChange}
        previous={previousScope}
        accounts={scopeAccounts}
        onReturn={onReturnToPreviousScope}
        onDismiss={onDismissScopeChange}
      />
      {/* #2430.4 — un lien « version figée » le DIT, et mène au fil vivant. */}
      <FrozenVersionBanner accountId={accountId} conversationId={conversationId} />
      {/* #3551 — l'emplacement de la carte proactive de Laura : DANS le flux, entre
          l'en-tête et le fil, donc sur aucun contrôle (voir `laura/chat-slot.ts`). */}
      {/* Recette salle démo 03/10 : une bulle ~220×130 recouvrait le début du message d'accueil.
          `shrink-0` : l'emplacement garde la hauteur de sa carte — sans lui, la colonne flex
          pouvait le comprimer et la carte débordait sur le fil. */}
      {/* Recette démo 04/10 (#3192.2) — sur un fil qui a des messages, l'emplacement vit DANS la boîte
          défilante du fil (`MessagesArea`) : la carte (~180 px) ne vole plus de hauteur fixe au fil
          (337 px sur 949), elle défile avec lui. Un seul des deux emplacements est monté à la fois. */}
      {messages.length === 0 ? <div ref={setLauraChatSlot} data-testid="laura-chat-slot" className="shrink-0" /> : null}
      <MessagesArea
        accountId={accountId}
        conversationId={conversationId}
        messages={messages}
        sending={sending}
        suggestions={suggestions}
        homeContext={homeContext}
        firstName={firstName}
        opener={opener}
        deepLinkInaccessible={deepLinkInaccessible}
        onPrompt={onPrompt}
        onPickOption={onSend}
        onRetryReply={onRetryReply}
        onRelaunchFailedTurn={onRelaunchFailedTurn}
        onEditLastMessage={onEditLastMessage}
        onAlternativeAngle={onAlternativeAngle}
        messagesBoxRef={messagesBoxRef}
        onOpenAttachment={onOpenAttachment}
        // #1957.4 — le périmètre COURANT, et le SEUL geste qui l'ouvre
        // (`ScopeDialog`, celui de l'en-tête) : une demande lourde propose de le
        // limiter, elle ne recrée jamais un second sélecteur (GA-26).
        scope={scope}
        onOpenScope={onOpenScope}
      />
      {/* Deux présentations pour DEUX moments, jamais les deux à la fois :
          - conversation vierge → les amorces s'affichent au centre, dans l'état
            vide porté par `MessagesArea` (c'est là qu'on a la place et que
            l'utilisateur cherche quoi demander) ;
          - conversation entamée → elles vivent DANS la ligne d'outils du
            composer, sur la même ligne que le « + » et les commandes.

          Elles occupaient jusqu'ici une bande à part au-dessus de la saisie :
          treize pastilles enroulées sur DEUX rangées à 1 440 px, ~90 px pris en
          permanence, juste au-dessus d'une ligne d'outils à moitié vide. Deux
          bandes horizontales pour deux gestes qui se font au même moment
          (Louis, 02/09/2026). Le composer les reçoit donc en prop, et la liste
          VIDE est ce qui dit « fil vierge » — sans quoi les amorces
          s'afficheraient deux fois, au centre et dans la ligne. */}
      {/* #1957.5 — « il te reste peu de demandes », AVANT le mur. */}
      {/* #4066.1 — « En attente · N », sous le fil, au-dessus de la saisie. */}
      <SendQueueBlock queue={sendQueue} />
      <ChatQuotaNote refreshKey={sending} />
      <Composer
        // V13.3 — tant que le composeur n'est pas `ready` (course au
        // chargement, voir `composer-draft.ts`), aucune frappe n'est acceptée.
        // #3769 (lot RAA 10/10) — recette prod : clic + frappe immédiate sur /chat
        // → champ vide (un champ `disabled` JETTE la frappe). Le champ n'est plus
        // désactivé tant que le brouillon charge : la frappe gagne toujours, et la
        // restauration du brouillon ne s'applique que sur un champ encore vide
        // (`useChatComposerDraft`).
        disabled={sending}
        loading={sending}
        queueable
        suggestions={messages.length > 0 ? suggestions : []}
        // #3050 — sous 768 px, tout ce que cette prop arme (amorces, mode de
        // contexte, catalogue, connecteurs) se pose une fois le fil commencé :
        // le FIL est le contenu, pas la ligne d'outils (voir `Composer`).
        hasMessages={messages.length > 0}
        onPrompt={onPrompt}
        value={input}
        textareaRef={textareaRef}
        onChange={onInputChange}
        onSend={onSend}
        onStop={onStop}
        conversationId={conversationId}
        accountId={accountId}
        attachedDocs={attachedDocs}
        onAttach={onAttach}
        onRemoveAttachment={onRemoveAttachment}
        onChangeAttachmentScope={onChangeAttachmentScope}
        onPreviewAttachment={onPreviewAttachment}
        connectorLabels={connectorLabels}
        onRemoveConnector={onRemoveConnector}
        onMentionMember={onMentionMember}
        conversationKey={conversationId ?? ''}
        onVoiceTranscribed={onVoiceTranscribed}
        lastAssistantText={lastAssistantText}
        lastTurnFailed={lastTurnFailed}
      />
      {/* #5042 (revient sur #3775, #3050) — la barre « Laura garde en tête » est retirée du fil : il ne reste
          que la mention d'erreur, UNE fois, sous le composeur. La mémoire se lit dans Réglages › Mémoire. */}
      <ComposerDisclaimer />
    </main>
  )
}

/**
 * L'en-tête du fil.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le sous-titre était une phrase FIXE (« ton copilote d'intelligence
 * commerciale »). Elle ne coûtait rien et n'apprenait rien — alors que la seule
 * information dont on a besoin en permanence, dans un fil, est **ce que Laura
 * est en train de lire**. Elle est remplacée par le bouton de portée, qui dit ET
 * permet de changer.
 *
 * Le titre, lui, cesse de répéter le compte : la portée le nomme déjà juste en
 * dessous, et l'entête qui redit l'onglet actif est exactement ce que la loi 4
 * du tome 7 interdit (« rien n'apparaît deux fois sous la même forme avec le
 * même contenu »).
 */
function ChatHeader({
  accountId,
  conversationId,
  threadsRefreshKey,
  scope,
  scopeAccounts,
  portfolioCount,
  onOpenScope,
  messages,
}: {
  accountId: string | null
  conversationId: string | null
  /** #1944.4 — la version de la liste des fils, pour le tiroir mobile ci-dessous. */
  threadsRefreshKey: number
  scope: ChatScope
  scopeAccounts: readonly ScopeAccount[]
  portfolioCount: number | null
  onOpenScope: () => void
  /** #1910.8 — de quoi MESURER si un collègue a écrit ici. Voir `SharedConversationState`. */
  messages: readonly {
    role: 'user' | 'assistant'
    author?: ChatMessageAuthor | null
    /** #1955.29 — les sources citées par chaque réponse, pour le résumé du fil. */
    context?: Pick<ChatResponseContext, 'sources' | 'reasoning_trace'> | null
  }[]
}) {
  // #5032.9 — « moi », pour ne dire « Laura a lu ce fil » qu’à l’auteur du tour (panneau ⋯ › Conversation).
  const selfAuthor = useSelfChatAuthor()
  const { t } = useTranslation('chat')
  // #1944.6 — la même garde que `MobileTabBar` (bas) : dans un navigateur, la
  // barre d'adresse occupe déjà la zone sûre du haut ; en mode installé, elle
  // n'y est plus, et rien ne réservait `env(safe-area-inset-top)` avant ce
  // point — mesuré le 15/09/2026 sur un iPhone à encoche installé, l'entête
  // `/chat` démarrait sous la barre d'état. `useIsInstalled` et non `md:` :
  // une seule borne de largeur (GA-28), l'installation est un autre axe.
  const installed = useIsInstalled()
  // #5048 — le mode de contexte n'est plus rappelé ici (revient sur #3846.1) : « Mon profil » vit
  // dans la barre du composeur, le SEUL endroit (GA-26, arbitrage Louis 31/10/2026).
  return (
    // Décision de Louis du 13/09/2026 (batch 13) : la portée ne vit plus QUE dans cet en-tête, donc sa cible
    // doit tenir 44 px au doigt (GA-30). L'en-tête garde ses 56 px à la souris et grandit au seul doigt.
    // #1994 — « mets tout sur une ligne, qu'on gagne de la place en hauteur » : au-delà de 768 px le nom,
    // la mention IA et la portée s'alignent, et la barre descend de 56 px à 40 px.
    // #3050 (26/09/2026, iPhone prod) — SOUS 768 px aussi désormais : l'entête empilée y mangeait deux
    // rangs sur un fil qui n'a déjà plus que 45 % de la hauteur (mesuré : ~35 % pour le seul chrome du
    // haut). C'est la portée — seul libellé long de la rangée — qui tronque, jamais le nom ni la mention.
    <header
      className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--bellum-border)] px-3 md:h-10 pointer-coarse:h-auto pointer-coarse:min-h-14 pointer-coarse:py-1 md:px-5"
      style={installed ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        {/*
          #1944.4 — tranché par Louis le 12/09/2026 : tiroir depuis l'en-tête.

          Sous 768 px, `ConversationsPanel` (la colonne desktop) est masquée en
          CSS : c'était devenu la seule PORTE vers l'historique, et elle
          n'existe pas sur téléphone. `ConversationsDrawer` porte le SEUL état
          d'ouverture de ce second déclencheur — les deux boutons ne coexistent
          jamais à l'écran (`md:hidden` ici, `max-md:hidden` sur la colonne).
        */}
        <ConversationsDrawer refreshKey={threadsRefreshKey} />
        {/* Décoratif : « Laura » est écrit juste à droite (`header.titleDefault`). */}
        <LauraFace size={32} decorative />
        {/* #1994 / #3050 — `data-chat-identity` : l'estampille que lit `chat-mise-en-page.test.ts`. Sans elle la
            garde devrait reconnaître un `className` parmi d'autres, et elle attraperait la rangée voisine. */}
        <div data-chat-identity className="flex min-w-0 items-center gap-2">
          {/* #1906.7 — l'entête de PAGE qui répétait « Laura » est retirée sur /chat : le titre de niveau 1 passe ici. */}
          {/* ⚠️ #1994 — `shrink-0` n'est posé que sur un nom SANS `truncate` (la garde
              `a-truncation-must-be-able-to-shrink` refuse l'inverse). #3769 (R31, 1512 px) : sans lui,
              « Laura » mesurait 38 px de contenu dans 30 — un nom court ne se coupe jamais ; c'est la
              portée, seul libellé long, qui cède la place. */}
          <Text element="h1" size="sm" weight="semibold" className="shrink-0 whitespace-nowrap">
            {t('header.titleDefault')}
          </Text>
          {/* « Assistante IA », lue AVANT le premier message et sans avoir à le
              demander (article 50 de l'EU AI Act, applicable depuis le
              02/08/2026). Elle vit à côté du nom et jamais dans l'avatar — le
              logo disparaît sous 32 px, la mention non. Même patron que le
              widget du site public, tenu là-bas par GL-07 et ici par GA-246. */}
          {/* #1994 / #3050 — `shrink-0` À TOUTES les largeurs : sur une ligne, la mention obligatoire ne se
              laisse pas rogner par la portée, qui est le seul libellé long de la rangée (c'est LUI qui tronque). */}
          <AiDisclosure className="shrink-0" />
          <ScopeButton
            scope={scope}
            accounts={scopeAccounts}
            portfolioCount={portfolioCount}
            onOpen={onOpenScope}
            size="sm"
            // #1994 / #3050 — la rangée est `gap-2` à toutes les largeurs désormais : aucune marge à
            // corriger. `md:min-w-0` : c'est CE bouton qui tronque en premier sur la ligne la plus dense ; sous 768 px il garde
            // ses 44 px (#4944) et son libellé s'efface.
            className="min-h-0 md:min-w-0 pointer-coarse:min-h-11"
          />
          {/* #1910.8 — l'état de périmètre que la portée ne dit pas : « ce fil
              est-il à moi ? ». Il vit ICI, collé à la portée, parce que les deux
              répondent à la même question (« qu'est-ce que je lis, et avec
              qui ») — et il n'apparaît que MESURÉ. */}
          <SharedConversationState messages={messages} />
        </div>
      </div>
      {/* #3769 — `shrink-0` sur la rangée d'ACTIONS (boutons à libellé constant, aucun texte libre) : mesurée 428 px
          de contenu dans 402, « Exporter » était rogné. C'est la portée, à gauche, qui cède (`min-w-0`). */}
      <div className="flex shrink-0 items-center gap-1">
        {/* #5047 — forme de la maquette V8 : UN menu ⋯ range Conversation (#3775.1 : Résumé, Accès, Détails),
            Partager, la présence (#3086) et Exporter (#3979.1). Voir `ConversationHeaderMenu`. */}
        <ConversationHeaderMenu
          accountId={accountId}
          conversationId={conversationId}
          hasExchange={messages.some(message => message.role === 'assistant')}
          sources={mainThreadSources(messages)}
          mailboxRead={threadMailboxRead(messages, selfAuthor)}
          hasRestrictedSource={hasRestrictedSource(messages)}
        />
      </div>
    </header>
  )
}

// #2429.4 — le bref halo d'un lien d'artefact suivi (`MessagesArea`, plus bas).
// Le même anneau de focus que le reste du produit (`--bellum-focus-ring`),
// jamais une couleur inventée pour l'occasion (D79 / GA-33).
const ARTIFACT_HIGHLIGHT_CLASSES = ['ring-2', 'ring-[var(--bellum-focus-ring)]', 'rounded-lg'] as const

function MessagesArea({
  accountId,
  conversationId,
  messages,
  onPrompt,
  onPickOption,
  onRetryReply,
  onRelaunchFailedTurn,
  onEditLastMessage,
  onAlternativeAngle,
  sending,
  suggestions,
  homeContext,
  firstName,
  opener,
  deepLinkInaccessible,
  messagesBoxRef,
  scope,
  onOpenScope,
  onOpenAttachment,
}: {
  accountId: string | null
  /** #1953.9 — le fil que le lien de partage d'UNE réponse doit désigner. */
  conversationId: string | null
  messages: ChatMessage[]
  onPrompt: (prompt: string) => void
  /** Cliquer une option de clarification ENVOIE l'option comme message. */
  onPickOption: (option: string, followUpRef?: FollowUpRef) => void
  /** #1953.5 — reposer la MÊME question sous une réponse donnée (son index dans `messages`). */
  onRetryReply: (index: number) => void
  /** #2519 — rejouer la question qu’une bulle d’ÉCHEC n’a pas obtenue (son index dans `messages`). */
  onRelaunchFailedTurn: (index: number) => void
  /** #1953.6 / #1953.11 — poser la question précédente dans la saisie, prête à corriger. */
  onEditLastMessage: (index: number) => void
  /** #1953.7 — reposer la question précédente en demandant explicitement un angle différent. */
  onAlternativeAngle: (index: number) => void
  /** #2876 (#2433.4) — rouvre la pièce jointe (image) d'un message DÉJÀ ENVOYÉ. */
  onOpenAttachment: (attachment: { id: string; name: string; imageUrl?: string }) => void
  sending: boolean
  /**
   * ⚠️ #1320 — EN DÉMONSTRATION SEULEMENT. Les amorces y SONT le script :
   * remplacer par l'accueil de Laura (#1600) enverrait un prospect sur des
   * questions sans réponse préparée. `demo-chat-script.ts` (la LISTE) est
   * hors du périmètre de ce chantier (`apps/web/src/features/demo/**`) ; ce
   * composant, lui, se contente de la rendre à l'identique de son ancien
   * rendu — voir `DemoSuggestionRow`.
   */
  suggestions: ChatSuggestion[]
  /** #1600 — les signaux de l'accueil, lus UNE fois par `Chat` (l'amorce les lit aussi). */
  homeContext: LauraHomeContext
  /** #1320.2 — le prénom vient du profil (`useFirstName`), lu une fois par `Chat`. */
  firstName: string
  /** #1947 / #1908 — la prise de parole de Laura sur un fil vierge, ou `null`. */
  opener: string | null
  /** #2435.12 — un lien partagé qui vise une conversation devenue inaccessible. */
  deepLinkInaccessible: boolean
  /**
   * La ZONE scrollable elle-même — c'est elle qu'on défile.
   *
   * Deux corrections successives sur le même symptôme (« le copilote répond,
   * la vue ne bouge pas »). D'abord l'ancre, qui vivait au-dessus du composeur,
   * donc hors de cette zone et par construction toujours visible : rien à
   * faire pour `scrollIntoView`. Puis la MÉTHODE, mesurée dans la page en
   * production le 04/08 :
   *
   *   scrollIntoView({ behavior: 'smooth' })  → scrollTop reste à 0
   *   scrollIntoView({ behavior: 'auto' })    → scrollTop passe à 1015 / 1014
   *   box.scrollTo({ top, behavior: 'smooth' })→ reste à 0
   *   box.scrollTop = box.scrollHeight        → 1015 / 1014
   *
   * Le défilement DOUX est purement et simplement abandonné sur ce conteneur,
   * sans erreur et sans `prefers-reduced-motion` — donc sans rien à débugger.
   * On affecte `scrollTop` : c'est le seul geste dont on ait la preuve qu'il
   * agit. L'animation perdue vaut moins qu'un défilement qui a lieu.
   */
  messagesBoxRef: RefObject<HTMLDivElement | null>
  /** #1957.4 — le périmètre courant de la conversation, et le geste qui ouvre
   *  SON sélecteur (`ScopeDialog`) — jamais un second, posé ici. */
  scope: ChatScope
  onOpenScope: () => void
}) {
  // #4016.L3.a — qui est « moi » : sert à ne montrer « Laura a lu ce fil » qu'à l'auteur du tour.
  const selfAuthor = useSelfChatAuthor()
  // #1912.11 — décision 13/09 batch 11 : la messagerie BRANCHÉE par l'espace, quand
  // il n'en a qu'une, pour que la carte dise « brouillon dans Gmail ».
  const mailboxName = connectedMailboxName(useConnectedCapabilities().tools)
  // #1918.2 / #1918.5 — les portées que CET écran a le droit de proposer : les
  // deux durables, les périmètres que la personne PORTE, et « cette
  // conversation » parce qu'on EST dans un fil. Calculées ici, une fois, et
  // descendues en prop : `PendingActions` se monte dans des suites sans
  // fournisseur react-query, un hook de plus les ferait toutes tomber.
  const memoryScopeOptions = useMemoryScopeOptions(conversationId)
  // #2441.11 — RÉFÉRENCES STABLES PAR INDEX pour les quatre actions de bulle.
  //
  // `messages.map` passait `onRetry={() => onRetryReply(index)}` : une closure
  // NEUVE par bulle à CHAQUE render du parent (chaque token streamé en fait
  // un). `useIndexedCallback` rend, pour un index donné, TOUJOURS la même
  // référence de fonction d'un render à l'autre ; le cache se vide au
  // changement de fil (`conversationId`), pour ne pas grandir sans borne sur
  // une session longue.
  //
  // C'est la condition NÉCESSAIRE pour qu'un `React.memo` sur `MessageBubble`
  // serve à quelque chose (des props stables) — mais PAS SUFFISANTE ici : le
  // envelopper a fait échouer `Chat.test.tsx › #2667.2` de façon déterministe
  // (reproduit deux fois, absent sans le memo), cause non identifiée sous ce
  // budget. `memo(MessageBubble)` reste donc À FAIRE, volontairement — voir le
  // registre #2441.11 pour la piste.
  const getOnRetry = useIndexedCallback(onRetryReply, conversationId)
  const getOnRelaunch = useIndexedCallback(onRelaunchFailedTurn, conversationId)
  const getOnEditLastMessage = useIndexedCallback(onEditLastMessage, conversationId)
  const getOnAlternativeAngle = useIndexedCallback(onAlternativeAngle, conversationId)
  // #5032.2 — mobile : la rangée du pied n'est visible que sous la DERNIÈRE réponse de Laura.
  let latestReplyIndex = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const candidate = messages[i]
    if (candidate && candidate.role === 'assistant' && candidate.content && !candidate.failedTurn) {
      latestReplyIndex = i
      break
    }
  }
  const { t } = useTranslation('chat')
  // ⚠️ #1320 — la démonstration garde son propre jeu de suggestions (le
  // script), jamais celui de l'accueil de Laura ci-dessous.
  const isDemo = useIsDemo()
  // #1907.11 — l'accueil n'a pas de provenance : un fondu simple (`MOTION.reveal`), réduit si le système le demande.
  const homeMotion = chatMotion('reveal', useReducedMotion())
  // #1600 — les six suggestions au plus, choisies selon le contexte réel de
  // l'espace (voir `laura-home-suggestions.ts` pour la doctrine complète).
  const homeSuggestions = resolveLauraHomeSuggestions(t, homeContext)
  // LOT STREAM (12/09/2026) — l'indicateur générique ne sert plus qu'AVANT le
  // premier signal du tour : dès que la bulle diffusée porte un texte ou une
  // étape, elle EST le signal, et l'empiler avec l'indicateur montrerait deux
  // choses différentes qui disent la même chose.
  const lastMessage = messages[messages.length - 1]
  const streamingBubbleHasSignal =
    lastMessage?.role === 'assistant' && Boolean(lastMessage.content || lastMessage.pendingStep)
  // #2472 — LES CRITÈRES QUE LAURA A PRÉPARÉS, BULLE PAR BULLE.
  //
  // Ils viennent des propositions `find_accounts` du fil — celles qui ouvrent
  // Découvrir pré-rempli depuis une CARTE. Le lien qu'elle écrit dans le texte
  // de sa réponse partait nu ; il emporte désormais les mêmes.
  //
  // La liste se lit en CUMUL et non message par message : la personne répond
  // « GO » à une proposition, et c'est la réponse SUIVANTE qui porte le lien —
  // les critères sont une bulle plus haut. On ne prend jamais de critère venu
  // d'APRÈS la bulle (une réponse ancienne ne se relit pas avec les filtres du
  // tour en cours), et rien n'est inventé : sans proposition, rien ne voyage.
  // #2441.11 (épopée #2840) — MÉMOÏSÉ : sans `useMemo`, ce calcul (en O(n²) —
  // une `slice`/`flatMap` PAR message, pour CHAQUE message) retournait à
  // chaque render du parent, donc à CHAQUE token streamé, sur la liste
  // ENTIÈRE — la même classe de défaut que les closures inline de
  // `messages.map` réglée par `useIndexedCallback` juste au-dessus.
  // #3769 — les cartes actualisées plus bas dans le fil (même `card_id`) : la précédente se remplace par un renvoi.
  const supersededCards = useMemo(() => supersededCardKeys(messages), [messages])
  const criteriaUpTo = useMemo(
    () =>
      messages.map((_, index) =>
        discoverCriteriaOfReply(
          messages
            .slice(0, index + 1)
            .flatMap(message => [
              ...(message.cards ?? []).map(card => card.action),
              ...(message.context?.pending_actions ?? []),
            ]),
        ),
      ),
    [messages],
  )
  // #2441.11 (épopée #2840) — LA FENÊTRE RÉELLE : `useMessageWindow` mesure le
  // VRAI conteneur (`messagesBoxRef`, la zone qu'on défile déjà plus haut) et
  // les VRAIES bulles rendues, et rend `computeVirtualWindow` (pur, testé) sur
  // ces mesures. Le cache de hauteurs se vide au changement de fil, comme
  // celui de `useIndexedCallback` juste au-dessus — même raison : un fil long
  // ne doit pas faire grandir un cache sans borne sur une session longue.
  const {
    window: messageWindow,
    itemHeights: windowItemHeights,
    registerHeight,
  } = useMessageWindow(messagesBoxRef, messages.length, conversationId)
  // Le spacer du BAS : ce que `computeVirtualWindow` n'a pas déjà rendu
  // compte (`offsetTop`, le spacer du HAUT) ni monté (la fenêtre elle-même).
  const bottomSpacerHeight = Math.max(
    0,
    messageWindow.totalHeight -
      messageWindow.offsetTop -
      windowItemHeights
        .slice(messageWindow.startIndex, messageWindow.endIndex + 1)
        .reduce((sum, height) => sum + height, 0),
  )
  // #2429.4 / recette #2429 « partage interne » — un lien copié
  // (`data-artifact-id`, StructuredReply.tsx) désigne ce hash. BEST-EFFORT :
  // sur un TRÈS long fil fenêtré (#2441.11), le bloc visé peut ne pas être
  // monté — on ne fait défiler QUE si on le trouve, jamais au hasard.
  useEffect(() => {
    const match = /^#artifact=(.+)$/.exec(window.location.hash)
    if (!match) return
    const artifactId = decodeURIComponent(match[1] as string)
    const candidates = messagesBoxRef.current?.querySelectorAll<HTMLElement>('[data-artifact-id]') ?? []
    const target = Array.from(candidates).find(node => node.dataset.artifactId === artifactId)
    if (!target) return
    target.scrollIntoView({ behavior: 'auto', block: 'center' })
    target.classList.add(...ARTIFACT_HIGHLIGHT_CLASSES)
    const timeout = window.setTimeout(() => target.classList.remove(...ARTIFACT_HIGHLIGHT_CLASSES), 2000)
    return () => window.clearTimeout(timeout)
  }, [conversationId, messagesBoxRef, messageWindow.endIndex])
  return (
    <div
      ref={messagesBoxRef}
      // #3050 — `overflow-x-hidden` : filet de sécurité explicite, le fil ne
      // défile qu'en Y (voir `break-words` sur `MessageBubble` pour la cause).
      // `data-testid` : la preuve chiffrée (`chat-mobile-fil-3050.spec.ts`)
      // mesure CETTE boîte, pas une classe.
      data-testid="chat-messages-list"
      // #3847.1 — `md:px-8` (était `md:px-6`) : /chat passe en pleine largeur,
      // la gouttière de `CHAT_SURFACE.composerBand` suit la même valeur.
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 md:px-8"
    >
      {/* #3192.2 — l'en-tête de l'écran (checklist d'activation) défile AVEC le fil.
          Vu en passant (lot V10, 08/10, recette prod Q #3899) : rendu SANS condition,
          elle revenait en tête de CHAQUE fil, même un fil déjà commencé — un fil qui
          porte déjà des messages n'a plus besoin d'un en-tête d'ACTIVATION. */}
      {messages.length === 0 ? <ChatTopSlot /> : null}
      {/* #3862.1 — une étude Approfondie interrompue faute de budget reste visible
          après une reconnexion : l'écran de progression que `chat-deepen-jobs.
          service.ts` annonçait depuis #3236.2 sans qu'aucun écran ne le relise. */}
      <DeepenJobResumeBanner conversationId={conversationId} messageCount={messages.length} />
      {messages.length > 0 ? <div ref={setLauraChatSlot} data-testid="laura-chat-slot" className="shrink-0" /> : null}
      <AnimatePresence mode="wait">
        {messages.length === 0 && !sending ? (
          <motion.div
            key="empty-chat"
            // décision Louis 13/09 batch 13 — plat : plus de dégradé derrière l'accueil (#1907.9 retiré).
            // #1906.7 — la colonne du fil (768 px), plus 576.
            // #2001 — `justify-start` : l'accueil part du même bord que le fil et que la saisie.
            // Sans lui, `CHAT_SURFACE.column` serait calée à gauche au premier message et centrée
            // avant — l'écran changerait de POSITION là où #1906.7 l'a empêché de changer de largeur.
            // #3774.1.3 — `items-end` : l'accueil se pose au ras de la saisie au lieu de flotter au
            // milieu du fil (le grand vide non structuré qui le séparait de la zone de saisie).
            className="flex min-h-full items-end justify-start"
            {...homeMotion}
          >
            <div className={CHAT_SURFACE.column}>
              {/*
                #1600 — L'ACCUEIL DE LAURA.

                Remplace l'ancien état vide générique (icône `Sparkles`,
                titre fixe) ET la rangée de suggestions bornée à six avec un
                « + N autres » : deux mécaniques pour le même geste, en plus
                des cinq travaux gouvernés affichés juste à côté. Une seule
                collection les remplace toutes les deux — le catalogue complet
                (`suggestions.seeAll`, sous la saisie) reste la troisième voie,
                inchangée.

                Le visage de Laura, jamais son nom en toutes lettres ici : la
                barre du haut nomme déjà Laura et porte la mention IA
                obligatoire (loi 4 du tome 7, un second titre la répéterait).
                Le prénom vient du profil (`useFirstName`, une seule source
                dans tout le produit) ; la formule sans prénom existe pour les
                profils qui n'en ont pas.
              */}
              {/* #1947 — quand Laura a pris la parole, sa bulle REMPLACE le titre :
                  les deux ensemble diraient deux fois « qu'est-ce qu'on fait ? »
                  (loi 4 du tome 7). Les suggestions restent dessous — elles
                  répondent à la question qu'elle vient de poser. */}
              {/* #2435.12 — un lien partagé vers une conversation disparue : jamais
                  la même page vide qu'un fil vraiment neuf. Réutilise l'habillage
                  visuel de `OpenerBubble` (Laura qui parle) mais SANS passer par
                  `opener` — ce texte ne doit ni se persister comme une vraie
                  réponse, ni partir dans l'historique envoyé au modèle. */}
              {deepLinkInaccessible ? (
                <OpenerBubble text={t('deepLink.inaccessible')} />
              ) : opener ? (
                <OpenerBubble text={opener} />
              ) : (
                // #3884.1 — recette 08/10/2026 : ce fallback posait sa PROPRE
                // question (« Qu'est-ce qu'on fait ? »), doublant celle de la
                // bulle de Laura trois secondes plus tard — deux salutations.
                // Une seule voix d'accueil (#3773) : ici, aucune question,
                // juste le visage de Laura et le sous-titre neutre.
                // Théo B l1-laura (accueil) : le salut à gauche — « Bonjour Théo. » en grand, la question
                // dessous, la phrase — et le visage de Laura à droite, en médaillon.
                <div data-laura-home="hero" className="flex items-center justify-between gap-6">
                  <div className="min-w-0">
                    {/* Théo B l1-laura.N6 — le salut nominatif ; sans prénom au profil, la question seule (jamais un prénom inventé). */}
                    <h2
                      data-testid="laura-home-greeting"
                      className="text-2xl font-semibold leading-tight tracking-tight text-[var(--bellum-text-primary)] md:text-3xl"
                    >
                      {firstName ? (
                        <>
                          <span className="block">{t('home.hello', { name: firstName })}</span>{' '}
                          <span className="block font-normal text-[var(--bellum-text-secondary)]">
                            {t('home.greetingNoName')}
                          </span>
                        </>
                      ) : (
                        t('home.greetingNoName')
                      )}
                    </h2>
                    <Text size="sm" className="mt-3 text-[var(--bellum-text-secondary)]">
                      {t(LAURA_HOME_MARKET_MEMORY_AVAILABLE ? 'home.subtitleWithMarketMemory' : 'home.subtitle')}
                    </Text>
                  </div>
                  <span className="hidden shrink-0 rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-1.5 md:block">
                    <LauraFace size={72} decorative />
                  </span>
                </div>
              )}
              {isDemo ? (
                <DemoSuggestionRow suggestions={suggestions} onPrompt={onPrompt} />
              ) : (
                <HomeSuggestionGrid
                  suggestions={homeSuggestions}
                  settled={homeContext.settled}
                  activeConversationId={conversationId}
                  onPrompt={onPrompt}
                  onOpenCatalog={requestOpenCommands}
                />
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {/* #1906.7 — la même colonne que l'accueil : l'écran ne change plus de largeur au premier message. */}
      <div className={cn(CHAT_SURFACE.column, 'space-y-4')}>
        {/* #2441.11 (épopée #2840) — LA FENÊTRE RÉELLE, câblée : seuls les
            indices `[startIndex, endIndex]` de `messageWindow` montent un
            `MessageBubble`. Les deux spacers (`offsetTop` en haut, le reste en
            bas) gardent la hauteur SCROLLABLE du conteneur égale à la hauteur
            réelle du fil entier — `box.scrollTop = box.scrollHeight` (l'effet
            de défilement, plus haut dans ce fichier) continue donc d'amener la
            vue tout en bas, fenêtrage ou non. Conteneur pas encore mesuré
            (0, comme tout `render(<Chat />)` en jsdom) : `useMessageWindow`
            ouvre alors la fenêtre en entier — voir son docblock. */}
        {messageWindow.offsetTop > 0 ? <div aria-hidden style={{ height: messageWindow.offsetTop }} /> : null}
        {messages.slice(messageWindow.startIndex, messageWindow.endIndex + 1).map((message, offset) => {
          const index = messageWindow.startIndex + offset
          // #2468 — LA BULLE VIDE QUE `handleSend` POSE AVANT LE PREMIER SIGNAL.
          //
          // Entre l'envoi et le premier `onDelta`/`onStep`, la dernière bulle
          // assistant n'a ni texte ni étape : son conteneur (`data-chat-kind=
          // "reply"`) se rendait quand même, vide — un rendu conditionnel qui
          // rend `<div/>` au lieu de `null`. `TypingIndicator`, juste en
          // dessous, EST déjà le signal de cet instant ; empiler les deux
          // montrait un carré vide au-dessus des trois points, à CHAQUE tour
          // de CHAQUE conversation (mesuré : « j'ai l'impression qu'il vient
          // à chaque conv »).
          if (sending && index === messages.length - 1 && message.role === 'assistant' && !streamingBubbleHasSignal) {
            return null
          }
          return (
            <MessageWindowItem key={`${message.role}-${index}`} index={index} onHeight={registerHeight}>
              <MessageBubble
                accountId={accountId}
                conversationId={conversationId}
                message={message}
                supersededCards={supersededCards}
                // #2472 — ce que le lien « Découvrir » de CETTE bulle doit emporter.
                discoverCriteria={criteriaUpTo[index] ?? null}
                onPickOption={onPickOption}
                onPrompt={onPrompt}
                onRetry={getOnRetry(index)}
                onRelaunch={getOnRelaunch(index)}
                onEditLastMessage={getOnEditLastMessage(index)}
                onAlternativeAngle={getOnAlternativeAngle(index)}
                // #1953.13 — un tour en vol ne s'interrompt pas d'un réessai : les
                // trois actions se désactivent tant que `sending` est vrai, le
                // même signal que le bouton « Arrêter » (`handleSend` refuse de
                // toute façon un second envoi concurrent, cette désactivation en
                // fait un état VISIBLE plutôt qu'un clic silencieusement ignoré).
                retryDisabled={sending}
                ownTurn={isOwnTurn(messages, index, selfAuthor)}
                isLatestReply={index === latestReplyIndex}
                mailboxName={mailboxName}
                memoryScopeOptions={memoryScopeOptions}
                scope={scope}
                onOpenScope={onOpenScope}
                onOpenAttachment={onOpenAttachment}
              />
            </MessageWindowItem>
          )
        })}
        {bottomSpacerHeight > 0 ? <div aria-hidden style={{ height: bottomSpacerHeight }} /> : null}
        {sending && !streamingBubbleHasSignal ? <TypingIndicator /> : null}
      </div>
      {/* #3776.5 — une réponse arrivée pendant qu'on lit plus haut : un accès discret, jamais un saut. */}
      <NewRepliesPill boxRef={messagesBoxRef} messages={messages} />
    </div>
  )
}

/**
 * #1927.3 / #1927.4 — CE QUE LAURA A ÉCARTÉ, ET CE QU'ELLE SUPPOSE.
 *
 * Le service IA refusait d'EXTRAIRE ces deux choses du texte de la réponse — un
 * détecteur par mots-clés rate en silence, et ce refus tient. Le chemin ouvert
 * est le STRUCTURÉ : `ask_clarification` les porte dans sa sortie typée, comme
 * elle porte déjà la question et ses options. Ce composant est le dernier
 * maillon — sans lui, le champ serait du code juste que personne n'appelle.
 *
 * Deux règles de rendu :
 *  - un champ ABSENT ne rend rien. Pas de section vide, pas de « aucune » : la
 *    forme d'avant, à l'écran près ;
 *  - une raison absente ne s'invente pas. La piste se nomme seule — « écarté »
 *    est déjà une information, « écarté pour une raison inconnue » n'en est pas.
 */
function ClarificationReasoning({
  ruledOut,
  assumptions,
}: {
  ruledOut?: { option: string; reason?: string | null }[]
  assumptions?: string[]
}) {
  const { t } = useTranslation('chat')
  const dropped = ruledOut?.filter(entry => entry.option) ?? []
  const composed = composeAssumptions(assumptions ?? [])
  if (dropped.length === 0 && !composed.phrases && !composed.sentences) return null

  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {dropped.length > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('clarification.ruledOut')}{' '}
          {dropped
            .map(entry => (entry.reason ? `${entry.option} (${entry.reason})` : entry.option))
            .map(chatPlainText)
            .join(' · ')}
        </Text>
      ) : null}
      {composed.phrases || composed.sentences ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {composed.sentences ? `${chatPlainText(composed.sentences)} ` : ''}
          {composed.phrases
            ? t('clarification.assumptions', { items: composed.phrases })
            : t('clarification.canCorrect')}
        </Text>
      ) : null}
    </div>
  )
}

/**
 * Les options d'une clarification — et, depuis #2679, d'une précision posée en
 * texte (`ReplyOptions` plus bas réutilise ce composant).
 *
 * Cliquer ENVOIE l'option comme message. Le §9.4 exige des options
 * « cliquables », et le mot est le point — retaper une réponse qu'on vient de
 * lire est exactement le frottement qu'on voulait retirer.
 *
 * ⚠️ #2679 — ce commentaire disait que le clic « distingue une clarification
 * d'une question posée en texte, à laquelle l'utilisateur doit répondre en
 * tapant ». Ce n'est plus vrai : les deux se cliquent. Ce qui les distingue
 * reste entier ailleurs — la CARTE arrête le tour, se dépense une fois par
 * conversation et exonère le plafond ; la précision en texte ne fait rien de
 * tout cela.
 */
function ClarificationOptions({
  options,
  onPick,
}: {
  options: ClarificationOption[]
  onPick: (option: string) => void
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {options.map((option, index) =>
        typeof option === 'string' ? (
          <Button key={option} size="sm" variant="outline" className="h-7" onClick={() => onPick(option)}>
            {chatPlainText(option)}
          </Button>
        ) : (
          <ClarificationOptionCard
            // #1951.10/.12-.16 — un label peut se répéter entre deux options homonymes
            // (« Sophie Martin » chez deux comptes différents) : l'index les distingue.
            key={`${option.label}-${index}`}
            option={option}
            onPick={onPick}
          />
        ),
      )}
    </div>
  )
}

/**
 * #2679 — LES RÉPONSES POSSIBLES D'UNE PRÉCISION POSÉE EN TEXTE.
 *
 * Le retour de Louis : « là ça serait bien de juste pouvoir sélectionner la
 * réponse, sans avoir besoin de la réécrire dans le chat, c'est bien plus
 * smooth ». La carte de clarification était déjà cliquable, mais elle est
 * bornée à UNE par conversation ; les précisions du bloc `_BLOCK_ASK_FIRST`,
 * elles, arrivaient en markdown — donc à retaper.
 *
 * Trois règles de rendu :
 *  - AUCUN parsing de prose. Les options viennent d'une sortie typée du modèle
 *    (`offer_reply_options`), jamais d'un découpage de la phrase ;
 *  - un groupe sans option ne rend RIEN : pas de bouton mort, on n'affiche pas
 *    ce qu'on n'a pas ;
 *  - la question n'est pas réaffichée — elle est déjà dans le texte de la
 *    réponse. Elle NOMME le groupe de boutons (`aria-label`), pour que la
 *    lecture d'écran sache à quoi ces réponses répondent.
 *
 * Cliquer envoie l'option comme message (`onPickOption`, le geste existant) :
 * rien n'est exécuté, rien n'est envoyé dehors, aucun crédit n'est dépensé.
 */
function ReplyOptions({
  groups,
  onPick,
}: {
  groups: NonNullable<ChatResponseContext['reply_options']>
  onPick: (option: string) => void
}) {
  const { t } = useTranslation('chat')
  const asked = groups.filter(group => group.options?.length)
  if (asked.length === 0) return null

  return (
    <div className="mt-1 flex flex-col gap-1">
      {asked.map((group, index) => (
        <div
          // Deux précisions peuvent se ressembler : l'index les distingue.
          key={`${group.question ?? 'precision'}-${index}`}
          role="group"
          aria-label={chatPlainText(group.question ?? '') || t('replyOptions.group')}
        >
          <ClarificationOptions options={group.options ?? []} onPick={onPick} />
        </div>
      ))}
    </div>
  )
}

/**
 * Une option de désambiguïsation structurée (#1951.12 à .16) : avatar, nom,
 * puis rôle/localisation et entreprise/statut sur une seconde ligne. Cliquer
 * envoie `option.label` — jamais les champs d'affichage, qui ne sont là que
 * pour aider à RECONNAÎTRE, pas pour composer le message.
 *
 * ⚠️ Doctrine critères protégés : l'avatar affiche une identité pour lever une
 * ambiguïté (exception nommée), il ne classe personne.
 */
function ClarificationOptionCard({
  option,
  onPick,
}: {
  option: Extract<ClarificationOption, object>
  onPick: (option: string) => void
}) {
  const metaLine = [option.role, option.location].filter(Boolean).join(' · ')
  const secondaryLine = [option.company, option.status].filter(Boolean).join(' · ')
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto min-h-11 items-center gap-2 px-2.5 py-1.5 text-left"
      onClick={() => onPick(option.label)}
    >
      <EntityAvatar name={option.label} src={option.avatar_url ?? null} size="xs" className="shrink-0" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium">{chatPlainText(option.label)}</span>
        {metaLine ? <span className="truncate text-xs text-[var(--bellum-text-muted)]">{metaLine}</span> : null}
        {secondaryLine ? (
          <span className="truncate text-xs text-[var(--bellum-text-muted)]">{secondaryLine}</span>
        ) : null}
      </span>
    </Button>
  )
}

/**
 * #2254 (défaut mesuré en prod le 17/09) — découpe le texte d'une question en
 * segments TEXTE / CONNECTEUR, pour que chaque connecteur posé se rende en
 * puce plutôt qu'en texte fondu dedans.
 *
 * `connectors` est l'ORDRE dans lequel les outils ont été cliqués (#2668.1 —
 * `connectorLabels`, l'état du composer, jamais une lecture du texte tapé) :
 * `content` porte le libellé lisible, accolé à la question par `handleSend`,
 * et cet ordre dit où le chercher. Un libellé introuvable (rare : `connectors`
 * d'un autre message, contenu retouché) abandonne la segmentation pour LUI
 * plutôt que d'inventer une position — le texte restant part tel quel, sans puce.
 */
function connectorMessageSegments(
  content: string,
  connectors: readonly string[] | undefined,
): Array<{ kind: 'text'; value: string } | { kind: 'connector'; label: string }> {
  if (!connectors?.length) return [{ kind: 'text', value: content }]
  const segments: Array<{ kind: 'text'; value: string } | { kind: 'connector'; label: string }> = []
  let rest = content
  for (const label of connectors) {
    const index = rest.indexOf(label)
    if (index === -1) break
    if (index > 0) segments.push({ kind: 'text', value: rest.slice(0, index) })
    segments.push({ kind: 'connector', label })
    rest = rest.slice(index + label.length)
  }
  if (rest) segments.push({ kind: 'text', value: rest })
  return segments
}

// #2441.11 — ses props sont maintenant stables (`getOnRetry`/`getOnRelaunch`/
// `getOnEditLastMessage`/`getOnAlternativeAngle` dans `MessagesArea`, voir le
// commentaire là-bas), la condition nécessaire pour qu'un `React.memo` évite
// de rerendre une bulle à chaque token streamé d'une AUTRE bulle. PAS ENCORE
// enveloppé : `memo(MessageBubble)` fait échouer `Chat.test.tsx › #2667.2` de
// façon déterministe, cause non identifiée sous ce budget — voir le registre.
function MessageBubble({
  accountId,
  conversationId,
  message,
  supersededCards,
  onPickOption,
  onPrompt,
  onRetry,
  onRelaunch,
  onEditLastMessage,
  onAlternativeAngle,
  retryDisabled,
  ownTurn,
  isLatestReply,
  mailboxName,
  discoverCriteria,
  memoryScopeOptions,
  scope,
  onOpenScope,
  onOpenAttachment,
}: {
  accountId: string | null
  /** #1953.9 — le fil que le lien de partage d'UNE réponse doit désigner. */
  conversationId: string | null
  message: ChatMessage
  /** #3769 — clés `messageId:cardId` des cartes remplacées par une version plus récente du fil. */
  supersededCards: ReadonlySet<string>
  /** #2876 (#2433.4) — rouvre la pièce jointe (image) de CE message. */
  onOpenAttachment: (attachment: { id: string; name: string; imageUrl?: string }) => void
  onPickOption: (option: string, followUpRef?: FollowUpRef) => void
  /** #3766 — pose un texte dans le composeur (« Affiner la recherche »). */
  onPrompt: (prompt: string) => void
  /** #1953.5 */
  onRetry: () => void
  /** #2519 — « Relancer » sur une bulle d'échec. */
  onRelaunch: () => void
  /** #1953.6 / #1953.11 */
  onEditLastMessage: () => void
  /** #1953.7 */
  onAlternativeAngle: () => void
  /** #1953.13 — un tour en vol désactive les trois. */
  retryDisabled: boolean
  /** #4016.L3.a — ce tour répond à une question du lecteur (voir `isOwnTurn`). */
  ownTurn: boolean
  /** #5032.2 — c'est la dernière réponse de Laura du fil : mobile, sa rangée de pied est visible. */
  isLatestReply: boolean
  /** #1912.11 — la messagerie branchée par l'espace, pour « brouillon dans Gmail ». */
  mailboxName: string | null
  /** #2472 — les critères que le lien « Découvrir » de cette bulle emporte, ou `null`. */
  discoverCriteria: Readonly<Record<string, string>> | null
  /** #1918.2 / #1918.5 — les portées proposables sur la carte d'épinglage de Laura. */
  memoryScopeOptions: readonly MemoryScopeOffer[]
  /** #1957.4 — le périmètre courant, et le geste qui ouvre SON sélecteur. */
  scope: ChatScope
  onOpenScope: () => void
}) {
  const isUser = message.role === 'user'
  const { t, i18n } = useTranslation('chat')
  // #5032.2 — mobile : toucher une réponse plus ancienne affiche SA rangée ; #5032.13 — le CTA de
  // qualification complémentaire ouvre le flux d'approfondissement du pied (un seul chemin, GA-26).
  const [touched, setTouched] = useState(false)
  const [deepenRequest, setDeepenRequest] = useState(0)
  // #3950.1 — descendu à `PendingActions` : voir son docblock `isDemo`.
  const isDemo = useIsDemo()
  // #1940.4 — l'auteur de la bulle : servi par l'API sur une bulle relue, la
  // personne connectée sur une bulle tapée dans cet onglet.
  const author = bubbleAuthor(message, useSelfChatAuthor())
  // #1907.11 — « ça vient d'arriver » : `MOTION.enterFromBelow`, réduit si le système le demande.
  const arrival = chatMotion('enterFromBelow', useReducedMotion())
  // #2892 (27/09) — recette prod : « Pas de réponse. » s'affichait, PARASITE,
  // devant une carte d'action quand le tour n'avait rien à dire au-delà de la
  // carte qu'il propose. `content` reste non vide (le contrat de persistance
  // l'exige, `createChatMessageSchema.content: z.string().min(1)`) — c'est
  // seulement l'AFFICHAGE du repli qui s'efface quand une carte suit, live ou
  // relu au rechargement (`message.cards`/`context.pending_actions`).
  const hasAFollowingCard = !isUser && Boolean(message.cards?.length || message.context?.pending_actions?.length)
  const isBareNoReplyFallback = message.content === t('messages.noReply')
  const showsTextContent = Boolean(message.content) && !(isBareNoReplyFallback && hasAFollowingCard)
  return (
    <motion.div {...arrival} className={cn('flex w-full gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser ? <AssistantAvatar named /> : null}
      {/* D81 / GA-34 — la largeur de LECTURE vient de `chat-surface.ts`, en `ch`. Elle était
          écrite ici en pixels (680), et une seconde fois sur l'amorce de Laura. */}
      <div
        // #5032.1 — `group/reply` : le survol ou le focus de la réponse montre la rangée de son pied.
        // #5032.2 — mobile : toucher la réponse la révèle (`touched`).
        className={cn(CHAT_SURFACE.reading, 'group/reply space-y-1', isUser ? 'items-end' : 'items-start')}
        onPointerDown={isUser ? undefined : () => setTouched(true)}
      >
        {/* #1940.4 — « Comprendre qui a posé la question » : prénom + avatar
            au-dessus de chaque question. Sans auteur connu, rien — jamais un nom
            deviné. */}
        {isUser && author ? (
          <div className="flex justify-end">
            <MessageAuthor author={author} label={t('messages.authorLabel', { firstName: author.firstName })} />
          </div>
        ) : null}
        <div
          // #1907.13 — ta question et la réponse de Laura ont chacune leur peau (`chat-surface.ts`) ;
          // #1907.5 — et leur relief est réellement peint (`shadow-xs` n'existe pas en Tailwind 3.4).
          // #3050 (26/09/2026, iPhone prod) — `break-words` : un mot ou une URL sans espace
          // (mesuré : un lien LinkedIn collé au texte) ne wrappait pas, la bulle débordait de
          // `CHAT_SURFACE.reading` et le fil gagnait un défilement HORIZONTAL — la seule barre
          // de défilement que ce produit ne doit jamais montrer (le fil ne défile qu'en Y).
          data-chat-kind={isUser ? 'question' : 'reply'}
          className={cn(
            'break-words px-4 py-3',
            // #3273 — la réponse se lit à `CHAT_SURFACE.replyText` (16 px dès `md`, GA-26) ;
            // ta question reste à sa taille d'avant, elle ne porte pas le même défaut mesuré.
            isUser ? 'text-sm leading-relaxed' : CHAT_SURFACE.replyText,
            isUser ? CHAT_SURFACE.question : CHAT_SURFACE.reply,
          )}
        >
          {/* #3761.16 / #2840 (#2441.13) — LE MODE DÉGRADÉ ANNONCÉ, EN TÊTE. `context.partial` marque un tour
              arrêté avant la fin (délai ou panne, `apps/ia/app/routers/chat.py::_partial_response`) : le repère
              STRUCTURÉ est un `ReplyHeader` (reply-kit) avant le texte, plus une pastille ad hoc dans le pied. */}
          {!isUser && message.context?.partial ? (
            <div className="mb-2">
              <ReplyHeader
                title={t(`provenance.partial.${message.context.partial.reason}`, {
                  defaultValue: t('provenance.partial.default'),
                })}
                status="partial"
                statusLabel={t('replyKit.header.partialBadge')}
              />
            </div>
          ) : null}
          {isUser ? (
            // #2254 (défaut mesuré en prod le 17/09) — chaque connecteur posé
            // se rend en puce (icône + nom), séparée du texte, plutôt que
            // fondu dedans (« Google Calendar Quels sont mes 3 prochains
            // rendez-vous ? »).
            connectorMessageSegments(message.content, message.connectors).map((segment, index) =>
              segment.kind === 'connector' ? (
                <span
                  key={`connector-${index}`}
                  className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-[var(--bellum-border)] px-2 py-0.5 align-middle text-xs text-[var(--bellum-text-secondary)]"
                >
                  <Plug aria-hidden className="size-3 shrink-0" />
                  {segment.label}
                </span>
              ) : (
                <span key={`text-${index}`}>{segment.value}</span>
              ),
            )
          ) : showsTextContent ? (
            // #2472 — « quand je clique sur découvrir la requete de decouvrir est
            // pas préremplie » : le lien que Laura écrit dans son texte emporte
            // désormais les mêmes critères que la carte de proposition.
            // #1903.20 / #1933.8 — et le fil source, pour le bouton « Revenir
            // à la conversation » de l'écran ouvert (même dérivation que
            // `PendingActions.tsx`, jusque-là le seul chemin qui l'emportait).
            <ReplyConversation conversationId={conversationId}>
              <DiscoverHandoff criteria={discoverCriteria}>
                {/* #3762 — les actions finales d'une cartographie envoient leur libellé (geste de ReplyOptions). */}
                <ReplyFollowUpProvider onSend={onPickOption}>
                  <StructuredReply
                    text={message.content}
                    messageId={message.id ?? undefined}
                    artifactVersions={message.artifactVersions}
                    supersededCards={supersededCards}
                  />
                </ReplyFollowUpProvider>
              </DiscoverHandoff>
            </ReplyConversation>
          ) : message.pendingStep ? (
            // LOT STREAM (12/09/2026) — l'étape en cours, tant qu'aucun texte
            // n'est encore arrivé : « Lecture de ta messagerie… » plutôt qu'un
            // indicateur générique pendant tout le tour.
            <TurnStepIndicator label={message.pendingStep} />
          ) : null}
          {/* #1320 — le graphe d'une réponse scriptée, DANS la bulle. Il n'existe
              qu'en démonstration : le vrai copilote rend du texte structuré. */}
          {!isUser && message.chart ? <DemoBarChart chart={message.chart} /> : null}
          {/* #1953.3 — l'arrêt volontaire se DIT, sans se confondre avec un
              échec : le texte au-dessus reste celui reçu avant le clic. */}
          {!isUser && message.stopped ? (
            <p className="mt-1 text-xs italic text-[var(--bellum-text-muted)]">{t('messages.stopped')}</p>
          ) : null}
          {/* #3809.1 — un tour abandonné par un changement de fil se NOMME au
              retour, plutôt que de laisser croire qu'aucune réponse n'a jamais
              été tentée (« En attente » sans explication). */}
          {!isUser && message.interruptedByNavigation ? (
            <p className="mt-1 text-xs italic text-[var(--bellum-text-muted)]">
              {t('messages.interruptedByNavigation')}
            </p>
          ) : null}
        </div>
        {/* #3766 — les actions métier de CETTE réponse. #5032.14 — le repli « Aller plus loin » est retiré ;
            #5032.13 — « Lancer une qualification complémentaire » ouvre l'approfondissement du pied de réponse. */}
        {!isUser && message.content && !message.failedTurn ? (
          <ReplyActions
            content={message.content}
            // Les critères de CETTE réponse seulement — `discoverCriteria` est cumulé
            // sur le fil (pour le lien du texte) : une réponse sans proposition ne
            // doit pas offrir « Ouvrir dans Découvrir » (#3766).
            discoverCriteria={discoverCriteriaOfReply([
              ...(message.cards ?? []).map(card => card.action),
              ...(message.context?.pending_actions ?? []),
            ])}
            notConsulted={message.context?.not_consulted}
            onPrefill={onPrompt}
            onQualify={() => setDeepenRequest(count => count + 1)}
          />
        ) : null}
        {/* #2494 — la ou les pièces jointes ENVOYÉES avec cette question : sans
            cette puce, le fichier déposé dans le composeur disparaissait de
            l'écran dès l'envoi, comme s'il n'avait jamais servi.
            #2876 (#2433.4) — pour une IMAGE (`imageUrl` cette session, ou
            `imageObjectId` persisté), la puce redevient cliquable : elle
            rouvre la PREUVE visuelle, la source derrière ce que la réponse en
            a cité — y compris après un rechargement du fil, ou pour un
            collègue qui le relit. Pour tout le reste, le nom reste le seul
            accessible de la puce — aucun aperçu de ce type n'existe encore. */}
        {/* #3924 — un post de réseau pro COLLÉ dans le fil d'un compte : le geste qui
            le déclare comme signal du compte, au clic du commercial seulement. */}
        {isUser ? <PastedNetworkPostSignal accountId={accountId} content={message.content} /> : null}
        {isUser && message.attachments?.length ? (
          <div data-testid="message-attachments" className="flex flex-wrap items-center justify-end gap-1.5">
            {message.attachments.map(attachment =>
              attachment.imageUrl || attachment.imageObjectId ? (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => onOpenAttachment(attachment)}
                  className={cn(
                    'inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)] outline-none transition-colors hover:text-[var(--bellum-text-primary)] pointer-coarse:min-h-11',
                    CHAT_SURFACE.focusRing,
                  )}
                  aria-label={t('attach.preview.open', { name: attachment.name })}
                >
                  <Paperclip aria-hidden className="size-3 shrink-0" />
                  <span className="truncate">{attachment.name}</span>
                </button>
              ) : (
                <span
                  key={attachment.id}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]"
                >
                  <Paperclip aria-hidden className="size-3 shrink-0" />
                  <span className="truncate">{attachment.name}</span>
                </span>
              ),
            )}
          </div>
        ) : null}
        {/*
          Ce que le copilote PROPOSE de faire — rien n'est exécuté avant le clic.

          #1998 — DEUX formes, jamais les deux à la fois. Une CARTE est la forme
          gouvernée : état persisté côté serveur, gestes permis servis par lui,
          prévisualisation complète (#1930). Une `pending_action` est le JSON
          brut du modèle, sans état ni prévisualisation — l'API le laisse INTACT
          pour les onglets ouverts avant le déploiement, et c'est la seule raison
          qu'il a de coexister. Quand la carte est là, elle gagne : rendre les
          deux montrerait deux fois le même geste (loi 4 du tome 7).
        */}
        {!isUser && message.cards?.length ? (
          // #1950.4 / .7 / .12 / .13 — le résumé du plan NOMMÉ par Laura.
          <CopilotCards cards={message.cards} brief={message.context?.plan_brief ?? null} mailboxName={mailboxName} />
        ) : !isUser && message.context?.pending_actions?.length ? (
          // #1953.14 — une branche ABANDONNÉE (réessai, autre angle, message
          // modifié) rend ses propositions OBSOLÈTES : `obsolete` vient de
          // `message.supersededAt`, jamais réinitialisé — la carte ne redevient
          // pas confirmable après coup (`PendingActionCard`, filet après hooks).
          <PendingActions
            actions={message.context.pending_actions}
            mailboxName={mailboxName}
            obsolete={Boolean(message.supersededAt)}
            scopeOptions={memoryScopeOptions}
            scope={scope}
            onOpenScope={onOpenScope}
            // #1933.8 / #1903.20 — le fil qui a produit cette proposition, pour
            // que le lien qu'elle ouvre porte `?from=chat:<id>`.
            conversationId={conversationId}
            // #3950.1 — la salle de démonstration, lue ICI (où `useIsDemo()` a
            // un fournisseur de session réel) plutôt que dans la carte
            // générique elle-même (montée nue par `PendingActions.test.tsx`).
            isDemo={isDemo}
          />
        ) : null}
        {/* #1953.14 / #1953.22 — la branche abandonnée reste lisible, avec sa
            date : « on archive, on ne supprime pas ». */}
        {!isUser && message.supersededAt ? (
          <p className="mt-1 text-xs italic text-[var(--bellum-text-muted)]">
            {t('retry.superseded', {
              time: message.supersededAt.toLocaleTimeString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </p>
        ) : null}
        {/* #1953.11 / #1953.22 — L'AUTRE MOITIÉ DE LA PHRASE.
            La réponse remplacée dit qu'elle l'a été ; celle-ci dit de QUOI elle
            repart. Sans elle, un fil rechargé montrait deux échanges côte à
            côte dont rien ne disait que le second rejouait le premier — défaut
            mesuré en production le 16/09/2026. L'heure manque quand la réponse
            d'origine est hors de la tranche lue : on le dit, on ne l'invente
            pas. */}
        {!isUser && message.branchOf ? (
          <p className="mt-1 text-xs italic text-[var(--bellum-text-muted)]">
            {message.branchOf.previousTimestamp
              ? t(`retry.branchOf.${message.branchOf.kind}`, {
                  time: message.branchOf.previousTimestamp.toLocaleTimeString(
                    i18n.language === 'fr' ? 'fr-FR' : 'en-GB',
                    { hour: '2-digit', minute: '2-digit' },
                  ),
                })
              : t('retry.branchOf.unknownTime')}
          </p>
        ) : null}
        {/* La précision demandée, avec ses options cliquables. Cliquer ENVOIE
            l'option comme message. #2679 — ce qui la distingue d'une question
            posée en TEXTE n'est plus le clic (les deux se cliquent) : c'est que
            la CARTE arrête le tour et se dépense une fois par conversation. */}
        {!isUser && message.context?.clarification ? (
          <ClarificationReasoning
            ruledOut={message.context.clarification.ruled_out}
            assumptions={message.context.clarification.assumptions}
          />
        ) : null}
        {!isUser && message.context?.clarification?.options?.length ? (
          <ClarificationOptions options={message.context.clarification.options} onPick={onPickOption} />
        ) : null}
        {/* #2276 — une demande complexe devenue un job : sa fiche, son état, ce
            qu'il coûtera au plus. Rien quand le tour n'en porte pas. */}
        {!isUser && (message.lauraJob ?? message.context?.laura_job) ? (
          <LauraJobCard job={message.lauraJob ?? message.context?.laura_job} />
        ) : null}
        {/* #2679 — une précision posée en texte se clique aussi. Rien quand le
            modèle n'a rien émis de structuré : aucun bouton n'est deviné. */}
        {!isUser && message.context?.reply_options?.length ? (
          <ReplyOptions
            // R10B-FIX.4 — un libellé déjà offert par la carte de clarification (ou un groupe précédent) ne se redit pas.
            groups={dedupeReplyOptionGroups(
              message.context.reply_options,
              message.context.clarification?.options ?? [],
            )}
            onPick={onPickOption}
          />
        ) : null}
        {/* #3758 — une famille de réponse connue rendue en texte : dit, avec un geste « refaire en carte ». */}
        {!isUser && !message.supersededAt ? (
          <ReplyFamilyRetry family={message.context?.reply_family} content={message.content} onRetry={onPickOption} />
        ) : null}
        {/*
          Le pied de réponse : heure, fraîcheur de la source la plus ANCIENNE,
          « voir la source », « épingler », et l'alerte de données manquantes.

          Il remplace trois blocs empilés (transparence repliée, sauvegarde,
          heure) par une ligne. Ce qui change n'est pas le contenu mais ce qu'on
          VOIT sans cliquer : la fraîcheur était derrière un panneau replié, donc
          lue par personne. Le panneau reste, sous la ligne.
        */}
        {/* #2519 — une bulle d'ÉCHEC n'est pas une réponse : ni copier, ni
            écouter, ni noter, ni le menu « Réessayer » (qui reposait la question
            D'AVANT — la question échouée venait d'être retirée du fil). Elle
            porte UN geste, « Relancer », là où relancer peut aboutir. */}
        {!isUser && message.failedTurn ? (
          message.failedTurn.retryable ? (
            <div className="flex items-center px-1">
              <Button variant="outline" size="sm" icon={RotateCcw} onClick={onRelaunch} disabled={retryDisabled}>
                {t('messages.relaunch')}
              </Button>
            </div>
          ) : null
        ) : !isUser ? (
          <ReplyFooter
            context={message.context}
            text={replyPlainText(message.content)}
            source={message.content}
            aside={extractReplyAside(message.content, message.context?.reply_notes)}
            accountId={accountId}
            conversationId={conversationId}
            timestamp={message.timestamp ?? null}
            messageId={message.id ?? null}
            memoryUses={message.memoryUses ?? null}
            branchOf={message.branchOf ?? null}
            dataOrigin={message.dataOrigin ?? null}
            onRetry={onRetry}
            onEditLastMessage={onEditLastMessage}
            onAlternativeAngle={onAlternativeAngle}
            retryDisabled={retryDisabled}
            ownTurn={ownTurn}
            revealed={isLatestReply || touched}
            deepenRequest={deepenRequest}
          />
        ) : message.content.trim() || message.timestamp ? (
          // #2226 — « je n'arrive pas à copier coller mes propres requêtes » :
          // Laura avait « Copier » sous sa réponse (`ReplyFooter`), la question
          // n'avait rien. La sélection à la souris n'était pas bloquée (aucun
          // `select-none` mesuré), mais le bouton reste le geste fiable — au
          // clavier et sur mobile, où sélectionner dans une bulle est pénible.
          <div className="flex items-center justify-end gap-1">
            {message.content.trim() ? <CopyQuestion text={message.content} /> : null}
            {message.timestamp ? <MessageTime date={message.timestamp} align="right" /> : null}
          </div>
        ) : null}
        {/* #1939 (9.3) — « Réécouter » : seulement une question relue qui porte un enregistrement. */}
        {isUser && message.id && message.voiceObjectId ? (
          <div className="flex justify-end">
            <VoiceReplay messageId={message.id} />
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}

/**
 * #1994 — le plafond de la saisie qui grandit, en pixels parce que `scrollHeight`
 * en est un. Au-delà, le champ défile plutôt que de manger l'écran : le fil doit
 * rester visible pendant qu'on écrit. La même valeur que les deux autres champs
 * qui grandissent dans le produit — et elle est DOUBLÉE dans la classe
 * (`max-h-[220px]`) parce qu'un défilement borné par le seul style en ligne
 * disparaîtrait avec le JavaScript.
 */
const COMPOSER_MAX_HEIGHT_PX = 220

/**
 * #2112 — recette iPhone du 25/09 : sous 768px, la même limite (220px)
 * pouvait, à elle seule, manger tout ce qui reste de viewport visuel quand le
 * clavier est ouvert (souvent sous 300px, voir `Chat.keyboard-inset.test.tsx`)
 * — poussant la rangée d'outils (le bouton « + », joindre un fichier / prise
 * de photo, #2435.9) hors du cadre visible. Desktop garde 220px, inchangé.
 */
const COMPOSER_MAX_HEIGHT_MOBILE_PX = 120

function Composer({
  disabled,
  loading,
  queueable = false,
  suggestions,
  hasMessages,
  onPrompt,
  textareaRef,
  value,
  onChange,
  onSend,
  onStop,
  conversationId,
  accountId,
  attachedDocs,
  onAttach,
  onRemoveAttachment,
  onChangeAttachmentScope,
  onPreviewAttachment,
  connectorLabels,
  onRemoveConnector,
  onMentionMember,
  conversationKey,
  onVoiceTranscribed,
  lastAssistantText,
  lastTurnFailed,
}: {
  /** #2779 — le compte du fil : il rend « Ce compte uniquement » proposable. */
  accountId: string | null
  /** #1939.8 — le fil actif : le changer abandonne un enregistrement en cours. */
  conversationKey: string
  /** #1939.4 — la transcription d'un message dicté, à poser dans la saisie. */
  onVoiceTranscribed: (result: ChatVoiceTranscription) => void
  /** #2434.8/.9/.10/.12/.24/.30 — la dernière réponse RÉUSSIE de Laura, que le
   *  mode conversation vocale lit à voix haute après chaque envoi. `null` :
   *  fil vierge, ou pas encore de réponse — rien à lire. */
  lastAssistantText: string | null
  /** #2434.8/.9/.10/.12/.24/.30 — le dernier tour envoyé a échoué : rien de
   *  neuf à lire, la conversation le dit puis réécoute. */
  lastTurnFailed: boolean
  disabled: boolean
  loading: boolean
  /** #4066 — le champ reste actif pendant une réponse : « Envoyer » met en attente. */
  queueable?: boolean
  /** Les amorces de la ligne d'outils. VIDE = conversation vierge, où elles
   *  s'affichent au centre de l'état vide et ne doivent donc pas se répéter. */
  suggestions: ChatSuggestion[]
  /**
   * #3050 (26/09/2026, iPhone prod) — le fil porte-t-il déjà au moins un
   * message ? Sous 768 px, le FIL est le contenu (≥ 50 % de la hauteur utile) :
   * la ligne d'outils au complet (amorces, mode de contexte, catalogue,
   * connecteurs branchés) ne peut plus rester montée en permanence une fois la
   * conversation commencée. Rien n'est retiré (doctrine) : `ComposerToolsMenu`
   * (« + ») reprend le catalogue et les connecteurs — voir `hideToolsRowOnMobile`
   * plus bas. Bureau inchangé à toutes les tailles de fil.
   */
  hasMessages: boolean
  onPrompt: (prompt: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (value: string) => void
  /** #2434.8/.9/.10/.12/.24/.30 — envoie le texte donné (mode conversation
   *  vocale : jamais posé dans la saisie), ou le contenu de la saisie quand
   *  il est omis (le geste ORDINAIRE, #1939.10). */
  onSend: (text?: string) => void
  /** #1953.1 — interrompt le tour DIFFUSÉ en cours (`loading` vrai). */
  onStop: () => void
  /** #1954.7 — le fil auquel un document « pour cette conversation » se rattache. */
  conversationId: string | null
  attachedDocs: AttachedDoc[]
  onAttach: (doc: AttachedDoc) => void
  onRemoveAttachment: (id: string) => void
  /** #1954.22 — change la portée d'une pièce déjà attachée. */
  onChangeAttachmentScope: (id: string, scope: RagDocumentScope) => void
  /** #1954.19 — ouvre l'aperçu d'une pièce déjà attachée. */
  onPreviewAttachment: (id: string) => void
  /** #2668.1 — les connecteurs cliqués pour la question en cours, à part du texte. */
  connectorLabels: string[]
  onRemoveConnector: (index: number) => void
  /** #2428.12 — le collègue choisi au clic, id compris — jamais juste un nom. */
  onMentionMember: (member: MentionedMember) => void
}) {
  const { t } = useTranslation('chat')
  const preferences = useReadPreferences()
  // #2435.5 — le clavier virtuel ne doit jamais recouvrir la saisie : la
  // marge basse du composer grandit de la hauteur qu'il occupe, mesurée sur
  // le viewport VISUEL (voir `useVisualViewportInset`). Vaut 0 sans clavier
  // ouvert, donc aucune marge ajoutée la plupart du temps.
  const keyboardInset = useVisualViewportInset()
  // #2112 — plafond de croissance de la saisie, plus bas sous 768px : voir la
  // note sur `COMPOSER_MAX_HEIGHT_MOBILE_PX`.
  const isMobile = useIsMobile()
  const composerMaxHeight = isMobile ? COMPOSER_MAX_HEIGHT_MOBILE_PX : COMPOSER_MAX_HEIGHT_PX
  // #3050 — voir la note de `hasMessages` ci-dessus : la ligne d'outils au
  // complet se pose derrière le « + » une fois le fil commencé, sous 768 px
  // seulement. Bureau (`!isMobile`) inchangé quel que soit l'état du fil.
  const hideToolsRowOnMobile = isMobile && hasMessages
  // Théo B l1-laura.R4 — champ vide, rien à envoyer : le micro prend la place d'« Envoyer » (si la dictée est possible).
  // Un champ vide SANS dictée possible garde son bouton (jamais un composeur sans issue) ; le lanceur (`open`) aussi.
  const voiceAvailable = useVoiceAvailability(useIsDemo())
  // #3774.2.1 — « Voir tout » (juste au bord des amorces) et le déclencheur
  // PROPRE de `CommandDrawerButton` (« Que puis-je demander ? », dans la
  // rangée de réglages un peu plus loin) ouvrent le MÊME tiroir
  // (`commandsOpen`). Tant que « Voir tout » est visible, lui seul reste
  // l'entrée directe : le second déclencheur se tait (`hideTrigger`), sans
  // jamais démonter son `Dialog` — voir `onOpenCommands` plus bas, qui doit
  // encore pouvoir l'ouvrir depuis le « + » sous 768 px.
  const seeAllVisible = suggestions.length > 0 && !hideToolsRowOnMobile
  // #4594 — la rangée ne tranche plus une amorce en plein mot : on en montre
  // MOINS, entières, d'après la largeur mesurée. Les autres restent derrière « Voir tout ».
  const { containerRef: chipRowRef, visibleCount: visibleChipCount } = useFittedChipCount(
    suggestions.length,
    seeAllVisible,
  )
  // #2450.1 / #2448.1 (reste, épopée #2882) — MÊME MAGASIN que `ResearchModeSelector`
  // (GA-26) : le sous-menu du « + » lit/écrit directement le mode du fil quand ce
  // sélecteur se tait sous 768 px, plutôt que de dupliquer l'état.
  const researchModes = useResearchModeStore(s => s.modes)
  const toolSourcesExcluded = useToolSourcesStore(s => s.excluded)
  const toggleToolSource = useToolSourcesStore(s => s.toggle)
  const setResearchMode = useResearchModeStore(s => s.setMode)
  /**
   * #1954.13 / #1954.14 / #1954.17 / #1954.18 — les pièces EN COURS de dépôt,
   * ou dont le dépôt a ÉCHOUÉ : elles vivent ici, séparées de `attachedDocs`
   * (le parent, `Chat`), parce qu'elles ne sont pas encore — ou jamais —
   * ENVOYABLES avec le message. Même règle de cloisonnement par fil que
   * `attachedDocs` juste en dessous : changer de fil retire les pièces « pour
   * cette conversation » qui n'ont pas fini leur dépôt.
   */
  const [pendingUploads, setPendingUploads] = useState<PendingAttachment[]>([])
  useEffect(() => {
    setPendingUploads(previous => {
      const kept = previous.filter(
        pending => pending.scope !== 'conversation' || pending.conversationId === conversationId,
      )
      return kept.length === previous.length ? previous : kept
    })
  }, [conversationId])
  const dismissPendingUpload = (localId: string) => {
    setPendingUploads(previous => previous.filter(pending => pending.localId !== localId))
  }
  /**
   * #2435.9 — le pont vers `retryUpload`, défini par `ComposerToolsMenu`
   * (un frère, pas un parent) : voir la note sur ce prop côté menu.
   */
  const retryUploadRef = useRef<(localId: string) => void>(() => {})
  /** #3849.1 — même pont, vers `attachFiles` (`ComposerToolsMenu`) : le geste de
   *  glisser-déposer, lui, vit sur le CADRE du composeur, ci-dessous. */
  const attachFilesRef = useRef<(files: File[], scope: RagDocumentScope) => void>(() => {})
  /**
   * #3849.1 — GLISSER UN FICHIER DANS LE COMPOSEUR, « COMME DANS CHATGPT OU
   * CLAUDE » (demande bêta du 08/10) : `dragCounter` compte les
   * `dragenter`/`dragleave` plutôt qu'un booléen posé par `dragenter` seul —
   * le composeur a des ENFANTS (textarea, rangée d'outils), et le navigateur
   * émet un `dragleave` en passant d'un enfant à un autre ; un booléen simple
   * ferait disparaître le repère au milieu du survol. `types.includes('Files')`
   * exclut un glissé de TEXTE (une sélection, un lien), qui n'est pas un
   * fichier à attacher.
   */
  const dragCounter = useRef(0)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const isFileDrag = (event: { dataTransfer: DataTransfer | null }) =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files')
  const onComposerDragEnter = (event: DragEvent<HTMLFormElement>) => {
    if (disabled || !isFileDrag(event)) return
    event.preventDefault()
    dragCounter.current += 1
    setIsDraggingFile(true)
  }
  const onComposerDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (disabled || !isFileDrag(event)) return
    event.preventDefault()
  }
  const onComposerDragLeave = () => {
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (dragCounter.current === 0) setIsDraggingFile(false)
  }
  const onComposerDrop = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault()
    dragCounter.current = 0
    setIsDraggingFile(false)
    if (disabled) return
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length === 0) return
    // #1954.7 — même portée par défaut que le sélecteur natif : « pour cette
    // conversation », le seul fil que ce geste peut viser sans détour par un menu.
    attachFilesRef.current(files, 'conversation')
  }
  /**
   * #2522 — « Voir tout » ouvrait `/chat/commandes`, une route qui REDIRIGE
   * aussitôt vers `/chat` (#1321) : le clic ramenait l'utilisateur là où il
   * était déjà, sans rien montrer. Le tiroir des commandes existe déjà juste à
   * côté (`CommandDrawerButton`) — on lève son état ici pour que « Voir tout »
   * ouvre CE tiroir, plutôt qu'un second catalogue (loi 4 du tome 7).
   */
  const [commandsOpen, setCommandsOpen] = useState(false)
  // #3773 — « Tous les exemples » (accueil) demande l'ouverture de CE tiroir.
  useEffect(() => {
    const open = () => setCommandsOpen(true)
    window.addEventListener(OPEN_COMMANDS_EVENT, open)
    return () => window.removeEventListener(OPEN_COMMANDS_EVENT, open)
  }, [])
  /*
    Le lanceur vit ICI depuis le 27/08/2026, et plus dans une bande au-dessus
    du fil. Il portait SON champ de saisie : l'écran en avait donc deux, à
    550 px l'un de l'autre, et déplier un chip poussait la conversation hors de
    vue. Le champ ci-dessous sert désormais aux DEUX voies ; ce qui change
    quand un run est armé, c'est ce que le champ dit de lui-même.

    `null` = cette surface n'a pas de lanceur (aucun fournisseur monté), et le
    composer se rend exactement comme avant. C'est la voie qui ne peut rien
    coûter, donc le bon repli.
  */
  const launcher = useLauncherArm()
  // Recette Z3 04/10 — Entrée a navigué vers /projects/needs?q= : un run armé ne suit pas le fil.
  useDisarmOnThreadChange(launcher, conversationId)
  const { tools: connectedTools, unconnectedFamilies } = useConnectedCapabilities()
  // #2810 — court-circuite `resolveEntity` (zéro appel réseau) : la salle de
  // démonstration ne parle jamais au modèle.
  const isDemo = useIsDemo()
  // #3648 — une QUESTION part chez Laura : ni recherche, ni panneau « 1 crédit si trouvé ».
  const armedRunRaw = launcher?.armedRun ?? null
  const armedRun = armedRunRaw && !isQuestionForLaura(value) ? armedRunRaw : null
  const submitMode = composerSubmitMode(armedRun)
  // #2668.1 — un connecteur SEUL (sans texte tapé) doit pouvoir partir : c'est
  // le sens même de la pastille (« ta question » peut être juste « regarde
  // mon CRM »). Jamais pour un run ARMÉ : la recherche y attend un texte, un
  // connecteur cliqué par erreur là ne doit pas ouvrir un compte vide — ce
  // champ n'en reçoit d'ailleurs plus jamais (`connectorLabels` est à part).
  const canSubmit = composerCanSubmit(armedRun, value) || (!armedRun && connectorLabels.length > 0)
  const micInsteadOfSend = voiceAvailable && !canSubmit && !armedRun && value.trim() === ''
  // #2428.19 — la raison, VISIBLE, quand ce même bouton est désactivé — même
  // garde `connectorLabels.length > 0` que `canSubmit` ci-dessus, pour que les
  // deux ne divergent jamais.
  const disabledReasonKey = composerDisabledReasonKey(armedRun, value, connectorLabels.length > 0)
  /* Un run armé part chez SON écran ; sans run, la question part chez Laura.
     La décision est prise une fois, ici, et `handleComposerKeyDown` la reçoit —
     Entrée et le bouton ne peuvent donc pas diverger. */
  const submit = () => {
    if (!canSubmit) return
    // #2668.1 — un connecteur ne touche plus jamais `value` : plus besoin de
    // retirer un marqueur avant d'ouvrir le run (`launcherIntent` →
    // `search[run.queryParam]`), la valeur brute est déjà propre.
    if (armedRun && launcher) {
      // #2810 — une PHRASE tapée sur le run qui lit `company` (« Analyser une
      // entreprise ») passe par le serveur pour en isoler le nom AVANT
      // d'ouvrir `/search` ; `needsEntityExtraction` est synchrone et gratuite
      // (un mot seul, ou tout autre run, n'y passe jamais — repli synchrone
      // inchangé). `resolveEntity` retombe elle-même sur `value` telle quelle
      // sur toute panne ou absence de proposition.
      if (needsEntityExtraction(armedRun, value)) {
        const currentLauncher = launcher
        void resolveEntity({ run: armedRun, text: value, isDemo }).then(resolved => currentLauncher.go(resolved))
      } else {
        launcher.go(value)
      }
    } else {
      onSend()
      // #3648 — un chip resté armé ne suit pas la question suivante.
      if (armedRunRaw) launcher?.disarm()
    }
  }
  /*
    #1994 — « mets tout sur une ligne, qu'on gagne de la place en hauteur ».

    La saisie réservait DEUX lignes en permanence (`rows={2}` + `min-h-12`), pour
    un champ où la question tient presque toujours sur une : 16 px de l'écran
    perdus à chaque tour, sur la zone qui ne défile pas. Elle en réserve une, et
    grandit avec ce qu'on tape — donc rien n'est perdu quand le texte est long.

    L'effet ne dépend que de `value` : mettre une PROP fonction en dépendance
    fait tourner un effet une fois par seconde sans fin, et le seul symptôme
    visible en est un écran qui « traîne ».

    ⚠️ `height` repart à la hauteur d'UNE ligne avant d'être relue : sans cette
    remise à zéro, `scrollHeight` ne redescend jamais et le champ ne rétrécit
    plus quand on efface. En jsdom `scrollHeight` rend 0 — le `min-h-10` de la
    classe tient alors le plancher, une hauteur en ligne plus petite ne l'écrase
    pas.
  */
  useEnterFallback(textareaRef, submit, preferences.sendCommentOn)
  const sendHintId = useId()
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, composerMaxHeight)}px`
  }, [value, textareaRef, composerMaxHeight])
  return (
    <form
      // #1906.8 / #1906.9 — plus de bande (trait + fond) autour de la saisie : un seul cadre, en relief.
      // #3050 — `data-testid` : la preuve chiffrée mesure CETTE boîte, pas une classe.
      data-testid="chat-composer"
      className={cn(CHAT_SURFACE.composerBand, 'relative')}
      // #2435.5 — la marge basse pousse le composer AU-DESSUS du clavier
      // ouvert. `undefined` (jamais `0`) quand rien n'est ouvert : pas de
      // style inline qui traînerait sans raison dans le DOM.
      style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
      // #3849.1 — glisser un fichier ici l'attache « pour cette conversation »,
      // comme ChatGPT/Claude. Voir la note sur `dragCounter` plus haut.
      onDragEnter={onComposerDragEnter}
      onDragOver={onComposerDragOver}
      onDragLeave={onComposerDragLeave}
      onDrop={onComposerDrop}
    >
      {/* #3849.1 — le repère de dépôt : recouvre le composeur entier tant que le
          pointeur porte un fichier, jamais un second contrôle (il n'AJOUTE rien,
          il ne fait QUE nommer un geste déjà possible par le sélecteur natif). */}
      {isDraggingFile && (
        <div
          data-testid="composer-drop-overlay"
          aria-hidden
          className="pointer-events-none absolute inset-1 z-widget flex items-center justify-center rounded-xl border border-dashed border-[var(--bellum-primary-500)] bg-[var(--bellum-surface-1)]"
        >
          <Text size="sm" weight="medium" color="text-[var(--bellum-text-accent)]">
            {t('attach.dropHint')}
          </Text>
        </div>
      )}
      {/* `ml-14` au téléphone : le bouton de signalement est ancré en bas à
          gauche, au-dessus de la barre d'onglets — c'est-à-dire exactement ici.
          Il s'efface au défilement, mais cette zone-là ne défile pas : elle est
          fixe. On lui laisse sa gouttière plutôt que de le retirer ou de le
          laisser recouvrir la saisie. */}
      {/*
        PLEINE LARGEUR (demande Louis, 27/08/2026).

        La boîte était bornée à `max-w-3xl` et centrée — la moitié droite de
        l'écran restait vide sur un portable, et le lanceur qui vit maintenant
        dessous s'y serait replié sur trois lignes.

        Ce n'est pas une entorse à la largeur de lecture (D81) : cette règle
        borne le TEXTE QU'ON LIT à 70 caractères, et une zone de saisie n'est
        pas de la prose — on n'y relit pas des paragraphes, on y tape une
        question et on y choisit un run. Les MESSAGES du fil, eux, gardent leur
        borne : c'est là que se lit le texte long.
      */}
      {/* #1907.10 — la boîte de saisie porte le relief doux (`CHAT_SURFACE.composer`). */}
      <div
        className={cn(
          // #3351 (LAU-UI-301) — Louis, 29/09/2026 : « plus d'air, plus
          // d'espacement ». `p-2` (8px) serrait le contenu contre le cadre ;
          // `p-2.5` (10px) sans changer la logique ni les gabarits internes.
          'p-2.5',
          // #3774.1.1 — UNE GRILLE COMMUNE : la saisie part du même bord et partage la même colonne
          // que l'accueil et le fil (`CHAT_SURFACE.column`, calée à gauche, `w-full` : elle suit la
          // largeur réellement disponible, panneau de détail ouvert compris). Elle était pleine
          // largeur (27/08) pendant que le fil était borné — deux compositions, pas une.
          CHAT_SURFACE.column,
          // GA-26 — le trou du bouton de signalement et l'anneau de focus viennent tous deux de
          // `chat-surface.ts`. L'anneau y a gagné sa couleur : le `color-mix` à 35 % de
          // `primary-500` faisait 2,68:1 sur le fond sombre, sous le 3:1 de WCAG 1.4.11.
          CHAT_SURFACE.composerFeedbackGutter,
          CHAT_SURFACE.focusWithinRing,
          CHAT_SURFACE.composer,
        )}
      >
        {/* Ce que le copilote va RECEVOIR. Sans cette ligne, l'utilisateur dépose
            un fichier, voit passer un message de confirmation, puis n'a plus
            aucune trace de ce qui est joint à son message — c'est la moitié de
            ce qui faisait croire que le dépôt ne servait à rien. */}
        {pendingUploads.length > 0 || attachedDocs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 px-2 pt-1.5">
            {/* #1954.13 / #1954.14 / #1954.17 / #1954.18 — une pièce EN COURS ou
                en ÉCHEC de dépôt reste dans SA carte, à l'état nommé, plutôt que
                de ne vivre que dans un toast qui disparaît. */}
            {pendingUploads.map(pending => (
              <span
                key={pending.localId}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]"
              >
                <Paperclip className="size-3 shrink-0" />
                <span className="truncate">{pending.name}</span>
                <span aria-hidden className="shrink-0 text-[var(--bellum-text-muted)]">
                  ·
                </span>
                <span
                  className={cn(
                    'shrink-0',
                    pending.status === 'refused' || pending.status === 'error'
                      ? 'text-[var(--danger-soft-text)]'
                      : 'text-[var(--bellum-text-muted)]',
                  )}
                >
                  {t(ATTACH_STATUS_LABEL_KEY[pending.status])}
                </span>
                {/* #2435.9 — un ÉCHEC TECHNIQUE (réseau, 5xx) se rejoue SANS
                    redemander le fichier — pas un REFUS de contenu (422), que
                    réessayer le même fichier ne corrigerait pas. Version
                    minimale d'« upload reprenable » tranchée par Louis
                    (22/09 soir, decisions-louis-22-09-soir.md §1). */}
                {pending.status === 'error' ? (
                  <button
                    type="button"
                    onClick={() => retryUploadRef.current(pending.localId)}
                    aria-label={t('attach.status.retry', { name: pending.name })}
                    className={cn(
                      'inline-flex shrink-0 items-center justify-center rounded-sm text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] min-h-11 min-w-11',
                      CHAT_SURFACE.focusRing,
                    )}
                  >
                    <RotateCcw className="size-3" />
                  </button>
                ) : null}
                {/* Un dépôt encore EN COURS n'a rien à retirer — seul un dépôt
                    qui a échoué (rien en base) peut être écarté sans conséquence. */}
                {pending.status === 'refused' || pending.status === 'error' ? (
                  <button
                    type="button"
                    onClick={() => dismissPendingUpload(pending.localId)}
                    aria-label={t('attach.status.dismiss', { name: pending.name })}
                    className={cn(
                      'inline-flex shrink-0 items-center justify-center rounded-sm text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] min-h-11 min-w-11',
                      CHAT_SURFACE.focusRing,
                    )}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </span>
            ))}
            {attachedDocs.map(doc => {
              // #2431.10 — un type métier PROBABLE, par le NOM seul (jamais le
              // contenu) : confiance toujours « à vérifier », et AUCUN badge
              // sur un nom qui ne porte aucun indice (jamais une catégorie
              // devinée — doctrine « on n'affiche pas ce qu'on n'a pas »).
              const classification = classifyDocumentByName(doc.name)
              return (
                <span
                  key={doc.id}
                  // #1954.24 — connaître la durée de conservation : le texte déjà
                  // dit AVANT l'envoi (menu « + », #1954.5/#1954.6) reste lisible
                  // une fois la pièce attachée, au survol/focus de sa carte.
                  title={t(
                    doc.scope === 'workspace' ? 'composer.attachToBaseHint' : 'composer.attachForConversationHint',
                  )}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]"
                >
                  {/* #1954.19 — un clic sur la pièce ouvre un aperçu de son
                    contenu (Louis, 12/09/2026). Bouton À PART des deux autres
                    (portée, retirer) : trois gestes, trois cibles. */}
                  <button
                    type="button"
                    onClick={() => onPreviewAttachment(doc.id)}
                    aria-label={t('attach.preview.open', { name: doc.name })}
                    className={cn(
                      // #3356.2 — l'aperçu répondait au clavier mais pas au survol, seul de la barre.
                      'inline-flex min-w-0 shrink items-center gap-1 rounded-sm transition-colors hover:text-[var(--bellum-text-primary)] min-h-11',
                      CHAT_SURFACE.focusRing,
                    )}
                  >
                    <Paperclip className="size-3 shrink-0" />
                    <span className="truncate">{doc.name}</span>
                  </button>
                  {/* #2428.9 — type et taille, seulement quand le fichier les
                    porte réellement (jamais pour une entrée d'archive .zip
                    dépliée côté serveur, qui n'a pas de `File` local). */}
                  {doc.size !== undefined ? (
                    <>
                      <span aria-hidden className="shrink-0 text-[var(--bellum-text-muted)]">
                        ·
                      </span>
                      <span className="shrink-0 text-[var(--bellum-text-muted)]">
                        {[fileExtensionLabel(doc.name, doc.type), formatBytes(doc.size)].filter(Boolean).join(' · ')}
                      </span>
                    </>
                  ) : null}
                  {/* #2431.10 — le type probable, seulement quand le nom porte un
                    indice reconnu : jamais un « type indéterminé » forcé sur
                    chaque pièce (même règle que type/taille ci-dessus). */}
                  {classification ? (
                    <>
                      <span aria-hidden className="shrink-0 text-[var(--bellum-text-muted)]">
                        ·
                      </span>
                      <span className="shrink-0 text-[var(--bellum-text-muted)]">
                        {t(DOCUMENT_CLASSIFICATION_LABEL_KEY[classification.type])}
                      </span>
                      <span aria-hidden className="shrink-0 text-[var(--bellum-text-muted)]">
                        ·
                      </span>
                      <span className="shrink-0 italic text-[var(--bellum-text-muted)]">
                        {t('attach.classification.toVerify')}
                      </span>
                    </>
                  ) : null}
                  {/* #1954.4 / #1954.22 puis #2779 — la pièce dit OÙ elle sert, et un clic
                    ouvre les CINQ portées du contrat (`attachScopesFor`, la même liste
                    qu'à l'ajout). Basculer vers « ce fil » est désactivé sans fil actif
                    (rien à rattacher), vers « ce compte » sans compte sur le fil. */}
                  <span aria-hidden className="shrink-0 text-[var(--bellum-text-muted)]">
                    ·
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        // #2148.16 — une pièce ÉPHÉMÈRE (cas a) n'a aucune ligne à
                        // reclasser : rien n'a été écrit, il n'y a rien à déplacer.
                        disabled={doc.ephemeral}
                        aria-label={t('attach.scope.changeAria', { name: doc.name })}
                        className={cn(
                          'shrink-0 rounded-sm text-[var(--bellum-text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--bellum-text-primary)] disabled:pointer-events-none disabled:no-underline disabled:opacity-60 min-h-11',
                          CHAT_SURFACE.focusRing,
                        )}
                      >
                        {t(ATTACH_SCOPE_LABEL_KEY[doc.scope])}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {attachScopesFor(accountId)
                        .filter(scope => scope !== doc.scope)
                        .map(scope => (
                          <DropdownMenuItem
                            key={scope}
                            disabled={scope === 'conversation' && !conversationId}
                            onSelect={() => onChangeAttachmentScope(doc.id, scope)}
                            className="min-h-11"
                          >
                            {t(CHANGE_SCOPE_ITEM_LABEL_KEY[scope])}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {/* #1954.15 / #1954.16 / #1954.30 — « Prêt » et « Partiellement
                    lisible » ne sont JAMAIS le même badge : un succès partiel ne
                    se présente pas comme un succès plein. */}
                  <span aria-hidden className="shrink-0 text-[var(--bellum-text-muted)]">
                    ·
                  </span>
                  <span
                    className={cn(
                      'shrink-0',
                      doc.status === 'partial' ? 'text-[var(--warning-soft-text)]' : 'text-[var(--bellum-text-muted)]',
                    )}
                  >
                    {t(ATTACH_STATUS_LABEL_KEY[doc.status])}
                  </span>
                  {/* #1954.20 — « retirer » SUPPRIME le document ingéré, et le nom du bouton le dit. */}
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(doc.id)}
                    aria-label={t(doc.scope === 'workspace' ? 'attach.removeFromBase' : 'attach.remove', {
                      name: doc.name,
                    })}
                    className={cn(
                      'inline-flex shrink-0 items-center justify-center rounded-sm text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] min-h-11 min-w-11',
                      CHAT_SURFACE.focusRing,
                    )}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )
            })}
          </div>
        ) : null}
        {/* #2254 point 4 (défaut mesuré en prod le 17/09) — un connecteur posé
            se voyait comme du texte fondu dans la saisie. Une rangée de
            pastilles AU-DESSUS du champ.
            #2668.1 — Louis, 20/09/2026 : « la pastille au dessus suffit » —
            même le bloc à marqueurs de #2254 écrivait encore le libellé,
            lisible, DANS le champ. `connectorLabels` est désormais un état à
            part (`Chat`, jamais une lecture de `value`) : cette rangée est la
            SEULE trace visible du connecteur avant l'envoi. */}
        {connectorLabels.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 px-2 pt-1.5">
            {connectorLabels.map((label, index) => (
              <span
                // L'ordre EST l'identité (comme `connector-${index}` dans la bulle
                // envoyée, plus haut) : deux pastilles du même connecteur se
                // distinguent par leur position, jamais par leur nom.
                key={`connector-live-${index}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]"
              >
                <Plug className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
                {/* GA-32 — un bouton qui ne montre qu'une icône porte un nom. */}
                <button
                  type="button"
                  onClick={() => {
                    onRemoveConnector(index)
                    textareaRef.current?.focus()
                  }}
                  aria-label={t('composer.connectorRemove', { name: label })}
                  className={cn(
                    'inline-flex shrink-0 items-center justify-center rounded-sm text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] min-h-11 min-w-11',
                    CHAT_SURFACE.focusRing,
                  )}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {/* #5048 — « Tes outils avec Laura » au-dessus de la saisie (revient sur #3708, Louis 31/10/2026).
            Visibles avant le premier message partout, et fil commencé sur grand écran (aucun geste perdu) ;
            sous 768 px une fois le fil commencé, le « + » les reprend (`ComposerToolsChecklist`). */}
        {hideToolsRowOnMobile ? null : (
          <ComposerToolChips
            tools={connectedTools}
            excludedProviders={excludedProvidersFor(toolSourcesExcluded, conversationId)}
            onToggle={provider => conversationId && toggleToolSource(conversationId, provider)}
            disabled={disabled || !conversationId}
          />
        )}
        <textarea
          {...guideAnchorProps('laura.saisie')}
          ref={textareaRef}
          aria-label={t('composer.aria')}
          // #3399.6 — le raccourci d'envoi se lit à l'écran ET se déclare au lecteur d'écran.
          aria-describedby={sendHintId}
          aria-keyshortcuts={preferences.sendCommentOn === 'mod-enter' ? 'Control+Enter Meta+Enter' : 'Enter'}
          value={value}
          disabled={disabled && !queueable}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            handleComposerKeyDown(event, submit, preferences.sendCommentOn)
          }}
          placeholder={t(composerPlaceholderKey(armedRun, launcher?.typeKey ?? null))}
          // #1994 — une ligne réservée au lieu de deux, et la hauteur suit le texte (effet ci-dessus).
          // `min-h-10` (40 px) reste au-dessus des 24 px d'une ligne nue : le champ ne se referme
          // jamais sur lui-même, et il garde sa cible au doigt.
          rows={1}
          className={cn(
            // #2112 — plafond plus bas sous 768px (voir `COMPOSER_MAX_HEIGHT_MOBILE_PX`) :
            // les deux classes existent en toutes lettres dans la source pour que
            // Tailwind les génère toutes les deux.
            isMobile ? 'max-h-[120px]' : 'max-h-[220px]',
            'min-h-10 w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-sm text-[var(--bellum-text-primary)] outline-none placeholder:text-[var(--bellum-text-muted)] disabled:cursor-not-allowed',
          )}
        />
        <ComposerSendHint sendOn={preferences.sendCommentOn} id={sendHintId} />
        {/* #3351.3 (LAU-UI-301, recette prod 30/09) — Louis : « blocs mieux
            délimités ». Le champ et la rangée d'outils/amorces partageaient le
            même cadre SANS séparation : un seul bloc visuel pour deux gestes
            différents (écrire, puis agir). Un simple filet — le même trait 1px
            que tout le reste de la surface (GA-328), jamais une seconde
            couleur ni un relief — les distingue sans changer la logique. */}
        {/* #5179 — conteneur de requête : la rangée se REPLIE selon la largeur de la carte du composeur
            (colonne + panneaux), pas celle de l'écran — à 1512 px la carte ne fait que ~954 px. */}
        <div className="min-w-0 [container-type:inline-size]">
          <div
            data-testid="composer-toolbar-row"
            className={cn(
              // #3861 (recette prod 09/10) — `flex-wrap` reste nécessaire SOUS 768 px
              // (GA-28) : réglages et « Envoyer » y ont légitimement besoin de deux
              // lignes. Au-dessus, `md:flex-nowrap` : le mode Approfondi (libellé plus
              // long qu'Auto/Rapide/Vérifié) élargissait cette rangée au point de
              // rejeter « Envoyer » sous les réglages, en plein desktop — #3709 avait
              // réglé l'intérieur de `chat-composer-settings-row`, pas l'ensemble.
              // recette MZ 10/10 (#3861) — `min-w-0 max-w-full` : en nowrap, la rangée ne dépasse pas le cadre.
              'flex min-w-0 max-w-full flex-wrap items-center justify-between gap-2 pt-1.5 md:flex-nowrap [@container(max-width:70rem)]:!flex-wrap',
              CHAT_SURFACE.composerToolbarDivider,
            )}
          >
            {/* Les amorces, sur la MÊME ligne que le « + » et les commandes
              (Louis, 02/09/2026 ; la portée a quitté cette ligne le 13/09). Une seule ligne, qui DÉFILE : le nombre
              d'amorces dépend du compte ouvert et de ce qui est branché, donc
              aucune largeur ne se devine — et l'enroulement qu'elles avaient
              sur grand écran est exactement ce qui prenait la deuxième rangée.

              #1944.17 (#3012) — UN SEUL ordre DOM, qui suit le visuel MOBILE
              (amorces puis outils) : `order-first`/`md:order-none` faisaient
              diverger la tabulation et le lecteur d'écran de l'ordre affiché
              sous 768 px. Le mobile fait foi (GA-28/29/30), donc le bureau
              adopte le même ordre (changement assumé). `w-full` garde leur
              ligne aux amorces là où la place manque sur téléphone ;
              `md:w-auto md:flex-1` les rejoint aux outils là où elle existe. */}
            {/* #3050 — sous 768 px, cette rangée entière (amorces + « voir tout ») se
              tait une fois le fil commencé : `LauncherExamples` reste atteignable
              par le lanceur ARMÉ d'un run choisi avant, et le catalogue complet
              par la nouvelle entrée du « + » (`ComposerToolsMenu`, ci-dessous). */}
            {seeAllVisible ? (
              // #3321 — plancher de largeur (`md:min-w-[17rem]` ici + `md:min-w-[11rem]` sur la rangée interne, #5042 R2 01/11 : « voir tout » prélève sa part, la rangée interne doit garder la place de la pastille « Analyser une entreprise ») : sans lui, `flex-1` (base 0)
              // laissait le groupe d'outils voisin prendre toute la rangée et écrasait les
              // amorces (texte coupé, illisible). Sous ce plancher la rangée s'ENROULE.
              <div className="flex w-full min-w-0 items-center gap-1.5 md:w-auto md:min-w-[17rem] md:flex-1">
                <div
                  ref={chipRowRef}
                  className="flex min-w-0 flex-1 md:min-w-[11rem] flex-nowrap items-center gap-1.5 overflow-hidden"
                >
                  <LauncherExamples disabled={disabled} />
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.label}
                      type="button"
                      data-chip=""
                      hidden={index >= visibleChipCount}
                      onClick={() => {
                        // #1946.2 — même lecture qu'à l'accueil : le rang est la
                        // position RENDUE parmi les amorces, 1-based. Le bouton
                        // des exemples qui les précède dans la même rangée n'en
                        // est pas une, donc il ne décale pas le rang.
                        trackSuggestionClicked(CHAT_SCREEN, index + 1)
                        onPrompt(suggestion.prompt)
                      }}
                      // La requête complète en `title` : la pastille reste courte,
                      // mais on peut lire ce qui sera réellement envoyé.
                      title={suggestion.prompt}
                      className={cn(
                        'shrink-0 whitespace-nowrap rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-1.5 text-xs text-[var(--bellum-text-secondary)] transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] min-h-11',
                        CHAT_SURFACE.focusRing,
                      )}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
                {/* Au BORD, hors du défilement : un « voir tout » qu'il faut
                  atteindre en faisant défiler ne sert à rien. Il ouvre le tiroir
                  de la bibliothèque de commandes, qui existe déjà et se cherche
                  — on n'en recopie pas une deuxième ici (loi 4 du tome 7).
                  #2522 — un `<Link to="/chat/commandes">` naviguait vers une
                  route qui REDIRIGE aussitôt vers `/chat` (#1321) : le clic ne
                  montrait donc jamais rien. Un bouton qui ouvre le MÊME tiroir
                  que `CommandDrawerButton`, pas un lien qui navigue. */}
                <button
                  type="button"
                  onClick={() => setCommandsOpen(true)}
                  // GA-30 — `px-2 py-1 text-xs` mesurait ≈ 24 px de haut : au doigt, la cible était
                  // deux fois trop petite, sur la ligne la plus dense de l'écran. Les pastilles
                  // voisines portaient déjà leur plancher, ce lien non — il était le seul.
                  className={cn(
                    'inline-flex shrink-0 items-center rounded-full px-2 py-1 text-xs font-medium text-[var(--bellum-text-accent)] transition-colors hover:bg-[var(--bellum-surface-2)] min-h-11',
                    CHAT_SURFACE.focusRing,
                  )}
                >
                  {t('suggestions.seeAll')}
                </button>
              </div>
            ) : null}
            {/* #3709 — `flex-nowrap` : changer de contexte, de profondeur ou d'outils ne
              doit JAMAIS faire passer un bouton à la ligne (libellé plus long →
              rangée plus haute → saisie et conversation déplacées). Les trois
              réglages restent dans un ordre constant : contexte, profondeur, outils. */}
            <div
              className="flex min-w-0 shrink-0 flex-nowrap items-center gap-1"
              data-testid="chat-composer-settings-row"
            >
              {/* Décision de Louis du 13/09/2026 (batch 13) : la PORTÉE du fil ne
                s'affiche plus ici. Elle était rendue deux fois, même bouton et
                même libellé, sous le titre du fil et au bord de la saisie — « rien
                n'apparaît deux fois » (loi 4 du tome 7). Elle vit dans l'en-tête
                (`ChatHeader`), d'où elle se change. */}
              {/* #1791.1 — un seul « + » pour joindre un fichier, mentionner un
                collègue, ou désigner un connecteur : les deux premiers gestes
                vivaient chacun dans leur propre bouton sur cette ligne. */}
              <ComposerToolsMenu
                disabled={disabled}
                conversationId={conversationId}
                accountId={accountId}
                onAttached={onAttach}
                onPendingUploadsChange={setPendingUploads}
                retryUploadRef={retryUploadRef}
                attachFilesRef={attachFilesRef}
                onMention={member => {
                  onChange(appendMention(value, member.name))
                  // #2428.12 — l'id canonique remonte au parent (`Chat`), qui
                  // le transmet SEULEMENT si le texte « @Nom » est encore
                  // présent au moment de l'envoi (voir `handleSend`).
                  onMentionMember(member)
                  textareaRef.current?.focus()
                }}
                // #3050 — CE QUE LA RANGÉE CACHE SOUS 768 PX REJOINT LE « + » :
                // rien n'est supprimé, seulement déplacé (doctrine). Le catalogue
                // (`CommandDrawerButton`) reste MONTÉ juste en dessous (son
                // dialogue est piloté par `commandsOpen`) — cette entrée ne fait
                // que l'ouvrir depuis un endroit qui reste, lui, toujours visible.
                showHiddenComposerTools={hideToolsRowOnMobile}
                onOpenCommands={() => setCommandsOpen(true)}
                toolSelection={{
                  tools: connectedTools,
                  excludedProviders: excludedProvidersFor(toolSourcesExcluded, conversationId),
                  onToggle: provider => conversationId && toggleToolSource(conversationId, provider),
                }}
                conversationResearchMode={{
                  value: researchModeFor(researchModes, conversationId),
                  onChange: mode => conversationId && setResearchMode(conversationId, mode),
                }}
              />
              {/* #5048 — « Mon profil » REVIENT dans la barre (Louis, 31/10/2026 : revient sur #3772.1, qui
                l'avait mis dans `ScopeDialog`). Le composeur est le SEUL endroit : ni le panneau de portée
                ni l'en-tête ne le portent plus (GA-26). Sous 768 px une fois le fil commencé, la rangée se
                tait comme ses voisines (`hidden`, pas un démontage : il synchronise le défaut d'espace) et
                le réglage se reprend dans le « + » (`ComposerProfileMenu`). */}
              <div className={hideToolsRowOnMobile ? 'hidden' : undefined}>
                <ComposerProfileControl conversationId={conversationId} disabled={disabled} />
              </div>
              {/* #2450.1 / #2448.1 (reste, épopée #2882) — « Mode de recherche » :
                quelle profondeur Laura doit atteindre pour CE tour (Auto/Rapide/
                Vérifié/Approfondi), distinct du « Contexte de travail » (quelles
                couches personnelles entrent dans le raisonnement, #3772.1 :
                désormais dans le panneau Contexte de l'en-tête). Masqué sous
                768 px une fois le fil commencé, repris dans le menu « + »
                ci-dessous (rien n'est supprimé, seulement déplacé). */}
              {hideToolsRowOnMobile ? null : (
                <ResearchModeSelector conversationId={conversationId} disabled={disabled} />
              )}
              {/* #1321 — le catalogue des commandes, DANS la conversation. Il
                était une page à part, ce qui faisait « une deuxième interface
                concurrente » (tes mots). Il pré-remplit la saisie, il n'envoie
                jamais : #1321.4, « ne pas envoyer aveuglément une commande en un
                clic ».
                #3050 — le déclencheur EN LIGNE se tait sous 768 px une fois le
                fil commencé (`hidden`, pas un démontage : son dialogue reste
                piloté par `commandsOpen`, que la nouvelle entrée du « + »
                ci-dessus peut encore ouvrir). */}
              <div className={hideToolsRowOnMobile ? 'hidden' : undefined}>
                <CommandDrawerButton
                  disabled={disabled}
                  open={commandsOpen}
                  onOpenChange={setCommandsOpen}
                  // #3774.2.1 — « Voir tout » reste alors la SEULE entrée directe et
                  // visible vers ce tiroir ; `hideTrigger` ne retire que ce bouton-ci,
                  // jamais le `Dialog`.
                  hideTrigger
                  onPick={prompt => {
                    onChange(prompt)
                    textareaRef.current?.focus()
                  }}
                  // #5043 — préparer REMPLACE la saisie : le toast « Annuler » la rend.
                  draft={value}
                  onRestore={onChange}
                />
              </div>
              {/* #3708 — « Outils et sources » : UNE entrée compacte (elle remplace
                les bulles d'outils alignées). Les noms viennent des connexions
                (`connectedClientTools`) ; l'exclusion choisie ici part avec le
                tour (`excludedToolFamilies`) et est appliquée côté serveur.
                #3050 — masquée sous 768 px une fois le fil commencé, comme les
                deux sélecteurs voisins. */}
              {hideToolsRowOnMobile ? null : (
                <ToolsSourcesMenu
                  tools={connectedTools}
                  unconnectedFamilies={unconnectedFamilies}
                  excludedProviders={excludedProvidersFor(toolSourcesExcluded, conversationId)}
                  disabled={disabled || !conversationId}
                />
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2" data-testid="chat-composer-send-group">
              {/* Le prix, COLLÉ au bouton qui l'engage. Il vivait à l'autre bout
                de l'écran, dans la bande du haut : on choisissait un run en
                haut et on cliquait en bas, donc le chiffre n'était plus sous
                les yeux au moment du clic. */}
              {/* #1939.1 / #1912.9 — le micro, au bord du bouton d'envoi. Absent tant
                que la capacité ne l'est pas (serveur, navigateur, démonstration). */}
              <VoiceInput
                conversationKey={conversationKey}
                accountId={accountId}
                disabled={disabled}
                onTranscribed={onVoiceTranscribed}
              />
              {/* #2434.8/.9/.10/.12/.24/.30 — LE MODE CONVERSATION (〰️) : dictée →
                envoi → lecture de la réponse → réécoute, en boucle jusqu'à
                l'arrêt explicite. Distinct du micro ci-dessus (🎤 Dicter : pose
                le texte dans la saisie, jamais n'envoie seul, #1939.10) —
                deux gestes différents, DEUX boutons, pas trois, comme le
                voulait déjà l'écran d'origine (MODE 1 / MODE 2 de #2434).
                #4536.1 — l'interrupteur « conversation continue » 🔁 de la
                dictée est RETIRÉ, repris ici. Un mot incertain n'envoie jamais
                seul : le texte retourne dans la saisie (`onUncertain`,
                #2434.1 / #3457). */}
              <VoiceConversation
                conversationKey={conversationKey}
                accountId={accountId}
                sending={disabled}
                lastAssistantText={lastAssistantText}
                lastTurnFailed={lastTurnFailed}
                onSend={onSend}
                onUncertain={onVoiceTranscribed}
              />
              {/* #2428.14 — nom, périmètre et coût s'affichaient déjà avant le
                clic ; la durée jamais. Collée au coût, même discipline
                anti-invention (`RunDuration`, `ComposerLauncher.tsx`). */}
              {armedRun ? <RunDuration run={armedRun} /> : null}
              {/* #1953.1 / #1953.2 — PENDANT la génération, le bouton d'envoi
                cède la place à « Arrêter » : un clic aborte le tour en cours
                (`onStop` → `handleStop` → `AbortController.abort()`) plutôt
                que d'attendre sa fin. Hors génération, rien ne change. */}
              {loading ? (
                <>
                  {/* #4066.1 — pendant la réponse, un message tapé se met en ATTENTE (bouton nommé, ≥ 44 px). */}
                  {queueable && canSubmit && !armedRun ? (
                    <Button type="submit" variant="light" size="sm" icon={ListPlus} className="min-h-11">
                      {t('queue.queueAction')}
                    </Button>
                  ) : null}
                  {/* #3356.3b — 44 px au pointeur fin aussi (Envoyer mesurait 96×32). */}
                  <Button type="button" variant="black" size="sm" icon={Square} onClick={onStop} className="min-h-11">
                    {t('common:actions.stop')}
                  </Button>
                </>
              ) : micInsteadOfSend ? null : (
                <Button
                  type="submit"
                  variant={submitMode === 'open' ? 'violet' : 'black'}
                  size="sm"
                  icon={submitMode === 'open' ? ArrowRight : SendHorizonal}
                  iconPosition={submitMode === 'open' ? 'right' : undefined}
                  disabled={!canSubmit}
                  className="min-h-11"
                  // #2428.19 — un `disabled` nu ne disait jamais POURQUOI. Le
                  // titre natif l'annonce au survol/focus, `null` sur un bouton
                  // actionnable (aucun `title` vide qui flotterait pour rien).
                  title={disabledReasonKey ? t(disabledReasonKey) : undefined}
                >
                  {submitMode === 'open' ? t('launcher:go') : t('common:actions.send')}
                </Button>
              )}
            </div>
          </div>
        </div>
        {/* Les cinq travaux gouvernés, SOUS la saisie — du côté où sont les
            mains, et non dans une bande en haut que personne ne regardait. */}
        <ComposerLauncher disabled={disabled} />
      </div>
      {/*
        La mention « les réponses peuvent contenir des erreurs » (maquette p.15,
        élément 7) n'est PAS retirée : elle a migré dans `MemoryBar`, la ligne
        juste en dessous. Elle y disait mot pour mot la même chose qu'ici —
        deux avertissements collés, dont le second annule le premier en le
        banalisant. Un copilote qui agit doit dire qu'il peut se tromper ; il
        doit le dire UNE fois.
      */}
    </form>
  )
}

/**
 * ⚠️ #1320 — LA DÉMONSTRATION SEULEMENT : le rendu qu'avait `PromptSuggestions`
 * avant #1600, conservé à l'identique pour elle. Les amorces y SONT le
 * script — les remplacer par l'accueil contextuel de Laura enverrait un
 * prospect sur des questions sans réponse préparée. `demo-chat-script.ts`,
 * qui porte la LISTE, reste hors du périmètre de ce chantier.
 */
// Exporté pour son test (GA-30) : le script de démonstration réel ne compte
// que 6 amorces, jamais assez pour faire apparaître le bouton « voir plus ».
export function DemoSuggestionRow({
  suggestions,
  onPrompt,
}: {
  suggestions: ChatSuggestion[]
  onPrompt: (prompt: string) => void
}) {
  const { t } = useTranslation('chat')
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? suggestions : suggestions.slice(0, DEMO_MAX_VISIBLE_SUGGESTIONS)
  const hidden = suggestions.length - visible.length

  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2" data-guide-keep-clear>
      {/* Le rendu D'AVANT #1600, à l'identique : les cinq travaux gouvernés
          restaient dans cette rangée pour la démonstration aussi (aucune
          branche `isDemo` ne les en écartait), et les en retirer ici serait
          un changement de comportement que ce chantier ne demande pas. */}
      <LauncherExamples />
      {visible.map(suggestion => (
        <button
          key={suggestion.label}
          type="button"
          onClick={() => onPrompt(suggestion.prompt)}
          // La requête complète en `title` : la pastille reste courte, mais on
          // peut lire ce qui sera réellement envoyé avant de cliquer.
          title={suggestion.prompt}
          // GA-30 — cible tactile ≥ 44 px en pointeur grossier, même idiome
          // que `LauncherExamples` (la même pastille, hors de ce chantier).
          className="min-h-8 rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-1.5 text-xs text-[var(--bellum-text-secondary)] outline-none transition-colors pointer-coarse:min-h-11 hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
        >
          {suggestion.label}
        </button>
      ))}
      {/* #1321.2 — les amorces excédentaires s'ouvrent SUR PLACE, jamais
          coupées : un `<button>`, pas un `<div onClick>` (GA-35). */}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          // GA-30 — même idiome que la pastille ci-dessus.
          className="min-h-8 rounded-full border border-dashed border-[var(--bellum-border)] px-3 py-1.5 text-xs text-[var(--bellum-text-accent)] outline-none transition-colors pointer-coarse:min-h-11 hover:bg-[var(--bellum-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
        >
          {t('prompts.showMore', { count: hidden })}
        </button>
      )}
    </div>
  )
}

/**
 * #1947 / #1908 — la première prise de parole de Laura, AVANT tout échange.
 *
 * Une bulle et non un titre : elle PARLE. `role="status"` parce que la phrase
 * arrive seule, trois secondes après l'écran — sans annonce, elle n'existerait
 * que pour qui regarde.
 *
 * Elle devient un vrai message du fil dès que l'utilisateur répond
 * (`handleSend`) ; d'ici là elle n'est écrite nulle part.
 */
function OpenerBubble({ text }: { text: string }) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      role="status"
      className="flex w-full items-start gap-2.5"
      // #1907.11 — Laura prend la parole : « ça vient d'arriver », par la grammaire du produit.
      // #1907.13 — et l'amorce EST une réponse de Laura : même peau que la bulle qu'elle deviendra.
      {...chatMotion('enterFromBelow', shouldReduceMotion)}
    >
      <AssistantAvatar named />
      {/* D81 / GA-34 — la MÊME borne de lecture que la bulle qu'elle deviendra, et au même endroit. */}
      <div className={cn(CHAT_SURFACE.reading, 'px-4 py-3', CHAT_SURFACE.replyText, CHAT_SURFACE.reply)}>
        {/* #1936.1 — le brief porte des titres et des liens réels : il se rend par le MÊME moteur
            que la réponse qui le relira une fois écrit dans le fil, sinon la syntaxe s'affiche. */}
        <StructuredReply text={text} />
      </div>
    </motion.div>
  )
}

function TypingIndicator() {
  const { t } = useTranslation('chat')
  // #1907.11 — « ça travaille » : `MOTION.breathe` en cascade, au lieu d'un `animate-pulse` hors grammaire.
  // Réduit, il reste une boucle sans déplacement : l'attente doit continuer de se dire.
  const breathe = chatMotion('breathe', useReducedMotion())
  return (
    <div className="flex items-start gap-2.5">
      <AssistantAvatar />
      <div className={cn('px-4 py-3', CHAT_SURFACE.reply)}>
        <div role="status" className="flex items-center gap-1.5" aria-label={t('messages.typingAria')}>
          {[0, 1, 2].map(index => (
            <motion.span
              key={index}
              className="size-1.5 rounded-full bg-[var(--bellum-text-muted)]"
              {...staggered(breathe, index)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Append "@Nom " to the composer, adding a separating space when needed. */
function appendMention(value: string, name: string): string {
  const needsSpace = value.length > 0 && !value.endsWith(' ')
  return `${value}${needsSpace ? ' ' : ''}@${name} `
}

/*
 * #1791.1 — la référence en TEXTE PUR (`appendConnectorReference`) a quitté ce
 * fichier avec #2254, puis le BLOC à marqueurs (`insertConnectorBlock`,
 * `./connector-block.ts`) avec #2668.1 : un connecteur posé est désormais un
 * état à part (`connectorLabels`, plus haut), jamais une écriture dans le
 * champ — jamais exécuté depuis la saisie non plus — #1791.2 (appeler le
 * connecteur et lui demander quelque chose) reste une capacité serveur
 * écartée de ce lot.
 */

/** Un fichier déposé dans le fil : ce qu'il faut pour l'ENVOYER (son
 *  identifiant) et pour le MONTRER (son nom). */
/**
 * #2428.12 — un collègue mentionné : l'identifiant CANONIQUE voyage AVEC le
 * nom affiché, plutôt que le nom seul. Le serveur le préfère à l'heuristique
 * par prénom (`ChatContextService.resolveMentionedColleague`).
 */
type MentionedMember = { id: string; name: string }

type AttachedDoc = {
  id: string
  name: string
  /** #1954.7 — où il sert : ce fil (défaut) ou la base de l'ESN, sur choix explicite. */
  scope: RagDocumentScope
  /** Le fil d'un document « pour cette conversation », `null` pour la base de l'ESN. */
  conversationId: string | null
  /**
   * #1954.15 / #1954.16 / #1954.30 — le document est ingéré dans les DEUX cas
   * (le contenu sert à Laura), mais `'partial'` dit qu'une partie du fichier
   * (une page scannée sans calque texte, typiquement) n'a pas pu être lue :
   * jamais présenté comme le même succès plein que `'ready'`.
   */
  status: 'ready' | 'partial'
  /** #2428.9 — MIME du fichier source, quand connu (jamais pour une entrée
   *  d'archive .zip dépliée côté serveur : aucun `File` local n'en porte). */
  type?: string
  /** #2428.9 — poids en octets, quand connu. `undefined` masque le segment de
   *  taille plutôt que d'afficher un zéro inventé (doctrine : non mesuré ≠ 0). */
  size?: number
  /**
   * #2148.16 — vrai pour une pièce jointe de CONVERSATION (cas a) : `text` a
   * été extrait par `POST /rag-documents/extract`, AUCUNE ligne de
   * `rag_documents` n'existe derrière `id` (un identifiant purement local).
   * `false`/absent pour les trois portées explicites (personal/account/
   * knowledge_base, cas b) : `id` désigne alors un document réellement ingéré.
   */
  ephemeral?: boolean
  /** Le texte déjà extrait, SEULEMENT quand `ephemeral` — c'est ce qui part
   *  dans `attachedFiles` à l'envoi, jamais relu depuis un `id` serveur. */
  text?: string
  /**
   * #2876 (#2433.4) — une image de conversation garde une URL `blob:` LOCALE
   * (créée depuis le `File`, jamais envoyée au serveur) : la preuve visuelle
   * cliquable derrière la pièce, revue via `AttachmentPreviewDialog`. Absente
   * pour tout ce qui n'est pas une image (`isChatImage`).
   */
  imageUrl?: string
  /**
   * #2876 (#2433.4) — l'identifiant `storage_objects` (domaine
   * `chat_image_attachment`) que le serveur a rendu en RANGEANT l'image
   * (`extract`, best-effort) : ce qui fait que la preuve visuelle survit à
   * l'envoi, à un rechargement du fil, et reste lisible par un collègue.
   * Absent quand le stockage est désactivé côté serveur ou en salle de
   * démonstration (`extract` reste alors sans effet secondaire) — la pièce
   * reste utilisable, seule la preuve visuelle ne survit pas à cet onglet.
   */
  imageObjectId?: string
  /**
   * #2433.4 (épopée #2876, lot M10 09/10) — la CITATION VISUELLE : où chaque
   * ligne lue se trouve dans l'image (`vision_regions.locate_lines`), avec
   * l'`image_id` qu'elle cite — l'objet rangé, sinon la pièce de cet onglet.
   * Absent sans zone mesurée (jamais une liste vide).
   */
  citations?: ChatImageCitation[]
  /**
   * #2433.12 (épopée #2876, lot P02 09/10) — les OBJETS de l'image mesurés par
   * le localiseur : bords du document (recadrage proposé) et grille d'un
   * tableau. Absent = rien mesuré (panne, pas une image, salle de démo).
   */
  objects?: ChatImageObjects
}

/**
 * #2428.9 — un libellé de type COURT et lisible, dérivé de l'extension du
 * fichier (jamais du MIME complet, illisible en pastille : « application/
 * vnd.openxmlformats-officedocument.wordprocessingml.document »). Le MIME
 * n'est lu QUE pour distinguer un fichier sans extension ; `undefined` quand
 * ni l'un ni l'autre ne donne de type exploitable — jamais un type inventé.
 */
function fileExtensionLabel(name: string, mime?: string): string | undefined {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name)
  if (match) return match[1].toUpperCase()
  const subtype = mime?.split('/')[1]
  return subtype ? subtype.toUpperCase() : undefined
}

/**
 * #1954.13 / #1954.14 / #1954.17 / #1954.18 — les états d'une pièce EN COURS
 * de dépôt, ou dont le dépôt a échoué. Vit à part de `AttachedDoc` : un fichier
 * dans ces états n'est ni ENVOYABLE (son contenu n'est pas encore, ou jamais,
 * dans la base) ni identifié par un id serveur — `localId` est la seule clé
 * stable tant qu'il n'y en a pas d'autre.
 */
type PendingAttachment = {
  localId: string
  name: string
  scope: RagDocumentScope
  conversationId: string | null
  /** `'uploading'` : lecture du fichier. `'analyzing'` : extraction + indexation
   *  côté serveur. `'refused'` : le serveur a rejeté le CONTENU (fichier
   *  illisible, type falsifié — HTTP 422). `'error'` : panne technique
   *  (réseau, 5xx) — distincte d'un refus, pour que la carte n'imprime pas la
   *  même excuse aux deux. */
  status: 'uploading' | 'analyzing' | 'refused' | 'error'
}

// i18n keys: attach.scope.conversation | attach.scope.workspace | attach.scope.personal |
//            attach.scope.account | attach.scope.knowledge_base
const ATTACH_SCOPE_LABEL_KEY: Record<RagDocumentScope, string> = {
  conversation: 'attach.scope.conversation',
  workspace: 'attach.scope.workspace',
  // #2779 — les trois portées manquantes de #1954.
  personal: 'attach.scope.personal',
  account: 'attach.scope.account',
  knowledge_base: 'attach.scope.knowledge_base',
}

// i18n keys: composer.attachForConversation | composer.attachToBase | composer.attachPersonal |
//            composer.attachAccount | composer.attachKnowledgeBase
/**
 * #2779 — le menu qui CHANGE la portée d'une pièce déjà attachée reprend les
 * MÊMES libellés que le menu « + » qui la propose à l'ajout : une portée se
 * nomme pareil qu'on la choisisse maintenant ou plus tard.
 */
const CHANGE_SCOPE_ITEM_LABEL_KEY: Record<RagDocumentScope, string> = {
  conversation: 'composer.attachForConversation',
  workspace: 'composer.attachToBase',
  personal: 'composer.attachPersonal',
  account: 'composer.attachAccount',
  knowledge_base: 'composer.attachKnowledgeBase',
}

/**
 * #2779 — les trois portées ajoutées au menu « + », chacune avec son libellé
 * et sa phrase « qui s'en sert, combien de temps » (#1954.5/#1954.6), comme
 * les deux premières. L'ordre et la présence de « compte » viennent de
 * `attachScopesFor` ; `conversation`/`workspace` gardent leurs entrées d'avant.
 */
// i18n keys: composer.attachPersonal | composer.attachPersonalHint | composer.attachAccount |
//            composer.attachAccountHint | composer.attachKnowledgeBase | composer.attachKnowledgeBaseHint
const EXTRA_ATTACH_SCOPE_MENU: Partial<Record<RagDocumentScope, { label: string; hint: string }>> = {
  personal: { label: 'composer.attachPersonal', hint: 'composer.attachPersonalHint' },
  account: { label: 'composer.attachAccount', hint: 'composer.attachAccountHint' },
  knowledge_base: { label: 'composer.attachKnowledgeBase', hint: 'composer.attachKnowledgeBaseHint' },
}

// i18n keys: attach.status.uploading | attach.status.analyzing | attach.status.ready |
//            attach.status.partial | attach.status.refused | attach.status.error
const ATTACH_STATUS_LABEL_KEY = {
  uploading: 'attach.status.uploading',
  analyzing: 'attach.status.analyzing',
  ready: 'attach.status.ready',
  partial: 'attach.status.partial',
  refused: 'attach.status.refused',
  error: 'attach.status.error',
} as const satisfies Record<PendingAttachment['status'] | AttachedDoc['status'], string>

// i18n keys: attach.classification.cv | attach.classification.crmExport | attach.classification.needsSheet |
//            attach.classification.rfp | attach.classification.invoice | attach.classification.screenshot
const DOCUMENT_CLASSIFICATION_LABEL_KEY = {
  cv: 'attach.classification.cv',
  crm_export: 'attach.classification.crmExport',
  needs_sheet: 'attach.classification.needsSheet',
  rfp: 'attach.classification.rfp',
  invoice: 'attach.classification.invoice',
  screenshot: 'attach.classification.screenshot',
} as const satisfies Record<DocumentProbableType, string>

// #2850 (#2431.2/.10, reste 27/09) — la SUGGESTION serveur (contenu tabulaire
// matchant une source d'import connue), distincte de `DOCUMENT_CLASSIFICATION_LABEL_KEY`
// ci-dessus (par NOM de fichier, client-side) : un vocabulaire d'OBJET MÉTIER,
// pas de genre de document.
// i18n keys: attach.importSuggestion.account | attach.importSuggestion.contact |
//            attach.importSuggestion.project | attach.importSuggestion.need |
//            attach.importSuggestion.talent
//            attach.importSuggestion.mission
const IMPORT_SUGGESTION_LABEL_KEY = {
  account: 'attach.importSuggestion.account',
  contact: 'attach.importSuggestion.contact',
  project: 'attach.importSuggestion.project',
  need: 'attach.importSuggestion.need',
  talent: 'attach.importSuggestion.talent',
  mission: 'attach.importSuggestion.mission',
} as const satisfies Record<WritableImportObject, string>

// #2850 (#2431.11, décision Louis 28/09) — distinct de `IMPORT_SUGGESTION_LABEL_KEY` :
// la confiance HAUTE a déjà une proposition PRÊTE côté serveur (session créée +
// simulée, jamais écrite) — dire « dépose-le via Import » redemanderait un geste
// déjà fait ; le bon geste ici est de RELIRE la proposition, pas de la refaire.
// i18n keys: attach.importProposalReady.account | .contact | .project | .need | .talent
const IMPORT_PROPOSAL_READY_LABEL_KEY = {
  account: 'attach.importProposalReady.account',
  contact: 'attach.importProposalReady.contact',
  project: 'attach.importProposalReady.project',
  need: 'attach.importProposalReady.need',
  talent: 'attach.importProposalReady.talent',
  mission: 'attach.importProposalReady.mission',
} as const satisfies Record<WritableImportObject, string>

/** #3751 — lu dans `@bellum/contracts` (partagé avec Connaissances, GA-26). Raw-size ceiling (~8 MB) so the base64 payload stays under the API's 12 MB
 *  ingest cap once encoded (+~33%). */
const ATTACH_MAX_BYTES = RAG_UPLOAD_MAX_BYTES
/** #1954.1 — les formats acceptés, UNE fois : l'attribut `accept` et la phrase qui les annonce lisent cette liste.
 *  #2667.1 — `zip` : dépliée CÔTÉ SERVEUR (`RagZipIngestService`), ses entrées lisibles deviennent des pièces
 *  jointes — `onFile` la détecte et l'envoie par `ragApi.ingestZip`, jamais par `fileToIngestInput`. Un zip qui
 *  n'est PAS déposé comme pièce jointe (autre appelant de `document_text.py`) reste lu tel quel par
 *  `_extract_archive`, texte concaténé de ses entrées lisibles.
 *  #2667.2 — `xlsx` : `apps/ia/app/services/document_text.py` l'extrait déjà (`_extract_xlsx`, une ligne de
 *  tableur par ligne de texte). `pptx` : le même fichier l'extrait désormais aussi (`_extract_pptx`, zip + XML
 *  comme docx/xlsx, aucune dépendance nouvelle). `png`/`jpg`/`jpeg`/`webp` : lues par le modèle
 *  (`claude_service.call_claude_image_text`), pas d'OCR local — un type n'est ouvert ici QUE s'il est réellement
 *  exploité côté serveur. */
const ATTACH_EXTENSIONS = RAG_UPLOAD_CHAT_EXTENSIONS
/** #1954.3 — le nombre de documents qui accompagnent un message. */
const ATTACH_MAX_COUNT = 3

/**
 * #1791.1 — LE « + » QUI RASSEMBLE LES OUTILS DE LA BARRE DE SAISIE.
 *
 * Avant ce lot, joindre un fichier (trombone) et mentionner un collègue (@)
 * étaient deux boutons séparés sur la même ligne. Ce menu unique les regroupe
 * — la barre s'allège, rien ne se perd — et ajoute une troisième entrée :
 * désigner un connecteur, SUR LE MÊME MODÈLE que la mention (elle insère une
 * référence en texte dans le message, elle n'exécute rien). « Appeler un
 * connecteur et lui demander quelque chose » (#1791.2) est une capacité
 * serveur — outils du copilote, budget de tour, droits d'accès — écartée de ce
 * lot ; voir le rapport pour ce qu'elle demanderait.
 *
 * Doctrine GA-44 (`no-vendor-names-in-app.test.ts`, `tool-capability-digest.spec.ts`) :
 * un connecteur se désigne par sa CAPACITÉ (« ton CRM »), jamais par son
 * éditeur. `useConnectedCapabilities` agrège donc par FAMILLE — deux CRM
 * connectés ne produisent qu'une seule entrée « ton CRM » dans ce menu,
 * jamais deux noms de fournisseur.
 */
function ComposerToolsMenu({
  disabled,
  conversationId,
  onAttached,
  onMention,
  onPendingUploadsChange,
  retryUploadRef,
  attachFilesRef,
  accountId,
  showHiddenComposerTools,
  onOpenCommands,
  conversationResearchMode,
  toolSelection,
}: {
  disabled: boolean
  /** #1954.7 — le fil auquel un document « pour cette conversation » se rattache. */
  conversationId: string | null
  /** #2779 — le compte auquel un document « Ce compte uniquement » se rattache. */
  accountId: string | null
  onAttached: (doc: AttachedDoc) => void
  onMention: (member: MentionedMember) => void
  /** #1954.13 / #1954.14 / #1954.17 / #1954.18 — les pièces EN COURS ou en
   *  ÉCHEC de dépôt, tenues par le parent (`Composer`) pour s'afficher dans la
   *  même rangée que les pièces déjà attachées. */
  onPendingUploadsChange: Dispatch<SetStateAction<PendingAttachment[]>>
  /**
   * #2435.9 — la carte d'une pièce en ÉCHEC (rendue par `Composer`, un
   * FRÈRE de ce menu) doit pouvoir rejouer SON dépôt sans reposer la
   * question du fichier. `Composer` pose sa fonction ici, ce menu l'appelle
   * — un ref plutôt qu'un contexte ou une remontée d'état, pour ne pas faire
   * voyager tout le mécanisme de dépôt jusqu'au parent.
   */
  retryUploadRef: MutableRefObject<(localId: string) => void>
  /**
   * #3849.1 — `Composer` pose le geste de glisser-déposer sur le CADRE entier
   * du composeur (son propre élément `<form>`), mais le contrôle AVANT envoi
   * et l'upload lui-même vivent ici, à côté de `attachOneFile` et de l'input
   * natif — même mécanisme que `retryUploadRef` juste au-dessus, pour ne pas
   * faire remonter tout le dépôt de fichier jusqu'au parent.
   */
  attachFilesRef: MutableRefObject<(files: File[], scope: RagDocumentScope) => void>
  /**
   * #3050 — sous 768 px, une fois le fil commencé, `Composer` tait sa ligne
   * d'outils (catalogue, mode de contexte) : `Composer.hideToolsRowOnMobile`.
   * Ce menu reprend alors leur ouverture — `false`/absent = comportement
   * d'avant, aucune entrée de plus (bureau, ou fil vierge).
   */
  showHiddenComposerTools?: boolean
  onOpenCommands?: () => void
  /** #2450.1 / #2448.1 (reste, épopée #2882) — le mode de recherche du fil
   *  (« Auto » par défaut) : LU et ÉCRIT via le même magasin que
   *  `ResearchModeSelector` (GA-26). */
  conversationResearchMode?: { value: ChatResearchMode; onChange: (mode: ChatResearchMode) => void }
  /** #5048 — la sélection d'outils des puces, reprise dans ce menu sous 768 px une fois le fil commencé. */
  toolSelection?: {
    tools: readonly ConnectedClientTool[]
    excludedProviders: readonly string[]
    onToggle: (provider: string) => void
  }
}) {
  const { t, i18n } = useTranslation('chat')
  const inputRef = useRef<HTMLInputElement>(null)
  /**
   * #2435.9 — capture photo DIRECTE, un input DÉDIÉ plutôt qu'un attribut
   * `capture` posé sur l'input générique ci-dessus : celui-là accepte aussi
   * PDF/DOCX/ZIP (`ATTACH_EXTENSIONS`), et `capture` y forcerait l'appareil
   * photo même pour un choix de document existant sur mobile. Réservé au
   * mobile (`useIsMobile`) : `capture` est ignoré des navigateurs de bureau,
   * mais l'entrée de menu n'a de sens que là où il y a un appareil photo.
   */
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()
  /**
   * #1954.7 / #1954.9 — la portée CHOISIE pour le prochain fichier : ce fil par
   * défaut (Louis, 12/09/2026), la base de l'ESN seulement quand on la choisit.
   * Remise au défaut dès que le fichier est lu.
   */
  const pendingScope = useRef<RagDocumentScope>('conversation')
  /**
   * #2435.9 — le FICHIER d'une pièce encore en vol ou en ÉCHEC, gardé en
   * mémoire pour un rejeu sans re-sélection (« upload reprenable », version
   * minimale tranchée par Louis 22/09 soir, decisions-louis-22-09-soir.md
   * §1 — pas de protocole par blocs, le fichier déjà lu ne se reperd pas au
   * premier accroc réseau). Nettoyé au succès ; laissé après un ÉCHEC ou un
   * REFUS pour la durée de vie du composeur — un `Map` en mémoire, jamais
   * en base, jamais renvoyé au serveur tel quel.
   */
  const pendingFiles = useRef(
    new Map<string, { file: File; scope: RagDocumentScope; pendingConversationId: string | null }>(),
  )
  const threadLabelId = useId()
  const threadHintId = useId()
  const baseLabelId = useId()
  const baseHintId = useId()
  const extraScopeIdPrefix = useId()
  const ingest = useIngestRagDocument()
  const ingestZip = useIngestRagZip()
  const extractFile = useExtractRagFile()
  const { team } = useTeam()
  // #2428.12 — l'id CANONIQUE voyage avec le nom affiché : la mention choisie
  // ici ne transmet plus un simple texte, `onMention` reçoit les deux.
  const mentionables = (team?.members ?? [])
    .map(member => ({ id: member.userId, name: member.fullName || member.email || '' }))
    .filter(entry => entry.name)

  const pickFile = (scope: RagDocumentScope) => {
    pendingScope.current = scope
    inputRef.current?.click()
  }

  const pickCamera = () => {
    pendingScope.current = 'conversation'
    cameraInputRef.current?.click()
  }

  /**
   * #3849.1 — ACCEPTE DES FICHIERS DÉJÀ EN MAIN, quelle que soit leur source
   * (sélecteur natif OU glisser-déposer) : jusqu'ici seul `onFile` existait, et
   * rien n'appelait `validateRagUpload` (#3751) dans ce composeur — pourtant
   * déjà branché côté Connaissances et côté import d'analyse. Un format
   * manifestement hors liste (ni document, ni image, ni archive) partait donc
   * quand même en réseau, pour un refus serveur générique au lieu d'un message
   * qui NOMME le format attendu. Glisser un fichier ne passe par AUCUN attribut
   * `accept` — c'est ce filtre natif qui tenait ce contrôle jusqu'ici en silence.
   */
  const attachFiles = async (files: File[], scope: RagDocumentScope) => {
    // #2431.1 — plusieurs fichiers en un seul geste, bornés à `ATTACH_MAX_COUNT`
    // pièces par message (#1954.3) : les fichiers au-delà sont NOMMÉS, jamais
    // écartés en silence. L'import massif a son chemin séparé (#2431.4,
    // `CvZipImportDialog`).
    const kept = files.slice(0, ATTACH_MAX_COUNT)
    const skipped = files.slice(ATTACH_MAX_COUNT)
    if (skipped.length > 0) {
      toast.error(
        t('attach.multiple.skipped', {
          max: ATTACH_MAX_COUNT,
          count: skipped.length,
          names: skipped.map(file => file.name).join(', '),
        }),
        { duration: TOAST_PROBLEM_MS },
      )
    }
    const accepted: File[] = []
    for (const file of kept) {
      const verdict = validateRagUpload(file, ATTACH_EXTENSIONS)
      if (verdict.ok) {
        accepted.push(file)
        continue
      }
      const ext = ragUploadExtension(file.name)
      const formats = new Intl.ListFormat(i18n.language, { type: 'disjunction' }).format(
        ATTACH_EXTENSIONS.map(known => known.toUpperCase()),
      )
      toast.error(
        t(
          verdict.reason === 'unsupported'
            ? ext
              ? 'attach.unsupported'
              : 'attach.unsupportedNoExtension'
            : verdict.reason === 'too_large'
              ? 'attach.tooLarge'
              : 'attach.empty',
          { name: file.name, ext, formats },
        ),
        { duration: TOAST_PROBLEM_MS },
      )
    }
    await Promise.all(accepted.map(file => attachOneFile(file, scope)))
  }

  /*
   * Joindre un document choisi au sélecteur natif. #1954.7 — il sert à CE fil
   * par défaut, et n'entre dans la base de l'ESN que sur le choix explicite du
   * menu : il y partait jusqu'ici en silence. Text is sent inline; PDF/DOCX go
   * as base64 and are extracted server-side.
   */
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = '' // let the same file be re-picked later
    const scope = pendingScope.current
    pendingScope.current = 'conversation'
    await attachFiles(files, scope)
  }

  const attachOneFile = async (file: File, scope: RagDocumentScope) => {
    if (file.size > ATTACH_MAX_BYTES) {
      toast.error(t('attach.tooLarge'))
      return
    }
    const localId = crypto.randomUUID()
    const pendingConversationId = scope === 'conversation' ? conversationId : null
    // #1954.13 — État « Téléversement » : la pièce apparaît dans SA carte dès
    // le choix du fichier, avant même que le réseau ait répondu — pas
    // seulement un toast qui disparaît (#1954.18).
    onPendingUploadsChange(previous => [
      ...previous,
      { localId, name: file.name, scope, conversationId: pendingConversationId, status: 'uploading' },
    ])
    // #2667.1 — décision Louis (QCM 21/09) : une archive .zip est DÉPLIÉE
    // CÔTÉ SERVEUR (`RagZipIngestService`) ; ses entrées lisibles deviennent
    // AUTANT de pièces jointes, pas UNE pièce nommée « lot.zip ». Chemin
    // séparé du dépôt unitaire ci-dessous : le rapport porte le sort de
    // CHAQUE entrée (`RagZipIngestReport`), jamais un succès/échec global.
    // #2148.16 (reste, 26/09) — ce chemin dépose TOUJOURS un objet durable
    // (`IaClient.ragIngest` par entrée) : une archive jointe « pour cette
    // conversation » (portée par défaut, cas a) doit rester ÉPHÉMÈRE comme
    // n'importe quel autre fichier — `scope !== 'conversation'` avant de
    // l'emprunter. En portée conversation, `uploadSingleDocument` ci-dessous
    // fait déjà le bon geste (`extractFile.mutateAsync`), et
    // `extract_document_text` (`apps/ia`) sait déjà lire un `.zip` en entier
    // (`_extract_archive`) — rien de nouveau à écrire côté service IA.
    if (scope !== 'conversation' && /\.zip$/i.test(file.name)) {
      try {
        const fileB64 = await fileToBase64(file)
        onPendingUploadsChange(previous =>
          previous.map(pending => (pending.localId === localId ? { ...pending, status: 'analyzing' } : pending)),
        )
        // #2779 — la portée et SA cible (fil ou compte), une seule règle.
        const placement = ragScopePlacement(scope, { conversationId, accountId })
        const report = await ingestZip.mutateAsync({
          fileB64,
          filename: file.name,
          category: CHAT_ATTACHMENT_CATEGORY,
          ...placement,
        })
        onPendingUploadsChange(previous => previous.filter(pending => pending.localId !== localId))
        const ingested = report.outcomes.filter(outcome => outcome.status === 'ingested')
        const failed = report.outcomes.filter(outcome => outcome.status === 'failed')
        for (const outcome of ingested) {
          onAttached({
            id: outcome.id,
            name: outcome.file,
            scope,
            conversationId: pendingConversationId,
            status: outcome.partial ? 'partial' : 'ready',
          })
        }
        if (ingested.length > 0) {
          toast.success(t('attach.zip.added', { count: ingested.length }), { duration: TOAST_SUCCESS_MS })
        }
        // #2667.1 — « un refus DIT pourquoi » : chaque entrée écartée est NOMMÉE,
        // jamais fondue dans un compte global.
        if (failed.length > 0) {
          toast.error(
            t('attach.zip.someFailed', { count: failed.length, names: failed.map(outcome => outcome.file).join(', ') }),
            { duration: TOAST_PROBLEM_MS },
          )
        }
        // #2431.7 / #2431.13 — un doublon (même contenu qu'une autre entrée)
        // n'est pas ingéré deux fois ; il est NOMMÉ avec ce qu'il double.
        const duplicates = report.outcomes.flatMap(outcome =>
          outcome.status === 'duplicate' ? [`${outcome.file} = ${outcome.duplicateOf}`] : [],
        )
        if (duplicates.length > 0) {
          toast.info(t('attach.zip.duplicates', { count: duplicates.length, names: duplicates.join(', ') }), {
            duration: TOAST_PROBLEM_MS,
          })
        }
      } catch (error) {
        console.error('[Chat attach zip]', error)
        // #2667.1 — l'archive ENTIÈRE est refusée sur un plafond ou une entrée
        // hostile (`BadRequestException`, 400) : le message du serveur DIT déjà
        // pourquoi (`ragZipCapRefusalMessage`) — on le montre tel quel plutôt
        // que le générique `attach.status.refusedToast`, écrit pour un fichier
        // seul dont la raison exacte n'a pas à voyager jusqu'à l'écran.
        const refused = error instanceof ApiError && (error.status === 400 || error.status === 422)
        onPendingUploadsChange(previous =>
          previous.map(pending =>
            pending.localId === localId ? { ...pending, status: refused ? 'refused' : 'error' } : pending,
          ),
        )
        toast.error(refused && error instanceof ApiError ? error.message : t('attach.failed'), {
          duration: TOAST_PROBLEM_MS,
        })
      }
      return
    }
    pendingFiles.current.set(localId, { file, scope, pendingConversationId })
    await uploadSingleDocument(file, scope, localId, pendingConversationId)
  }

  /**
   * #2435.9 — LE DÉPÔT D'UN FICHIER UNIQUE, ISOLÉ POUR ÊTRE REJOUABLE.
   *
   * Extrait du corps de `onFile` (inchangé sinon) pour une seule raison :
   * `retryUpload`, plus bas, doit pouvoir l'appeler une seconde fois sur le
   * MÊME fichier après un ÉCHEC technique, sans repasser par le sélecteur.
   */
  const uploadSingleDocument = async (
    file: File,
    scope: RagDocumentScope,
    localId: string,
    pendingConversationId: string | null,
  ) => {
    try {
      // #2148.16 — cas (a) : une pièce « pour ce fil » (la portée PAR DÉFAUT,
      // `pickFile('conversation')`) est ÉPHÉMÈRE — Laura la lit pour CE tour,
      // aucune ligne de `rag_documents` n'est créée. Les trois portées
      // EXPLICITES (personal/account/knowledge_base, `EXTRA_ATTACH_SCOPE_MENU`)
      // restent le geste d'ajout à la base (cas b) : chemin d'ingestion
      // inchangé plus bas.
      if (scope === 'conversation') {
        // #2876 (#2433.12) — réduction et orientation AVANT l'envoi : une
        // photo mobile tournée (EXIF) part droite, une image surdimensionnée
        // part à la taille que le modèle lira de toute façon. Un fichier déjà
        // droit et dans les bornes part TEL QUEL (jamais réencodé sans
        // raison) ; un échec de prétraitement retombe sur le fichier d'origine.
        const preparedFile = await preprocessChatImage(file)
        const fileB64 = await fileToBase64(preparedFile)
        onPendingUploadsChange(previous =>
          previous.map(pending => (pending.localId === localId ? { ...pending, status: 'analyzing' } : pending)),
        )
        const { text, partial, imageObjectId, regions, objects } = await extractFile.mutateAsync({
          fileB64,
          filename: file.name,
        })
        onPendingUploadsChange(previous => previous.filter(pending => pending.localId !== localId))
        pendingFiles.current.delete(localId)
        // #2876 (#2433.4) — la PREUVE visuelle : une image garde une URL
        // locale (jamais envoyée) pour rouvrir la source depuis la pièce
        // jointe de CE message, pas seulement son texte lu. `imageObjectId`
        // (quand le serveur a rangé l'image, best-effort) fait survivre cette
        // même preuve à l'envoi : c'est lui qui voyage avec le message écrit,
        // jamais l'URL locale qui meurt avec cet onglet.
        const imageUrl = isChatImage(preparedFile) ? URL.createObjectURL(preparedFile) : undefined
        onAttached({
          id: `ephemeral:${localId}`,
          name: file.name,
          scope,
          conversationId: pendingConversationId,
          status: partial ? 'partial' : 'ready',
          type: file.type || undefined,
          size: file.size,
          ephemeral: true,
          text,
          imageUrl,
          imageObjectId,
          // #2433.4 (lot M10) — la zone de chaque ligne lue, citant CETTE image.
          ...(regions?.length
            ? {
                citations: regions.map(region => ({
                  ...region,
                  image_id: imageObjectId ?? `ephemeral:${localId}`,
                })),
              }
            : {}),
          // #2433.12 (lot P02) — recadrage proposé et tableau lu de CETTE image.
          ...(objects ? { objects } : {}),
        })
        toast.success(t(partial ? 'attach.status.partialToast' : 'attach.added'), { duration: TOAST_SUCCESS_MS })
        return
      }
      const input = await fileToIngestInput(file, scope, conversationId, accountId)
      // #1954.14 — État « Analyse » : la lecture locale est finie, le serveur
      // extrait puis indexe désormais le contenu.
      onPendingUploadsChange(previous =>
        previous.map(pending => (pending.localId === localId ? { ...pending, status: 'analyzing' } : pending)),
      )
      const { id, partial, suggestedObject, pendingImportSessionId } = await ingest.mutateAsync(input)
      onPendingUploadsChange(previous => previous.filter(pending => pending.localId !== localId))
      pendingFiles.current.delete(localId)
      // Le dépôt en base ne suffisait pas : le fichier était bien ingéré, et le
      // copilote répondait « je n'ai reçu aucun fichier » parce que rien ne le
      // rattachait au message suivant. L'identifiant est ce rattachement.
      if (id) {
        // #1954.15 / #1954.16 / #1954.30 — jamais un succès plein quand
        // l'extraction est PARTIELLE (un scan sans calque texte au milieu d'un
        // dossier autrement numérique) : le statut voyage jusqu'à la pièce.
        onAttached({
          id,
          name: file.name,
          scope,
          conversationId: pendingConversationId,
          status: partial ? 'partial' : 'ready',
          // #2428.9 — la pièce garde le type et la taille du fichier réellement
          // choisi : `file.type` est parfois vide (le navigateur ne l'a pas
          // deviné) — dans ce cas le segment ne s'affiche pas, jamais un type
          // inventé.
          type: file.type || undefined,
          size: file.size,
        })
      }
      toast.success(
        t(partial ? 'attach.status.partialToast' : scope === 'workspace' ? 'attach.addedToBase' : 'attach.added'),
        { duration: TOAST_SUCCESS_MS },
      )
      // #2850 (#2431.2/.10, reste 27/09) — le fichier est ingéré dans le RAG
      // EXACTEMENT comme avant (rien ci-dessus ne change) ; un second toast,
      // séparé, NOMME l'objet métier reconnu quand le contenu matche une
      // source d'import connue — une SUGGESTION, jamais une écriture : le
      // copilote prépare, il n'importe jamais seul (même doctrine que
      // « propose une fusion, ne fusionne jamais »).
      if (suggestedObject) {
        // #2850 (#2431.11/.3, décision Louis 28/09) — confiance HAUTE : une
        // proposition est déjà PRÊTE (session créée + simulée côté serveur,
        // jamais écrite) — le toast le dit, jamais « intégré » (#2431.3 NO-GO).
        // Confiance BASSE : reste l'invite à déposer via Import (comportement
        // inchangé).
        toast.info(
          t(
            pendingImportSessionId
              ? IMPORT_PROPOSAL_READY_LABEL_KEY[suggestedObject]
              : IMPORT_SUGGESTION_LABEL_KEY[suggestedObject],
          ),
          { duration: TOAST_SUCCESS_MS },
        )
      }
    } catch (error) {
      console.error('[Chat attach]', error)
      // #1954.17 — État « Refusé » : le serveur a rejeté le CONTENU (fichier
      // illisible, type falsifié — HTTP 422), distinct d'une ERREUR technique
      // (#1954.18 : réseau, panne 5xx) — deux excuses, jamais la même carte.
      const refused = error instanceof ApiError && error.status === 422
      onPendingUploadsChange(previous =>
        previous.map(pending =>
          pending.localId === localId ? { ...pending, status: refused ? 'refused' : 'error' } : pending,
        ),
      )
      toast.error(t(refused ? 'attach.status.refusedToast' : 'attach.failed'), { duration: TOAST_PROBLEM_MS })
    }
  }

  /**
   * #2435.9 — rejoue le dépôt d'une pièce en ÉCHEC TECHNIQUE, sans redemander
   * le fichier. `Composer` l'appelle via `retryUploadRef` depuis la carte de
   * la pièce (bouton « Réessayer », visible sur `status === 'error'` seulement
   * — un REFUS de contenu ne se corrige pas en réessayant le même fichier).
   */
  const retryUpload = (localId: string) => {
    const entry = pendingFiles.current.get(localId)
    if (!entry) return
    onPendingUploadsChange(previous =>
      previous.map(pending => (pending.localId === localId ? { ...pending, status: 'uploading' } : pending)),
    )
    void uploadSingleDocument(entry.file, entry.scope, localId, entry.pendingConversationId)
  }
  retryUploadRef.current = retryUpload
  attachFilesRef.current = (files, scope) => void attachFiles(files, scope)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ATTACH_EXTENSIONS.map(ext => `.${ext}`).join(',')}
        multiple
        onChange={onFile}
      />
      {/* #2435.9 — capture caméra, input séparé : voir la note sur `cameraInputRef`. */}
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={onFile}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            disabled={disabled || ingest.isPending || ingestZip.isPending || extractFile.isPending}
            aria-label={t('composer.moreTools')}
          >
            <Plus className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {/* #1954.4 / #1954.5 / #1954.6 / #1954.9 — joindre un fichier, c'est CHOISIR
              où il sert, et chaque choix dit qui s'en sert et combien de temps il
              est gardé, AVANT l'envoi. Ce fil par défaut (Louis, 12/09/2026). */}
          <p className="px-2 pt-1.5 text-xs font-medium text-[var(--bellum-text-secondary)]">
            {t('composer.attachAria')}
          </p>
          <DropdownMenuItem
            onSelect={() => pickFile('conversation')}
            aria-labelledby={threadLabelId}
            aria-describedby={threadHintId}
            className="items-start gap-2 pointer-coarse:min-h-11"
          >
            <Paperclip className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
            <span className="flex min-w-0 flex-col">
              <span id={threadLabelId}>{t('composer.attachForConversation')}</span>
              <span id={threadHintId} className="text-xs text-[var(--bellum-text-muted)]">
                {t('composer.attachForConversationHint')}
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => pickFile('workspace')}
            aria-labelledby={baseLabelId}
            aria-describedby={baseHintId}
            className="items-start gap-2 pointer-coarse:min-h-11"
          >
            <BookOpen className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
            <span className="flex min-w-0 flex-col">
              <span id={baseLabelId}>{t('composer.attachToBase')}</span>
              <span id={baseHintId} className="text-xs text-[var(--bellum-text-muted)]">
                {t('composer.attachToBaseHint')}
              </span>
            </span>
          </DropdownMenuItem>
          {/* #2779 — « Mon espace personnel », « Ce compte uniquement » (dans un
              fil sur un compte), « Base de connaissance durable » : jamais un
              défaut, chacune un choix explicite. */}
          {attachScopesFor(accountId).map(scope => {
            const entry = EXTRA_ATTACH_SCOPE_MENU[scope]
            if (!entry) return null
            return (
              <DropdownMenuItem
                key={scope}
                onSelect={() => pickFile(scope)}
                aria-labelledby={`${extraScopeIdPrefix}-${scope}-label`}
                aria-describedby={`${extraScopeIdPrefix}-${scope}-hint`}
                className="items-start gap-2 pointer-coarse:min-h-11"
              >
                <BookOpen className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
                <span className="flex min-w-0 flex-col">
                  <span id={`${extraScopeIdPrefix}-${scope}-label`}>{t(entry.label)}</span>
                  <span id={`${extraScopeIdPrefix}-${scope}-hint`} className="text-xs text-[var(--bellum-text-muted)]">
                    {t(entry.hint)}
                  </span>
                </span>
              </DropdownMenuItem>
            )
          })}
          {/* #2435.9 — capture photo directe, mobile seulement (voir `cameraInputRef`). */}
          {isMobile ? (
            <DropdownMenuItem onSelect={pickCamera} className="items-start gap-2 pointer-coarse:min-h-11">
              <Camera className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
              {t('composer.attachCamera')}
            </DropdownMenuItem>
          ) : null}
          {/* #2431.5 — troisième mode, « Importer dans {{brand}} » : créer ou mettre à
              jour des FICHES, pas seulement indexer. Il mène aux chemins d'import
              DÉDIÉS (#2431.4) plutôt que d'ouvrir un pipeline de plus ici. */}
          <p className="px-2 pt-1.5 text-xs font-medium text-[var(--bellum-text-secondary)]">
            {t('composer.importMode')}
          </p>
          <DropdownMenuItem asChild className="items-start gap-2 pointer-coarse:min-h-11">
            <Link to="/consultants">
              <UserCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
              <span className="flex min-w-0 flex-col">
                <span>{t('composer.importCvs')}</span>
                <span className="text-xs text-[var(--bellum-text-muted)]">{t('composer.importCvsHint')}</span>
              </span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="items-start gap-2 pointer-coarse:min-h-11">
            <Link to="/settings/mes-donnees" search={{ tab: 'imports' }}>
              <Users className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
              <span className="flex min-w-0 flex-col">
                <span>{t('composer.importRecords')}</span>
                <span className="text-xs text-[var(--bellum-text-muted)]">{t('composer.importRecordsHint')}</span>
              </span>
            </Link>
          </DropdownMenuItem>
          {/* #1954.1 / #1954.2 / #1954.3 — ce qu'on peut joindre, dit AVANT le choix
              du fichier (la taille ne s'apprenait qu'au refus, le nombre jamais).
              Hors de l'entrée : son nom reste « Ajouter un fichier ». */}
          <p className="px-2 pb-1.5 text-xs text-[var(--bellum-text-muted)]">
            {t('attach.limits', {
              formats: new Intl.ListFormat(i18n.language, { type: 'disjunction' }).format(
                ATTACH_EXTENSIONS.map(ext => ext.toUpperCase()),
              ),
              maxMb: Math.round(ATTACH_MAX_BYTES / 1_000_000),
              max: ATTACH_MAX_COUNT,
            })}
          </p>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={mentionables.length === 0} className="gap-2">
              <AtSign className="size-3.5 text-[var(--bellum-text-muted)]" />
              {t('composer.mention')}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {mentionables.map(entry => (
                  <DropdownMenuItem key={entry.id} onSelect={() => onMention(entry)} className="gap-2">
                    <AtSign className="size-3.5 text-[var(--bellum-text-muted)]" />
                    {entry.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          {/* #3050 — SEULEMENT quand la rangée d'outils se tait sous 768 px (fil
              déjà commencé) : le catalogue reste atteignable, déplacé plutôt
              que supprimé (doctrine). `showHiddenComposerTools` garantit
              qu'un seul des deux jeux d'entrées (ligne d'outils, ou ce menu)
              est monté à la fois pour un fil donné — jamais les deux (GA-26). */}
          {/* Théo B l1-laura.R4 — « Exemples » vit dans le « + » à TOUTES les tailles (Louis 22/10) : le déclencheur propre est tu. */}
          {onOpenCommands ? (
            <DropdownMenuItem onSelect={() => onOpenCommands()} className="gap-2">
              <Sparkles className="size-3.5 text-[var(--bellum-text-muted)]" />
              {t('chatCommands:drawer.trigger')}
            </DropdownMenuItem>
          ) : null}
          {/* #3772.1 — « Contexte de travail » n'a plus d'entrée ici : il ne
              vit plus dans la ligne d'outils du composer (voir la note dans
              `Composer` ci-dessus), donc rien à reprendre dans ce menu non
              plus — il reste atteignable à toutes les tailles depuis le
              panneau Contexte de l'en-tête. */}
          {/* #5048 — « Mon profil » sous 768 px, fil commencé : repris ici, déplacé plutôt que supprimé. */}
          {showHiddenComposerTools ? <ComposerProfileMenu conversationId={conversationId} /> : null}
          {showHiddenComposerTools && toolSelection ? <ComposerToolsChecklist {...toolSelection} /> : null}
          {/* #2450.1 / #2448.1 (reste, épopée #2882) — même traitement mobile
              que les autres entrées ci-dessus : le sélecteur se tait sous
              768 px une fois le fil commencé, repris ici plutôt que supprimé
              (doctrine). */}
          {showHiddenComposerTools && conversationResearchMode ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <Search className="size-3.5 text-[var(--bellum-text-muted)]" />
                {t(`composer.researchMode.options.${conversationResearchMode.value}`)}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  {CHAT_RESEARCH_MODES.map(mode => (
                    <DropdownMenuItem
                      key={mode}
                      onSelect={() => conversationResearchMode.onChange(mode)}
                      className="gap-2"
                    >
                      <Search className="size-3.5 text-[var(--bellum-text-muted)]" />
                      {t(`composer.researchMode.options.${mode}`)}
                      {mode === conversationResearchMode.value ? ` · ${t('workContexts:mode.selected')}` : ''}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          ) : null}
          {/* #3050 / #3775.5b — sur /chat, à TOUTES les largeurs depuis #3775.5b,
              le bouton flottant de signalement (`FeedbackWidget`) se tait pour
              ne jamais recouvrir la saisie (`CHAT_SURFACE.composerFeedbackGutter`
              reste vide — le coin bas-droite partage toujours « Envoyer ») : le
              geste reste accessible d'ici, à toute étape du fil (vide ou non),
              bureau compris désormais. */}
          <DropdownMenuItem onSelect={() => requestReport({ message: '' })} className="gap-2">
            <Bug className="size-3.5 text-[var(--bellum-text-muted)]" />
            {t('feedback:trigger.ariaLabel')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

async function fileToIngestInput(
  file: File,
  scope: RagDocumentScope,
  conversationId: string | null,
  accountId: string | null,
): Promise<IngestInput> {
  // #1954.7 — la portée voyage TOUJOURS, explicite ; la clé du fil seulement pour
  // un document « pour cette conversation ». Sans fil, le serveur refuse — jamais
  // un repli silencieux vers la base de l'ESN. #2779 — le compte, seulement pour
  // un document « Ce compte uniquement » (le serveur le vérifie contre l'espace).
  const placement = ragScopePlacement(scope, { conversationId, accountId })
  const base = { title: file.name, category: CHAT_ATTACHMENT_CATEGORY, ...placement }
  const isText = /\.(txt|md|csv|json)$/i.test(file.name) || file.type.startsWith('text/')
  if (isText) {
    // #3803.2 — le nom voyage avec le texte, sinon l'original n'est pas conservé (grille CSV impossible).
    return { ...base, content: await file.text(), filename: file.name }
  }
  return { ...base, fileB64: await fileToBase64(file), filename: file.name }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // Strip the "data:<mime>;base64," prefix — the API wants raw base64.
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/**
 * Le visage de Laura à gauche de chacune de ses réponses — D137 (01/09/2026).
 *
 * C'était le logo Bellum, qui portait `role="img" aria-label="BellumAI"` en dur :
 * un lecteur d'écran annonçait donc « BellumAI » avant CHAQUE réponse — le
 * mauvais nom, cinquante fois par conversation.
 *
 * `named` tranche la règle « décoratif ou nommé, jamais à moitié » (GA-32) au
 * cas par cas, parce que la réponse dépend de ce qui est écrit à côté :
 *  - dans une bulle du fil, RIEN n'attribue le message → le visage le fait ;
 *  - dans l'en-tête et pendant la frappe, le nom est déjà là → il se tait.
 */
function AssistantAvatar({ named = false }: { named?: boolean }) {
  const { t } = useTranslation('chat')
  return named ? (
    <LauraFace size={32} name={t('messages.assistantName')} className="mt-1" />
  ) : (
    <LauraFace size={32} decorative className="mt-1" />
  )
}

function MessageTime({ align, date }: { align: 'left' | 'right'; date: Date }) {
  const { i18n } = useTranslation('chat')
  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]" className={align === 'right' ? 'text-right' : 'pl-1'}>
      {date.toLocaleTimeString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' })}
    </Text>
  )
}

/**
 * La source de la modale de portée : tous les comptes chargés, non coupés.
 *
 * Même projection que `buildSidebarAccounts` sans le `.slice(0, 20)` — la coupe
 * est une protection de RENDU (une liste de trois cents lignes dans un panneau),
 * pas une règle métier, et l'appliquer à une recherche la ferait mentir.
 */
function buildScopeAccountSource(accountsData: ReturnType<typeof useAccounts>['data']): SidebarAccount[] {
  return projectAccounts(accountsData?.pages.flatMap(page => page.data) ?? [])
}

function buildSidebarAccounts(accountsData: ReturnType<typeof useAccounts>['data']): SidebarAccount[] {
  return projectAccounts((accountsData?.pages.flatMap(page => page.data) ?? []).slice(0, 20))
}

/** Une ligne de `GET /accounts`, telle que la rend le hook paginé. */
type AccountRow = NonNullable<ReturnType<typeof useAccounts>['data']>['pages'][number]['data'][number]

function projectAccounts(rows: readonly AccountRow[]): SidebarAccount[] {
  return rows.map(account => ({
    id: account.id,
    company_name: account.company_name ?? null,
    priority_score: account.priority_score ?? null,
    // `GET /accounts` porte DÉJÀ ces deux champs (accountListItemSchema) : la
    // projection les jetait, d'où la pastille d'initiales du panneau contexte
    // alors que le reste de l'app montrait le vrai logo.
    logo_url: account.logo_url ?? null,
    website: account.website ?? null,
    status: account.status ?? null,
    commercial_status: account.commercial_status ?? null,
    last_analyzed_at: account.last_analyzed_at ?? null,
    signal_preview: account.signal_preview ?? null,
  }))
}

function conversationIdForAccount(accountId: string): string {
  return `account-${accountId}`
}

/** Les mêmes familles, scopées sur le compte actif. */
function promptsForAccount(
  companyName: string,
  t: TFunction<'chat'>,
  families: readonly ToolFamily[],
): ChatSuggestion[] {
  return promptsAvailable('account', 8, families).map(n => ({
    label: t(`prompts.account${n}.label`),
    prompt: t(`prompts.account${n}.prompt`, { company: companyName }),
  }))
}

/**
 * #1953.2 — la forme EXACTE que `laura-turn.ts` rejette quand le signal
 * qu'il transmet à `fetch` est aboli (voir `openChatStream`) : une
 * `AbortError`, jamais confondue avec un refus serveur ou une coupure
 * réseau — ceux-là gardent leur message dédié (`chatErrorMessage`).
 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function assistantMessage(content: string, context?: ChatResponseContext): ChatMessage {
  // #1998 — les cartes du tour remontent au même niveau que celles d'un fil relu :
  // le rendu n'a qu'un champ à lire, quelle que soit la porte par laquelle elles
  // sont arrivées. Clé OMISE quand il n'y en a pas — jamais un tableau vide, qui
  // se lirait comme « le serveur a dit : aucune carte ».
  const cards = context?.cards
  return { role: 'assistant', content, timestamp: new Date(), context, ...(cards?.length ? { cards } : {}) }
}

/**
 * Message persisté → message d'écran.
 *
 * #1914.14 — le `context` EST désormais stocké (liste blanche
 * `persistedChatContext`, colonne `chat_messages.context`) : une réponse relue
 * retrouve son panneau de transparence. Absent ou `null` — tout message écrit
 * avant ce lot, un message tapé, une réponse scriptée — la bulle se rend comme
 * elle l'a toujours fait, sans panneau.
 */
function toChatMessage(saved: {
  id?: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  author?: ChatMessageAuthor | null
  memory_uses?: number
  voice_object_id?: string | null
  cards?: CopilotCardWire[]
  context?: PersistedChatContext | null
  attachments?: { id: string; name: string }[] | null
  /** #2876 (#2433.4) — les images de conversation persistées avec ce message ;
   *  distinct d'`attachments` (rag_documents, cas b), fusionné avec lui à
   *  l'écran (`imageObjectId` marque celles qui sont des images). */
  image_attachments?: PersistedChatImage[] | null
  laura_job?: unknown
  envelope?: { artifacts?: Array<{ id: string; version: number; block: ReplyBlock }> }
}): ChatMessage {
  // #2876 (#2433.4) — une seule liste de pièces à l'écran : les documents
  // durables (`attachments`) et les images de conversation (`image_attachments`,
  // marquées `imageObjectId`) sont deux colonnes distinctes côté serveur pour
  // deux raisons distinctes (rag_documents vs storage_objects), mais une seule
  // puce par pièce jointe côté écran.
  const attachments = [
    ...(saved.attachments ?? []),
    // #2433.4 / #2433.12 (lot W8) — les zones lues et objets mesurés reviennent avec l'image.
    ...(saved.image_attachments ?? []).map(savedImageAsAttachment),
  ]
  // #1940.4 — le champ est TOUJOURS posé sur une bulle relue : une API antérieure
  // qui ne le sert pas donne `null`, jamais « la personne qui lit ».
  return withSavedReply(
    {
      role: saved.role,
      content: saved.content,
      timestamp: new Date(saved.created_at),
      author: saved.author ?? null,
      // #1914.14 — clé OMISE quand rien n'a été gardé : le rendu teste la
      // PRÉSENCE du contexte, et un objet vide lui ferait ouvrir un panneau vide.
      ...(saved.context ? { context: saved.context } : {}),
      // #2276.62 — le job de Laura de ce tour revient par SA porte (`laura_job`,
      // relu par l'API dans l'état où il en est), jamais par le contexte gardé.
      // Clé omise sans job : une API antérieure au champ n'en invente aucun.
      ...(saved.laura_job !== undefined && saved.laura_job !== null ? { lauraJob: saved.laura_job } : {}),
      // #2429.9 — seuls les artefacts MODIFIÉS (version ≥ 2) remplacent le texte du
      // message ; clé omise sinon (une API antérieure n'en sert aucune).
      ...artifactVersionsOf(saved.envelope),
      // #2494 / #2876 — clé OMISE sans pièce jointe : une API antérieure au
      // champ, ou un message tapé sans document ni image, ne montre alors
      // aucune puce.
      ...(attachments.length ? { attachments } : {}),
    },
    saved,
  )
}

/** #2429.9 — les artefacts modifiés d'une enveloppe, par adresse ; vide = aucune clé. */
function artifactVersionsOf(
  envelope: { artifacts?: Array<{ id: string; version: number; block: ReplyBlock }> } | undefined,
): {
  artifactVersions?: ArtifactVersionOverrides
} {
  const edited = (envelope?.artifacts ?? []).filter(artifact => artifact.version > 1)
  if (edited.length === 0) return {}
  return {
    artifactVersions: Object.fromEntries(
      edited.map(artifact => [artifact.id, { version: artifact.version, block: artifact.block }]),
    ),
  }
}

/**
 * #1916.24 — une bulle et sa réponse enregistrée : l'identifiant, et le compte de
 * mémoire consultée quand l'API le sert (ABSENT sinon — jamais « 0 » deviné).
 */
function withSavedReply(
  message: ChatMessage,
  saved: { id?: string; memory_uses?: number; voice_object_id?: string | null; cards?: CopilotCardWire[] },
): ChatMessage {
  return {
    ...message,
    // #1939 (9.3) — de quoi proposer « Réécouter » ; absent d'une API antérieure = aucune réécoute.
    ...(saved.id ? { id: saved.id } : {}),
    ...(typeof saved.memory_uses === 'number' ? { memoryUses: saved.memory_uses } : {}),
    // #1998 — les cartes du tour, avec l'état OÙ ELLES EN SONT au moment de la
    // relecture : c'est ce qui fait survivre un geste au rechargement de page.
    // Clé omise sans carte — une API antérieure au champ n'en invente aucune.
    ...(saved.cards?.length ? { cards: saved.cards } : {}),
    voiceObjectId: saved.voice_object_id ?? null,
  }
}

/**
 * Écrit un tour dans le fil — best-effort par CONTRAT : la promesse ne rejette
 * jamais. Sans cela, un échec d'écriture remonterait dans le `catch` de l'envoi
 * et afficherait une erreur de connexion alors que le copilote a bien répondu.
 * Rend le message enregistré, ou `null` quand l'écriture a échoué (#1916.24).
 *
 * #1942.4 — `isDemo` COURT-CIRCUITE avant tout appel réseau : le bandeau de
 * démonstration dit « aucune analyse réelle », et un espace de démo est
 * PARTAGÉ et LEASÉ (`DEMO_POOL_SIZE`, `DEMO_LEASE_TTL_MINUTES`) — une question
 * ou une réponse scriptée écrite dans le fil réel survivrait à la personne
 * suivante qui loue le même espace. Rendre `null` reproduit exactement le cas
 * « écriture échouée » déjà géré par tous les appelants (best-effort).
 */
/** #4967 (lot L6) — l'identifiant d'un tour, ou `null` là où `randomUUID` n'existe pas (le serveur en tire un). */
function newTurnId(): string | null {
  try {
    return crypto.randomUUID()
  } catch {
    return null
  }
}

async function persistTurn(args: {
  accountId: string | null
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  memoryTurnId?: string
  /** #1952.10 — le tour de la réponse, qui rattache les cartes d'Action OS. */
  turnId?: string
  /** #1939.13 — l'enregistrement d'une question dictée ; omis pour tout le reste. */
  voiceObjectId?: string
  /** #1953.11 / #1953.22 — la réponse dont celle-ci repart, et la nature de la branche. */
  branchOfMessageId?: string
  branchKind?: BranchKind
  /**
   * #1914.14 — le contexte du tour (panneau de transparence). Réduit à la liste
   * blanche avant de partir ; `null` quand il n'y en a pas, quand il est
   * illisible ou trop lourd — la clé est alors omise du corps.
   */
  context?: PersistedChatContext | null
  /**
   * #2494 — les documents ENVOYÉS avec ce message : c'est ce qui fait que le
   * nom de la pièce jointe survit à un rechargement du fil.
   */
  documentIds?: string[]
  /**
   * #2876 (#2433.4) — les images de CONVERSATION rangées côté serveur pour ce
   * message : c'est ce qui fait que la preuve visuelle survit à un
   * rechargement du fil, et reste lisible par un collègue de l'espace.
   */
  imageObjectIds?: string[]
  /** #2433.4 / #2433.12 (lot W8) — leurs zones lues et objets mesurés, pour la relecture du fil. */
  imageVision?: SentImageVision[]
  /** #1942.4 — espace de démonstration : aucune écriture, jamais. */
  isDemo?: boolean
}): Promise<Awaited<ReturnType<typeof createAgentChatMessage>> | null> {
  // `isDemo` pilote CETTE fonction ; elle ne voyage jamais jusqu'à l'API
  // (le DTO serveur ne la connaît pas, et une clé en trop n'a rien à y faire).
  const { isDemo, ...rest } = args
  if (isDemo) return null
  try {
    // #1939 (9.3) — le message tel que le serveur l'a ÉCRIT : son id, et
    // l'enregistrement qu'il a accepté de rattacher. `null` sur un échec.
    return (await createAgentChatMessage(rest)) ?? null
  } catch (error) {
    console.error('[Chat persist]', error)
    return null
  }
}

/** Théo L1 — la valeur de `?scope=` pour une portée : un dossier précis, sinon `''`. */
function scopeParamOf(scope: ChatScope | null): string {
  const object = scope ? scopeObjectOf(scope) : null
  return object ? chatScopeObjectParam(object) : ''
}

/** Ce que l'effet de suivi d'URL compare : compte, fil, et (Théo L1) dossier précis. */
function urlKeyOf(accountId: string | null, conversationId: string | null, scopeKey: string): string {
  return `${accountId ?? ''}|${conversationId ?? ''}|${scopeKey}`
}

function searchParamsFromRecord(search: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }
  return params
}
