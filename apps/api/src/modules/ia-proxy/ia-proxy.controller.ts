import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { abortOnClientClose } from './client-abort'
import { ConfigService } from '@nestjs/config'
// #1943 L3 — le contrôleur ORCHESTRE la conversation et les cartes (un geste
// d'utilisateur, la porte que GA-07 nomme) : import de VALEUR, jeton d'injection.
import { CopilotCardService, type CardView } from '../action-os/copilot-card.service'
import { LauraJobService } from '../action-os/laura-job.service'
import { ProviderCostService } from '../analytics/provider-cost.service'
import { ChatTurnCostEstimateService } from '../analytics/chat-turn-cost-estimate.service'
import { ChatTurnRegistry } from '../chat-turns/chat-turn-registry'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import {
  CHAT_VOICE_MESSAGE_MAX_BYTES,
  CHAT_VOICE_MESSAGE_MAX_SECONDS,
  LAURA_REPLY_COST_CEILING_CREDITS,
  STORED_VOICE_FILE_TYPES,
  buildRequestIntentContract,
  buildTriggerEvent,
  triggerPeriodQualifier,
  can,
  chatVoiceDurationRefused,
  chatVoiceUncertainSegments,
  commandAvailability,
  localDayKey,
  portfolioScopeFor,
  renderLauraPageContext,
  requestIntentContractForLog,
  sniffChatVoiceContainer,
  type ChatScopeObject,
  CHAT_QUOTA_REACHED_CODE,
  type ChatQuotaStatus,
  // #2429.2 / #2429.4 / #2429.9 — la vue additive des briques déjà servies (jamais un second canal).
  buildChatReplyEnvelope,
  type ChatArtifactLatestVersion,
  type ChatReplyEnvelope,
  type PersistedChatContext,
  type ChatVoiceStatus,
  type ChatVoiceTranscription,
  type ContextMode,
  contextModeExcludes,
  DEFAULT_LAURA_CONTEXT_MODE,
  resolveByPrecedence,
  type DiscoverCommonBaseCandidate,
  type DiscoverResponse,
  computeDiscoverSourceAxes,
  type LauraJobView,
  type MarketPortfolioRead,
  type MessageStyleTemplate,
  messageStyleThreadKey,
  type SignedDownload,
  type WorkspacePermission,
  type WorkspaceRole,
  workspacePermissionValues,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { discoverBaseCriteria } from './base-matches-source'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { DEMO_DISCOVER_OWNED_CANDIDATE_NAMES, demoDiscoverResponse } from '../demo/demo-scripts'
import { demoSkillSearchResponse } from '../demo/demo-discover-skill'
import { withDemoWidening } from '../demo/demo-criteria-widening'
import { withDemoCommonBase } from '../demo/demo-discover-common-base'
import { withDemoSignalNeighbour } from '../demo/demo-discover-widening'
import { evalMayReadMessageBody } from '../chat-eval-sampling/eval-message-body-access'
import { withRegistrySignals } from './discover-registry-signals'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { PlanFeaturesService } from '../plan-features/plan-features.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { RequireFeature, RequireOpenTrial } from '../plan-features/require-feature.decorator'
import { AccountsService } from '../accounts/accounts.service'
import { ConsultantsService } from '../consultants/consultants.service'
// #1951.1 — la lecture d'une fiche de contact, cloisonnée à l'espace actif.
import { ContactsService } from '../contacts/contacts.service'
// #1951.4 — la lecture d'une opportunité du pipe, cloisonnée à l'espace actif.
import { ProjectsService } from '../projects/projects.service'
import { DeliveryService } from '../delivery/delivery.service'
import { OpenNeedsService } from '../projects/open-needs.service'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { DiscoverMarketMemoryService } from './discover-market-memory.service'
import { withNeedFilters } from './discover-space-past-needs'
import { DiscoverSourcesService } from './discover-sources.service'
import { DiscoverCandidateFeedbackService } from '../discover-feedback/discover-candidate-feedback.service'
import { MemoryReplyUsesService } from '../memory/memory-reply-uses.service'
import { ReplyFeedbackService } from '../account-feedback/reply-feedback.service'
import { parseThreadState } from '../memory/memory.service'
import { marketPortfolioLookups } from '../market-memory/portfolio-lookups'
import { LauraUnroutedIntentsService } from '../laura-unrouted-intents/laura-unrouted-intents.service'
import { composeMessageStylePreviewContext, MessageStyleService } from '../message-style/message-style.service'
// #3757 (reste) — SIREN déclarés partenaires par CET espace (`partner_relations`),
// injecté `@Optional()` ici, jamais dans un service (GA-07 est au plafond).
import { PartnerPipelineService } from '../partner-pipeline/partner-pipeline.service'
import {
  languageOf,
  readUnroutedSignal,
  surfaceOf,
  withoutUnroutedSignal,
} from '../laura-unrouted-intents/unrouted-intent'
import { IA_COST_HEADER, IaClient, type ChatStreamEvent, type IaEnvelope } from '../ia/ia.client'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'
import { NotificationsService } from '../notifications/notifications.service'
import { resolveChatMentions } from './chat-mentions'
import { markRestrictedSources, restrictedToolFamilies } from './chat-restricted-sources'
import { chatNotificationLink } from './chat-notification-link'
import { buildMarkdownDocument, safeFileName } from '../documents/document-builders'
import { buildPdfDocument } from '../documents/pdf-builder'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceLauraModeService } from '../workspace/workspace-laura-mode.service'
import { TriggerRegistryService } from '../trigger-registry/trigger-registry.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ToolRegistryService } from '../tool-registry/tool-registry.service'
import { connectedFamiliesOf, resolveToolExclusions } from './tool-exclusions'
import { machineReplyText } from '../../common/reply-plain-text'
import { StorageService } from '../storage/storage.service'
import {
  EmptyTranscriptionError,
  readTranscriptionConfig,
  transcribeAudioDetailed,
} from '../transcription/transcription.client'
import { readVoxtralConfig, transcribeWithVoxtral } from '../transcription/voxtral.client'
import { detectSegmentLanguage, transcriptionCostRow } from '../transcription/segment-language'
import { voiceRefinementStatus } from '../transcription/voice-refinement'
import { ChatContextService } from './chat-context.service'
import { ChatConversationsService } from './chat-conversations.service'
import { jobOfferReadFrom, renderChatScopeObject } from './chat-scope-object'
import { COMMAND_CATALOG } from './command-catalog'
import { ChatArtifactVersionsService } from './chat-artifact-versions.service'
import { ChatEvalSamplingService } from '../chat-eval-sampling/chat-eval-sampling.service'
import { ChatMessagesService } from './chat-messages.service'
import { runDeepenResumeTurn, type DeepenResumeTarget } from './chat-deepen-resume-turn'
import { ChatThreadDocumentsService } from './chat-thread-documents.service'
import { ChatTurnClock } from './chat-turn-trace'
import { deriveChatTurnCostUsd, extractChatTier } from './chat-turn-cost'
import { getCorrelationContext } from '../../correlation-id/correlation-id.store'
import { chatThreadExportSections, formatExportTimestamp, type ChatThreadExportLanguage } from './chat-thread-export'
import { ChatThreadExportService } from './chat-thread-export.service'
import {
  QUOTA_WINDOW_MS,
  askedForPrecision,
  chatDailyLimitOfPlan,
  countableMessages,
  effectiveChatDailyLimit,
  isChatQuotaExempt,
  isChatQuotaLow,
  quotaReopensAt,
} from './chat-quota'
import { ChatThreadTitlesService } from './chat-thread-titles.service'
import { DiscoverPortfolioService } from './discover-portfolio.service'
import { classifyDiscoverFailure } from './discover-failure'
import { timedDiscoverSource } from './discover-source-timing'
import { classifyIcebreakerFailure } from './icebreaker-failure'
import { classifyMessageFailure, messageFailureLogLevel } from './message-failure'
import {
  AssignPendingActionDto,
  BattlecardDto,
  ChatDto,
  CompareDto,
  CreateChatMessageDto,
  DiscoverDto,
  DiscoverRegistryDto,
  DiscoverSignalsDto,
  GenerateMessageDto,
  IcebreakerDto,
  ArchiveChatThreadDto,
  ChatThreadTargetDto,
  ListChatHistoryDto,
  SearchChatThreadsDto,
  ListChatMessagesDto,
  RenameChatThreadDto,
  SearchEntityExtractDto,
  TranscribeChatVoiceDto,
} from './dto/ia-proxy.dto'
import { DataExit } from '../workspace/data-exit.decorator'
import { SignalHistoryService } from '../signal-history/signal-history.service'

/**
 * Métrage de Découvrir. L'écran est GRATUIT au sens du contrat (« découvrir ne
 * consomme ni slot d'analyse ni crédit d'enrichissement ») — seul le LANCEMENT
 * d'une analyse coûte, et c'est un acte explicite. Gratuit ne veut pas dire sans
 * coût pour nous : chaque run paie des appels registre et UN appel Claude.
 * Or seul le throttler global s'appliquait, soit 60 runs/minute par utilisateur
 * authentifié, à volonté.
 *
 * 10/min laisse largement place à l'exploration réelle (affiner ses critères,
 * relancer, comparer) tout en fermant la boucle automatisée. Aligné sur les
 * autres routes coûteuses (auth 10/min, privacy 5/min) et posé sur le throttler
 * nommé `default-1m` — la clé DOIT correspondre à un throttler configuré dans
 * `app.module.ts`, sinon l'override est silencieusement ignoré.
 */
const DISCOVER_RATE_LIMIT = { 'default-1m': { limit: 10, ttl: 60_000 } }

/** Registre + une passe Claude : un retry triple la dépense LLM pour rien, et
 *  le timeout par défaut (30 s) peut couper un run un peu lent. Même discipline
 *  que la route discover v1 juste au-dessus. */
// #4517.2 (Louis 31/10) — 60 s : revient sur les 45 s (#4517.13) ; le budget IA monte à ~55 s pour un volume de 100
// (#4673.2, #4419.1), toujours UN seul chargement — 5 s de marge pour le transport.
const DISCOVER_CALL_OPTS = { maxAttempts: 1, timeoutMs: 60_000 }

/** #4796 — le mode Signaux est UN run long (arbitrage du 28/10/2026 : « 2 min+, rien en arrière-plan »).
 *  Le budget côté IA est `HARVEST_BUDGET_S` (90 s) + `RESOLUTION_BUDGET_S` (25 s) = 115 s, plus le scoring ;
 *  couper à 45 s jetterait la pagination que l'IA vient de payer. 125 s : la marge au-dessus des 115 s. */
const DISCOVER_SIGNALS_CALL_OPTS = { maxAttempts: 1, timeoutMs: 125_000 }

/**
 * Le garde-fou de débit des actions « incluses » (BEL-FIX-006, dossier du 26/08).
 *
 * `credit-weights.ts` distingue deux zéros et le dit en toutes lettres : les
 * actions qui ne coûtent RIEN à produire (un rapprochement déterministe, une
 * photo d'open data) et celles qui coûtent un appel de modèle mais qu'on refuse
 * de facturer — « facturer au crédit ce qu'on veut voir utilisé serait un
 * contresens produit ». Pour ces dernières, il promet « un plafond quotidien
 * sur le copilote, un garde-fou de débit sur les messages ».
 *
 * Le premier existait. **Le second n'existait pas** : la génération de message
 * et l'icebreaker sont deux appels Claude par clic, sans aucune borne autre que
 * le throttler global — 120 requêtes par minute, c'est-à-dire deux appels de
 * modèle par seconde et par siège, indéfiniment. C'est la définition d'une
 * dérive silencieuse : elle ne casse rien, elle se lit sur la facture.
 *
 * Vingt par minute, pas dix : la génération est le geste qu'on répète en
 * ajustant son angle, et un commercial qui reformule trois fois de suite ne
 * doit jamais rencontrer la borne. Elle n'existe que pour la boucle.
 *
 * ⚠️ La clé DOIT être `default-1m` — le nom du throttler déclaré dans
 * `app.module.ts`. Une clé inconnue est silencieusement ignorée, et la route
 * reste sans borne en croyant en avoir une.
 */
const LLM_DRAFT_RATE_LIMIT = { 'default-1m': { limit: 20, ttl: 60_000 } }

/**
 * #1939 — le débit de la transcription d'un message vocal : dix par minute.
 *
 * Chaque appel est une transcription PAYÉE, et elle n'est pas comptée par le
 * plafond quotidien tant que le texte n'est pas ENVOYÉ (le plafond compte des
 * messages, pas des essais — pas de second compteur, défaut retenu le 12/09).
 * Dix par minute laisse largement place à « je recommence, j'ai bafouillé » et
 * ferme la boucle automatisée. ⚠️ Même clé `default-1m` que les voisines : une
 * clé inconnue est ignorée en silence.
 */
const VOICE_TRANSCRIBE_RATE_LIMIT = { 'default-1m': { limit: 10, ttl: 60_000 } }

/**
 * #2434.34 / #2434.35 / #2434.36 / #2434.37 / #2434.38 — LE BIAIS DE
 * VOCABULAIRE DU MESSAGE VOCAL DE LAURA.
 *
 * `transcription.client.ts` reste NEUTRE (aucun jargon métier — voir son
 * commentaire « le déplacement ») : c'est ICI, côté appelant, que le domaine
 * ESN se compose. Le `prompt` du contrat OpenAI ne force rien — il oriente le
 * vocabulaire et le STYLE de sortie : un jargon métier absent du corpus
 * d'entraînement général (TJM, ESN, CRA…), des acronymes fréquents dans une
 * ESN, et deux exemples de mise en forme (nombres en chiffres, date au format
 * français) pour que le style de sortie penche du bon côté.
 *
 * ⚠️ Ce que ceci NE garantit PAS À LUI SEUL : un prompt statique ne connaît
 * aucun NOM PROPRE précis (un contact, une société). #2434.33 complète ce
 * biais fixe par un second, VARIABLE — le dossier ouvert au moment de la
 * dictée, injecté par {@link IaProxyController.voiceTranscriptionPrompt}
 * quand `accountId` est fourni. Un biais de vocabulaire ne se mesure pas
 * en CI (service externe) : c'est `transcription.client.spec.ts` et
 * `chat-voice.controller.spec.ts` qui vérifient que la valeur PART, pas que
 * la transcription s'améliore.
 */
const CHAT_VOICE_TRANSCRIPTION_PROMPT =
  'Vocabulaire fréquent en ESN (entreprise de services du numérique) : TJM, CRA, staffing, ' +
  "avenant, BPU, appel d'offres, cabinet de recrutement, DSI, RSSI, sourcing, freelance, SIRET, SIREN. " +
  'Écris les nombres en chiffres (par exemple : 450 euros), les dates au format JJ/MM/AAAA, ' +
  'et les adresses e-mail sans espace (par exemple : jean.dupont@exemple.fr).'

/**
 * #2434.33 — au-delà, la liste de noms n'oriente plus, elle noie le prompt.
 * Six contacts couvre largement un organigramme typique montré à l'écran ;
 * plus, et le vocabulaire ESN ci-dessus perdrait sa part du budget de tokens.
 */
const ACCOUNT_NAME_HINT_CONTACT_LIMIT = 6

/**
 * Budget d'un tour de copilote.
 *
 * Vivait ici (`maxAttempts: 1, timeoutMs: 120_000`) tant que `/ia/chat`
 * appelait `IaClient.chat()`. LOT STREAM (12/09/2026) : la route appelle
 * `IaClient.chatStream()`, dont `streamSse` n'a ni tentative (« un flux à
 * moitié consommé ne se rejoue pas ») ni `timeoutMs` — le budget est donc
 * porté PAR `chatStream()` elle-même (`CHAT_CALLER_BUDGET_MS`, un
 * `AbortSignal.timeout`), au même endroit que la construction du corps de
 * requête. Un réglage vit à un seul endroit : le dupliquer ici l'aurait
 * rendu réglable depuis deux points qui auraient fini par diverger.
 */

/**
 * JWT-authenticated proxy for the browser-facing IA routers (discover, chat).
 * The SPA used to call the IA host directly (VITE_IA_URL), leaving those metered
 * endpoints open and — for chat — trusting a body-supplied user_id. Here the
 * user is authenticated and `userId` comes from the token; IaClient forwards the
 * internal secret so the IA side can require it.
 */
@Controller('ia')
// Le guard de features ne ferme QUE les routes annotées `@RequireFeature` :
// le copilote (`chat_ai`) et Découvrir (`discover`). L'icebreaker, le
// battlecard ou la comparaison restent ouverts à tous les paliers — ils
// prolongent un dossier déjà payé en crédits.
// `WorkspacePermissionGuard` monté le 29/08/2026 : les deux routes d'archivage
// et de suppression d'un fil déclaraient `records:write` sans que personne ne
// le lise — un siège `viewer` supprimait un fil de conversation. Un palier
// n'est pas une permission : `PlanFeatureGuard` répond « cet espace y a-t-il
// droit ? », jamais « ce membre-là y a-t-il droit ? ». GA-05 bis tient la paire.
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class IaProxyController {
  private readonly logger = new Logger(IaProxyController.name)

  constructor(
    private readonly ia: IaClient,
    private readonly chatMessages: ChatMessagesService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly esnProfile: EsnProfileReader,
    private readonly chatContext: ChatContextService,
    private readonly portfolio: DiscoverPortfolioService,
    private readonly config: ConfigService,
    private readonly toolRegistry: ToolRegistryService,
    // #1954 — les documents « fil seul » vivent et meurent avec leur fil.
    // OBLIGATOIRE : optionnelle, une suppression de fil laissait ses documents
    // sans qu'aucun test le voie. Placée avant les dépendances `@Optional()` —
    // un paramètre requis ne peut pas les suivre.
    private readonly threadDocuments: ChatThreadDocumentsService,
    // D19 — optionnel : sans le module analytics, le chat marche pareil, il
    // n'est simplement pas mesuré.
    @Optional() private readonly providerCosts?: ProviderCostService,
    // #1581.1 — la couverture mémoire marché du portefeuille, lue ICI et non
    // dans `ChatContextService`. Deux raisons, et la première n'est pas un
    // arrangement : un tour de chat est un GESTE D'UTILISATEUR, donc son
    // orchestration appartient au contrôleur (c'est l'issue même de GA-07, qui a
    // déjà renvoyé deux lots du service au contrôleur — `coverage.controller.ts`
    // et `companies.controller.ts` le documentent). Et `@Optional()` parce que le
    // chat doit marcher sans le module de mémoire monté : absent, le bloc
    // n'apparaît pas, il ne se rend pas « à zéro ».
    @Optional() private readonly marketMemory?: MarketMemoryService,
    @Optional() private readonly accountsService?: AccountsService,
    // #1911.1 / #1911.12 — le titre des fils. Toujours fourni par
    // `IaProxyModule` ; `@Optional()` et en fin de liste parce que cinq suites
    // construisent ce contrôleur par position — un paramètre inséré au milieu les
    // décalerait en silence. Absent, la liste garde les premiers messages et le
    // renommage répond 503 plutôt qu'un succès qui n'a rien écrit.
    @Optional() private readonly threadTitles?: ChatThreadTitlesService,
    // #1960.20 — la marque de l'espace, lue ICI (geste d'utilisateur, GA-07),
    // APRÈS `threadTitles` : les specs qui construisent ce contrôleur par
    // position gardent leur ordre. Absent = marque du produit.
    @Optional() private readonly brands?: WorkspaceBrandService,
    // #1943 L3 — les cartes de Laura (Action OS). APRÈS le titre des fils et la
    // marque de l'espace, AVANT les lecteurs de portée objet ajoutés par la
    // fusion (des specs construisent ce contrôleur par position, elles ont été
    // décalées d'autant) et `@Optional()` : sans le module, le chat marche à
    // l'identique et le `done` reste celui du service IA.
    @Optional() private readonly cards?: CopilotCardService,
    // #1951.2 / #1951.3 — les deux lecteurs de la portée « objet », lus ICI
    // (geste d'utilisateur, GA-07) et EN DERNIER : les specs qui construisent ce
    // contrôleur par position gardent leur ordre. Absents = la fiche demandée se
    // dit « illisible » à Laura, jamais un fil qui lit le portefeuille en silence.
    @Optional() private readonly consultants?: ConsultantsService,
    @Optional() private readonly openNeeds?: OpenNeedsService,
    // Décision Louis 13/09 batch 13 — plafond selon le plan : le palier de
    // l'espace. Toujours fourni par `IaProxyModule`, qui importe déjà
    // `PlanFeaturesModule` pour la porte `chat_ai` ; `@Optional()` et EN
    // DERNIER pour la même raison que `threadTitles`. Absent, le plafond est
    // celui de l'opérateur — jamais 0, jamais l'illimité.
    @Optional() private readonly planFeatures?: PlanFeaturesService,
    // #1916.24 — la trace des éléments de mémoire envoyés à Laura, réponse par
    // réponse. Lue ICI (un tour est un geste d'utilisateur, GA-07), EN DERNIER
    // pour les suites qui construisent ce contrôleur par position. Absente : le
    // chat répond comme avant, sans trace et sans en promettre une.
    @Optional() private readonly replyMemoryUses?: MemoryReplyUsesService,
    // #1919.15 — les retours de la personne sur les réponses de Laura, lus ICI
    // pour la même raison que la mémoire marché plus haut (GA-07 : un geste
    // d'utilisateur s'orchestre au contrôleur). Absent = aucun bloc. EN DERNIER,
    // après `threadTitles` et `brands` : ne décaler aucune suite qui construit ce
    // contrôleur par position.
    @Optional() private readonly replyFeedback?: ReplyFeedbackService,
    // #1949.23 — décision Louis 13/09 batch 12 : la trace anonyme d'une demande
    // que Laura n'a pas su router. APRÈS les retours (#1919.15) à la refusion du
    // 13/09, pour la même raison que les précédents. Absent = le chat répond à
    // l'identique, sans trace.
    @Optional() private readonly unroutedIntents?: LauraUnroutedIntentsService,
    // #1939 — le message vocal range son enregistrement dans le stockage privé.
    // EN FIN et `@Optional()` : un optionnel
    // inséré au milieu décalerait les specs qui construisent ce contrôleur par
    // position. Sans le module, la capacité se déclare ABSENTE — elle ne fait pas
    // tomber le chat.
    @Optional() private readonly storage?: StorageService,
    // #1910.6 — la portée « une mission ». EN FIN et `@Optional()` pour la même
    // raison que les précédents : un optionnel inséré au milieu décalerait les
    // specs qui construisent ce contrôleur par position. Sans le module, la
    // portée se déclare « illisible pour ce tour » — jamais un fil sans cadre.
    @Optional() private readonly missions?: DeliveryService,
    // #1955.7 — l'export d'un fil (.md/.pdf/.json). EN FIN et `@Optional()` pour
    // la même raison que les précédents : un optionnel inséré au milieu
    // décalerait les specs qui construisent ce contrôleur par position. Sans le
    // service, les trois routes d'export répondent 503 — jamais un fichier à
    // moitié composé.
    @Optional() private readonly threadExport?: ChatThreadExportService,
    // #1951.1 — la portée « une personne ». EN FIN et `@Optional()` pour la même
    // raison que les précédents : un optionnel inséré au milieu décalerait les
    // specs qui construisent ce contrôleur par position. Sans le module, la
    // portée se déclare « illisible pour ce tour » — jamais un fil qui lit le
    // compte entier en silence à la place de la fiche demandée.
    @Optional() private readonly contacts?: ContactsService,
    // #1951.4 — la portée « une opportunité ». EN FIN et `@Optional()` pour la
    // même raison que les précédents. Absent = la fiche se dit « illisible ».
    @Optional() private readonly projects?: ProjectsService,
    // #1918.2 — « de quelles équipes cette personne est-elle MEMBRE », pour que
    // la mémoire d'un périmètre entre dans le contexte de Laura de qui le porte.
    // Lu ICI et non dans `ChatContextService` : un service ne va pas chercher le
    // service d'un autre module (GA-07), et un tour de chat est un geste
    // d'utilisateur, donc son orchestration appartient au contrôleur — la même
    // raison que la mémoire marché. EN FIN et `@Optional()` : absent, aucune
    // mémoire d'équipe n'entre dans le prompt (repli FERMÉ).
    @Optional() private readonly businessUnits?: BusinessUnitService,
    // #2165.28 / #2165.30 — les filtres serveur « technologies observées » et
    // « recours externe observé » de Découvrir. EN FIN et `@Optional()` pour
    // la même raison que les précédents : un optionnel inséré au milieu
    // décalerait les specs qui construisent ce contrôleur par position. Sans
    // le service, les deux filtres sont des no-op — les candidats du
    // registre/signal restent inchangés (jamais une liste vide en silence).
    @Optional() private readonly discoverMarketMemory?: DiscoverMarketMemoryService,
    // #1940.1 — un collègue mentionné (`@Prénom`) dans le fil est prévenu. EN
    // FIN et `@Optional()` pour la même raison que les précédents : un geste
    // d'utilisateur (écrire un message) s'orchestre au contrôleur (GA-07),
    // jamais dans un service qui irait chercher celui d'un autre module. Sans
    // le module notifications, `appendMention` insère toujours le texte —
    // seul l'avertissement au collègue ne part pas.
    @Optional() private readonly notifications?: NotificationsService,
    // #2430 — l'objet conversation : le propriétaire DÉCLARÉ et la conservation
    // légale décident du retrait d'un fil, une version figée borne sa lecture,
    // le fil d'origine d'une branche entre dans le contexte. EN FIN et
    // `@Optional()` pour la même raison que les précédents (specs positionnelles) ;
    // fourni par ce module-ci (`IaProxyModule.providers`), donc présent en service.
    @Optional() private readonly conversations?: ChatConversationsService,
    // #2276 — le job composite de Laura. EN FIN et `@Optional()` pour la même
    // raison que les précédents (specs positionnelles) ; fourni par
    // `ActionOsModule` (importé par `IaProxyModule`), donc présent en service —
    // la garde `ia-proxy.module` le vérifie. Absent : la fiche brute est retirée
    // du `done`, jamais relayée.
    @Optional() private readonly lauraJobs?: LauraJobService,
    // #2451.1 — le mode de contexte par défaut de l'ESPACE, appliqué par
    // Découvrir quand l'appel n'en porte aucun. EN FIN et `@Optional()` pour la
    // même raison que les précédents (specs positionnelles) ; exporté par
    // `WorkspaceModule`, importé par ce module — donc présent en service.
    @Optional() private readonly lauraMode?: WorkspaceLauraModeService,
    // #2875/#2402.1 (vague F/G 27/09) — le registre canonique des déclencheurs
    // commerciaux : `discoverSignals` y persiste `ao_publie` pour chaque
    // candidat déjà POSSÉDÉ (compte suivi) qui porte un signal BOAMP. EN FIN
    // et `@Optional()` pour la même raison que les précédents (specs
    // positionnelles) ; fourni par `TriggerRegistryModule`.
    @Optional() private readonly triggers?: TriggerRegistryService,
    // #2204.59-.65 (épopée #2947) — le style de message `active` choisi dans le
    // composer, résolu ICI (geste d'utilisateur, GA-07) pour qu'il atteigne la
    // génération RÉELLE (jusqu'ici seule la sauvegarde l'estampillait,
    // `resolveAppliedStyle` de `outreach-message.service.ts`). EN FIN et
    // `@Optional()` pour la même raison que les précédents (specs
    // positionnelles) ; fourni par `MessageStyleModule`, importé par ce module.
    @Optional() private readonly messageStyle?: MessageStyleService,
    // #2448.8 / #2882.11 (épopée #2882) — coût et durée RÉELS d'un tour, par
    // PALIER, pour que `ResearchModeSelector` estime « avant le run » sans
    // deviner. EN FIN et `@Optional()` pour la même raison que les précédents
    // (specs positionnelles) ; fourni par `AnalyticsModule` (`@Global()`).
    // Absent = aucune mesure écrite, `chat()` répond à l'identique.
    @Optional() private readonly chatTurnCosts?: ChatTurnCostEstimateService,
    // #2429.9 (épopée #2852, lot P07) — la version la plus récente de chaque
    // artefact modifié, lue avec le fil. EN FIN et `@Optional()` (specs
    // positionnelles) : absent, tout artefact se lit en version 1.
    @Optional() private readonly artifactVersions?: ChatArtifactVersionsService,
    // #3757 (reste) — les SIREN que CET espace a déclarés partenaires
    // (`partner_relations`), pour que Découvrir nomme « Partenaire déclaré »
    // au lieu d'une ESN concurrente supposée. EN FIN et `@Optional()` pour la
    // même raison que les précédents (specs positionnelles) ; fourni par
    // `PartnerPipelineModule`. Absent = `discoverSignals` envoie une liste
    // vide, comportement inchangé.
    @Optional() private readonly partnerPipeline?: PartnerPipelineService,
    // #3671.2bis — les SIREN qu'un espace a déclarés « Mauvaise entreprise »
    // sur une carte Découvrir : exclus des recherches suivantes. EN FIN et
    // `@Optional()` pour la même raison que les précédents (specs
    // positionnelles) ; fourni par `DiscoverFeedbackModule`, importé par ce
    // module. Absent : aucun SIREN n'est exclu (comportement d'avant cette
    // capacité).
    @Optional() private readonly discoverFeedback?: DiscoverCandidateFeedbackService,
    // #2899 / #2443.10 — l'échantillonnage opt-in des tours de l'utilisateur pour les évals,
    // anonymisé avant stockage. EN FIN et `@Optional()` pour la même raison que les précédents
    // (specs positionnelles) ; fourni par `ChatEvalSamplingModule`. Absent : aucun échantillon,
    // le chat répond à l'identique.
    @Optional() private readonly evalSampling?: ChatEvalSamplingService,
    // #4067 — ce que l'espace sait déjà d'un candidat Découvrir (historique,
    // CRM, Drive, missions, référentiel) : EN FIN et `@Optional()` pour la
    // même raison que les précédents. Absent : aucun axe, classement d'avant.
    @Optional() private readonly discoverSources?: DiscoverSourcesService,
    // Théo L1 — sélecteur avancé — la portée « une offre d'emploi » : la ligne
    // d'historique de recrutement, relue bornée à l'espace. EN FIN et
    // `@Optional()` pour la même raison que les précédents (specs
    // positionnelles) ; fourni par `SignalHistoryModule`. Absent : la portée se
    // dit « illisible », jamais un fil sans cadre.
    @Optional() private readonly signalHistory?: SignalHistoryService,
    // #4967 (lot L6) — les tours en arrière-plan, pour « Arrêter » sans la connexion d'origine.
    @Optional() private readonly turnRegistry?: ChatTurnRegistry,
  ) {}

  /**
   * #1918.2 — les périmètres PORTÉS par l'appelant, ou rien. Une lecture ratée
   * ne fait pas tomber le tour : elle rend une liste vide, donc aucune mémoire
   * d'équipe — « je n'ai pas pu lire » se répare en ne montrant pas, jamais en
   * montrant tout.
   */
  private async perimetersOf(workspaceId: string, userId: string): Promise<string[]> {
    if (!this.businessUnits) return []
    try {
      return await this.businessUnits.perimetersOf(workspaceId, userId)
    } catch {
      return []
    }
  }

  /**
   * #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — LES FICHES des BU
   * portées, pour le contexte de BU envoyé à Laura (DÉCISION Louis 17/09
   * après-midi). Même discipline que {@link perimetersOf} juste au-dessus :
   * une lecture ratée ne fait pas tomber le tour, elle rend `[]` — aucun
   * contexte de BU plutôt qu'un tour cassé.
   */
  private async businessUnitDetailsOf(workspaceId: string, ids: readonly string[]) {
    if (!this.businessUnits || !ids.length) return []
    try {
      return await this.businessUnits.findByIds(workspaceId, ids)
    } catch {
      return []
    }
  }

  /** Un geste HTTP authentifié est, par définition, un geste d'UTILISATEUR (D9). */
  private principalOf(user: CurrentUserPayload): { userId: string; email: string; origin: 'user' } {
    return { userId: user.userId, email: user.email, origin: 'user' }
  }

  /**
   * #1943.1 — les cartes d'UN tour, persistées AVANT que le `done` ne parte.
   *
   * Le `done` garde `context.pending_actions` INTACT — les onglets ouverts avant
   * le déploiement ne lisent que lui — et y AJOUTE `turn_id` (le tour, que le
   * navigateur renvoie en persistant ses messages) et `context.cards` (chaque
   * carte avec son identité, son état et ses gestes permis).
   *
   * Ce qui arrive du service IA est une sortie de modèle : la validation, la
   * coupe à 3 et l'idempotence vivent dans `CopilotCardService.proposeTurn`. Ici,
   * seulement l'orchestration — et un journal CHIFFRÉ (combien, jamais quoi).
   *
   * Une panne des cartes ne fait jamais tomber le tour : le `done` part sans elles.
   */
  private async withTurnCards(
    received: { success: boolean; data: Record<string, unknown> },
    turn: {
      user: CurrentUserPayload
      conversationId: string | null
      turnId: string
      signal: AbortSignal
      /** Le début du tour, AVANT l'appel au service IA (#1943.5). */
      startedAt: Date
    },
  ): Promise<{ success: boolean; data: Record<string, unknown> }> {
    // #2276.1 — le job composite du tour, AVANT les cartes : il ne dépend pas du
    // module de cartes, et sa fiche brute ne doit jamais atteindre le navigateur.
    const event = await this.withTurnJob(received, turn)
    const done = { success: event.success, data: event.data }
    if (!this.cards) return done
    // D8 — ce qui arrive après l'annulation n'ouvre aucune carte ; une réponse en échec non plus.
    if (turn.signal.aborted || !event.success) return done
    const context = IaProxyController.isRecord(event.data['context']) ? event.data['context'] : {}
    const proposals = context['pending_actions']
    const stamped = { ...event.data, turn_id: turn.turnId }

    // #1943.5 — une analyse lancée pendant CE tour (outil de lancement RÉUSSI) :
    // le suivi que le pont a inscrit sans connaître le tour rejoint ce tour.
    const actions = Array.isArray(context['actions']) ? context['actions'] : []
    const launchedInTurn = actions.filter(
      action =>
        IaProxyController.isRecord(action) &&
        action['tool'] === 'start_account_analysis' &&
        action['status'] === 'done',
    ).length
    if (launchedInTurn > 0) {
      // L'horloge de la base date le suivi, celle de l'API date le tour : 5 s de tolérance.
      const clockToleranceMs = 5_000
      try {
        await this.cards.adoptAnalysisLaunches({
          principal: this.principalOf(turn.user),
          conversationId: turn.conversationId,
          turnId: turn.turnId,
          since: new Date(turn.startedAt.getTime() - clockToleranceMs),
          launchedInTurn,
        })
      } catch (error) {
        this.logger.error('Suivi d’analyse non rattaché au tour', { error, tags: { 'chat.turn_id': turn.turnId } })
      }
    }
    if (proposals === undefined) return { success: event.success, data: stamped }

    let proposed: Awaited<ReturnType<CopilotCardService['proposeTurn']>>
    try {
      proposed = await this.cards.proposeTurn({
        principal: this.principalOf(turn.user),
        conversationId: turn.conversationId,
        turnId: turn.turnId,
        proposals,
      })
    } catch (error) {
      this.logger.error('Cartes du tour non enregistrées — la réponse part sans elles', {
        error,
        tags: { 'chat.turn_id': turn.turnId },
      })
      return { success: event.success, data: stamped }
    }
    if (proposed.counts.invalid > 0 || proposed.counts.droppedOverCap > 0) {
      // #1943.3 — des NOMBRES : ni contact, ni destinataire, ni texte proposé.
      this.logger.warn('Propositions de Laura écartées', {
        tags: { 'chat.turn_id': turn.turnId },
        contexts: { cards: proposed.counts },
      })
    }
    const cards: CardView[] = proposed.cards
    return { success: event.success, data: { ...stamped, context: { ...context, cards } } }
  }

  /**
   * #2276.1 / #2276.2 — une demande complexe devient UN job persistant, au lieu
   * d'une réponse texte qui simulerait le travail.
   *
   * `context.laura_job` arrive BRUT du service IA (sortie de modèle) : il ne
   * repart JAMAIS tel quel. Validé et persisté, il est remplacé par la vue du job
   * (`LauraJobView`) ; sinon — invalide, démonstration, module absent, tour
   * annulé ou en échec, panne — la clé est retirée : aucune fiche non validée
   * n'est rendue comme si elle existait. Rien n'est exécuté ici.
   */
  private async withTurnJob(
    event: { success: boolean; data: Record<string, unknown> },
    turn: { user: CurrentUserPayload; conversationId: string | null; turnId: string; signal: AbortSignal },
  ): Promise<{ success: boolean; data: Record<string, unknown> }> {
    const context = IaProxyController.isRecord(event.data['context']) ? event.data['context'] : null
    if (!context || !('laura_job' in context)) return event
    const { laura_job: raw, ...rest } = context
    const without = { ...event, data: { ...event.data, context: rest } }
    if (!this.lauraJobs || turn.signal.aborted || !event.success) return without
    try {
      const proposed = await this.lauraJobs.proposeFromTurn({
        principal: this.principalOf(turn.user),
        conversationId: turn.conversationId,
        turnId: turn.turnId,
        raw,
      })
      if (proposed.outcome === 'invalid') {
        this.logger.warn('Fiche de job de Laura écartée (forme invalide)', { tags: { 'chat.turn_id': turn.turnId } })
      }
      if (!proposed.job) return without
      return { ...event, data: { ...event.data, context: { ...rest, laura_job: proposed.job } } }
    } catch (error) {
      this.logger.error('Job de Laura non enregistré — la réponse part sans lui', {
        error,
        tags: { 'chat.turn_id': turn.turnId },
      })
      return without
    }
  }

  /**
   * #2276.62 — les jobs de Laura d'un fil, rattachés à la réponse de LEUR tour
   * (`workflow_runs.turn_id`, comme les cartes, #1931). Une réponse sans job ne
   * reçoit aucune clé ; une panne de lecture laisse le fil intact (le job reste
   * lisible dans sa carte d'origine au tour suivant) — jamais un fil qui tombe.
   */
  private async withThreadJobs<M extends { id: string }>(
    messages: M[],
    user: CurrentUserPayload,
    workspaceId: string,
    conversationId: string | null,
  ): Promise<Array<M & { laura_job?: LauraJobView }>> {
    if (!this.lauraJobs || messages.length === 0) return messages
    try {
      const turns = await this.chatMessages.turnIdsOf(
        workspaceId,
        messages.map(message => message.id),
      )
      const turnIds = [...new Set(turns.values())]
      if (turnIds.length === 0 && !conversationId) return messages
      const jobs = await this.lauraJobs.listForThread(this.principalOf(user), { conversationId, turnIds })
      const byTurn = new Map(jobs.filter(job => job.turnId).map(job => [job.turnId as string, job]))
      return messages.map(message => {
        const job = byTurn.get(turns.get(message.id) ?? '')
        return job ? { ...message, laura_job: job } : message
      })
    } catch (error) {
      this.logger.warn(`Jobs de Laura du fil illisibles : ${error instanceof Error ? error.name : 'erreur'}`)
      return messages
    }
  }

  /**
   * #2429.2 / #2429.4 / #2429.9 — l'enveloppe d'UNE réponse, posée sur ce que
   * cet endpoint sert déjà (`context`, `laura_job`, les cartes de son tour) :
   * un champ additionnel, jamais une seconde lecture. Une question de la
   * personne (`role !== 'assistant'`) n'en porte aucune — ce n'est pas une
   * réponse à adresser.
   */
  private static replyEnvelopeOf(
    message: {
      id: string
      role: string
      content: string
      context?: PersistedChatContext | null
      laura_job?: unknown
    },
    // #1998 — les cartes GOUVERNÉES du tour, quand cet endpoint les connaît déjà.
    actions?: unknown[],
    // #2429.9 — les versions les plus récentes des artefacts de CE message.
    versions?: ReadonlyMap<string, ChatArtifactLatestVersion>,
  ): ChatReplyEnvelope | undefined {
    if (message.role !== 'assistant') return undefined
    return buildChatReplyEnvelope({
      messageId: message.id,
      content: message.content,
      sources: message.context?.sources,
      replyOptions: message.context?.reply_options,
      partial: message.context?.partial,
      actions,
      job: message.laura_job,
      versions,
    })
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  /**
   * #1941.5 / #1941.8 — LES DROITS EFFECTIFS DU LECTEUR, calculés CÔTÉ SERVEUR.
   *
   * Décision de Louis du 15/09/2026 : le panneau « Ce que Laura utilise »
   * (#1941) doit montrer les droits RÉELS de la personne qui lit — jamais une
   * déduction faite par le navigateur à partir du rôle affiché, qui ignorerait
   * un accord en propre (`extraPermissionsOf`, additif — GA-26 : `can()` reste
   * l'UNIQUE calcul). `ChatResponseContext.permissions` (web,
   * `ContextDisclosure.tsx`) AFFICHE ce tableau, il ne le recalcule jamais.
   *
   * N'ajoute la clé QUE si `context` existe déjà dans la réponse : un contexte
   * absent (réponse en échec, service IA d'avant ce champ) ne doit pas se
   * mettre à en porter un — la même prudence que `withTurnCards`.
   */
  /**
   * #1941.4 — LE PORTEFEUILLE LISIBLE, NOMMÉ, POSÉ PAR LE SERVEUR.
   *
   * « Comprendre les comptes lisibles » : le panneau « Ce que Laura utilise »
   * n'affichait qu'un NOMBRE, et ce nombre était compté côté IA en comptant les
   * LIGNES du digest (`context_transparency._count_lines`) — l'en-tête du bloc
   * et le bloc de mémoire marché compris. Il annonçait donc « 23 comptes » là où
   * vingt étaient partis.
   *
   * Le serveur remplace ici les deux valeurs par ce qu'il a RÉELLEMENT servi : la
   * liste des noms, et le total de l'espace quand la liste est partielle. Même
   * geste que `withReaderPermissions` — le navigateur n'a rien à recalculer, et
   * l'IA n'a rien à deviner d'un texte qu'elle a reçu formaté.
   *
   * Sans portefeuille dans ce tour (un dossier est ouvert, ou la lecture a
   * échoué), l'événement repart INTACT : jamais une liste vide, qui se lirait
   * « tu n'as aucun compte ».
   */
  private withReadablePortfolio(
    event: { success: boolean; data: Record<string, unknown> },
    portfolio: { names: string[]; total: number } | null | undefined,
  ): { success: boolean; data: Record<string, unknown> } {
    if (!event.success || !portfolio) return event
    const context = IaProxyController.isRecord(event.data['context']) ? event.data['context'] : null
    if (!context) return event
    const active = IaProxyController.isRecord(context['active']) ? context['active'] : null
    if (!active) return event
    return {
      success: event.success,
      data: {
        ...event.data,
        context: {
          ...context,
          active: {
            ...active,
            portfolio: {
              present: portfolio.names.length > 0,
              // Ce qui est PARTI au modèle — jamais le total de l'espace.
              count: portfolio.names.length,
              names: portfolio.names,
              total: portfolio.total,
            },
          },
        },
      },
    }
  }

  private withReaderPermissions(
    event: { success: boolean; data: Record<string, unknown> },
    reader: { role: WorkspaceRole; extra: readonly WorkspacePermission[] },
  ): { success: boolean; data: Record<string, unknown> } {
    if (!event.success) return event
    const context = IaProxyController.isRecord(event.data['context']) ? event.data['context'] : null
    if (!context) return event
    const permissions = workspacePermissionValues.filter(permission => can(reader.role, reader.extra, permission))
    return { success: event.success, data: { ...event.data, context: { ...context, permissions } } }
  }

  /**
   * #1951.2 / #1951.3 / #1910.6 — LA FICHE DU PÉRIMÈTRE OBJET, RELUE CÔTÉ SERVEUR.
   *
   * Le navigateur a désigné une nature et un identifiant ; la fiche se relit
   * ici, dans l'espace actif, par la MÊME lecture que l'écran qui la montre
   * (`findOneScoped`, `OpenNeedsService.list({ id })`, `DeliveryService.list({ id })`). Hors de l'espace, elle
   * est « introuvable » ; en échec, « illisible » — et Laura reçoit l'un ou
   * l'autre plutôt qu'un fil sans cadre (#1951.17 : jamais le mauvais objet en
   * silence).
   *
   * `undefined` = aucune portée objet demandée : clé omise, corps d'avant.
   */
  private async readScopeObject(
    userId: string,
    workspaceId: string,
    scope: ChatScopeObject | null | undefined,
  ): Promise<string | undefined> {
    if (!scope) return undefined
    try {
      if (scope.kind === 'consultant') {
        if (!this.consultants) return renderChatScopeObject({ kind: 'consultant', status: 'unavailable' })
        const consultant = await this.consultants.findOneScoped(scope.id, workspaceId, userId)
        return renderChatScopeObject(
          consultant
            ? { kind: 'consultant', status: 'found', consultant }
            : { kind: 'consultant', status: 'not_found' },
        )
      }
      if (scope.kind === 'mission') {
        if (!this.missions) return renderChatScopeObject({ kind: 'mission', status: 'unavailable' })
        /**
         * #1910.6 — LA MÊME LECTURE QUE LE DOSSIER DE LA MISSION.
         *
         * `filters.id` est le troisième resserrement de `DeliveryService.list`,
         * celui qu'utilise déjà le dossier : hors du portefeuille du lecteur, il
         * rend « introuvable » plutôt qu'une porte dérobée, et l'espace reste
         * dans le `where` quoi qu'il arrive. Rien n'est réécrit ici.
         *
         * ⚠️ `canReadFinance: false`, TOUJOURS — et pas parce que le rendu tait
         * les montants (il les tait aussi) : la permission `finance:read` n'est
         * pas résolue sur ce chemin, et la demander « au cas où » ferait entrer
         * une décision d'autorisation dans un appel qui n'en prend aucune.
         */
        const mission = (await this.missions.list(userId, { canReadFinance: false, filters: { id: scope.id } }))
          .missions[0]
        return renderChatScopeObject(
          mission ? { kind: 'mission', status: 'found', mission } : { kind: 'mission', status: 'not_found' },
        )
      }
      if (scope.kind === 'contact') {
        /**
         * #1951.1 — LA MÊME LECTURE QUE LA FICHE À L'ÉCRAN.
         *
         * `ContactsService.findOne` résout lui-même l'espace actif de l'appelant
         * et pose `workspaceScopeWhere` : hors de l'espace, il rend « not_found »
         * plutôt qu'une porte dérobée. Rien n'est réécrit ici, et aucune route
         * nouvelle n'est ouverte — c'est la lecture que `GET /contacts/:id` sert
         * déjà.
         */
        if (!this.contacts) return renderChatScopeObject({ kind: 'contact', status: 'unavailable' })
        const found = await this.contacts.findOne(scope.id, userId)
        if (found.type !== 'success') return renderChatScopeObject({ kind: 'contact', status: 'not_found' })
        const row = found.output
        /**
         * Le COMPTE est relu à part, dans le même espace.
         *
         * ⚠️ Sans lui, Laura saurait tout d'une personne sans savoir chez qui
         * elle travaille — et une relance écrite sans l'employeur ne se tient
         * pas. `null` si la lecture n'aboutit pas : on ne devine JAMAIS le nom
         * du compte depuis la fiche (un `entity` n'est pas une société).
         */
        let accountName: string | null = null
        if (row.account_id && this.accountsService) {
          const account = await this.accountsService.findOneForWorkspace(row.account_id, workspaceId)
          accountName = account.type === 'success' ? (account.output.company_name ?? null) : null
        }
        return renderChatScopeObject({
          kind: 'contact',
          status: 'found',
          // ⚠️ Champ par champ, jamais un `...row` : l'étalement ferait entrer
          // dans le prompt la colonne ajoutée demain (coordonnée, photo, note)
          // sans que personne ne l'ait décidé — voir `ChatScopeContactRead`.
          contact: {
            full_name: row.full_name ?? null,
            title: row.title ?? null,
            entity: row.entity ?? null,
            decision_role: row.decision_role ?? null,
            seniority: row.seniority ?? null,
            scope: row.scope ?? null,
            budget_authority: row.budget_authority ?? null,
            why_contact: row.why_contact ?? null,
            key_points: row.key_points ?? null,
            user_status: row.user_status ?? null,
            accountName,
          },
        })
      }
      if (scope.kind === 'opportunity') {
        /**
         * #1951.4 — LA MÊME LECTURE QUE L'EXPORT D'UN BESOIN VERS LE CRM.
         *
         * `ProjectsService.getRow` porte l'espace dans son `WHERE` (l'espace de
         * l'affaire OU celui de son compte) et écarte les comptes supprimés :
         * hors de l'espace, elle rend `null`, donc « introuvable ». Aucune route
         * nouvelle — c'est la lecture serveur qui sert déjà l'export.
         */
        if (!this.projects) return renderChatScopeObject({ kind: 'opportunity', status: 'unavailable' })
        const row = await this.projects.getRow(scope.id, workspaceId)
        if (!row) return renderChatScopeObject({ kind: 'opportunity', status: 'not_found' })
        return renderChatScopeObject({
          kind: 'opportunity',
          status: 'found',
          // Champ par champ, jamais un `...row` — voir `ChatScopeOpportunityRead` :
          // `source` nommerait un de nos fournisseurs, `confidence` se lirait
          // comme une chance de conclure.
          opportunity: {
            label: row.label ?? null,
            kind: row.kind ?? null,
            detail: row.detail ?? null,
            offer: row.offer ?? null,
            sector: row.sector ?? null,
            urgency: row.urgency ?? null,
            stage: row.stage ?? null,
            stage_entered_at: row.stage_entered_at ?? null,
            accountName: row.company_name ?? null,
            ...(typeof row.has_mission === 'boolean' ? { has_mission: row.has_mission } : {}),
          },
        })
      }
      if (scope.kind === 'job_offer') {
        /**
         * Théo L1 — sélecteur avancé — L'OFFRE D'EMPLOI ET SON COMPTE.
         *
         * `SignalHistoryService.readJobOffer` borne la lecture à l'espace actif
         * (le compte y est, la ligne n'en porte pas un autre) : hors de
         * l'espace, `null`, donc « introuvable ». Une offre de STAGE n'est
         * jamais relue (décision 12/10) — `jobOfferReadFrom` rend `null`, et
         * elle se dit introuvable comme une offre qui n'existe pas.
         */
        if (!this.signalHistory) return renderChatScopeObject({ kind: 'job_offer', status: 'unavailable' })
        const row = await this.signalHistory.readJobOffer(scope.id, workspaceId)
        const jobOffer = row ? jobOfferReadFrom(row) : null
        return renderChatScopeObject(
          jobOffer ? { kind: 'job_offer', status: 'found', jobOffer } : { kind: 'job_offer', status: 'not_found' },
        )
      }
      if (!this.openNeeds) return renderChatScopeObject({ kind: 'need', status: 'unavailable' })
      const need = (await this.openNeeds.list(workspaceId, { id: scope.id, offset: 0, limit: 1 })).data[0]
      return renderChatScopeObject(
        need ? { kind: 'need', status: 'found', need } : { kind: 'need', status: 'not_found' },
      )
    } catch (error) {
      this.logger.warn(`Fiche du périmètre de conversation illisible: ${String(error)}`)
      return renderChatScopeObject({ kind: scope.kind, status: 'unavailable' })
    }
  }

  /**
   * #1916.24 — CAPTURE, AVANT L'ÉVÉNEMENT TERMINAL, des éléments de mémoire
   * envoyés pour ce tour.
   *
   * ⚠️ AVANT, et pas après `res.end()` : le web enregistre la réponse dès qu'il
   * reçoit le terminal (`POST /ia/chat/messages`), et y rattache le tour. Une
   * capture écrite après coup arriverait en course derrière ce rattachement,
   * qui ne trouverait rien — la trace serait perdue sans que rien ne le dise.
   *
   * Seulement pour une réponse RÉUSSIE et NON VIDE : un tour annulé, échoué ou
   * interrompu ne trace rien. Le tour (émis par le serveur) voyage sous
   * `memory_turn_id` ; une capture ratée n'en émet pas, et le web n'annonce
   * alors aucune trace.
   */
  private async withMemoryTrace<T extends { success: boolean; data: Record<string, unknown> }>(
    event: T,
    turn: { userId: string; workspaceId: string; factIds: readonly string[] },
  ): Promise<T> {
    const reply = event.data['reply']
    if (!this.replyMemoryUses || !event.success || typeof reply !== 'string' || !reply.trim()) return event
    if (turn.factIds.length === 0) return event
    const turnId = await this.replyMemoryUses.captureTurn({ ...turn, surface: 'chat' }).catch(() => null)
    return turnId ? { ...event, data: { ...event.data, memory_turn_id: turnId } } : event
  }

  /**
   * #1916.24 — rattache le tour à la réponse que la personne vient d'enregistrer.
   * `null` = rien de rattaché de façon SÛRE (service absent, écriture ratée,
   * compte illisible) : la réponse du fil ne porte alors aucun compte.
   */
  private async attachMemoryTurn(args: {
    turnId: string
    messageId: string
    userId: string
    workspaceId: string
  }): Promise<number | null> {
    if (!this.replyMemoryUses) return null
    try {
      return await this.replyMemoryUses.attachTurn(args)
    } catch (error) {
      this.logger.warn(`Trace de mémoire non rattachée : ${error instanceof Error ? error.name : 'erreur'}`)
      return null
    }
  }

  /** #1919.15 — les lignes de retours de CETTE personne, ou `null` (bloc absent). */
  private async readReplyFeedback(userId: string, workspaceId: string): Promise<string | null> {
    if (!this.replyFeedback) return null
    return (await this.replyFeedback.memoryFor({ workspaceId, userId })) || null
  }

  /**
   * #1960.20 — l'espace est-il en MARQUE BLANCHE ?
   *
   * Décision de Louis du 13/09/2026 : en marque blanche, Laura ne donne AUCUNE
   * adresse Bellum, seulement le signalement. `isCustom` est LE drapeau de
   * `resolveBrand` — une seule dérivation, celle que les écrans lisent déjà.
   *
   * Best-effort : une lecture ratée rend la marque du produit (le défaut
   * convenu), jamais un tour de chat en échec.
   */
  private async isWhiteLabel(workspaceId: string): Promise<boolean> {
    if (!this.brands) return false
    try {
      return (await this.brands.getForWorkspace(workspaceId)).isCustom === true
    } catch (error) {
      this.logger.warn(`Marque de l'espace illisible pour le chat: ${String(error)}`)
      return false
    }
  }

  /**
   * #1581.1 / #1573.1 — CE QUE LAURA SAIT DU PORTEFEUILLE, CÔTÉ MARCHÉ.
   *
   * Le même dénominateur que `GET /accounts/market-memory-portfolio`, obtenu de
   * la même façon : le même cloisonnement, la même population, la même mise en
   * forme des clés (`marketPortfolioLookups`) — c'est ce qui garantit que Laura
   * et l'écran de pilotage ne donnent pas deux chiffres, le défaut que #1621
   * décrit mot pour mot.
   *
   * `null` quand rien n'a pu être lu : le bloc n'apparaît alors pas du tout dans
   * le contexte. « Je n'ai pas lu » n'est jamais « il n'y a rien », et surtout
   * jamais « 0 couvert sur 0 » — un modèle en ferait une phrase rassurante.
   */
  private async readMarketPortfolio(userId: string, workspaceId: string): Promise<MarketPortfolioRead | null> {
    if (!this.marketMemory || !this.accountsService) return null
    try {
      const { role } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
      const accounts = await this.accountsService.listPortfolioLookups(
        workspaceId,
        portfolioScopeFor(role, visibility, userId),
      )
      return await this.marketMemory.portfolioFor(marketPortfolioLookups(accounts), {
        expertises: (await this.esnProfile.getAnswers(userId).catch(() => null))?.expertise_areas ?? [],
        // #1617.4 — le copilote lit le MÊME portefeuille corrigé que l'écran.
        // Deux lectures du même objet qui divergent est un défaut que ce dépôt
        // a déjà payé : l'un des deux écrans dirait une ambiguïté déjà tranchée.
        workspaceId,
      })
    } catch (error) {
      // Une lecture d'agrégat ne fait JAMAIS tomber un tour de chat.
      this.logger.warn(`Couverture mémoire marché du portefeuille illisible: ${String(error)}`)
      return null
    }
  }

  @RequireFeature('discover')
  // #4629.2 — Découvrir coûte du modèle : un essai terminé le ferme (refus énuméré, `PlanFeatureGuard`).
  @RequireOpenTrial()
  @Post('discover')
  @Throttle(DISCOVER_RATE_LIMIT)
  async discover(@CurrentUser() user: CurrentUserPayload, @Body() dto: DiscoverDto): Promise<IaEnvelope> {
    // #4556 / #4628 — la démo ne déclenche aucune collecte payante (un appel web + un appel au modèle ici) : elle
    // MONTRE la liste scriptée de `discover/registry`. Refus net, jamais une réponse inventée.
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      throw new BadRequestException(
        'Dans l’espace de démonstration, les listes de Découvrir sont préparées à l’avance : aucune recherche payante n’y est lancée. Ouvre une recherche enregistrée depuis Découvrir.',
      )
    }
    // Resolve the ESN profile SERVER-SIDE so Discover is truly personalised — the
    // front used to send profileData: {} (Théo: "Discover envoie encore
    // profileData = {} → ne doit pas être vendu comme personnalisé"). Same profile
    // source as Analysis/Chat/Score/Messages.
    const profileData = (await this.esnProfile.resolveProfileData(user.userId)) as Record<string, unknown>
    // Discover is one Brave + one Claude call; retrying it triples the LLM spend
    // for no benefit, and the default 30s timeout can clip a slower run. Single
    // attempt, comfortable deadline.
    return this.ia.discover({ criteria: dto.criteria, profileData }, { maxAttempts: 1, timeoutMs: 45_000 })
  }

  @RequireFeature('discover')
  // #4629.2 — Découvrir coûte du modèle : un essai terminé le ferme (refus énuméré, `PlanFeatureGuard`).
  @RequireOpenTrial()
  @Post('discover/registry')
  @Throttle(DISCOVER_RATE_LIMIT)
  async discoverRegistry(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: DiscoverRegistryDto,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<DiscoverResponse> {
    // Découvrir v2 : le REGISTRE produit la liste, le LLM ne produit que
    // l'angle. Le profil ESN est résolu server-side (même source qu'Analysis /
    // Chat / Score) — le front n'envoie que des critères structurés.
    // Salle de démonstration : la liste est SCRIPTÉE. Le registre réel rendait
    // ici de vraies entreprises, avec leur SIREN, dans un espace dont le bandeau
    // annonce des données fictives — vu en production le 03/08.
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      // COMPETENCE-TROUVE (20/10) — une compétence posée TROUVE des comptes par leurs offres : la salle
      // rejoue cette forme (comptes prouvés + intermédiaires à part), fictive, avec la compétence tapée.
      // #4433 — sous 10 exacts, la salle s'élargit au voisin fictif, étiqueté ; « revenir au strict » le retire.
      const skillDemo = withDemoWidening(
        demoSkillSearchResponse({ ...(dto.filters ?? {}) }),
        { ...(dto.filters ?? {}) },
        dto.strictCriteria,
      )
      if (skillDemo) return skillDemo as unknown as DiscoverResponse
      // #2489.3/D1 — la démo honore le MÊME filtre cible que le vrai chemin
      // (voir `demoDiscoverResponse`, `demo-scripts.ts`) : `includeOutOfTarget`
      // voyage jusqu'à elle comme n'importe quel autre critère.
      // #4793.1 — la base commune fabrique des candidats, en salle aussi (`withDemoCommonBase`).
      return this.withDemoOwnedCandidates(
        user.userId,
        withDemoCommonBase(
          demoDiscoverResponse({
            ...(dto.filters ?? {}),
            includeOutOfTarget: dto.includeOutOfTarget,
          }),
          // #5203 — période et nature des besoins RETIRENT aussi en salle.
          dto.filters ?? {},
        ) as unknown as DiscoverResponse,
      )
    }

    // #2454.10 — « Neutre » : le profil habituel est IGNORÉ, jamais relu puis
    // retiré — le contrat de contexte (`GET /context-contract`) le dit à l'écran.
    // #4045.12 — deux lectures INDÉPENDANTES avant le moteur : elles partent ensemble, pas l'une après l'autre.
    const timed = <T>(source: string, read: () => Promise<T>) =>
      timedDiscoverSource(source, read, line => this.logger.log(line))
    const [profileData, spaceSirens, spaceKey, baseCandidates, spaceNeedCandidates, marketMemoryNames] =
      await Promise.all([
        timed('profile', () => this.discoverProfileData(user.userId, dto.contextMode)),
        // #4067 (reste) — ce que l'espace sait déjà ne se coupe pas à `limit` côté IA.
        // #4792 — et « ce que l'espace sait » inclut maintenant ce que la BASE porte sur ces critères.
        timed('space_sirens', () => this.spaceFactSirensOf(user.userId, dto.limit, dto.filters)),
        // #4430 — l'espace actif : seul sésame des offres fraîches (plafond quotidien par espace).
        timed('space_key', () => this.discoverSpaceKeyOf(user.userId)),
        // #4793.1 — les CANDIDATS de la base commune : aucun espace n'entre dans cette lecture (#4791.3).
        timed('common_base', () => this.commonBaseCandidatesOf(dto.limit, dto.filters)),
        // #5203 — les besoins PASSÉS de l'espace actif (cloisonné espace + BU), sans borne d'âge.
        timed('space_past_needs', () => this.spacePastNeedCandidatesOf(user.userId, dto.limit, dto.filters)),
        // #4791.2 — Market Memory SOURCE : des noms, appariés au registre par l'IA.
        timed('market_memory', () => this.marketMemoryNamesOf(dto.limit, dto.filters)),
      ])
    // #5203 — UNE liste de candidats-par-besoin : la base commune d'abord, puis les besoins passés de l'espace
    // (dédoublonnés par SIREN) ; bornée au volume demandé comme la base commune.
    const knownSirens = new Set(baseCandidates.map(candidate => candidate.siren))
    const commonBaseCandidates = [
      ...baseCandidates,
      ...spaceNeedCandidates.filter(candidate => !knownSirens.has(candidate.siren)),
    ].slice(0, Math.max(1, (dto.limit ?? 24) * 2))
    let response: DiscoverResponse
    // #4490.2 — « Arrêter » côté navigateur coupe aussi l'appel au moteur.
    const client = req && res ? abortOnClientClose(req, res) : null
    try {
      response = await this.ia.discoverRegistry(
        {
          filters: dto.filters ?? {},
          limit: dto.limit,
          profileData,
          includeOutOfTarget: dto.includeOutOfTarget,
          // #4433 — « revenir au strict » : seul le geste de l'écran le pose.
          ...(dto.strictCriteria === true ? { strictCriteria: true } : {}),
          ...(spaceSirens.length > 0 ? { spaceSirens } : {}),
          ...(spaceKey ? { spaceKey } : {}),
          userId: user.userId, // #4419.7 — l'IA relit l'identité d'un employeur dans l'espace de l'appelant
          ...(commonBaseCandidates.length > 0 ? { commonBaseCandidates } : {}),
          ...(marketMemoryNames.length > 0 ? { marketMemoryNames } : {}),
        },
        client ? { ...DISCOVER_CALL_OPTS, signal: client.signal } : DISCOVER_CALL_OPTS,
      )
    } catch (error) {
      // #2496 — throws a clear, typed HttpException (never a bare 500) and
      // logs the REAL failure. See `discover-failure.ts` for why this was
      // missing here.
      throw this.discoverEngineFailure(error, 'registry')
    } finally {
      client?.release()
    }
    response = await this.withoutWrongCompanyCandidates(user.userId, response)
    // #5203 — les filtres « période » et « nature » des besoins RETIRENT ce qui ne correspond pas.
    const filtered = await this.withMarketMemoryFilters(
      withNeedFilters(response, dto.filters ?? {}, new Date()),
      dto.filters ?? {},
    )
    // #3916.b — même lecture des annonces de registre que le mode Signaux.
    const withPortfolio = await this.withPortfolioState(user.userId, await this.withRegistryAnnouncements(filtered))
    const withHeadline = await this.withKnownNeedsAndHeadline(user.userId, withPortfolio)
    // #4067 — APRÈS `withPortfolioState` : elle seule tranche `accountId`.
    return this.withSourceAxes(user.userId, withHeadline, profileData)
  }

  @RequireFeature('discover')
  // #4629.2 — Découvrir coûte du modèle : un essai terminé le ferme (refus énuméré, `PlanFeatureGuard`).
  @RequireOpenTrial()
  @Post('discover/signals')
  @Throttle(DISCOVER_RATE_LIMIT)
  async discoverSignals(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: DiscoverSignalsDto,
  ): Promise<DiscoverResponse> {
    // Même contrat, autre porte d'entrée : la liste part du SIGNAL (AO ouverts,
    // marchés attribués, recrutements) au lieu du registre.
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      // #4437 — un recrutement qualifié montre aussi son voisin étiqueté (`withDemoSignalNeighbour`).
      return this.withDemoOwnedCandidates(
        user.userId,
        withDemoSignalNeighbour(demoDiscoverResponse({ ...dto }), { ...dto }) as unknown as DiscoverResponse,
      )
    }

    // #2454.10 — le mode est un RÉGLAGE, pas un critère : il ne part pas au moteur.
    // #3551 — `includeOutOfTarget` non plus : le moteur de signaux n'a aucun filtre de cible.
    const { contextMode, ...filters } = dto
    delete filters.includeOutOfTarget
    // #4045.12 — les lectures INDÉPENDANTES avant le moteur partent ensemble (profil, partenaires, SIREN de l'espace).
    // #3757 (reste) — les SIREN que CET espace a déclarés partenaires :
    // `classify_actor_type` (apps/ia) les nomme `PARTENAIRE` plutôt que de
    // les laisser à l'hypothèse NAF. Best-effort : `partnerPipeline` absent
    // ou en échec ⇒ liste vide, comportement inchangé (jamais une panne qui
    // bloque Découvrir pour une seule colonne de badge).
    // #4067 (reste) — ce que l'espace sait déjà ne se coupe pas à `limit` côté IA (comme le registre).
    const [profileData, declaredPartnerSirens, spaceSirens] = await Promise.all([
      this.discoverProfileData(user.userId, contextMode),
      this.declaredPartnerSirensOf(user.userId),
      // #4792 — le mode Signaux pose les mêmes critères de lieu : la base les lit aussi. Ses critères
      // sont PLATS (pas de `filters`) et son `keywords` est UN mot, pas une liste : on traduit ici,
      // explicitement, plutôt que de faire deviner la forme au pont.
      this.spaceFactSirensOf(user.userId, dto.limit, {
        ...(dto.city ? { city: dto.city } : {}),
        ...(dto.department ? { department: dto.department } : {}),
        ...(dto.region ? { region: dto.region } : {}),
        ...(dto.keywords ? { keywords: [dto.keywords] } : {}),
        ...(dto.technologiesObserved ? { technologiesObserved: dto.technologiesObserved } : {}),
      }),
    ])
    let response: DiscoverResponse
    try {
      response = await this.ia.discoverSignals(
        { filters, profileData, declaredPartnerSirens, ...(spaceSirens.length > 0 ? { spaceSirens } : {}) },
        DISCOVER_SIGNALS_CALL_OPTS,
      )
    } catch (error) {
      throw this.discoverEngineFailure(error, 'signals')
    }
    response = await this.withoutWrongCompanyCandidates(user.userId, response)
    const filtered = await this.withMarketMemoryFilters(response, dto ?? {})
    // #3916.b — « pourquoi maintenant » lit AUSSI les annonces de registre
    // lues en continu (BODACC, ouvertures Sirene) pour les SIREN déjà connus.
    const withRegistry = await this.withRegistryAnnouncements(filtered)
    const withPortfolio = await this.withPortfolioState(user.userId, withRegistry)
    // #2875/#2402.1 (vague F/G 27/09) — best-effort, APRÈS la résolution
    // portefeuille : c'est elle seule qui sait quel candidat est déjà un
    // compte suivi. Attendu (jamais fire-and-forget) mais protégé par son
    // propre `try/catch` interne : une panne du registre ne change jamais la
    // réponse Découvrir.
    await this.recordAoPublieTriggers(user.userId, withPortfolio)
    const withHeadline = await this.withKnownNeedsAndHeadline(user.userId, withPortfolio)
    // #4067 — mêmes axes de sources que le registre, même place.
    return this.withSourceAxes(user.userId, withHeadline, profileData)
  }

  /**
   * #4430 (Louis 21/10) — l'espace ACTIF, résolu server-side (jamais lu du corps de la requête) : l'IA
   * s'en sert pour le seul plafond quotidien des offres fraîches, jamais dans une clé du cache commun.
   * Best-effort : en échec, `undefined` — l'IA reste alors au cache seul (aucun achat).
   */
  private async discoverSpaceKeyOf(userId: string): Promise<string | undefined> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      return workspaceId || undefined
    } catch {
      return undefined
    }
  }

  /**
   * #4067 (reste) — les SIREN que l'espace actif connaît (historique, affaires CRM), pour que l'IA
   * ne les coupe pas à `limit` avant qu'ils ne pèsent dans le rang (`withSourceAxes`). Bornés à
   * 4 × la page. Best-effort : sans service ou en échec, `[]` — la coupe reste celle d'avant.
   *
   * #4792 (épopée #4791) — S'Y AJOUTE CE QUE LA BASE PORTE SUR LES CRITÈRES DE LA RECHERCHE, par le
   * lecteur COMMUN (`BaseReaderService`, un seul endroit — GA-26). Un compte analysé qui porte un
   * besoin « Java à Lille », mais dont aucun signal n'a été historisé et qui n'a aucune affaire CRM,
   * était coupé à `limit` : l'épopée est née de là (« la base m'en remonte 80, et rien ne les
   * montre »). Les deux lectures partent ENSEMBLE et leurs SIREN s'unissent, dédoublonnés.
   *
   * ⚠️ Le périmètre de Business Unit est résolu ICI, au bord, et descend entier jusqu'au lecteur.
   * `resolveBusinessUnitScope` est fail-closed : sans le service de périmètre il LÈVE, le `catch`
   * ci-dessous rend `[]`, et la coupe reste celle d'avant — jamais une lecture sans cloisonnement.
   */
  /** #4791.2 — les NOMS de Market Memory (source de candidats) ; best-effort, jamais une panne de la recherche. */
  private async marketMemoryNamesOf(
    limit: number | undefined,
    filters?: Parameters<DiscoverMarketMemoryService['namesFor']>[0],
  ): Promise<Array<{ name: string; label: string; date?: string; nature?: 'mission' }>> {
    try {
      return (await this.discoverMarketMemory?.namesFor(filters ?? {}, Math.max(1, limit ?? 24))) ?? []
    } catch (error) {
      this.logger.warn('Découvrir — Market Memory (source) illisible (non-fatal, aucun candidat de plus)', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  private async commonBaseCandidatesOf(
    limit: number | undefined,
    filters?: Parameters<DiscoverSourcesService['commonBaseCandidates']>[0],
  ): Promise<DiscoverCommonBaseCandidate[]> {
    // #4793.1 (Louis 31/10) — la borne est le volume DEMANDÉ ; la lecture ne reçoit ni l'utilisateur ni l'espace.
    if (!this.discoverSources) return []
    try {
      return await this.discoverSources.commonBaseCandidates(filters, Math.max(1, limit ?? 24))
    } catch (error) {
      this.logger.warn('Découvrir — base commune illisible (non-fatal, aucun candidat de plus)', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  /** #5203 — les candidats nés des besoins passés de l'espace actif ; best-effort, jamais une panne de la recherche. */
  private async spacePastNeedCandidatesOf(
    userId: string,
    limit: number | undefined,
    filters?: Parameters<DiscoverSourcesService['spacePastNeedCandidates']>[2],
  ): Promise<DiscoverCommonBaseCandidate[]> {
    if (!this.discoverSources) return []
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const businessUnitScope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)
      return await this.discoverSources.spacePastNeedCandidates(
        workspaceId,
        businessUnitScope,
        filters,
        Math.max(1, limit ?? 24),
      )
    } catch (error) {
      this.logger.warn('Découvrir — besoins passés de l’espace illisibles (non-fatal, aucun candidat de plus)', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  private async spaceFactSirensOf(
    userId: string,
    limit: number | undefined,
    filters?: Parameters<typeof discoverBaseCriteria>[0],
  ): Promise<string[]> {
    if (!this.discoverSources) return []
    const cap = Math.max(1, (limit ?? 24) * 4)
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const businessUnitScope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)
      const [known, fromBase] = await Promise.all([
        this.discoverSources.spaceFactSirens(workspaceId, cap),
        this.discoverSources.baseAccountSirens(workspaceId, businessUnitScope, filters, cap),
      ])
      return [...new Set([...known, ...fromBase])]
    } catch (error) {
      this.logger.warn('Découvrir — SIREN de l’espace illisibles (non-fatal, coupe inchangée)', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  /**
   * #4067 (décision Louis 12/10) — chaque candidat porte ce que l'ESPACE ACTIF
   * sait déjà de lui, en six axes nommés (`computeDiscoverSourceAxes`) : c'est
   * ce que l'écran ajoute au rang (`discoverRankRatio`) et nomme dans la ligne
   * « Pourquoi ». Best-effort : sans le service, ou sur une lecture en échec,
   * la réponse sort à l'identique — jamais un axe inventé, jamais une panne de
   * Découvrir.
   */
  private async withSourceAxes(
    userId: string,
    response: DiscoverResponse,
    profileData: Record<string, unknown>,
  ): Promise<DiscoverResponse> {
    const candidates = response?.candidates ?? []
    if (!this.discoverSources || candidates.length === 0) return response
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const [facts, marketFacts] = await Promise.all([
        this.discoverSources.collect(
          workspaceId,
          candidates.map(candidate => ({
            siren: candidate.siren,
            name: candidate.name,
            accountId: candidate.accountId ?? null,
          })),
        ),
        this.discoverMarketMemory?.sourceFactsFor(candidates, discoverProfileTerms(profileData)) ?? null,
      ])
      const now = new Date()
      return {
        ...response,
        candidates: candidates.map((candidate, index) => {
          const { sharedPeople, ...own } = facts[index] ?? {
            signalHistory: null,
            crm: null,
            dataforge: null,
            drive: null,
            missions: null,
          }
          const market = marketFacts?.get(candidate.siren) ?? null
          // #4067.11 (#4286.15.d) — ce que la base commune sait de la société (personnes en poste, un
          // compte) rejoint l'axe « observé sur le marché », même quand la mémoire marché n'a rien vu.
          const marketMemory =
            sharedPeople && sharedPeople > 0
              ? { ...(market ?? { externalRecourse: null, stackOverlap: null }), sharedPeople }
              : market
          return { ...candidate, sourceAxes: computeDiscoverSourceAxes({ ...own, marketMemory }, now) }
        }),
      }
    } catch (error) {
      this.logger.warn('Axes de sources Découvrir indisponibles (non-fatal)', {
        user: { id: userId },
        error: error instanceof Error ? error.message : String(error),
      })
      return response
    }
  }

  /**
   * #3916.b — les annonces de registre public déjà collectées pour les SIREN des
   * candidats rejoignent leurs signaux (`withRegistrySignals`). Best-effort :
   * une lecture en échec rend la réponse du moteur à l'identique — jamais une
   * panne de Découvrir pour une colonne de signaux.
   */
  private async withRegistryAnnouncements(response: DiscoverResponse): Promise<DiscoverResponse> {
    if (!this.accountsService) return response
    const sirens = (response?.candidates ?? []).map(candidate => candidate.siren)
    if (sirens.length === 0) return response
    try {
      return withRegistrySignals(response, await this.accountsService.registryAnnouncementsBySiren(sirens))
    } catch (error) {
      this.logger.warn('Annonces de registre indisponibles pour Découvrir (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
      return response
    }
  }

  /**
   * #2875/#2402.1 (vague F/G 27/09) — `discover_signals.py` ne connaît ni
   * l'espace ni le compte suivi (une recherche BOAMP libre, sans portefeuille,
   * voir son docblock côté IA) : c'est ICI, une fois le candidat croisé avec
   * le portefeuille (`withPortfolioState`), que le signal devient un
   * `TriggerEvent` canonique — un candidat déjà POSSÉDÉ (`accountId` non nul)
   * qui porte un signal `tender` (BOAMP, `SOURCE_LABELS` côté IA). Jamais un
   * second point de construction : {@link buildTriggerEvent} reste le seul
   * (#2402.2), même ici où le détecteur RÉEL vit en Python.
   *
   * Un candidat NEUF (`accountId: null`) ne construit rien : Découvrir montre
   * des prospects, pas des comptes suivis, et un `TriggerEvent` porte
   * toujours un sujet réel de l'espace (#2402.9).
   */
  private async recordAoPublieTriggers(userId: string, response: DiscoverResponse): Promise<void> {
    if (!this.triggers) return
    const candidates = response?.candidates ?? []
    if (candidates.length === 0) return
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const now = new Date()
      for (const candidate of candidates) {
        if (!candidate.accountId) continue
        const tender = candidate.signals.find(signal => signal.type === 'tender')
        if (!tender) continue
        const event = buildTriggerEvent({
          type: 'ao_publie',
          source: 'discover',
          subjectType: 'account',
          subjectId: candidate.accountId,
          workspaceId,
          ownerId: null,
          evidence: tender.label,
          now,
          // #2875 — Découvrir est relu toute la journée : une ligne par jour et par compte.
          dedupeQualifier: triggerPeriodQualifier(now, 'day'),
        })
        void this.triggers.recordOnceByDedupeKey(event, 'ia-proxy/discover-signals')
      }
    } catch (error) {
      this.logger.warn('Événement canonique « ao_publie » en échec (non-fatal)', {
        user: { id: userId },
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * #2454.10 / #2451.1 — le profil vendeur d'une recherche Découvrir. Un mode
   * qui exclut le profil (« Neutre », « Mission ponctuelle ») rend un
   * profil VIDE (le moteur retombe sur ses défauts, comme un espace sans
   * profil) sans même le lire ; tout autre mode lit le profil résolu
   * server-side, byte-identique à avant ce paramètre.
   */
  private async discoverProfileData(userId: string, mode: ContextMode | undefined): Promise<Record<string, unknown>> {
    // #2451.1 — l'appel ne porte aucun mode : le défaut de l'ESPACE s'applique
    // (`workspaces.default_context_mode`), le même que la chip affiche
    // (`GET /context-contract`). Défaut « Mon activité » = chemin historique.
    // #2453.6 — tranché par LA hiérarchie : la demande (niveau 1) bat le défaut
    // de l'espace (niveau 7), lu seulement quand la demande ne dit rien.
    const effective =
      resolveByPrecedence<ContextMode>({
        explicit_request: mode,
        defaults: mode ? undefined : await this.lauraMode?.resolveForUser(userId),
      }) ?? DEFAULT_LAURA_CONTEXT_MODE
    // « Mission ponctuelle » et « Neutre » écartent le profil : il n'est pas LU.
    if (contextModeExcludes(effective, 'profile')) return {}
    return (await this.esnProfile.resolveProfileData(userId)) as Record<string, unknown>
  }

  /**
   * #3757 (reste) — les SIREN que l'espace ACTIF a déclarés partenaires
   * (`partner_relations`), pour que Découvrir nomme un fait plutôt qu'une
   * hypothèse NAF. Best-effort : sans le module (`partnerPipeline` absent)
   * ou sur une lecture en échec, rend `[]` — jamais un échec qui bloquerait
   * la recherche pour une seule colonne de badge.
   */
  private async declaredPartnerSirensOf(userId: string): Promise<string[]> {
    if (!this.partnerPipeline) return []
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      return await this.partnerPipeline.declaredSirens(workspaceId)
    } catch (error) {
      this.logger.warn('SIREN partenaires déclarés illisibles (non-fatal) — Découvrir repart sans eux', {
        user: { id: userId },
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  /**
   * #2496 — Découvrir : « Ta cible » (tous les secteurs de l'ICP appliqués
   * d'un coup) rendait un écran « La recherche a échoué — le service n'a pas
   * pu être joint » pour un `500 {"statusCode":500,"message":"Internal server
   * error"}` générique, quelle que soit la VRAIE cause côté IA (critères
   * refusés, panne amont, ou recherche trop longue — le rail unifié peut
   * envoyer jusqu'à `MAX_CROSSED_SECTORS` sous-recherches, plus longues qu'une
   * recherche à un seul secteur). `IaClient.discoverRegistry`/`discoverSignals`
   * lèvent une `TechnicalError` pour tout échec, et le contrôleur la laissait
   * filer jusqu'au filtre générique — perdant le statut et le corps RÉELS de
   * la réponse IA, exactement ce qu'il aurait fallu pour diagnostiquer
   * l'incident. `classifyDiscoverFailure` (même patron que
   * `classifyEnrichmentFailure`, contacts) rend le VRAI type d'échec ; jamais
   * les critères de recherche dans le log (ils peuvent porter un texte libre
   * saisi par l'utilisateur).
   */
  private discoverEngineFailure(error: unknown, route: 'registry' | 'signals'): HttpException {
    const failure = classifyDiscoverFailure(error)
    this.logger.error(`Discover ${route} — le moteur IA a échoué (${failure.reason})`, {
      error,
      tags: { feature: 'discover', route, reason: failure.reason },
    })
    return new HttpException(
      { statusCode: failure.status, message: failure.message, code: `discover_${failure.reason}` },
      failure.status,
    )
  }

  /** Enrichit les candidats de leur état portefeuille — la seule chose que l'IA
   *  ne peut pas savoir, et ce qui évite de reproposer un compte déjà détenu. */
  private async withPortfolioState(userId: string, response: DiscoverResponse): Promise<DiscoverResponse> {
    const candidates = response?.candidates ?? []
    const matches = await this.portfolio.resolve(userId, candidates)
    return {
      ...response,
      candidates: candidates.map((candidate, index) => ({ ...candidate, ...matches[index] })),
      degraded: response?.degraded ?? [],
    }
  }

  /**
   * #2166.11 (épopée #2806) — LA RÉFÉRENCE COMPARABLE.
   *
   * APRÈS `withPortfolioState` : la résolution ne regarde que les candidats
   * déjà tranchés `portfolioState: 'new'` — un compte déjà possédé n'a rien à
   * apprendre de lui-même. Voir `DiscoverPortfolioService.resolveSimilarityHeadlines`
   * pour ce qu'elle apparie (NAF exact, jamais un texte de secteur libre).
   */
  private async withSimilarityHeadline(userId: string, response: DiscoverResponse): Promise<DiscoverResponse> {
    const candidates = response?.candidates ?? []
    const headlines = await this.portfolio.resolveSimilarityHeadlines(userId, candidates)
    return {
      ...response,
      candidates: candidates.map((candidate, index) =>
        headlines[index] ? { ...candidate, similarityHeadline: headlines[index] } : candidate,
      ),
    }
  }

  /**
   * #3819.1 (lot RBB2) — salle démo : la liste reste scriptée, mais la carte du
   * compte client semé (`DEMO_DISCOVER_OWNED_CANDIDATE_NAMES`) passe par le VRAI
   * portefeuille puis le VRAI décompte (`resolve` → `resolveKnownNeeds`) : son
   * `accountId` et son « N besoins connus » viennent de la base de la salle,
   * jamais d'un nombre inventé. Les autres cartes ne bougent pas.
   */
  private async withDemoOwnedCandidates(userId: string, response: DiscoverResponse): Promise<DiscoverResponse> {
    const candidates = response?.candidates ?? []
    const owned = candidates.filter(candidate => DEMO_DISCOVER_OWNED_CANDIDATE_NAMES.includes(candidate.name))
    if (owned.length === 0) return response
    const matches = await this.portfolio.resolve(userId, owned)
    const merged = owned.map((candidate, index) => ({ ...candidate, ...matches[index] }))
    const withCounts = (await this.withKnownNeeds({ ...response, candidates: merged })).candidates
    // #4067 — la carte du compte semé passe par le VRAI calcul des axes de
    // sources (base de la salle) ; les cartes scriptées gardent leurs faits fictifs.
    const withAxes = this.discoverSources
      ? (
          await this.withSourceAxes(
            userId,
            { ...response, candidates: withCounts },
            await this.discoverProfileData(userId, undefined).catch(() => ({})),
          )
        ).candidates
      : withCounts
    const byName = new Map(withAxes.map(candidate => [candidate.name, candidate]))
    return { ...response, candidates: candidates.map(candidate => byName.get(candidate.name) ?? candidate) }
  }

  /**
   * #4045.12 — « besoins connus » et « référence comparable » lisent chacune la réponse DÉJÀ tranchée par
   * `withPortfolioState` et n'ont rien à s'apprendre l'une à l'autre : elles partent ensemble, puis se
   * fusionnent par position (même ordre de candidats, `withKnownNeeds` ne retire rien).
   */
  private async withKnownNeedsAndHeadline(userId: string, response: DiscoverResponse): Promise<DiscoverResponse> {
    const [needs, headline] = await Promise.all([
      this.withKnownNeeds(response),
      this.withSimilarityHeadline(userId, response),
    ])
    return {
      ...needs,
      candidates: needs.candidates.map((candidate, index) => {
        const similarityHeadline = headline.candidates[index]?.similarityHeadline
        return similarityHeadline ? { ...candidate, similarityHeadline } : candidate
      }),
    }
  }

  /**
   * #3819.1 — « besoins connus », APRÈS `withPortfolioState` : elle seule
   * tranche `accountId`, dont `resolveKnownNeeds` a besoin pour savoir quel
   * candidat correspond déjà à un compte. Voir `DiscoverPortfolioService` pour
   * ce qu'un `undefined` dit (candidat neuf, ou requête en échec — jamais un
   * `0` deviné) contre un `0` mesuré (compte possédé, aucun besoin ouvert).
   */
  private async withKnownNeeds(response: DiscoverResponse): Promise<DiscoverResponse> {
    const candidates = response?.candidates ?? []
    // #4068 — le décompte ET les besoins eux-mêmes : la carte en montre au moins un.
    const [counts, facts] = await Promise.all([
      this.portfolio.resolveKnownNeeds(candidates),
      this.portfolio.resolveKnownNeedFacts(candidates),
    ])
    return {
      ...response,
      candidates: candidates.map((candidate, index) => ({
        ...candidate,
        ...(counts[index] !== undefined ? { knownNeedsCount: counts[index] } : {}),
        ...(facts[index] !== undefined ? { knownNeeds: facts[index] } : {}),
      })),
    }
  }

  /**
   * #2165.28 / #2165.30 — les deux filtres SERVEUR de la mémoire marché,
   * AVANT `withPortfolioState` : moins de candidats à résoudre côté
   * portefeuille quand le filtre en écarte. Sans le service monté (module
   * mémoire marché absent), no-op strict — voir `DiscoverMarketMemoryService`.
   */
  private async withMarketMemoryFilters(
    response: DiscoverResponse,
    filters: { technologiesObserved?: string[]; externalRecourseObserved?: boolean },
  ): Promise<DiscoverResponse> {
    if (!this.discoverMarketMemory) return response
    const candidates = response?.candidates ?? []
    const { candidates: filtered, degraded } = await this.discoverMarketMemory.applyFilters(candidates, filters)
    // #3408 — la pile observée nourrit le « Périmètre conseillé » de la carte (best-effort, no-op sans mémoire marché).
    const annotated = await this.discoverMarketMemory.annotateObservedStacks(filtered)
    return { ...response, candidates: annotated, degraded: [...(response?.degraded ?? []), ...degraded] }
  }

  /**
   * #3671.2bis — un SIREN déclaré « Mauvaise entreprise » par CET espace ne
   * se rattache plus aux recherches suivantes. AVANT `withMarketMemoryFilters`,
   * même raison : moins de candidats à résoudre plus loin quand ce filtre en
   * écarte. Sans le module monté, no-op strict (comportement d'avant cette
   * capacité) — un incident de lecture dégrade en liste inchangée, jamais en
   * liste vide (voir `DiscoverCandidateFeedbackService.excludedSirens`).
   */
  private async withoutWrongCompanyCandidates(userId: string, response: DiscoverResponse): Promise<DiscoverResponse> {
    if (!this.discoverFeedback) return response
    const candidates = response?.candidates ?? []
    if (candidates.length === 0) return response
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const excluded = await this.discoverFeedback.excludedSirens(workspaceId)
    if (excluded.size === 0) return response
    return { ...response, candidates: candidates.filter(candidate => !excluded.has(candidate.siren)) }
  }

  /**
   * Plafond quotidien du copilote (décision Louis 31/07 — « gratuit mais borné »).
   *
   * Le copilote ne débite aucun crédit alors que CHAQUE message est un appel
   * Claude : c'est le poste qui pèse le plus lourd dans la facture du mois sans
   * qu'aucun compteur ne le voie. Plutôt que de le rendre payant (il est la
   * fonction qu'on veut voir utilisée), on borne l'usage d'un siège.
   *
   * Par UTILISATEUR, pas par workspace : le plafond protège la marge d'un siège,
   * il ne fait pas payer à un commercial l'usage de son collègue. Espace démo
   * exempté — le fil y est scripté, il n'appelle aucun modèle.
   *
   * `CHAT_DAILY_MESSAGE_LIMIT` POSÉ à `0` désactive la borne.
   *
   * ⚠️ Décision Louis 13/09 batch 13 — plafond selon le plan (grille des plans).
   * ⚠️ #4016 L7, décision Louis 11/10/2026 — le PLAN fait foi :
   * `CHAT_DAILY_MESSAGE_LIMIT` n'a plus de défaut ; posé, c'est un plafond de
   * SÉCURITÉ optionnel de l'opérateur (le minimum des deux) ; absent, il ne
   * bride rien (`effectiveChatDailyLimit`).
   *
   * ⚠️ Ce qu'il compte a changé le 30/08/2026 (décision Louis) : **le plafond
   * borne les DEMANDES, pas les allers-retours que Laura provoque elle-même.**
   * Depuis qu'elle pose une question de précision quand la demande est
   * incomplète, y répondre consommait un message — quelqu'un à qui elle ne
   * demande jamais rien s'en trouvait avantagé. La soustraction et sa borne
   * vivent dans `countableMessages` ; ce qui est exonéré est décidé à
   * l'écriture, par `ChatMessagesService`, à partir du marquage que Laura pose
   * elle-même.
   */
  private async assertChatQuota(userId: string): Promise<void> {
    const quota = await this.measureChatQuota(userId)
    if (quota.state !== 'measured' || quota.remaining > 0) return

    // #1957.8 → .10 — le refus porte des DONNÉES (code, plafond, instant de
    // réouverture, source du plafond) : l'écran formate l'heure dans le fuseau
    // et la langue de la personne, que l'API n'a pas. La phrase reste pour un
    // client qui ne lit pas le code. Elle dit ce qui reste utilisable (aucune
    // de ces routes ne passe par `assertChatQuota`).
    // Décision Louis 13/09 batch 13 — plafond selon le plan : elle dit « c'est
    // le plafond de ton plan » quand c'est VRAI, et rien sur le plan quand c'est
    // le plafond de sécurité de l'opérateur qui borne.
    const planSentence = quota.limitSource === 'plan' ? " C'est le plafond de ton plan." : ''
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message:
          `Plafond du copilote atteint (${quota.limit} messages sur 24 h glissantes). Il se rouvre au fil des heures, ` +
          'à mesure que tes demandes passent les 24 h. Les écrans, la recherche, les fiches, les analyses, ' +
          `les enrichissements, les exports et les actions déjà préparées restent disponibles.${planSentence}`,
        code: CHAT_QUOTA_REACHED_CODE,
        limit: quota.limit,
        reopensAt: quota.reopensAt,
        limitSource: quota.limitSource,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }

  /**
   * #1957.5 — ce que le plafond laisse à CET utilisateur, mesuré à UN endroit :
   * le refus (`assertChatQuota`) et l'annonce (`GET chat/quota`) lisent le même
   * comptage, sinon l'écran pourrait annoncer « il te reste 2 demandes » à
   * quelqu'un que le serveur refuse déjà.
   *
   * ⚠️ Un comptage illisible LÈVE (`countableMessages`) : le refus reste fermé.
   * C'est la route d'annonce, et elle seule, qui le traduit en `unmeasured`.
   */
  private async measureChatQuota(userId: string): Promise<ChatQuotaStatus> {
    // #4016 L7 — décision Louis 11/10/2026 : le PLAN fait foi ; le plafond
    // opérateur est OPTIONNEL (absent = `undefined`, aucune bride de plus).
    const operatorLimit = this.config.get<number | undefined>('chatDailyMessageLimit')
    // L'interrupteur de l'opérateur : `0` POSÉ coupe la borne entière, et aucun plan n'est lu.
    if (typeof operatorLimit === 'number' && operatorLimit <= 0) return { state: 'unbounded' }
    if (await this.workspaceContext.isDemoWorkspace(userId)) return { state: 'unbounded' }
    // Louis 29/09/2026 — l'exemption nominative de l'opérateur (compte de recette).
    if (isChatQuotaExempt(userId, this.config.get('chatQuotaExemptUserIds'))) return { state: 'unbounded' }

    // décision Louis 13/09 batch 13 — plafond selon le plan
    const ceiling = effectiveChatDailyLimit({
      operatorLimit,
      planLimit: chatDailyLimitOfPlan(await this.readWorkspacePlan(userId)),
    })
    if (!ceiling) return { state: 'unbounded' }
    const { limit } = ceiling

    const since = new Date(Date.now() - QUOTA_WINDOW_MS)
    const measured = await this.chatMessages.measureUserMessagesSince(userId, since)
    const used = countableMessages({ ...measured, limit })
    const remaining = Math.max(limit - used, 0)
    const reopensAt = remaining === 0 ? await this.readQuotaReopening(userId, since, limit) : null
    return {
      state: 'measured',
      limit,
      remaining,
      low: isChatQuotaLow(remaining, limit),
      reopensAt: reopensAt ? reopensAt.toISOString() : null,
      limitSource: ceiling.source,
    }
  }

  /**
   * Décision Louis 13/09 batch 13 — le palier de l'espace, pour le plafond.
   *
   * Best-effort, et le sens de la dégradation est choisi : un palier illisible
   * (module absent, lecture en échec) rend `null`, donc le plafond de SÉCURITÉ
   * de l'opérateur — jamais « aucune borne », et jamais un refus fermé pour une
   * panne de lecture de l'abonnement.
   */
  private async readWorkspacePlan(userId: string): Promise<string | null> {
    if (!this.planFeatures) return null
    try {
      return await this.planFeatures.planForUser(userId)
    } catch (error) {
      this.logger.warn(`Palier illisible pour le plafond du copilote, plafond opérateur appliqué: ${String(error)}`)
      return null
    }
  }

  /** #1957.8 — best-effort : un instant incalculable vaut `null`, jamais une heure devinée. */
  private async readQuotaReopening(userId: string, since: Date, limit: number): Promise<Date | null> {
    try {
      const stamps = await this.chatMessages.userMessageStampsSince(userId, since)
      return stamps ? quotaReopensAt({ stamps, limit }) : null
    } catch (error) {
      this.logger.warn(`Réouverture du plafond du copilote incalculable: ${String(error)}`)
      return null
    }
  }

  /**
   * #1957.5 — `GET /ia/chat/quota` : ce qui reste à la personne CONNECTÉE, pour
   * la prévenir AVANT le mur (« il te reste peu de demandes »).
   *
   * Cloisonné au JWT (`user.userId`), jamais un paramètre. Aucun appel de
   * modèle. Sans borne ou en démonstration : `unbounded`, rien à annoncer. Un
   * comptage illisible : `unmeasured` — l'écran se tait plutôt que d'écrire
   * « 0 restant ».
   */
  @Get('chat/quota')
  async chatQuota(@CurrentUser() user: CurrentUserPayload): Promise<ChatQuotaStatus> {
    try {
      return await this.measureChatQuota(user.userId)
    } catch (error) {
      this.logger.warn(`Plafond du copilote non mesurable: ${String(error)}`)
      return { state: 'unmeasured' }
    }
  }

  /**
   * Le marquage à la SOURCE du saut de précision.
   *
   * Quand Laura répond par une question de précision — c'est-à-dire quand le
   * modèle a appelé `ask_clarification`, qui ARRÊTE le tour —, on estampille le
   * message qui l'a provoquée. Le message suivant de la personne héritera du
   * marquage et ne comptera pas contre le plafond.
   *
   * Best-effort, et le sens de la dégradation est choisi : un marquage perdu
   * fait payer un message de plus, jamais l'inverse. Une exonération qui
   * déborde est le seul risque réel de ce mécanisme.
   */
  /**
   * #1949.23 — décision Louis 13/09 batch 12, contre la recommandation : une
   * demande que Laura n'a pas su router laisse une trace ANONYME (règle 2 de
   * `c64_analytique_produit` levée pour ce seul usage, relecture juridique RGPD
   * toujours due).
   *
   * Le moteur IA pose le signal (catégorie + texte DÉJÀ masqué) ; ce contrôleur
   * le relit en liste blanche, refuse la salle de DÉMONSTRATION — le service ne
   * peut pas la lire (GA-07) —, et passe l'espace au service, qui n'en écrit
   * qu'un hash tourné à 24 h. Best-effort et APRÈS la réponse : tracer ne
   * retarde ni ne casse le tour, et le journal ne porte que le NOM de l'erreur.
   */
  private async recordUnroutedIntent(args: {
    envelope: IaEnvelope
    userId: string
    workspaceId: string
    dto: ChatDto
  }): Promise<void> {
    const intents = this.unroutedIntents
    if (!intents || !args.envelope.success) return
    const signal = readUnroutedSignal(args.envelope.data)
    if (!signal) return
    try {
      if (await this.workspaceContext.isDemoWorkspace(args.userId)) return
      await intents.record({
        signal,
        workspaceId: args.workspaceId,
        surface: surfaceOf(args.dto.pageContext),
        language: languageOf(args.dto.interfaceLanguage),
      })
    } catch (error) {
      this.logger.warn(
        `Trace d'une demande non comprise impossible (${error instanceof Error ? error.name : typeof error})`,
      )
    }
  }

  private async markPrecisionRequest(args: {
    envelope: IaEnvelope
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId: string | null
  }): Promise<void> {
    if (!askedForPrecision(args.envelope)) return
    try {
      await this.chatMessages.markPrecisionRequest({
        userId: args.userId,
        workspaceId: args.workspaceId,
        accountId: args.accountId,
        conversationId: args.conversationId,
      })
    } catch (error) {
      this.logger.warn(`Marquage de la question de précision impossible: ${String(error)}`)
    }
  }

  /**
   * Ce que le navigateur voit quand le flux casse EN COURS — ni le plafond
   * nommé (`_TIMEOUT_REPLY`, côté IA), ni le kill-switch : une vraie coupure
   * (idle timeout, connexion perdue). LA MÊME phrase que le filet générique
   * de `chat.py`, pour que les deux bouts de la chaîne disent la même chose.
   */
  /** #3493 — la cause d'une panne : le type et le message de l'erreur, jamais un corps de message. */
  private static describeFailure(error: unknown): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  }

  private static readonly STREAM_FAILURE_REPLY =
    'Désolé, une erreur est survenue côté assistant. Réessaie dans un instant.'

  /**
   * #4540 — le `done` d'un échec côté assistant : la phrase (filet générique, inchangée) ET un
   * marqueur lisible par machine, pour que l'écran propose de relancer la MÊME question au lieu de
   * rendre une phrase d'excuse sans suite.
   */
  private static streamFailureData(): { reply: string; failure: 'assistant_stream' } {
    return { reply: IaProxyController.STREAM_FAILURE_REPLY, failure: 'assistant_stream' }
  }

  @RequireFeature('chat_ai')
  /**
   * #3236 (lot W2) — un tour de reprise automatique d'une étude Approfondie (voir `runDeepenResumeTurn`) :
   * le MÊME chemin que `chat` ci-dessous, sans navigateur.
   */
  async resumeDeepenTurn(job: DeepenResumeTarget): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(job.user_id)
    await runDeepenResumeTurn(job, {
      workspaceId,
      chat: (user, dto, res) => this.chat(user, dto as unknown as ChatDto, res),
      messages: this.chatMessages,
    })
  }

  // #4629.2 — le chat coûte du modèle : un essai terminé le ferme, propriétaire compris (refus énuméré).
  @RequireOpenTrial()
  @Post('chat')
  async chat(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChatDto, @Res() res: Response): Promise<void> {
    // #2442.4 (épopée #2879) — les étapes de l'API avant le service IA, dans
    // la trace du tour. `receivedAt` (posé par `correlationIdMiddleware`, le
    // seul maillon qui s'exécute AVANT tout guard Nest) fait démarrer
    // l'horloge à la RÉCEPTION de la requête plutôt qu'à l'entrée dans ce
    // contrôleur : le premier lap mesure alors le span « auth » manquant —
    // tout ce qui s'est passé entre la réception et ici, routage et guards
    // (`@RequireFeature('chat_ai')` compris) — sans qu'aucun de ces guards
    // n'ait besoin de connaître cette horloge. Hors d'une vraie requête HTTP
    // (un test qui appelle le contrôleur directement), `receivedAt` est
    // absent : le span reste alors NON MESURÉ plutôt que posé à zéro.
    const receivedAt = getCorrelationContext()?.receivedAt
    const chatTurnClock = new ChatTurnClock(Date.now, receivedAt)
    if (receivedAt !== undefined) chatTurnClock.lap('auth')
    // #1942.2 / #1942.12 — SALLE DE DÉMONSTRATION : aucun appel de modèle.
    //
    // Sept endroits de ce fichier tenaient déjà la promesse (`discover/registry`,
    // `discover/signals`, le plafond quotidien, la trace des demandes non
    // routées, le titre des fils, `chat/voice/status` et `chat/voice/transcribe`)
    // ; LE TOUR, lui, NE LA TENAIT PAS. La bulle flottante
    // de Laura est montée globalement (`routes/__root.tsx`), donc ouverte dans
    // la salle publique : chaque message y déclenchait un vrai appel facturé
    // sur un espace que personne ne surveille — et le plafond quotidien, lui,
    // rend `unbounded` en démonstration (plus haut dans ce fichier), donc rien
    // ne bornait le nombre de ces appels.
    //
    // Le navigateur, lui, répond par le moteur préparé (`demo-turn.ts`, #1320)
    // et n'arrive donc jamais ici — mais un client se contourne, et c'est cette
    // ligne qui TIENT. Même forme que `chat/voice/transcribe` plus bas, et même
    // ordre : ce qui refuse sans appel réseau passe d'abord, ici AVANT le
    // plafond, le contexte et les en-têtes SSE (« LOT STREAM » plus bas), pour
    // que le refus reste un statut HTTP ordinaire.
    //
    // Aucune réponse n'est fabriquée ici : la réponse préparée vit côté
    // navigateur, avec les dossiers de la salle qu'elle cite.
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      throw new BadRequestException(
        'Dans l’espace de démonstration, les réponses de Laura sont préparées à l’avance : aucun service payant n’y est appelé. Repose ta question depuis la conversation, les questions préparées de cette salle y sont proposées.',
      )
    }
    await this.assertChatQuota(user.userId)
    chatTurnClock.lap('quota')
    // #1943.1 — le TOUR de ce message, moitié de la clé de ses cartes
    // (`card:<tour>:<rang>`). Repris du navigateur quand il en a déjà un — une
    // reprise du même tour retrouve ses cartes au lieu d'en ouvrir d'autres (I5).
    const turnId = dto.turnId ?? randomUUID()
    // #1943.5 — le début du tour, AVANT l'appel au service IA : ce qui borne les
    // suivis d'analyse que le pont inscrit pendant le tour (`adoptAnalysisLaunches`).
    const turnStartedAt = new Date()
    // Resolve the ENTIRE context server-side from the JWT + accountId (Théo §4/§13):
    // the ESN profile, the account, its contacts and the plan digest. The front no
    // longer assembles account/contacts nor sends a profile — it sends only intent.
    // Long memory (Théo P2) — pinned facts, preferences and the rolling
    // conversation summary — is folded in by chat-context, scoped to the caller's
    // active workspace.
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #1941.5 / #1941.8 — les accords en propre du lecteur, pour
    // `withReaderPermissions` plus bas (même paire rôle+accords que
    // `WorkspacePermissionGuard`). Une seule lecture par tour.
    const readerExtraPermissions = await this.workspaceContext.extraPermissionsOf(workspaceId, user.userId)
    // #1918.2 — les périmètres PORTÉS, pour que la mémoire d'une équipe entre
    // dans le contexte de ses membres — et de personne d'autre. Résolu UNE
    // fois : `businessUnitDetailsOf` ci-dessous en a besoin pour la MÊME
    // liste (#2259.30-.35), une seconde lecture diverge au premier BU ajouté
    // ou retiré entre les deux appels.
    const businessUnitIds = await this.perimetersOf(workspaceId, user.userId)
    // #3772.5 — `true` seulement quand le navigateur le DEMANDE (jamais déduit).
    const excludeWorkspaceData = dto.excludeWorkspaceData === true
    const ctx = await this.chatContext.build({
      userId: user.userId,
      workspaceId,
      // #3772.5 — l'exclusion stricte l'emporte : aucun dossier n'est relu.
      accountId: excludeWorkspaceData ? undefined : dto.accountId,
      excludeWorkspaceData,
      conversationId: dto.conversationId,
      // #2430.2 — une BRANCHE part avec le résumé de son fil d'origine.
      parentConversationId:
        dto.conversationId && this.conversations
          ? await this.conversations.parentOf(workspaceId, dto.conversationId)
          : null,
      // Lets the shared thread resolve an account named in the message text.
      message: dto.message,
      // #2428.12 — id canonique choisi au clic ; `null` retombe sur
      // l'heuristique par prénom, jamais cassé.
      mentionedUserId: dto.mentionedUserId ?? null,
      // #1581.1 — les quatre couches que les retours demandent : le privé et les
      // signaux voyagent avec chaque compte, celle-ci est un agrégat de
      // portefeuille et se lit donc ici.
      marketPortfolio: excludeWorkspaceData ? null : await this.readMarketPortfolio(user.userId, workspaceId),
      businessUnitIds,
      // #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — les FICHES des
      // BU ci-dessus (DÉCISION Louis 17/09 après-midi) : le contexte de BU
      // envoyé à Laura, jamais un filtre.
      businessUnitDetails: await this.businessUnitDetailsOf(workspaceId, businessUnitIds),
      // #2259.4 / #2259.13 — déjà résolu juste au-dessus (`resolveActiveWorkspace`),
      // simplement PORTÉ : ce service ne recalcule aucun rôle lui-même (GA-07).
      role,
    })
    // #1919.15 — lu AVANT les en-têtes SSE, comme le contexte : best-effort, une
    // lecture ratée rend `null` et le tour part sans ce bloc.
    const replyFeedback = await this.readReplyFeedback(user.userId, workspaceId)
    // #1954.7 — le fil dont CE tour peut lire les documents « fil seul ». Rangé,
    // il ne se transmet pas : ses documents restent masqués jusqu'à ce qu'on le
    // ressorte (Louis, 12/09/2026).
    const readableConversationId = await this.threadDocuments.readableThread({
      // #2703 — la clé du fil porte désormais son propriétaire ; sans
      // `conversationId` cette lecture rend `undefined` avant même de lire.
      userId: user.userId,
      workspaceId,
      accountId: dto.accountId ?? null,
      conversationId: dto.conversationId ?? null,
    })

    // LOT STREAM (12/09/2026) — tout ce qui PRÉCÈDE (plafond, contexte) est un
    // geste serveur normal, susceptible d'échouer en HTTP classique (429, 403,
    // 500 par le filtre d'exceptions de Nest). Les en-têtes SSE ne partent
    // qu'À PARTIR D'ICI : après ce point, un refus ne peut plus être un
    // statut HTTP — il doit voyager DANS le flux, comme `chat.py` le fait déjà
    // pour son propre budget dépassé.
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    // Certains proxys bufferisent un flux tant qu'ils n'ont pas vu ce signal —
    // sans lui, le premier octet n'atteindrait le navigateur qu'à la fin.
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    // D8 — Arrêter. Le navigateur qui ferme la connexion (bouton Arrêter, onglet
    // fermé) ANNULE la requête vers le service IA : sans ce signal, le tour
    // continuait jusqu'au bout — un appel modèle payé pour une réponse que
    // personne ne lira, et des cartes proposées après coup. `close` est aussi
    // émis après une fin NORMALE : seul un `close` sans `end` est une annulation.
    //
    // #4967 (lot L6, arbitrage Louis : côté serveur) — D8 est gardé pour tout client qui ne le demande
    // pas ; un tour EN ARRIÈRE-PLAN (`background`, l'écran `/chat`, sur un fil nommé) ne meurt plus avec
    // la connexion : le navigateur parti (autre écran, autre fil, onglet fermé) le DÉTACHE, le tour va au
    // bout et c'est ce contrôleur qui écrit la réponse dans le fil. Seul « Arrêter »
    // (`POST /ia/chat/turns/:turnId/stop`, via le registre) l'abolit.
    const abort = new AbortController()
    const background = dto.background === true && Boolean(dto.conversationId)
    let detached = false
    res.on?.('close', () => {
      if (res.writableEnded) return
      if (background) detached = true
      else abort.abort()
    })
    if (background) {
      this.turnRegistry?.begin({
        turnId,
        userId: user.userId,
        workspaceId,
        conversationId: dto.conversationId ?? null,
        abort,
      })
    }

    // #2257.1 — LE CONTRAT DE DEMANDE STRUCTURÉ, produit UNE FOIS par tour à
    // partir de ce que ce contrôleur a DÉJÀ résolu — jamais un second appel au
    // modèle. Seuls deux des dix-huit champs ont un producteur aujourd'hui
    // (`objet_depart`, `ambiguite_deja_demandee`) ; les autres restent nommés
    // et `null` (voir `request-intent-contract.ts`, GA-26 — un seul contrat).
    // Journalisé SANS CONTENU : `requestIntentContractForLog` retire même le
    // nom du compte, ne garde que sa PRÉSENCE.
    chatTurnClock.lap('context')
    const intentContract = buildRequestIntentContract({
      activeAccountCompanyName:
        typeof ctx.accountData?.['company_name'] === 'string' ? (ctx.accountData['company_name'] as string) : null,
      clarificationAlreadyAsked: dto.clarificationAsked ?? false,
    })
    this.logger.log('Contrat de demande structuré (#2257.1)', {
      tags: { 'chat.turn_id': turnId, ...requestIntentContractForLog(intentContract) },
    })

    let costHeader: string | null = null
    let terminal: { success: boolean; data: Record<string, unknown> } | null = null
    // #1927.10 — l'état du fil rendu par CE tour, déjà validé ; `null` = aucun
    // (service IA d'avant #1927, état vide, forme illisible).
    let returnedThreadState: ReturnType<typeof parseThreadState> = null
    // #2442.12 (épopée #2879) — le registre de coûts DU TOUR, rendu dans le
    // `done` : l'en-tête `x-bellum-costs` d'un flux part au premier octet, vide.
    let returnedTurnCosts: unknown = undefined
    const writeDone = (payload: { success: boolean; data: Record<string, unknown> }) => {
      terminal = payload
      // D8 — plus personne n'écoute : rien ne s'écrit sur une connexion fermée (#4967 : ni détachée).
      if (abort.signal.aborted || detached) return
      // #1949.23 — le signal « demande non routée » s'arrête ICI : le navigateur
      // reçoit l'enveloppe d'avant. Sans signal, `withoutUnroutedSignal` rend le
      // MÊME objet — la ligne écrite est celle d'avant, au caractère près.
      res.write(`data: ${JSON.stringify({ type: 'done', ...payload, data: withoutUnroutedSignal(payload.data) })}\n\n`)
    }
    try {
      // #3708.fournisseur — le registre est lu UNE fois par tour : les familles
      // opérationnelles et l'exclusion « Outils et sources » en dérivent toutes deux.
      const registryTools = await this.registryTools(user.userId)
      const toolExclusions = resolveToolExclusions(registryTools, dto.excludedToolProviders, dto.excludedToolFamilies)
      for await (const event of this.ia.chatStream(
        {
          userId: user.userId,
          // Grounding RAG d'équipe : le copilote cite les documents de l'ESN.
          workspaceId,
          message: dto.message,
          accountId: excludeWorkspaceData ? undefined : dto.accountId,
          history: dto.history,
          // Fichiers déposés dans le fil. Le service IA charge leur contenu et le
          // scope au user/workspace ; l'API ne transmet que les identifiants.
          documentIds: dto.documentIds ?? undefined,
          // #2148.16 — la pièce jointe de CONVERSATION (cas a) : le texte est
          // déjà là (extrait par `POST /rag-documents/extract`, jamais
          // ingéré), transmis tel quel pour CE tour — rien n'est écrit ici.
          attachedFiles: dto.attachedFiles ?? undefined,
          // #1954.7 — un document « fil seul » n'est lu QUE par son fil (et
          // aucun pour un fil rangé : `readableThread` rend `undefined`).
          conversationId: readableConversationId,
          accountData: ctx.accountData,
          contactsSummary: ctx.contactsSummary,
          planSummary: ctx.planSummary,
          accountsSummary: ctx.accountsSummary,
          profileData: ctx.profileData,
          pinnedFacts: ctx.pinnedFacts,
          userPreferences: ctx.userPreferences,
          conversationSummary: ctx.conversationSummary,
          // Real integration state → the IA builds the honest "not consulted" list.
          crmConnected: ctx.crmConnected,
          crmProvider: ctx.crmProvider,
          // Presence read-back (roadmap §8/§9) — non-null only when the CRM was
          // actually queried for the active account; flips it to "consulté".
          crmPresence: ctx.crmPresence,
          // #1915.11 — la lecture a été TENTÉE et a ÉCHOUÉ : le panneau dit
          // « indisponible », jamais « non croisé » (qui se lit comme « rien
          // trouvé »). `undefined`/`false` = comportement d'avant, byte pour byte.
          crmUnavailable: ctx.crmUnavailable,
          // Mémoire de corrections du compte (feedback loop A2) — directives issues
          // des retours utilisateur sur ce dossier, résolues server-side.
          accountFeedback: ctx.accountFeedback,
          // #3272.6 — REX de perte du compte, condensés server-side (jamais mot
          // pour mot) : Laura peut citer une route déjà essayée sans réciter le formulaire.
          lostDealRexContext: ctx.lostDealRexContext,
          // #3390.10/.11 — la méthode retenue du besoin ouvert, telle que l'écran la montre.
          commercialMethodContext: ctx.commercialMethodContext,
          // #4071.1 — les faits du compte (socle #4069), datés, sans provenance.
          accountFactsContext: ctx.accountFactsContext,
          // #3295 — les règles apprises de l'espace (adoptées puis activées).
          workspaceLearnedRulesContext: ctx.workspaceLearnedRulesContext,
          // #4071.3 — recherches enregistrées, listes de cibles, conversations passées : datées, sans provenance.
          workspaceRecallContext: ctx.workspaceRecallContext,
          // Registre d'outils (Tool Registry v2) — digest compact des outils
          // réellement connectés + coût des actions, pour que le copilote propose
          // « enrichir via Dropcontact, coût 1 crédit » sans jamais inventer un outil.
          toolsSummary: ctx.toolsSummary,
          // #2261.21-32 — capacités INTERNES (comptes, contacts, besoins, vivier,
          // missions, mémoire marché, DataForge, routines) : même registre que
          // `toolsSummary` ci-dessus (GA-26), jamais un second manifeste.
          internalCapabilitiesSummary: ctx.internalCapabilitiesSummary,
          // Une seule voix (D44) : le copilote parle avec le prénom de la
          // personne quand l'espace le connaît.
          chatFirstName: ctx.firstName,
          // #2259.11 / #2259.4 / #2259.13 / #2259.6 — identité et entourage,
          // résolus server-side, jamais devinés (LAU-FINAL-004, #2259).
          lastName: ctx.lastName ?? undefined,
          workspaceRole: ctx.workspaceRole ?? undefined,
          isAccountOwner: ctx.isAccountOwner ?? false,
          mentionedColleague: ctx.mentionedColleague ?? undefined,
          // #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — la ou les
          // BU portées, avec ce que l'espace en sait (DÉCISION Louis 17/09
          // après-midi). `undefined` sur une liste vide : propriétaire sans
          // BU, aucune clé envoyée, prompt inchangé.
          businessUnits: ctx.businessUnits?.length ? ctx.businessUnits : undefined,
          // LE FUSEAU DE LA PERSONNE (décision Louis, 14/09/2026). Lu côté
          // serveur sur son profil, jamais depuis le corps du navigateur : le
          // fuseau est un RÉGLAGE que la personne a confirmé ou corrigé, et il
          // doit gagner sur ce que l'appareil du moment annonce. `undefined` =
          // inconnu = clé omise = fuseau de référence du service IA.
          timezone: ctx.timezone ?? undefined,
          // #1958.2 — LE FUSEAU DE L'ESPACE, résolu server-side (jamais envoyé
          // par le navigateur, même discipline que `timezone` ci-dessus).
          workspaceTimezone: ctx.workspaceTimezone ?? undefined,
          workspaceCreatedAt: ctx.workspaceCreatedAt ?? undefined,
          // #2266.10 (épopée #2920) — même discipline : clé omise si l'espace
          // n'a encore aucune collecte connue, jamais une date inventée.
          workspaceLastSyncAt: ctx.workspaceLastSyncAt ?? undefined,
          // Routeur étape 3 : les familles d'outils RÉELLEMENT opérationnelles.
          // Le service IA n'a aucun moyen de les connaître — les jetons vivent
          // ici, chiffrés. Sans cette liste, la vérification de capacité resterait
          // une consigne de prompt, c'est-à-dire un conseil.
          connectedFamilies: connectedFamiliesOf(registryTools),
          // CE QUE LA PERSONNE A SOUS LES YEUX (bulle de Laura).
          //
          // Le navigateur envoie la STRUCTURE, le serveur la rend en texte : la
          // dérivation vit à un seul endroit (`renderLauraPageContext`,
          // @bellum/contracts), lue aussi par l'app web pour montrer à la personne
          // ce que Laura voit de son écran. Deux rendus auraient divergé au
          // premier champ ajouté.
          //
          // ⚠️ Absent ou illisible → chaîne vide → clé non envoyée au service IA →
          // prompt byte-identique. L'écran `/chat`, qui ne déclare rien, ne change
          // pas d'un octet.
          pageContext: renderLauraPageContext(dto.pageContext),
          clarificationAsked: dto.clarificationAsked ?? false,
          // #1960.20 — en marque blanche, aucune adresse Bellum dans la voix de
          // Laura. Lu côté serveur, jamais depuis le corps du navigateur.
          whiteLabel: await this.isWhiteLabel(workspaceId),
          // #1958.8 — la langue de l'INTERFACE, déclarée par le navigateur —
          // jamais résolue ici, comme `pageContext` juste au-dessus.
          interfaceLanguage: dto.interfaceLanguage ?? undefined,
          // #1951.2 / #1951.3 — la fiche relue ci-dessus, jamais un texte du corps.
          scopeObject: await this.readScopeObject(
            user.userId,
            workspaceId,
            excludeWorkspaceData ? null : dto.scopeObject,
          ),
          // #2453 — le mode de contexte DÉCLARÉ sous le composeur, tel quel.
          contextMode: dto.contextMode ?? undefined,
          // #3772.5 — l'exclusion stricte, transmise au service IA qui l'applique en code.
          excludeWorkspaceData: excludeWorkspaceData || undefined,
          // #2450.1 (reste partiel, épopée #2882) — le mode de recherche
          // DÉCLARÉ sous le composeur, tel quel : `mode` reste ici, jamais
          // recalculé — le service IA seul sait s'il force le palier.
          mode: dto.mode ?? undefined,
          // #3708 — les sources exclues dans « Outils et sources », telles quelles.
          // #3708.fournisseur — recoupée avec le registre RÉEL : un outil inconnu est
          // écarté, le dernier outil décoché d'une famille exclut la famille.
          excludedToolFamilies: toolExclusions.families.length ? toolExclusions.families : undefined,
          excludedToolProviders: toolExclusions.providers.length ? toolExclusions.providers : undefined,
          // #3768 — le geste « retravailler cette réponse », tel que borné par le
          // schéma du DTO : le service IA en fait un bloc de prompt volatil.
          replyTransform: dto.replyTransform ?? undefined,
          // #4397 (N1) — l'objet d'une suite cliquée, hors du texte du message.
          followUpRef: dto.followUpRef ?? undefined,
          // #1950.17 — le plafond agrégé d'une réponse, lu dans la grille.
          replyCostCeiling: LAURA_REPLY_COST_CEILING_CREDITS,
          // #1927.10 — l'état structuré du fil, rechargé par le contexte (jamais
          // envoyé par le navigateur). Absent = clé omise côté service IA.
          threadState: ctx.threadState ?? undefined,
          // #1919.15 — les retours de CETTE personne, jamais ceux d'un collègue.
          replyFeedback,
        },
        {
          // D8 — l'annulation du navigateur coupe l'appel au service IA (le
          // plafond de durée de `chatStream` s'y ajoute, il ne le remplace pas).
          signal: abort.signal,
          // Ce que CE message a coûté (D19) — le copilote est le premier poste de
          // la facture Anthropic et ne débitait aucun crédit.
          responseHeaderName: IA_COST_HEADER,
          onResponseHeader: (_name, value) => (costHeader = value),
          // #2442.3 — l'id du message + la durée des étapes de l'API ; jamais un texte.
          headers: chatTurnClock.header(turnId),
        },
      )) {
        if (event.type === 'done') {
          // #1927.10 — l'état du fil rendu par le service IA est une affaire
          // SERVEUR : lu ici (une seule lecture, `parseThreadState`), stocké
          // plus bas avec le résumé, et RETIRÉ de ce que le navigateur reçoit —
          // son `done` reste byte-identique à celui d'avant #1927.
          // #3493 — une réponse BONNE ne devient jamais « erreur côté assistant » parce
          // qu'un habillage postérieur (cartes, job, permissions, portefeuille) a levé :
          // la réponse part nue, la cause est journalisée (type + trace, jamais le texte).
          // #2442.12 — `turn_costs` RETIRÉ de même : un client ne voit jamais nos coûts (D19).
          const { thread_state: rawThreadState, turn_costs: rawTurnCosts, ...browserData } = event.data
          returnedTurnCosts = rawTurnCosts
          try {
            if (rawThreadState !== undefined) returnedThreadState = parseThreadState(rawThreadState)
            // #1943.1 — les cartes du tour sont PERSISTÉES avant que le `done` ne
            // parte : le navigateur reçoit leur identité et leur état dans le même
            // événement, et un rechargement les retrouve (D1).
            // #1916.24 — la trace de mémoire est écrite AVANT que le navigateur
            // voie la fin. Les trois se COMPOSENT sur le même `done`, dans cet
            // ordre : `thread_state` retiré, puis les cartes (qui peuvent y poser
            // `turn_id`), puis la trace (qui n'ajoute que `memory_turn_id`).
            writeDone(
              this.withReadablePortfolio(
                this.withReaderPermissions(
                  await this.withMemoryTrace(
                    await this.withTurnCards(
                      { success: event.success, data: browserData },
                      {
                        user,
                        conversationId: dto.conversationId ?? null,
                        turnId,
                        signal: abort.signal,
                        startedAt: turnStartedAt,
                      },
                    ),
                    {
                      userId: user.userId,
                      workspaceId,
                      factIds: ctx.pinnedFactIds,
                    },
                  ),
                  { role, extra: readerExtraPermissions },
                ),
                ctx.readablePortfolio,
              ),
            )
          } catch (error) {
            this.logger.error(
              `Habillage de la réponse du chat en échec — réponse rendue sans habillage: ${IaProxyController.describeFailure(error)}`,
              error instanceof Error ? error.stack : undefined,
            )
            writeDone({ success: event.success, data: browserData })
          }
          continue
        }
        if (!abort.signal.aborted && !detached) res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
    } catch (error) {
      // Le repli : un flux qui casse EN COURS (idle timeout, connexion IA
      // perdue) ne doit ni pendre le navigateur ni lui rendre un 500 muet —
      // des en-têtes 200 sont déjà partis. Le client reçoit quand même un
      // `done` honnête.
      if (abort.signal.aborted) {
        // D8 — un arrêt demandé n'est pas une panne, il ne se journalise pas comme telle.
        this.logger.log('Tour de chat arrêté par le navigateur')
      } else {
        // #3493 — le TYPE et la trace, jamais `String(error)` seul : une coupure
        // réseau, un délai d'inactivité et une panne d'habillage se lisaient pareil.
        // #4540 — marqueur DISTINCT de la cause (comme `model_key_scope_missing`, #4473) : chercher
        // `chat_stream_failed` dans le journal sépare cet échec des autres.
        this.logger.error(
          `Flux de chat interrompu [chat_stream_failed:stream_interrupted]: ${IaProxyController.describeFailure(error)}`,
          error instanceof Error ? error.stack : undefined,
        )
      }
      // Un `done` déjà parti reste LE terminal : un second écraserait la vraie réponse.
      if (!terminal) writeDone({ success: false, data: IaProxyController.streamFailureData() })
    }
    if (!terminal) {
      // Le flux s'est terminé SANS jamais émettre de `done` — un producteur
      // qui a raccroché proprement mais sans terminal event. Le silence
      // n'est jamais un succès — ni muet dans le journal (#4540).
      this.logger.error('Flux de chat terminé sans événement terminal [chat_stream_failed:no_terminal_event]')
      writeDone({ success: false, data: IaProxyController.streamFailureData() })
    }
    res.end()

    // Tout ce qui suit était déjà du travail APRÈS la réponse HTTP — la
    // diffusion ne change rien à cet ordre, elle avance seulement le moment
    // où le NAVIGATEUR voit le premier octet.
    // `writeDone` a TOUJOURS tourné au moins une fois avant ce point (le
    // flux réussi, le catch, ou le filet « aucun `done` ») — non-null par
    // construction, mais dans une fermeture que le contrôle de flux de TS
    // ne peut pas suivre à travers `writeDone`.
    const envelope = terminal!
    // Roll the conversation summary forward with this exchange (best-effort,
    // deterministic — no blocking LLM call). Only when the IA actually replied.
    const reply = typeof envelope?.data?.['reply'] === 'string' ? (envelope.data['reply'] as string) : ''
    // D8 — un tour arrêté n'a pas eu lieu pour la personne : il ne roule pas le
    // résumé du fil, et une question qu'elle n'a pas vue n'exonère rien.
    const stoppedByBrowser = abort.signal.aborted
    if (background) {
      // #4967 — le navigateur est parti avant la fin : la réponse finie s'écrit ICI (il ne l'écrira plus),
      // AVANT que le tour quitte le registre — l'écran qui relit le fil la trouve dès qu'il n'est plus
      // « en cours ». Arrêté ou vide : rien d'écrit (une réponse partielle n'est pas un tour terminé).
      try {
        if (detached && !stoppedByBrowser && envelope?.success && reply.trim() && dto.conversationId) {
          await this.chatMessages.create({
            userId: user.userId,
            workspaceId,
            accountId: dto.accountId ?? null,
            conversationId: dto.conversationId,
            role: 'assistant',
            content: reply,
            turnId,
            context: envelope.data,
          })
        }
      } catch (error) {
        this.logger.error(
          `Réponse d'un tour détaché non écrite [chat_background_persist_failed]: ${IaProxyController.describeFailure(error)}`,
        )
      } finally {
        this.turnRegistry?.end(turnId)
      }
    }
    if (envelope?.success && reply && !stoppedByBrowser) {
      await this.chatContext.recordConversationTurn({
        userId: user.userId,
        workspaceId,
        accountId: dto.accountId ?? null,
        conversationId: dto.conversationId ?? null,
        userMessage: dto.message,
        // #1914 — le résumé roulant repart dans le PROMPT : une carte y entre en
        // texte, jamais en JSON (tronqué par le résumé, il deviendrait illisible).
        // Le navigateur, lui, a reçu la carte intacte dans l'événement `done`.
        assistantReply: machineReplyText(reply),
        // #1927.10 — l'état du fil prolongé par ce tour, stocké sur la même
        // ligne que le résumé. Absent = colonne non touchée.
        threadState: returnedThreadState ?? undefined,
      })
    }
    // #1953.19 — CE TOUR N'A-T-IL RIEN RENDU ? — tranché Louis 16/09/2026,
    // « non facturé si le modèle n'a rien rendu ».
    //
    // Un tour de copilote ne débite aucun crédit et ne pose aucune réservation :
    // ce qu'il consomme est UNE DEMANDE du plafond quotidien. C'est donc là, et
    // nulle part ailleurs, qu'un retry technique pouvait faire payer deux fois
    // la même question — le flux casse, la personne relance, sa fenêtre de 24 h
    // a compté deux demandes pour une seule réponse reçue.
    //
    // La frontière est celle, déjà tranchée, des timeouts : la requête a-t-elle pu
    // RENDRE quelque chose ? Le prédicat est le MÊME que celui du résumé roulant
    // ci-dessus (`envelope.success && reply`), et c'est volontaire — un tour qui
    // ne mérite pas d'entrer dans l'historique du fil n'a rien rendu non plus.
    //
    // ⚠️ Un ARRÊT demandé par la personne n'est PAS une panne technique : la
    // réponse partait, elle l'a coupée. L'exonérer ferait du bouton « stop » un
    // moyen de vider le plafond de son sens (D8 dit qu'un tour arrêté n'a pas eu
    // lieu pour la personne — il ne dit pas qu'il n'a rien coûté).
    if (!stoppedByBrowser && !(envelope?.success && reply.trim())) {
      // #4540 — la trace dit que ce tour n'a rien rendu et qu'il est régularisé, jamais un texte.
      this.logger.warn(
        `Tour de chat sans réponse rendue — plafond régularisé [chat_turn_unrendered] (success=${String(envelope?.success)})`,
      )
      await this.chatMessages
        .releaseQuotaForUnrenderedTurn({
          userId: user.userId,
          workspaceId,
          accountId: dto.accountId ?? null,
          conversationId: dto.conversationId ?? null,
          // #4540 (garde #2650.2) — la question de CE tour, pas la précédente.
          turnStartedAt,
        })
        .catch(() => undefined)
    }
    // Laura vient-elle de DEMANDER une précision ? Si oui, la réponse que la
    // personne va taper ne comptera pas contre son plafond.
    if (!stoppedByBrowser) {
      await this.markPrecisionRequest({
        envelope,
        userId: user.userId,
        workspaceId,
        accountId: dto.accountId ?? null,
        conversationId: dto.conversationId ?? null,
      })
    }
    // #1949.23 — décision Louis 13/09 batch 12 : Laura n'a pas su router cette
    // demande ? Une trace anonyme, jamais depuis une salle de démonstration.
    // HORS du garde `!stoppedByBrowser` : c'est une trace du MODÈLE, pas un
    // geste de la personne — un navigateur parti ne l'efface pas.
    await this.recordUnroutedIntent({ envelope, userId: user.userId, workspaceId, dto })
    // Ce que ce message a coûté, fournisseur par fournisseur. Best-effort et
    // APRÈS la réponse : mesurer ne retarde pas ce qu'on mesure.
    // #2442.12 — l'en-tête ET le `done` : le second porte les outils du tour,
    // chacun étiqueté (colonne `tool`). Deux registres distincts côté IA
    // (celui de la requête, celui du tour) : aucune ligne n'est comptée deux fois.
    const parsedCosts = [
      ...(this.providerCosts?.parseHeader(costHeader) ?? []),
      ...(this.providerCosts?.parseRows(returnedTurnCosts) ?? []),
    ]
    await this.providerCosts?.record(parsedCosts, {
      workspaceId,
      userId: user.userId,
      accountId: dto.accountId ?? null,
      feature: 'chat',
    })
    // #2448.8 / #2882.11 (épopée #2882) — « Vérifié estime coût et durée avant
    // le run » : ce tour devient une mesure RÉELLE pour le PROCHAIN tour du
    // même palier. `tier` absent (mode `auto` non forcé, ou tour hors HTTP) ⇒
    // rien n'est écrit, jamais un palier deviné. `durationMs` réutilise
    // `receivedAt`, la même horloge que `chatTurnClock` plus haut.
    const chatTier = extractChatTier(envelope?.data)
    if (chatTier && receivedAt !== undefined) {
      await this.chatTurnCosts?.record(chatTier, Date.now() - receivedAt, deriveChatTurnCostUsd(parsedCosts))
    }
  }

  /**
   * #2448.8 / #2882.11 (épopée #2882) — ce que `ResearchModeSelector` lit pour
   * annoncer coût et durée AVANT de lancer un tour Vérifié/Approfondi (les deux
   * modes qui forcent `tier: 'deep'`, `CHAT_MODE_POLICIES` côté service IA).
   * Aucun périmètre d'espace : une latence/un coût du PRODUIT, jamais une
   * donnée d'espace (doctrine `c64_analytique_produit`) — même contrat que
   * `GET contacts/enrichment-duration-estimate`. `null` sans le service
   * (`@Optional()`) ou sous 5 mesures (GA-18/19), jamais un chiffre deviné.
   */
  @SkipThrottle()
  @Get('chat/mode-estimate')
  @WorkspaceRead()
  async getChatModeEstimate(
    @Query('tier') tier: string,
  ): Promise<{ estimate: Awaited<ReturnType<ChatTurnCostEstimateService['estimate']>> | null }> {
    if (tier !== 'fast' && tier !== 'deep') return { estimate: null }
    const estimate = (await this.chatTurnCosts?.estimate(tier)) ?? null
    return { estimate }
  }

  @Post('icebreaker')
  @Throttle(LLM_DRAFT_RATE_LIMIT)
  async icebreaker(@CurrentUser() user: CurrentUserPayload, @Body() dto: IcebreakerDto): Promise<IaEnvelope> {
    // Resolve the ESN profile server-side so the icebreakers are written from the
    // real ESN (name/offers), not the "votre ESN" fallback (Théo: messages basés
    // sur profil + signal + contact).
    const profileData = (await this.esnProfile.resolveProfileData(user.userId)) as Record<string, unknown>
    try {
      return await this.ia.icebreaker({ userId: user.userId, contactId: dto.contactId, profileData })
    } catch (error) {
      throw this.icebreakerEngineFailure(error)
    }
  }

  /**
   * #2810 — extraire un nom d'entreprise d'une phrase tapée dans le lanceur
   * de /search (« Analyser une entreprise »). Ouverte à tout palier, comme
   * `icebreaker`/`message`/`battlecard` juste au-dessus : elle ne fait
   * qu'aiguiller VERS un écran déjà payé en crédits, elle ne débite rien.
   *
   * Aucune donnée d'espace lue ni écrite (texte in, texte out) : pas de
   * `@RequireFeature` ni de résolution de workspace, comme ses voisines.
   * `null` quand l'IA n'a rien à proposer (pas de clé, ou un nom non ancré
   * dans la phrase) — l'appelant (le composer) garde alors le texte tapé.
   */
  @Post('search/extract-entity')
  @Throttle(LLM_DRAFT_RATE_LIMIT)
  async extractSearchEntity(@Body() dto: SearchEntityExtractDto): Promise<{ company: string | null }> {
    const company = await this.ia.extractSearchEntity({ text: dto.text, locale: dto.locale })
    return { company }
  }

  /**
   * #2648.1 — `ContactIcebreakers.tsx` retombait entièrement sur
   * `icebreakers.unavailable` (générique) parce que rien ne portait la raison
   * plus haut : `IaClient.icebreaker` lève une `TechnicalError` pour TOUT
   * échec, et le contrôleur la laissait filer jusqu'au filtre générique —
   * perdant le seul cas où le moteur SAIT dire pourquoi (`insufficient_context`,
   * `apps/ia/app/routers/icebreaker.py`). Même patron que
   * `discoverEngineFailure` juste au-dessus (`classifyDiscoverFailure`) :
   * `code` voyage dans le corps JSON, lu par `ApiError.code` côté web
   * (`extractError`, `apps/web/src/lib/api-error.ts`) — jamais dans un
   * message français à parser.
   */
  private icebreakerEngineFailure(error: unknown): HttpException {
    const failure = classifyIcebreakerFailure(error)
    this.logger.error(`Icebreaker — le moteur IA a échoué (${failure.reason})`, {
      error,
      tags: { feature: 'icebreaker', reason: failure.reason },
    })
    return new HttpException(
      { statusCode: failure.status, message: failure.message, code: `icebreaker_${failure.reason}` },
      failure.status,
    )
  }

  @Post('message')
  @Throttle(LLM_DRAFT_RATE_LIMIT)
  async generateMessage(@CurrentUser() user: CurrentUserPayload, @Body() dto: GenerateMessageDto): Promise<IaEnvelope> {
    // #4592.4 — la salle de démonstration ne rédige rien : aucun appel de modèle facturé sur un espace que
    // personne ne surveille. Le bouton web est masqué (`PlanMailBlock`), mais un client se contourne — cette
    // ligne TIENT, avant le profil et l'appel moteur. Aucun message n'est fabriqué ici.
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      throw new BadRequestException({
        statusCode: 400,
        message:
          'Dans l’espace de démonstration, la rédaction de messages n’est pas disponible : aucun service payant n’y est appelé.',
        code: 'message_demo_unavailable',
      })
    }
    // Same server-side ESN profile as icebreaker/chat so the draft carries the
    // real ESN name/offers. `channel` + free-text `context` (the seller's angle)
    // steer the IA; ownership of the contact is checked IA-side against userId.
    // #3405.3 — « ne jamais relancer un NO-GO sans nouveau motif » : la MÊME
    // règle que `ActionRouterService.dispatchGenerateMessage`
    // (`noGoMessageRefusal`, `@bellum/contracts`), posée sur cet appelant direct.
    if (this.accountsService) {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
      const refusal = await this.accountsService.messageRefusalForContact(dto.contactId, workspaceId)
      if (refusal) {
        throw new HttpException({ statusCode: 409, message: refusal, code: 'account_no_go' }, 409)
      }
    }
    const profileData = (await this.esnProfile.resolveProfileData(user.userId)) as Record<string, unknown>
    const appliedStyle = await this.resolveMessageStyleForGeneration(
      user.userId,
      dto.messageStyleTemplateId ?? null,
      // #2204.65 — SANS style choisi (clé absente, pas `null`), le style actif le plus proche de la situation
      // s'applique (fil > équipe > personne > espace). Il faut un objectif posé : sans lui, rien n'est deviné.
      dto.messageStyleTemplateId === undefined && dto.parameters?.objective && dto.channel !== 'task'
        ? {
            objective: dto.parameters.objective,
            channel: dto.channel,
            ...(dto.parameters.persona ? { persona: dto.parameters.persona } : {}),
            ...(await this.styleScopeContextOf(user.userId, dto.contactId, dto.businessUnitId)),
          }
        : null,
    )
    // Le caller connaît déjà l'identifiant du style choisi (c'est lui qui vient
    // de l'envoyer) : rien à faire remonter dans la réponse, GA-26 — un réglage
    // vit à un seul endroit, jamais redemandé ni redupliqué côté serveur.
    try {
      return await this.ia.generateMessage({
        userId: user.userId,
        contactId: dto.contactId,
        channel: dto.channel,
        // #2204.59-.65 — un style résolu enrichit le MÊME `context` que
        // `MessageStyleService.previewCompare` (#2369.11, GA-26 : le moteur ne
        // connaît jamais un second canal « style », seulement un angle plus riche).
        context: appliedStyle ? composeMessageStylePreviewContext(dto.context, appliedStyle) : dto.context,
        // #2123.61-.68 — clé omise sans paramètre : le corps envoyé au moteur est celui d'avant.
        ...(dto.parameters ? { parameters: dto.parameters } : {}),
        // #3419.3 — clé omise sans révision : le corps envoyé au moteur est celui d'avant.
        ...(dto.revision ? { revision: dto.revision } : {}),
        // #4524.2 — clé omise sans choix : le corps envoyé au moteur est celui d'avant.
        ...(dto.grounding ? { grounding: dto.grounding } : {}),
        profileData,
      })
    } catch (error) {
      throw this.messageEngineFailure(error)
    }
  }

  /** #3458 — le moteur a refusé ou est tombé : la raison voyage (`code`), jamais un 500 muet. */
  private messageEngineFailure(error: unknown): HttpException {
    const failure = classifyMessageFailure(error)
    // #4458 — un refus du moteur est un signal métier (warn) ; une panne reste une error.
    this.logger[messageFailureLogLevel(failure.reason)](`Message — le moteur IA a échoué (${failure.reason})`, {
      error,
      tags: { feature: 'message', reason: failure.reason },
    })
    return new HttpException(
      { statusCode: failure.status, message: failure.message, code: `message_${failure.reason}` },
      failure.status,
    )
  }

  /**
   * #2204.59-.65 (épopée #2947) — un identifiant fourni mais introuvable dans
   * l'espace ou pas `active` échoue clairement (« un contrat d'API non
   * vérifiable ne se devine pas ») plutôt que de générer un texte qui prétend
   * respecter un style qu'il ignore silencieusement.
   */
  private async resolveMessageStyleForGeneration(
    userId: string,
    templateId: string | null,
    auto: {
      objective: string
      channel: MessageStyleTemplate['channel']
      persona?: string
      businessUnitId?: string
      conversationId?: string
    } | null = null,
  ): Promise<MessageStyleTemplate | null> {
    if (!templateId && !auto) return null
    if (!this.messageStyle) {
      // Le choix AUTOMATIQUE ne casse jamais une génération : sans service de style, elle part comme avant.
      if (!templateId) return null
      throw new ServiceUnavailableException('La mémoire de style est indisponible.')
    }
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const ctx = { userId, workspaceId, role }
    if (!templateId) return this.messageStyle.resolveByScope(ctx, auto as NonNullable<typeof auto>)
    return this.messageStyle.resolveActiveTemplateForGeneration(ctx, templateId)
  }

  /**
   * #2204.65 — la situation qui décide quel style PRÈS de la personne s'applique : le fil (la conversation avec CE
   * contact, recomposée ici — jamais envoyée par le navigateur) et l'équipe. Une équipe demandée n'est honorée que si
   * l'appelant la porte ; sans demande, celle d'une personne qui n'en porte qu'UNE ; avec plusieurs, rien n'est deviné.
   */
  private async styleScopeContextOf(
    userId: string,
    contactId: string,
    requestedUnitId: string | undefined,
  ): Promise<{ businessUnitId?: string; conversationId: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const carried = await this.perimetersOf(workspaceId, userId)
    const businessUnitId = requestedUnitId
      ? carried.includes(requestedUnitId)
        ? requestedUnitId
        : undefined
      : carried.length === 1
        ? carried[0]
        : undefined
    return { ...(businessUnitId ? { businessUnitId } : {}), conversationId: messageStyleThreadKey(contactId) }
  }

  @Post('weekly-briefing')
  @Throttle(LLM_DRAFT_RATE_LIMIT)
  async weeklyBriefing(@CurrentUser() user: CurrentUserPayload): Promise<IaEnvelope> {
    // "Mon briefing de la semaine" (cockpit). Resolve the ESN profile server-side
    // (same source as discover/chat/message) so the briefing carries the real ESN
    // identity, then the IA aggregates the caller's accounts + open plan actions +
    // weekly activity. `userId` comes from the JWT — never the body. One Claude
    // call: no retry (a re-run doubles the LLM spend for no benefit) and a
    // comfortable deadline so a slower synthesis isn't clipped.
    const profileData = (await this.esnProfile.resolveProfileData(user.userId)) as Record<string, unknown>
    return this.ia.weeklyBriefing({ userId: user.userId, profileData }, { maxAttempts: 1, timeoutMs: 45_000 })
  }

  @Post('battlecard')
  @Throttle(LLM_DRAFT_RATE_LIMIT)
  async battlecard(@CurrentUser() user: CurrentUserPayload, @Body() dto: BattlecardDto): Promise<IaEnvelope> {
    // Same server-side ESN profile as icebreaker/chat so the card carries the real
    // ESN name/offers, not "votre ESN". The IA fetches the account scoped to the
    // JWT userId (404 otherwise) — the body only names which account.
    const profileData = (await this.esnProfile.resolveProfileData(user.userId)) as Record<string, unknown>
    return this.ia.battlecard({ userId: user.userId, accountId: dto.accountId, profileData })
  }

  @Post('compare')
  @Throttle(LLM_DRAFT_RATE_LIMIT)
  async compare(@CurrentUser() user: CurrentUserPayload, @Body() dto: CompareDto): Promise<IaEnvelope> {
    // AI prioritisation of a hand-picked set of accounts. The IA scopes the read
    // to the JWT userId, so non-owned ids simply drop out — never a cross-tenant
    // read. Profile resolved server-side (same source as the rest).
    const profileData = (await this.esnProfile.resolveProfileData(user.userId)) as Record<string, unknown>
    return this.ia.compareAccounts({ userId: user.userId, accountIds: dto.accountIds, profileData })
  }

  @RequireFeature('chat_ai')
  /**
   * La bibliothèque de commandes (ticket BEL-AUT-505).
   *
   * Elle ne dit pas « voici ce que Bellum sait faire » dans l'absolu : elle dit
   * ce qui marche ICI, pour CET utilisateur. Une commande dont le connecteur
   * manque reste VISIBLE avec le nom de ce qui manque — la cacher ferait croire
   * qu'elle n'existe pas, et l'afficher comme prête ferait cliquer sur un mur.
   *
   * La disponibilité se lit sur l'état RÉEL des outils, pas sur l'existence
   * d'une ligne de connexion : un jeton expiré est une connexion qui existe et
   * qui ne répond pas.
   */
  /**
   * Les familles d'outils opérationnelles chez cet utilisateur.
   *
   * Un échec de lecture rend `undefined` et NON une liste vide : `undefined`
   * veut dire « on ne sait pas » et laisse tous les outils, une liste vide
   * voudrait dire « rien n'est branché » et amputerait le copilote sur une
   * panne de registre.
   */
  private async registryTools(userId: string): Promise<Awaited<ReturnType<ToolRegistryService['list']>> | undefined> {
    try {
      return await this.toolRegistry.list(userId)
    } catch (error) {
      this.logger.warn(`Registre d'outils illisible pour le copilote: ${String(error)}`)
      return undefined
    }
  }

  @Get('chat/commands')
  async listCommands(@CurrentUser() user: CurrentUserPayload) {
    const tools = await this.toolRegistry.list(user.userId)
    // #3973 — même dérivation que le tour de chat : un outil multi-familles compte dans chacune.
    const connected = connectedFamiliesOf(tools) ?? []
    return {
      commands: COMMAND_CATALOG.map(command => ({
        ...command,
        availability: commandAvailability(command, connected),
      })),
    }
  }

  @Get('chat/messages')
  async listChatMessages(@CurrentUser() user: CurrentUserPayload, @Query() query: ListChatMessagesDto) {
    // Multi-user Phase 2: chat is team-scoped. Resolve the caller's active
    // workspace and read that workspace's thread (identical today, 1 = 1).
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #1955.12 — un fil partagé qui cite un compte hors du portefeuille du
    // lecteur ne s'ouvre pas (portefeuille cloisonné, D5).
    await this.assertCitedAccountsReadable(user.userId, workspaceId, role, query.conversationId ?? null)
    // #2430.4 — un lien « version figée » lit LE MÊME fil, borné à sa version :
    // aucune copie, aucun second chemin de lecture. Une version inconnue dans
    // cet espace est un 404, jamais le fil vivant servi à sa place.
    let upTo: Date | null = null
    if (query.version !== undefined) {
      upTo =
        query.conversationId && this.conversations
          ? await this.conversations.versionBound(workspaceId, query.conversationId, query.version)
          : null
      if (!upTo) throw new NotFoundException('Version introuvable pour cette conversation.')
    }
    const messages = await this.chatMessages.listThread({
      // #2703 — QUI lit : le fil par DÉFAUT est celui de son auteur (une
      // conversation nommée, elle, reste partagée par l'espace).
      userId: user.userId,
      workspaceId,
      accountId: query.accountId ?? null,
      conversationId: query.conversationId ?? null,
      limit: query.limit,
      upTo,
      // #1944.20 — le curseur de pagination vers le haut d'un fil vivant,
      // distinct de `upTo` (lien figé, ci-dessus) : la date du plus ancien
      // message déjà à l'écran, envoyée par le client au défilement.
      before: query.before ?? null,
    })
    // #1916.24 — combien d'éléments de mémoire étaient dans le contexte de chaque
    // réponse relue, en UNE lecture pour tout le fil : c'est ce qui décide que
    // « Voir la source » s'offre sous une réponse d'historique, sans une requête
    // par bulle. Un compte illisible laisse le champ ABSENT — jamais « 0 ».
    const assistantIds = messages.filter(message => message.role === 'assistant').map(message => message.id)
    let memoryCounts = new Map<string, number>()
    if (this.replyMemoryUses && assistantIds.length > 0) {
      try {
        memoryCounts = await this.replyMemoryUses.countsForMessages({ workspaceId, messageIds: assistantIds })
      } catch (error) {
        this.logger.warn(`Traces de mémoire du fil illisibles : ${error instanceof Error ? error.name : 'erreur'}`)
      }
    }
    const withMemory = messages.map(message =>
      memoryCounts.has(message.id) ? { ...message, memory_uses: memoryCounts.get(message.id) } : message,
    )
    // #2276.62 — le job composite d'un tour revient dans le fil au rechargement,
    // dans l'état où il en est MAINTENANT (terminé, partiel, à valider) : sa vue
    // est relue, jamais le cliché du tour. Posé sur la même bulle, par le tour.
    const readMessages = await this.withThreadJobs(withMemory, user, workspaceId, query.conversationId ?? null)
    // #2429.9 — les versions modifiées des artefacts du fil, en UNE lecture. Illisible :
    // le fil se lit en version 1 (jamais un blocage), et le journal le dit.
    let artifactVersions = new Map<string, Map<string, ChatArtifactLatestVersion>>()
    if (this.artifactVersions && assistantIds.length > 0) {
      try {
        artifactVersions = await this.artifactVersions.latestFor(workspaceId, assistantIds)
      } catch (error) {
        this.logger.warn(`Versions d'artefacts du fil illisibles : ${error instanceof Error ? error.name : 'erreur'}`)
      }
    }

    if (!this.cards) {
      return {
        messages: readMessages.map(message => {
          const envelope = IaProxyController.replyEnvelopeOf(message, undefined, artifactVersions.get(message.id))
          return envelope ? { ...message, envelope } : message
        }),
      }
    }

    // D1 (#1943.2) — recharger un fil rend ses cartes, avec leur état et leurs
    // gestes du moment : elles disparaissaient au rechargement (rien ne les
    // persistait). Chaque message porte son tour et les cartes de ce tour ; le
    // fil porte TOUTES ses cartes, y compris celles d'un tour dont le message n'a
    // pas encore été rattaché (navigateur d'avant L4, qui n'envoie pas `turnId`).
    // Posé APRÈS le compte de mémoire, sur les MÊMES messages : les deux lectures
    // enrichissent la même bulle, aucune ne remplace l'autre.
    const turns = await this.chatMessages.turnIdsOf(
      workspaceId,
      messages.map(message => message.id),
    )
    const cards = await this.cards.listForThread(this.principalOf(user), {
      conversationId: query.conversationId ?? null,
      turnIds: [...new Set(turns.values())],
    })
    return {
      messages: readMessages.map(message => {
        const turnId = turns.get(message.id) ?? null
        const turnCards = turnId ? cards.filter(card => card.turnId === turnId) : []
        const envelope = IaProxyController.replyEnvelopeOf(
          message,
          turnCards.length ? turnCards : undefined,
          artifactVersions.get(message.id),
        )
        return { ...message, turn_id: turnId, cards: turnCards, ...(envelope ? { envelope } : {}) }
      }),
      cards,
    }
  }

  @RequireFeature('chat_ai')
  @Post('chat/messages')
  async createChatMessage(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateChatMessageDto) {
    // Stamp both: `user_id` (created-by, from the JWT — never the body) and the
    // active `workspace_id` (read scope) so the new row is visible to the team.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #3775.2b — une source issue d'une connexion PERSONNELLE de l'appelant
    // (`owner: 'user'`, BEL-INT-604) reste lisible, marquée, même après la
    // fermeture de cette connexion : « Partager » (écran) le dit alors, sans
    // jamais relire le registre d'un tiers. Le registre n'est lu que si un
    // contexte arrive — un message tapé, sans `context`, ne coûte rien de plus.
    const context =
      dto.context === undefined
        ? undefined
        : markRestrictedSources(dto.context, restrictedToolFamilies(await this.toolRegistry.list(user.userId)))
    const message = await this.chatMessages.create({
      userId: user.userId,
      workspaceId,
      accountId: dto.accountId ?? null,
      conversationId: dto.conversationId ?? null,
      role: dto.role,
      content: dto.content,
      // #1943.1 — le tour annoncé par le `done` : ce qui rattache ses cartes au message à la relecture.
      turnId: dto.turnId ?? null,
      // #1939.13 — un message VOCAL porte son enregistrement ; le service vérifie
      // qu'il est à cette personne, dans cet espace, avant de l'écrire. Un
      // message tapé garde exactement l'appel d'avant.
      ...(dto.voiceObjectId ? { voiceObjectId: dto.voiceObjectId } : {}),
      // #1953.11 / #1953.22 — la réponse dont celle-ci repart, et la nature de
      // la branche. Le service vérifie que la réponse d'origine est bien dans
      // cet espace avant d'écrire le lien ; absents = message ordinaire.
      branchOfMessageId: dto.branchOfMessageId ?? null,
      branchKind: dto.branchKind ?? null,
      // #1914.14 — le contexte du tour, passé BRUT (ses sources désormais
      // marquées si personnelles, #3775.2b) : c'est le service qui applique la
      // liste blanche (`persistedChatContext`), pour qu'il n'y ait qu'un seul
      // endroit où la règle tienne. Clé omise sans contexte — l'appel d'un
      // message tapé ne change pas.
      ...(context === undefined ? {} : { context }),
      // #2494 — les documents joints à CETTE question ; le service les retrouve
      // dans l'espace de l'appelant avant d'écrire leur nom. Absents = message
      // ordinaire, corps identique à celui d'avant ce lot.
      documentIds: dto.documentIds ?? null,
      // #2876 (#2433.4) — les images de conversation jointes à CETTE question ;
      // le service les retrouve dans l'espace de l'appelant avant d'écrire
      // leur nom. Absentes = message ordinaire, corps identique à avant ce lot.
      imageObjectIds: dto.imageObjectIds ?? null,
      // #2433.4 / #2433.12 — la vision mesurée de ces images, relue côté service.
      imageVision: dto.imageVision ?? null,
    })
    // #1911.1 — une réponse de Laura vient d'être écrite : le fil en est peut-être
    // à son 2e échange. Le titre part en TÂCHE DE FOND, jamais attendu ici — le
    // tour de la personne ne dépend pas d'un modèle, et un titre manqué ne casse
    // rien (le fil garde son premier message).
    if (dto.role === 'assistant') {
      this.titleThreadInBackground({
        userId: user.userId,
        workspaceId,
        accountId: dto.accountId ?? null,
        conversationId: dto.conversationId ?? null,
      })
    }
    // #1940.1 — un message TAPÉ (jamais une réponse de Laura) peut mentionner
    // un collègue : `appendMention` (Chat.tsx) a déjà inséré `@Prénom` dans le
    // texte, ici on prévient réellement la personne. Attendu (pas en tâche de
    // fond, contrairement au titre) : c'est une écriture, pas un appel modèle.
    if (dto.role === 'user') {
      // #2899 — opt-in par espace, anonymisé AVANT stockage ; jamais une question à pièce jointe
      // ni un message vocal (le corps d'un document n'est jamais échantillonné).
      const hasAttachment =
        Boolean(dto.voiceObjectId) || Boolean(dto.documentIds?.length) || Boolean(dto.imageObjectIds?.length)
      if (!hasAttachment) {
        // #2958.98 (DEC-4036 Q5) — l'exception NOMMÉE : le corps des messages de l'utilisateur
        // désigné par `EVAL_MESSAGE_BODY_USER_ID`, et de lui seul, hors démo. La salle de démo
        // n'est lue que pour lui : un autre tour garde exactement l'appel d'avant.
        const allowMessageBody =
          evalMayReadMessageBody(user.userId, { isDemo: false }) &&
          !(await this.workspaceContext.isDemoWorkspace(user.userId))
        await (allowMessageBody
          ? this.evalSampling?.recordUserTurn(workspaceId, dto.content, { allowMessageBody })
          : this.evalSampling?.recordUserTurn(workspaceId, dto.content))
      }
      await this.notifyMentions({
        authorUserId: user.userId,
        conversationId: dto.conversationId ?? null,
        accountId: dto.accountId ?? null,
        content: dto.content,
      })
    }
    // #1916.24 — une réponse de Laura porte le tour émis à la fin du flux : ses
    // éléments de mémoire se rattachent à CE message. Une question de la personne
    // ne rattache jamais rien, quel que soit le corps.
    const memoryUses =
      dto.role === 'assistant' && dto.memoryTurnId
        ? await this.attachMemoryTurn({
            turnId: dto.memoryTurnId,
            messageId: message.id,
            userId: user.userId,
            workspaceId,
          })
        : null
    const withMemory = memoryUses === null ? message : { ...message, memory_uses: memoryUses }
    const envelope = IaProxyController.replyEnvelopeOf(withMemory)
    return { message: envelope ? { ...withMemory, envelope } : withMemory }
  }

  /**
   * #1911.1 — la rédaction du titre, détachée de la requête.
   *
   * Le refus de la salle de DÉMONSTRATION vit ici et pas dans le service : zéro
   * appel de modèle en démo, et le service ne peut pas lire l'espace sans aller
   * chercher le service d'un autre module (GA-07). Hors quota par construction —
   * aucun `assertChatQuota`, aucune ligne `chat_messages` écrite.
   *
   * Rien ne remonte : la réponse HTTP est déjà partie. Le journal ne porte que le
   * NOM de l'erreur — son message peut recopier la conversation.
   */
  private titleThreadInBackground(target: {
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId: string | null
  }): void {
    const titles = this.threadTitles
    if (!titles) return
    void (async () => {
      if (await this.workspaceContext.isDemoWorkspace(target.userId)) return
      // #1911.1 — le coût RÉEL de la rédaction : l'en-tête `x-bellum-costs` que
      // le service IA remplit avec l'usage mesuré (jetons, prix ou NULL si non
      // tarifé), enregistré ici par la MÊME porte que le tour de chat (plus haut,
      // après `chatStream`). Sans en-tête — aucun appel de modèle —, aucune ligne.
      let costHeader: string | null = null
      await titles.titleAfterReply({ ...target, onCostHeader: value => (costHeader = value) })
      await this.providerCosts?.record(this.providerCosts.parseHeader(costHeader), {
        workspaceId: target.workspaceId,
        userId: target.userId,
        accountId: target.accountId,
        // La famille « coûte sans débiter de crédit » (`UNCREDITED_COST_FEATURES`) ;
        // l'opération `bellum_chat_title` distingue le titre du tour.
        feature: 'chat',
      })
    })().catch((error: unknown) => {
      this.logger.error('Titre de fil : tâche de fond interrompue, le fil garde son premier message', {
        error: { name: error instanceof Error ? error.name : typeof error },
        tags: { feature: 'chat_thread_title' },
      })
    })
  }

  /**
   * #1940.1 — MENTIONNER UN COLLÈGUE prévient réellement le collègue.
   *
   * `resolveChatMentions` (pure) dit QUI est mentionné ; ce contrôleur lit les
   * membres de l'espace (`WorkspaceContextService.listMembers`, GA-07 : un
   * geste d'utilisateur s'orchestre ici, jamais dans un service qui irait
   * chercher celui d'un autre module) et écrit une notification réelle par
   * collègue. Sans le module notifications (`@Optional()`), le texte `@Nom`
   * reste inséré côté navigateur mais personne n'est prévenu — repli FERMÉ,
   * jamais une erreur qui ferait échouer l'écriture du message. Une erreur de
   * lecture des membres ou d'écriture de la notification est journalisée et
   * avalée pour la même raison : mentionner quelqu'un ne doit jamais faire
   * perdre le message qu'on vient de taper.
   */
  private async notifyMentions(target: {
    authorUserId: string
    conversationId: string | null
    accountId: string | null
    content: string
  }): Promise<void> {
    if (!this.notifications) return
    try {
      const members = await this.workspaceContext.listMembers(target.authorUserId)
      const mentioned = resolveChatMentions(target.content, members, target.authorUserId)
      if (mentioned.length === 0) return
      const authorName = members.find(member => member.userId === target.authorUserId)?.fullName ?? 'Un collègue'
      const link = chatNotificationLink({ conversationId: target.conversationId, accountId: target.accountId })
      // #4158.56 — l'espace du geste et son auteur : la mention ne se lit plus dans tous les espaces.
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(target.authorUserId)
      await Promise.all(
        mentioned.map(member =>
          this.notifications!.createNotification(member.userId, {
            type: 'chat_mention',
            title: `${authorName} t'a mentionné dans un fil Laura`,
            link,
            workspaceId,
            actorUserId: target.authorUserId,
          }),
        ),
      )
    } catch (error) {
      this.logger.warn('Mention de collègue : notification non envoyée (le message reste enregistré)', {
        error: { name: error instanceof Error ? error.name : typeof error },
        tags: { feature: 'chat_mention' },
      })
    }
  }

  /**
   * #1940.7 — ATTRIBUER LA PROCHAINE ACTION À UN COLLÈGUE.
   *
   * Geste EXPLICITE (sélecteur « assigner à » sur une carte de Laura,
   * `PendingActions.tsx`, relié à `useWorkspaceMembers` — même registre que
   * #1940.1 et le sélecteur du plan de compte, `ActionExecuteMenu.tsx`) :
   * contrairement à une mention en texte (#1940.1), il n'y a rien à avaler en
   * silence ici. L'action EST la notification — un sélecteur qui ne prévient
   * jamais personne serait un bouton qui sonne sans écrire. Deux refus,
   * jamais un faux succès :
   *  - l'assigné DOIT être un membre RÉEL de l'espace (401→400, jamais deviné) ;
   *  - sans le module notifications, la porte refuse (503) plutôt que de dire
   *    « assigné » sans que personne ne le sache jamais.
   */
  @RequireFeature('chat_ai')
  @Post('chat/actions/assign')
  @RequirePermission('records:write')
  async assignPendingAction(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AssignPendingActionDto,
  ): Promise<{ assignedTo: string }> {
    if (!this.notifications) {
      throw new ServiceUnavailableException('Assignation indisponible : notifications non branchées')
    }
    const members = await this.workspaceContext.listMembers(user.userId)
    const assignee = members.find(member => member.userId === dto.assigneeUserId)
    if (!assignee) throw new BadRequestException('Ce collègue ne fait pas partie de ton espace')
    const authorName = members.find(member => member.userId === user.userId)?.fullName ?? 'Un collègue'
    // #4158.56 — l'espace du geste et son auteur.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.notifications.createNotification(assignee.userId, {
      workspaceId,
      actorUserId: user.userId,
      type: 'chat_action_assigned',
      title: `${authorName} t'a assigné une action dans Laura : ${dto.summary}`,
      link: chatNotificationLink({ conversationId: dto.conversationId ?? null, accountId: dto.accountId ?? null }),
    })
    return { assignedTo: assignee.userId }
  }

  @RequireFeature('chat_ai')
  @Get('chat/history')
  async listChatHistory(@CurrentUser() user: CurrentUserPayload, @Query() query: ListChatHistoryDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #2703 — la liste des fils porte les conversations NOMMÉES de l'espace et
    // les fils par DÉFAUT de l'appelant, jamais ceux d'un collègue.
    const items = await this.chatMessages.listHistory(workspaceId, user.userId, query.limit, query.archived === true)
    // #1911.1 — le titre STOCKÉ (saisi, ou rédigé par Laura) remplace le premier
    // message ; sans titre stocké, la ligne reste ce qu'elle était.
    return {
      items: this.threadTitles ? await this.threadTitles.withStoredTitles(workspaceId, user.userId, items) : items,
    }
  }

  /**
   * #1955.2 — « La recherche portera sur tout l'historique, pas seulement la
   * page chargée. » Route séparée de `GET chat/history`, comme prévu par
   * `filterThreads` (web) : ses propres gardes, sa propre borne de lecture
   * (`THREAD_SEARCH_SCAN_LIMIT`, `chat-messages.service.ts`).
   *
   * `@WorkspaceRead` (GA-05) : elle lit ce que `GET chat/history` lit déjà, par
   * `workspaceId` résolu côté serveur — les fils sont une ressource d'ÉQUIPE
   * dans ce produit. Le marqueur n'ouvre rien (il ne pose qu'une métadonnée que
   * rien ne lit à l'exécution) ; il DÉCLARE une lecture d'espace, là où une
   * permission d'écriture aurait fermé la porte au `viewer` qui lit déjà la
   * liste à l'écran.
   */
  @RequireFeature('chat_ai')
  @WorkspaceRead()
  @Get('chat/threads/search')
  async searchChatThreads(@CurrentUser() user: CurrentUserPayload, @Query() query: SearchChatThreadsDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #2703 — même périmètre que `GET chat/history` : les fils par défaut d'un
    // collègue ne se cherchent pas davantage qu'ils ne se listent.
    const items = await this.chatMessages.searchThreads(
      workspaceId,
      user.userId,
      query.q,
      query.limit,
      query.archived === true,
    )
    // ⚠️ Connu : le filtre porte sur le premier MESSAGE (comme `listHistory`),
    // le titre STOCKÉ (renommé à la main, ou rédigé par Laura) le remplace
    // seulement APRÈS le filtrage — un fil renommé pour contenir le terme
    // cherché, dont le premier message ne le contient pas, peut manquer. Même
    // borne que `GET chat/history` ; l'étendre au titre stocké est un point
    // séparé, pas ce que #1955.2 réclame (« tout l'historique », pas « le
    // titre affiché »).
    return {
      items: this.threadTitles ? await this.threadTitles.withStoredTitles(workspaceId, user.userId, items) : items,
    }
  }

  /**
   * Ranger un fil de Laura, ou le ressortir (#1120).
   *
   * « Faudrait pouvoir archiver ou supprimer les conversations. »
   *
   * `records:write` : les fils sont une ressource d'ÉQUIPE dans ce produit
   * (`listHistory` lit par espace de travail), donc les ranger est une écriture
   * partagée — pas un réglage personnel.
   *
   * 404 quand rien n'a été touché : « ce fil n'existe pas dans cet espace » se
   * dit, plutôt qu'un succès qui n'a rien fait.
   */
  @RequireFeature('chat_ai')
  @RequirePermission('records:write')
  @Post('chat/threads/archive')
  async archiveChatThread(@CurrentUser() user: CurrentUserPayload, @Body() dto: ArchiveChatThreadDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const affected = await this.chatMessages.setThreadArchived({
      // #2703 — on range SON fil par défaut, jamais celui d'un collègue.
      userId: user.userId,
      workspaceId,
      accountId: dto.accountId ?? null,
      conversationId: dto.conversationId ?? null,
      archived: dto.archived,
    })
    if (affected === 0) throw new NotFoundException('Conversation introuvable dans cet espace.')
    return { messages: affected, archived: dto.archived }
  }

  /**
   * #1955.8 — « Un fil dupliqué apparaîtra comme un nouveau fil indépendant. »
   *
   * `records:write` : même porte que l'archivage/le renommage — les fils sont
   * une ressource d'équipe, dupliquer est une écriture partagée (elle crée des
   * lignes visibles par tout le monde). 404 quand la source n'existe pas dans
   * cet espace, jamais un succès qui n'a rien copié.
   */
  @RequireFeature('chat_ai')
  @RequirePermission('records:write')
  @Post('chat/threads/duplicate')
  async duplicateChatThread(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChatThreadTargetDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const duplicated = await this.chatMessages.duplicateThread({
      // #2703 — la source dupliquée est le fil de l'appelant quand c'est le fil par défaut.
      userId: user.userId,
      workspaceId,
      accountId: dto.accountId ?? null,
      conversationId: dto.conversationId ?? null,
    })
    if (!duplicated) throw new NotFoundException('Conversation introuvable dans cet espace.')
    return duplicated
  }

  /**
   * #2430.9 — « Supprimer » un fil (#1120) ARCHIVE ses messages, il ne les
   * détruit plus.
   *
   * Jusqu'au 20/09/2026, ce geste faisait disparaître les messages pour de
   * bon (« exception assumée » à « on archive, on ne supprime pas ») : contre
   * la doctrine, et le mécanisme d'archivage (`setThreadArchived`, #1120)
   * existait déjà pour le même besoin. Décision de Louis du 20/09 (QCM) :
   * `chatMessages.deleteThread` réutilise désormais CE mécanisme (GA-26) —
   * les messages restent en base, `archived_at` posé, retrouvables via
   * « Voir les conversations rangées ». Le nom de la route et de la méthode ne
   * changent pas (compat des appelants) ; côté écran, le bouton ne s'appelle
   * plus « Supprimer » (voir `ConversationsPanel.tsx`, `sidebarThreads.delete`).
   *
   * Ce qui suit CE geste-ci reste une suppression RÉELLE, à dessein : les
   * documents « fil seul » (#1954), le titre stocké (#1911.1) et la mémoire
   * de Laura sur ce fil (#1927.10) sont des artefacts DÉRIVÉS du fil, pas son
   * contenu — ils partent encore pour de bon, comme avant le 20/09. Un fil
   * ressorti après ce geste retrouve ses messages, pas son titre personnalisé
   * ni les documents qu'il portait : un défaut connu, hors du périmètre de la
   * décision du 20/09, qui ne portait que sur les MESSAGES.
   *
   * #1911.15 — décision de Louis du 15/09/2026 : le défaut vivant était que
   * `records:write` (la porte de route ci-dessous) est portée par TOUS les
   * sièges commerciaux (`owner`/`admin`/`sales_ops`/`sales`/`member`) — la
   * suppression ne filtrait donc QUE par `workspace_id`, et n'importe quel
   * membre supprimait le fil de n'importe quel autre. La suppression
   * appartient désormais à **l'auteur du fil OU un porteur de `team:manage`**
   * — la permission RBAC EXISTANTE la plus proche de « gérant de l'espace »
   * (invite/retire des membres, gère les invitations), jamais un rôle déclaré
   * en dur : `can()` lit le rôle RÉSOLU par `resolveActiveWorkspace` puis les
   * accords en propre (`extraPermissionsOf`), la même paire que
   * `WorkspacePermissionGuard`. `threadAuthor` reste borné par
   * `workspace_id` (`threadWhere`) : rien ici n'élargit le cloisonnement.
   */
  @RequireFeature('chat_ai')
  @RequirePermission('records:write')
  @Post('chat/threads/delete')
  async deleteChatThread(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChatThreadTargetDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #2703 — `userId` désigne le fil par DÉFAUT de l'appelant ; sur une
    // conversation nommée (partagée), il ne change rien à la clé lue.
    const target = {
      userId: user.userId,
      workspaceId,
      accountId: dto.accountId ?? null,
      conversationId: dto.conversationId ?? null,
    }
    // #1911.15 — `null` (fil déjà vide, ou compte de l'ouvreur supprimé) :
    // aucun auteur à qui comparer l'appelant, donc seul `team:manage` passe.
    // #2430.12 — sur une conversation NOMMÉE, le propriétaire DÉCLARÉ fait foi
    // (transféré), sinon qui l'a ouverte — la règle d'avant, inchangée.
    const conversationId = target.conversationId
    const authorId =
      conversationId && this.conversations
        ? await this.conversations.ownerOf({ workspaceId, userId: user.userId, conversationId })
        : await this.chatMessages.threadAuthor(target)
    // #2430.10 — sous conservation légale, le fil ne se retire pas, pour personne.
    if (conversationId && (await this.conversations?.isOnLegalHold(workspaceId, conversationId))) {
      throw new ConflictException('Cette conversation est sous conservation légale : elle ne peut pas être retirée.')
    }
    if (authorId !== user.userId) {
      const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, user.userId)
      if (!can(role, extra, 'team:manage')) {
        throw new ForbiddenException('Rôle insuffisant pour cette action')
      }
    }
    // #1954 — supprimer un fil supprime SES documents « fil seul » (Louis,
    // 12/09/2026), jamais un document de l'ESN. AVANT les messages : si les
    // documents ne partent pas, le fil reste entier et le geste se rejoue.
    await this.threadDocuments.deleteForThread({ workspaceId, conversationId: target.conversationId })
    // #1911.1 — le titre part AVANT les messages : c'est un texte dérivé d'eux, et
    // un fil recréé sous la même clé (`general`) ne doit pas hériter du titre
    // d'une conversation effacée. Dans cet ordre, un échec laisse les messages.
    await this.threadTitles?.forget(target)
    const affected = await this.chatMessages.deleteThread(target)
    if (affected === 0) throw new NotFoundException('Conversation introuvable dans cet espace.')
    // #1927.10 — ce que Laura avait RETENU du fil part avec lui : son résumé
    // roulant et son état structuré, pour chaque membre. Sans ce geste, le
    // premier message écrit sous la même clé (« general ») rouvrait dans le
    // prompt les extraits et les objets d'un fil archivé « pour de bon » du
    // point de vue de la mémoire (#2430.9 : les MESSAGES, eux, survivent).
    // Seulement APRÈS le geste : un 404 n'efface rien.
    try {
      await this.chatContext.forgetConversation({
        workspaceId,
        accountId: dto.accountId ?? null,
        conversationId: dto.conversationId ?? null,
      })
    } catch (error) {
      // Les messages SONT archivés (#2430.9) : rendre une erreur ferait
      // relancer un geste qui répondrait 404. L'échec part au journal
      // (Sentry) — une mémoire restée derrière est un défaut à corriger, pas
      // à cacher.
      this.logger.error(`Mémoire du fil supprimé non effacée: ${String(error)}`, { error })
    }
    return { messages: affected }
  }

  /**
   * #1911.12 / #1955.1 — renommer un fil de Laura.
   *
   * « Un commercial renommera un fil et le nouveau titre survivra au
   * rechargement. »
   *
   * La MÊME règle de visibilité que l'archivage (`archiveChatThread`, plus haut) :
   * même palier (`chat_ai`), même permission (`records:write` — les fils sont une
   * ressource d'équipe, les renommer est une écriture partagée), espace résolu
   * depuis le jeton, et le fil désigné par `threadWhere` borné à cet espace.
   * 404 quand le fil n'y existe pas, plutôt qu'un succès qui n'a rien nommé.
   *
   * Une correction humaine gagne toujours : ce titre écrase celui de Laura, et
   * Laura ne réécrira jamais celui-ci.
   */
  @RequireFeature('chat_ai')
  @RequirePermission('records:write')
  @Patch('chat/threads/title')
  async renameChatThread(@CurrentUser() user: CurrentUserPayload, @Body() dto: RenameChatThreadDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    if (!this.threadTitles) throw new ServiceUnavailableException('Le renommage des conversations est indisponible.')
    const renamed = await this.threadTitles.rename({
      workspaceId,
      userId: user.userId,
      accountId: dto.accountId ?? null,
      conversationId: dto.conversationId ?? null,
      title: dto.title,
    })
    if (!renamed) throw new NotFoundException('Conversation introuvable dans cet espace.')
    return renamed
  }

  /**
   * #1955.7 / #1955.15-.23 — EXPORTER un fil : `.md`, `.pdf`, `.json`.
   *
   * Une LECTURE, pas une écriture : même porte que `GET chat/history`
   * (`chat_ai` seul, aucune permission d'équipe) — un membre qui lit déjà ce
   * fil à l'écran peut en télécharger une copie. `@Optional()` : sans le
   * service (module Action OS ou Tool Registry absent), l'export répond 503
   * plutôt qu'un fichier à moitié composé.
   *
   * `@WorkspaceRead` (GA-05) : le fichier part à L'APPELANT, qui est déjà membre
   * de l'espace et lit le même fil à l'écran — ce n'est ni un partage public, ni
   * un lien qui survit à la révocation d'un siège, les deux cas où le décorateur
   * ne se pose pas. `data:export` aurait retiré la copie au `viewer` et au
   * `tech_admin` sans que personne l'ait décidé.
   */
  @RequireFeature('chat_ai')
  @WorkspaceRead()
  @Get('chat/threads/export.md')
  // #2081.14 — une SORTIE de données : la règle d'espace « qui peut exporter » la tient.
  @DataExit()
  async exportChatThreadMarkdown(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ChatThreadTargetDto,
    @Res() response: Response,
  ): Promise<void> {
    const data = await this.buildThreadExport(user, query)
    const { language, timezone } = await this.exportDateContext(user, query)
    const markdown = buildMarkdownDocument({
      title: data.title,
      subtitle: `Émis le ${formatExportTimestamp(data.generatedAt, language, timezone)}`,
      sections: chatThreadExportSections(data, language, timezone),
    })
    sendDocument(
      response,
      Buffer.from(markdown, 'utf8'),
      safeFileName(data.title, 'md'),
      'text/markdown; charset=utf-8',
    )
  }

  @RequireFeature('chat_ai')
  @WorkspaceRead()
  @Get('chat/threads/export.pdf')
  // #2081.14 — une SORTIE de données : la règle d'espace « qui peut exporter » la tient.
  @DataExit()
  async exportChatThreadPdf(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ChatThreadTargetDto,
    @Res() response: Response,
  ): Promise<void> {
    const { workspaceId, data } = await this.buildThreadExportWithWorkspace(user, query)
    const { language, timezone } = await this.exportDateContext(user, query)
    const buffer = await buildPdfDocument({
      title: data.title,
      subtitle: `Émis le ${formatExportTimestamp(data.generatedAt, language, timezone)}`,
      sections: chatThreadExportSections(data, language, timezone),
      brandName: await this.exportBrandName(workspaceId),
    })
    sendDocument(response, buffer, safeFileName(data.title, 'pdf'), 'application/pdf')
  }

  /**
   * #1955.18 — CE QU'IL FAUT POUR AFFICHER UNE DATE : la langue déclarée par le
   * navigateur (même porte que #1958.8 — jamais devinée, jamais stockée) et le
   * fuseau du PROFIL (même dérivation que le tour de chat,
   * `ChatContextService.resolveTimezone` — pas une seconde lecture). Seuls les
   * DEUX formats lus par un humain (`.md`, `.pdf`) en ont besoin : le `.json`
   * garde ses dates en ISO, c'est un format MACHINE.
   */
  private async exportDateContext(
    user: CurrentUserPayload,
    query: ChatThreadTargetDto,
  ): Promise<{ language: ChatThreadExportLanguage; timezone: string | null }> {
    const language: ChatThreadExportLanguage = query.interfaceLanguage === 'en' ? 'en' : 'fr'
    const timezone = await this.chatContext.resolveTimezone(user.userId)
    return { language, timezone }
  }

  @RequireFeature('chat_ai')
  @WorkspaceRead()
  @Get('chat/threads/export.json')
  // #2081.14 — une SORTIE de données : la règle d'espace « qui peut exporter » la tient.
  @DataExit()
  async exportChatThreadJson(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ChatThreadTargetDto,
    @Res() response: Response,
  ): Promise<void> {
    const data = await this.buildThreadExport(user, query)
    sendDocument(
      response,
      Buffer.from(JSON.stringify(data, null, 2), 'utf8'),
      safeFileName(data.title, 'json'),
      'application/json',
    )
  }

  private async buildThreadExport(user: CurrentUserPayload, query: ChatThreadTargetDto) {
    return (await this.buildThreadExportWithWorkspace(user, query)).data
  }

  /**
   * GA-07 — l'orchestration vit ICI, pas dans `ChatThreadExportService` : le
   * registre d'outils et les cartes confirmées appartiennent à deux AUTRES
   * modules, et un service qui va chercher celui d'un autre module fait rougir
   * la garde des frontières. Le contrôleur les lit — c'est là que vit le geste
   * utilisateur — et passe au composeur des DONNÉES, pas des services.
   *
   * Sans Action OS (`@Optional()`), l'export répond 503 plutôt qu'un fichier
   * dont la section « actions » serait vide sans le dire.
   */
  /**
   * #1955.12 — « un partage EXIGE les permissions sur les objets cités ».
   *
   * Une conversation NOMMÉE est partagée par l'espace (#2703) ; en portefeuille
   * CLOISONNÉ, un membre ne voit pourtant que les comptes qu'il porte et les
   * comptes libres (`portfolioScopeFor`, D5). Le lien de partage ne crée aucun
   * droit : s'il mène à un fil qui cite un compte porté par un collègue, la
   * lecture est refusée, dite, et rien n'est servi. Ouvert, ou gérant : aucune
   * lecture de plus. Le fil par défaut est celui du lecteur : rien à vérifier.
   */
  private async assertCitedAccountsReadable(
    userId: string,
    workspaceId: string,
    role: WorkspaceRole,
    conversationId: string | null,
  ): Promise<void> {
    if (!conversationId || !this.conversations) return
    const scope = portfolioScopeFor(role, await this.workspaceContext.portfolioVisibilityOf(workspaceId), userId)
    if (!scope) return
    if (await this.conversations.citesAccountOutside({ workspaceId, userId, conversationId }, scope.ownerId)) {
      throw new ForbiddenException(
        'Cette conversation porte sur un compte hors de ton portefeuille : elle ne peut pas être ouverte ici.',
      )
    }
  }

  private async buildThreadExportWithWorkspace(user: CurrentUserPayload, query: ChatThreadTargetDto) {
    if (!this.threadExport || !this.cards)
      throw new ServiceUnavailableException('L’export des conversations est indisponible.')
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const conversationId = query.conversationId ?? null
    // #1955.12 — la même borne que la lecture à l'écran : un export ne sort pas
    // ce que le lecteur ne pourrait pas ouvrir.
    await this.assertCitedAccountsReadable(user.userId, workspaceId, role, conversationId)
    const [connectedTools, confirmedCards] = await Promise.all([
      this.toolRegistry.list(user.userId),
      this.cards.confirmedForThread(this.principalOf(user), conversationId),
    ])
    const data = await this.threadExport.build({
      // #2703 — l'export d'un fil par défaut est celui de l'appelant.
      userId: user.userId,
      workspaceId,
      accountId: query.accountId ?? null,
      conversationId,
      connectedTools,
      confirmedCards,
      scope: query.scope === 'extract' ? 'extract' : 'full',
    })
    return { workspaceId, data }
  }

  /**
   * La marque de l'espace pour un export PDF — même lecture que
   * `consultants.controller.ts` (`brandName`) : `workspaceId` déjà résolu ici,
   * `@Optional()` parce que le chat marche sans `WorkspaceBrandModule`.
   */
  private async exportBrandName(workspaceId: string): Promise<string> {
    if (!this.brands) return 'BellumAI'
    return (await this.brands.getForWorkspace(workspaceId)).name
  }

  /* ════════════════════════════════════════════════════════════════════════ */
  /*  #1939 — LE MESSAGE VOCAL (lot 9.1, serveur)                             */
  /* ════════════════════════════════════════════════════════════════════════ */
  //
  // POURQUOI ICI, ET PAS DANS UN CONTRÔLEUR À PART
  //
  //  1. La RÉÉCOUTE doit avoir la même porte que la LECTURE du message (décision
  //     Louis : « même portée que le texte du fil ») — et cette lecture, c'est
  //     `GET chat/messages` juste au-dessus : mêmes gardes de classe, même
  //     résolution d'espace depuis la session. Une seconde classe aurait recopié
  //     la porte, et deux portes d'un même droit finissent par diverger.
  //  2. La TRANSCRIPTION applique le plafond quotidien du copilote
  //     (`assertChatQuota`) — le même, pas un second compteur ni une copie de sa
  //     dérivation (GA-26).
  //  3. Transcrire PUIS ranger est une orchestration de deux capacités : elle
  //     appartient à un contrôleur (GA-07 — le plafond d'imports service → service
  //     n'a plus qu'une place, et elle n'est pas pour ça).
  //
  // POURQUOI `@WorkspaceRead` SUR LES TROIS ROUTES
  //
  // La matrice des droits n'a aucune permission « parler à Laura » : écrire à
  // Laura (`POST chat`, `POST chat/messages`) est ouvert à TOUT membre de l'espace,
  // `viewer` compris, et #1939.13 exige « les mêmes règles de permission que le
  // texte ». Le marqueur déclare cette ouverture au lieu de la laisser nue.
  // ⚠️ La transcription écrit un objet — l'enregistrement de CETTE personne, qui
  // n'est lu que par le fil où elle l'envoie. `records:write` l'aurait fermée au
  // `viewer` qui peut pourtant taper la même question : c'est une décision, pas
  // un oubli, et elle est au rapport du lot.

  /**
   * #1939.1 — la capacité, que l'écran lit AVANT d'afficher le micro.
   *
   * `false` sans clé de transcription (la capacité n'existe pas — on ne lit même
   * pas l'espace), `false` sans stockage (un message vocal qu'on ne peut pas
   * conserver ne se propose pas), `false` en salle de démonstration (aucun
   * service payant). Un bouton qui échoue au clic est pire qu'un bouton absent.
   */
  @Get('chat/voice/status')
  @WorkspaceRead()
  async voiceStatus(@CurrentUser() user: CurrentUserPayload): Promise<ChatVoiceStatus> {
    // #3579 (décision Louis 14/10) — Voxtral n'allume jamais accent/bruit
    // SEUL : il s'ajoute à une transcription déjà branchée (`voice-refinement.ts`).
    const voxtralWired = readVoxtralConfig() !== null
    // #2434.74 / #2434.75 / #2434.77 — nommé à chaque lecture, jamais deviné :
    // sans transcription branchée, Voxtral ne peut rien ajouter (`voice-refinement.ts`).
    const unavailable = { available: false, refinements: voiceRefinementStatus(false, voxtralWired) }
    if (readTranscriptionConfig() === null || !this.storage) return unavailable
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) return unavailable
    // #3579 — la transcription est branchée : la langue par segment est rendue,
    // et accent/bruit basculent si Voxtral est aussi configuré.
    return { available: true, refinements: voiceRefinementStatus(true, voxtralWired) }
  }

  /**
   * #1939 — TRANSCRIRE un message vocal, et RANGER son enregistrement 30 jours.
   *
   * Rend `{ text, voiceObjectId }`. ⚠️ Le texte n'est envoyé NULLE PART : il
   * revient dans la zone de saisie, le commercial le relit, le corrige, et
   * l'envoie lui-même par le tour ordinaire (`laura-turn.ts`, GA-237) — avec
   * `voiceObjectId` sur `POST chat/messages`. Aucun appel au modèle ici, aucun
   * message écrit (#1939.9, #1939.10, #1939.14).
   *
   * L'ORDRE DES REFUS est une décision : tout ce qui peut refuser sans appel
   * réseau passe AVANT la transcription — la clé (no-op strict), la démo (aucun
   * service payant), le plafond, la durée, la taille, le format. Et rien n'est
   * rangé tant que la transcription n'a pas rendu un texte : ni l'audio d'une
   * panne, ni celui d'un silence.
   *
   * ⚠️ Ni l'audio ni la transcription n'entrent dans un journal — seulement une
   * taille et la nature d'un échec.
   */
  /**
   * #2434.33 — LE BIAIS DE VOCABULAIRE ESN, ÉTENDU AUX NOMS PROPRES DU DOSSIER OUVERT.
   *
   * `CHAT_VOICE_TRANSCRIPTION_PROMPT` oriente le jargon (#2434.34-.38) mais ne
   * peut rien pour un nom propre : Whisper n'a aucune chance de bien orthographier
   * « Nova Logistique » ou « Belhadi » sans indice. Le contexte de la conversation
   * active — le dossier ouvert au moment de la dictée — est exactement cet
   * indice, tel que documenté ici et sur `chat-voice.ts` comme hors de portée
   * tant qu'il n'était pas injecté.
   *
   * ⚠️ `accountId` est une PORTÉE À VÉRIFIER, pas une clé de confiance : les deux
   * lectures ci-dessous (`findOneForWorkspace`, `findByAccount`) rendent un
   * résultat vide plutôt qu'une erreur pour un compte hors espace ou introuvable
   * — même discipline que le reste du dossier (#1951.1 et suivants). Un indice
   * qui ne peut pas se lire n'échoue JAMAIS la transcription : il ne l'oriente
   * simplement pas, comme sans `accountId` du tout.
   */
  private async voiceTranscriptionPrompt(
    accountId: string | undefined,
    userId: string,
    workspaceId: string,
  ): Promise<string> {
    const names = await this.voiceVocabulary(accountId, userId, workspaceId)
    if (names.length === 0) return CHAT_VOICE_TRANSCRIPTION_PROMPT
    return `${CHAT_VOICE_TRANSCRIPTION_PROMPT} Noms propres probables dans ce dossier : ${names.join(', ')}.`
  }

  /** Les noms propres du dossier (compte + contacts) — vocabulaire de la
   *  transcription : `prompt` sur la voie OpenAI, `context_bias` sur Voxtral
   *  (LOT 15/10 DATA-C). Vide hors dossier : rien n'est inventé. */
  private async voiceVocabulary(accountId: string | undefined, userId: string, workspaceId: string): Promise<string[]> {
    if (!accountId || !this.accountsService || !this.contacts) return []

    const account = await this.accountsService.findOneForWorkspace(accountId, workspaceId)
    if (account.type !== 'success') return []

    const contacts = await this.contacts.findByAccount(accountId, userId)
    return [account.output.company_name, ...contacts.map(contact => contact.full_name)]
      .filter((name): name is string => Boolean(name?.trim()))
      .slice(0, ACCOUNT_NAME_HINT_CONTACT_LIMIT + 1)
  }

  @Post('chat/voice/transcribe')
  @WorkspaceRead()
  @RequireFeature('chat_ai')
  @Throttle(VOICE_TRANSCRIBE_RATE_LIMIT)
  @HttpCode(200)
  async transcribeVoiceMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: TranscribeChatVoiceDto,
  ): Promise<ChatVoiceTranscription> {
    const config = readTranscriptionConfig()
    const storage = this.storage
    if (!config || !storage) {
      throw new ServiceUnavailableException(
        'Les messages vocaux ne sont pas activés sur ce serveur. Tape ta question : Laura répond pareil.',
      )
    }
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      throw new BadRequestException(
        'Les messages vocaux sont désactivés dans l’espace de démonstration : aucun service payant n’y est appelé. Tape ta question.',
      )
    }
    // #1939.13 — le même plafond qu'un message tapé, et pas un second compteur :
    // à plafond atteint, transcrire ne servirait à rien, l'envoi serait refusé.
    await this.assertChatQuota(user.userId)

    if (chatVoiceDurationRefused(dto.durationMs)) {
      throw new BadRequestException(
        `Un message vocal dure au plus ${CHAT_VOICE_MESSAGE_MAX_SECONDS} secondes. Coupe ta question en deux, ou tape-la.`,
      )
    }
    const audio = Buffer.from(dto.audioB64, 'base64')
    if (audio.byteLength > CHAT_VOICE_MESSAGE_MAX_BYTES) {
      throw new PayloadTooLargeException(
        `Cet enregistrement dépasse ${Math.round(CHAT_VOICE_MESSAGE_MAX_BYTES / (1024 * 1024))} Mo — un message vocal dure au plus ${CHAT_VOICE_MESSAGE_MAX_SECONDS} secondes.`,
      )
    }
    const container = sniffChatVoiceContainer(audio)
    if (!container) {
      throw new BadRequestException(
        'Cet enregistrement n’est pas dans un format audio reconnu. Réessaie depuis le micro.',
      )
    }
    const fileName = `message-vocal.${container}`
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)

    let text: string
    let uncertainSegments: string[]
    // #2434.40 / #2434.85 — `verbose_json` + horodatages par mot, dans le MÊME
    // appel que la langue détectée et les segments : un seul appel payant au
    // fournisseur rend les trois (`transcribeAudioDetailed`). Le compte rendu
    // de rendez-vous reste sur `transcribeAudio` (`json`), qui n'a besoin
    // d'aucun de ces trois.
    let words: ChatVoiceTranscription['words']
    let segments: NonNullable<ChatVoiceTranscription['segments']> = []
    try {
      // #2434.74/.75/.77 — `'auto'` ne se transmet PAS au fournisseur (ce
      // n'est pas un code de langue qu'il reconnaît) : omis, le fournisseur
      // détecte seul et la rend dans `.language` ci-dessous.
      const language = dto.language === 'auto' ? undefined : dto.language
      // #3579 (décision Louis 14/10) — Voxtral REMPLACE le fournisseur suivi
      // pour CET appel quand il est configuré : il ne s'ajoute qu'à une
      // transcription déjà branchée (`config` vérifié juste au-dessus), jamais
      // seul. Sans `OCR_API_KEY` (absente en production au 14/10/2026),
      // `voxtral` vaut `null` et ce chemin reste byte-identique à avant ce lot.
      const voxtral = readVoxtralConfig()
      const detail = voxtral
        ? await transcribeWithVoxtral(voxtral, {
            audio,
            filename: fileName,
            language,
            // LOT (15/10) DATA-C — les noms propres du dossier guident l'orthographe.
            contextBias: await this.voiceVocabulary(dto.accountId, user.userId, workspaceId),
          })
        : await transcribeAudioDetailed(config, {
            audio,
            filename: fileName,
            language,
            prompt: await this.voiceTranscriptionPrompt(dto.accountId, user.userId, workspaceId),
          })
      text = detail.text
      // #2434.40 — Whisper ne rend aucun score PAR MOT : le calcul pur
      // (`chatVoiceUncertainSegments`) marque les SEGMENTS sous le seuil
      // documenté ; la transcription reste éditable avant envoi (#1939.4), qui
      // reste la limite réelle sans score plus fin.
      uncertainSegments = chatVoiceUncertainSegments(detail.segments)
      // #2434.85 — le MÊME appel rend aussi le verdict par mot, dérivé des
      // mêmes segments (voir `word-confidence.ts`).
      words = detail.words
      // #3579 / #2434.77 — la langue (FR/EN) de chaque segment, déduite de son texte.
      segments = detail.segments
        .map(segment => ({ text: segment.text.trim(), language: detectSegmentLanguage(segment.text) }))
        .filter(segment => segment.text.length > 0)
      // #3579 — le coût par minute entre dans la gouvernance de coût IA (best-effort).
      await this.providerCosts?.record([transcriptionCostRow(detail.durationSeconds)], {
        workspaceId,
        userId: user.userId,
        feature: 'voice_transcription',
      })
    } catch (error) {
      if (error instanceof EmptyTranscriptionError) {
        throw new BadRequestException(
          'Je n’ai rien entendu dans cet enregistrement. Rapproche-toi du micro, ou tape ta question.',
        )
      }
      this.logger.warn(
        `Message vocal non transcrit (${audio.byteLength} octets) : ${(error as Error)?.name ?? 'Error'}`,
      )
      throw new ServiceUnavailableException(
        'La transcription n’a pas abouti. Réessaie dans un instant, ou tape ta question.',
      )
    }

    // #1939.3 — rangé sous son domaine : échéance à 30 JOURS, purge par le
    // balayage existant de 03:41, effacement immédiat avec le compte.
    const stored = await storage.put({
      workspaceId,
      domain: 'chat_voice_message',
      fileName,
      contentType: STORED_VOICE_FILE_TYPES[container] ?? '',
      fileB64: dto.audioB64,
      uploadedBy: user.userId,
      today: localDayKey(new Date()),
    })
    return {
      text,
      voiceObjectId: stored.id,
      uncertainSegments,
      ...(words && words.length > 0 ? { words } : {}),
      ...(segments.length > 0 ? { segments } : {}),
    }
  }

  /**
   * #1939 — RÉÉCOUTER un message vocal : une URL signée de cinq minutes.
   *
   * La porte est celle de la LECTURE du message : l'espace vient de la SESSION,
   * et le message est cherché DANS cet espace. Un membre d'un autre espace — ou
   * un identifiant deviné — ne trouve rien, et le magasin n'est même pas
   * interrogé. Le 404 dit la raison la plus probable sans dire si le message
   * existe ailleurs.
   */
  @Get('chat/messages/:id/voice')
  @WorkspaceRead()
  async listenVoiceMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SignedDownload> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const objectId = await this.chatMessages.voiceObjectIdInWorkspace(workspaceId, id)
    if (!objectId || !this.storage) {
      throw new NotFoundException(
        'Aucun enregistrement conservé pour ce message — un message vocal est effacé 30 jours après son envoi.',
      )
    }
    return this.storage.signedUrlFor(workspaceId, objectId)
  }
}

/**
 * #1955.7 — envoie un export de fil en PIÈCE JOINTE.
 *
 * Même geste que `consultants.controller.ts` (`sendDocument`) : `attachment`
 * et non `inline`, un fil se télécharge pour être relu ou archivé, il ne
 * s'ouvre pas dans un onglet qu'on referme sans le garder. Dupliqué plutôt que
 * partagé : `document-builders.ts` reste PUR (aucun accès réseau), et cette
 * fonction n'existe que pour écrire sur `Response`.
 */
function sendDocument(response: Response, buffer: Buffer, filename: string, mime: string): void {
  response.setHeader('Content-Type', mime)
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  response.setHeader('Content-Length', String(buffer.byteLength))
  response.end(buffer)
}

/** #4067.3 — les termes de l'OFFRE de l'ESN (offres, portefeuille, rôles
 *  placés) contre lesquels la pile observée d'un candidat se compare. */
function discoverProfileTerms(profileData: Record<string, unknown>): string[] {
  const keys = ['offers', 'offerPortfolio', 'offerPortfolioNames', 'placedRoles'] as const
  return keys.flatMap(key => {
    const value = profileData?.[key]
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  })
}
