import { Module } from '@nestjs/common'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { IsNull, type Repository } from 'typeorm'
import { ConversationSummaryEntity } from '../../database/entities/conversation-summary.entity'
import { SavedViewEntity } from '../../database/entities/saved-view.entity'
import { TargetListEntity } from '../../database/entities/target-list.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ChatArtifactVersionsController } from './chat-artifact-versions.controller'
import { ChatArtifactVersionsService } from './chat-artifact-versions.service'
import { ChatArtifactVersionEntity } from '../../database/entities/chat-artifact-version.entity'
import { ChatConversationsController } from './chat-conversations.controller'
import { ChatConversationsService } from './chat-conversations.service'
import { InternalChatTurnController } from './internal-chat-turn.controller'
import { InternalChatTurnsListController } from './internal-chat-turns-list.controller'
import { ChatConversationEntity, ChatConversationVersionEntity } from '../../database/entities/chat-conversation.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { ChatPresenceEntity } from '../../database/entities/chat-presence.entity'
import { ChatThreadTitleEntity } from '../../database/entities/chat-thread-title.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { AccountFeedbackModule } from '../account-feedback/account-feedback.module'
import { ActionOsModule } from '../action-os/action-os.module'
import { AccountsModule } from '../accounts/accounts.module'
import { AuthModule } from '../auth/auth.module'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
// #3272.6 — Laura cite le REX de perte du compte. Importé ICI (le fichier de
// module, hors mesure GA-07) pour fournir le jeton `LOST_DEAL_REX_CONTEXT` —
// `ChatContextService` ne connaît que la FORME de ce qu'il reçoit, voir
// `module-tokens.ts`.
import { CapitalisationModule } from '../capitalisation/capitalisation.module'
import { CapitalisationService } from '../capitalisation/capitalisation.service'
import { WorkspaceMethodRulesService } from '../capitalisation/workspace-method-rules.service'
import { ConsultantsModule } from '../consultants/consultants.module'
import { DeliveryModule } from '../delivery/delivery.module'
import { ContactsModule } from '../contacts/contacts.module'
// #3671.2bis — les SIREN qu'un espace a déclarés « Mauvaise entreprise »,
// exclus des recherches Découvrir suivantes (`withoutWrongCompanyCandidates`).
import { DiscoverFeedbackModule } from '../discover-feedback/discover-feedback.module'
import { ProjectsModule } from '../projects/projects.module'
import { CrmModule } from '../crm/crm.module'
import { SignalHistoryModule } from '../signal-history/signal-history.module'
import { EsnProfileReaderModule } from '../esn-profile/esn-profile-reader.module'
import { ChatEvalSamplingModule } from '../chat-eval-sampling/chat-eval-sampling.module'
import { LauraUnroutedIntentsModule } from '../laura-unrouted-intents/laura-unrouted-intents.module'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { MemoryModule } from '../memory/memory.module'
import { MessageStyleModule } from '../message-style/message-style.module'
// #1940.1 — le collègue mentionné est prévenu par une VRAIE notification
// (`NotificationsService.createNotification`), pas seulement le texte `@Nom`
// déjà inséré côté navigateur. Le cœur léger (`NotificationsCoreModule`,
// juste le service + ses trois dépôts, sans mailer ni planificateur) : le
// contrôleur l'injecte en `@Optional()`, sans lui `notifyMentions` se tait.
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
// #3757 (reste) — fournit `PartnerPipelineService`, injecté `@Optional()` au
// CONTRÔLEUR (hors du compteur GA-07, qui ne porte que les imports service →
// service) pour nommer les SIREN que cet espace a déclarés partenaires.
import { PartnerPipelineModule } from '../partner-pipeline/partner-pipeline.module'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { StorageModule } from '../storage/storage.module'
import { ToolRegistryModule } from '../tool-registry/tool-registry.module'
import { TriggerRegistryModule } from '../trigger-registry/trigger-registry.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ChatContextService } from './chat-context.service'
import { ChatImageVisionArchiveScheduler } from './chat-image-vision-archive.scheduler'
import { ChatMessagesService } from './chat-messages.service'
import { DeepenResumeTurnRunner } from './chat-deepen-resume-turn'
import { ChatPresenceController } from './chat-presence.controller'
import { ChatTurnsController } from './chat-turns.controller'
import { ChatTurnsModule } from '../chat-turns/chat-turns.module'
import { ChatPresenceService } from './chat-presence.service'
import { ChatThreadDocumentsService } from './chat-thread-documents.service'
import { ChatThreadExportService } from './chat-thread-export.service'
import { ChatThreadTitlesService } from './chat-thread-titles.service'
import { DiscoverPortfolioService } from './discover-portfolio.service'
import { DiscoverMarketMemoryService } from './discover-market-memory.service'
import { DiscoverSourcesService } from './discover-sources.service'
import { BASE_MATCHES_SOURCE, type BaseMatchesSource } from './base-matches-source'
import { SPACE_PAST_NEEDS_SOURCE, type SpacePastNeedsSource } from './space-past-needs-source'
import { AccountSignalLinesService } from '../accounts/account-signal-lines.service'
import { BaseReaderModule } from '../base-reader/base-reader.module'
import { BaseReaderService } from '../base-reader/base-reader.service'
import { TechnologyRadarController } from './technology-radar.controller'
import { IaProxyController } from './ia-proxy.controller'
import { learnedRulesContextFor } from './learned-rules-context'
import { lostDealRexContextFor } from './lost-deal-rex-context'
import { commercialMethodContextFor } from './commercial-method-context'
import { accountFactsContextFor } from './account-facts-context'
import { workspaceRecallContextFor } from './workspace-recall-context'
// #4071.1 — le lecteur unique des faits du compte (socle #4069), fourni au
// jeton `ACCOUNT_FACTS_CONTEXT` ci-dessous. Sans cycle : `AccountFactsModule`
// n'importe que TypeORM et `MarketMemoryModule`.
import { AccountFactsModule } from '../account-facts/account-facts.module'
import { AccountFactsService } from '../account-facts/account-facts.service'
import { NeedVerdictService } from '../projects/need-verdict.service'
// #4759 — l'historique des besoins de Laura (TypeORM seul, sans cycle), fourni au jeton `NEEDS_HISTORY_CONTEXT`.
import { NeedsHistoryModule } from '../laura/needs-history.module'
import { NeedsHistoryService } from '../laura/needs-history.service'
import { needsAggregateLine } from '../laura/needs-history'
import {
  ACCOUNT_FACTS_CONTEXT,
  COMMERCIAL_METHOD_CONTEXT,
  LOST_DEAL_REX_CONTEXT,
  NEEDS_HISTORY_CONTEXT,
  WORKSPACE_LEARNED_RULES_CONTEXT,
  WORKSPACE_RECALL_CONTEXT,
  type AccountFactsContextReader,
  type CommercialMethodContextReader,
  type LostDealRexContextReader,
  type NeedsHistoryContextReader,
  type WorkspaceLearnedRulesContextReader,
  type WorkspaceRecallContextReader,
} from './module-tokens'

/**
 * Browser-facing IA proxy (discover, chat). IaClient is provided by the global
 * IaModule; AuthModule supplies the JwtGuard. RAG ingest/query are proxied by
 * RagController (they live with the rag-documents resource). CrmModule supplies
 * CrmReadService — the chat context crosses the active account with the CRM.
 * ToolRegistryModule supplies the connected-tools digest (Tool Registry v2) the
 * advisor uses to propose real tool actions with their costs.
 */
@Module({
  imports: [
    // #4967 (lot L6) — le registre des tours en arrière-plan (partagé avec l'avancement, #4611).
    ChatTurnsModule,
    NeedsHistoryModule,
    // #4792 (épopée #4791) — le lecteur commun de la base, dont Découvrir lit les comptes.
    BaseReaderModule,
    AccountFactsModule,
    AccountFeedbackModule,
    // #1943 L3 — la conversation crée et relit les cartes de Laura, qui sont des
    // runs d'Action OS (`CopilotCardService`). Sans cycle : ActionOsModule
    // n'atteint pas IaProxyModule (graphe des imports vérifié le 13/09).
    ActionOsModule,
    AccountsModule,
    AuthModule,
    // #1918.2 — « de quelles équipes cette personne est-elle MEMBRE », pour la
    // mémoire de périmètre lue au contrôleur (GA-07). Sans cycle :
    // `BusinessUnitModule` n'importe que TypeORM et `WorkspaceModule`.
    BusinessUnitModule,
    // #3272.6 — fournit `CapitalisationService`, injecté `@Optional()` par le
    // jeton `LOST_DEAL_REX_CONTEXT` ci-dessous. Sans cycle : `CapitalisationModule`
    // n'importe que Workspace et MarketMemory (déjà importés ici).
    CapitalisationModule,
    ConsultantsModule,
    ContactsModule,
    CrmModule,
    // #1910.6 — la portée « une mission » relit la fiche par la MÊME lecture que
    // son dossier (`DeliveryService.list({ id })`). Composition au CONTRÔLEUR
    // (GA-07), et sans cycle : `DeliveryModule` n'importe que Workspace,
    // AccountGate et Agenda — il n'atteint pas `IaProxyModule`.
    DeliveryModule,
    DiscoverFeedbackModule,
    EsnProfileReaderModule,
    // #1949.23 — décision Louis 13/09 batch 12 : la trace anonyme d'une demande
    // que Laura n'a pas su router. AUTONOME : le contrôleur l'injecte en
    // `@Optional()`, sans lui le chat répond à l'identique et ne trace rien.
    LauraUnroutedIntentsModule,
    // #2899 — l'échantillonnage opt-in des tours pour les évals.
    ChatEvalSamplingModule,
    // #1581.1 — la couverture mémoire marché du portefeuille entre dans le
    // contexte du copilote. Le module est AUTONOME et en lecture seule : sans lui
    // le chat marche à l'identique, le bloc n'apparaît simplement pas — ce qui est
    // le contrat de ses deux dépendances `@Optional()` sur le contrôleur.
    MarketMemoryModule,
    MemoryModule,
    // #2204.59-.65 (épopée #2947) — la génération réelle (`generateMessage`)
    // résout le style `active` choisi, plutôt que de ne l'estampiller qu'à la
    // sauvegarde. `MessageStyleService` exporté, sans cycle (`MessageStyleModule`
    // n'importe que Workspace/EsnProfileReader — `IaClient` est `@Global()`).
    MessageStyleModule,
    NotificationsCoreModule,
    // #3757 (reste) — voir l'import ci-dessus.
    PartnerPipelineModule,
    // Gating par offre : le copilote (`chat_*`) n'est ouvert qu'aux paliers qui
    // portent la feature `chat_ai`.
    PlanFeaturesModule,
    ProjectsModule,
    // Théo L1 — sélecteur avancé — la portée « une offre d'emploi » relit sa ligne
    // d'historique de recrutement (`SignalHistoryService.readJobOffer`). Sans cycle :
    // `SignalHistoryModule` n'importe que Actions, Activities et Workspace.
    SignalHistoryModule,
    // #1939 — le message vocal range son enregistrement (30 jours) dans le
    // stockage privé, et la réécoute signe une URL courte. `StorageService` est
    // `@Optional()` côté contrôleur : sans ce module, la capacité se déclare absente.
    StorageModule,
    ToolRegistryModule,
    // #2875/#2402.1 (vague F/G 27/09) — le registre canonique des
    // déclencheurs commerciaux : `discoverSignals` y persiste `ao_publie`
    // pour chaque candidat déjà possédé qui porte un signal BOAMP.
    TriggerRegistryModule,
    WorkspaceModule,
    // AccountEntity : Découvrir croise les candidats avec le portefeuille du
    // workspace pour ne jamais reproposer un compte déjà détenu (lecture seule).
    // ChatThreadTitleEntity : #1911.1 — le titre d'un fil de Laura, et qui l'a écrit.
    // RagDocumentEntity : #1954 — les documents « fil seul » vivent et meurent
    // avec leur fil (`ChatThreadDocumentsService`).
    TypeOrmModule.forFeature([
      AccountEntity,
      // #4067 — contacts connus d'un candidat déjà possédé (`DiscoverSourcesService`).
      ContactEntity,
      // #3819.1 — « besoins connus » : un schéma partagé (hors du périmètre
      // de GA-07, qui ne vise que les imports service → service), lu en
      // lecture seule pour le COMPTE de besoins ouverts du candidat déjà
      // possédé (`DiscoverPortfolioService.resolveKnownNeeds`).
      ProjectNeedEntity,
      // #2430.11 — l'objet conversation (propriétaire, branche, rattachement,
      // conservation légale) et ses versions figées.
      ChatConversationEntity,
      ChatConversationVersionEntity,
      ChatMessageEntity,
      ChatArtifactVersionEntity,
      // #3086 — présence sur un fil (battement de coeur éphémère).
      ChatPresenceEntity,
      ChatThreadTitleEntity,
      CrmConnectionEntity,
      RagDocumentEntity,
      // #4071.3 — lus en LECTURE SEULE pour le contexte de Laura (recherches enregistrées,
      // listes de cibles, résumés des conversations passées de la personne).
      SavedViewEntity,
      TargetListEntity,
      ConversationSummaryEntity,
    ]),
  ],
  // #2430 — les routes de l'objet conversation (branche, propriétaire, rattachement,
  // conservation légale, versions figées).
  // #2905 (#2442.16) — réplique en lecture seule d'un tour, back-office.
  // #3086 — les deux routes de présence (battement, lecture).
  controllers: [
    IaProxyController,
    ChatConversationsController,
    ChatArtifactVersionsController,
    InternalChatTurnController,
    InternalChatTurnsListController,
    ChatPresenceController,
    // #4967 (lot L6) — « Arrêter » et « tourne encore ? » pour les tours en arrière-plan.
    ChatTurnsController,
    // #4282.10 — le radar par technologie de Découvrir (même sortie que Laura).
    TechnologyRadarController,
  ],
  providers: [
    ChatContextService,
    ChatConversationsService,
    ChatArtifactVersionsService,
    ChatMessagesService,
    // #2876 (décision Louis 14/10) — le balayage nocturne qui ARCHIVE (jamais
    // ne supprime) les zones vision d'une image de chat expirée.
    ChatImageVisionArchiveScheduler,
    // #3236 (lot W2) — le tour de reprise automatique d'une étude Approfondie (même chemin que le chat).
    DeepenResumeTurnRunner,
    ChatPresenceService,
    ChatThreadDocumentsService,
    // #1955.7 — l'export d'un fil (.md/.pdf/.json) : dépend de `CopilotCardService`
    // (ActionOsModule) et `ToolRegistryService` (ToolRegistryModule), déjà
    // importés ci-dessus pour les cartes de Laura.
    ChatThreadExportService,
    ChatThreadTitlesService,
    DiscoverPortfolioService,
    // #2165.28 / #2165.30 — les filtres serveur mémoire marché de Découvrir.
    DiscoverMarketMemoryService,
    // #4067 — les faits de l'espace qui pèsent dans le classement Découvrir.
    DiscoverSourcesService,
    // #4792 (épopée #4791) — le lecteur COMMUN de la base, par son JETON : `DiscoverSourcesService`
    // ne connaît pas le nom du service (GA-07), et le port est le TYPE DE RETOUR du `useFactory`
    // (jamais `useExisting`) — même idiome que les jetons ci-dessous. `optional: true` : sans le
    // module, Découvrir garde EXACTEMENT la coupe qu'il avait avant ce lot.
    {
      provide: BASE_MATCHES_SOURCE,
      inject: [{ token: BaseReaderService, optional: true }],
      useFactory: (reader?: BaseReaderService): BaseMatchesSource | null => reader ?? null,
    },
    // #5203 — les lignes PASSÉES de l'espace pour Découvrir : le port, jamais le service (GA-07). Absent : no-op.
    {
      provide: SPACE_PAST_NEEDS_SOURCE,
      inject: [{ token: AccountSignalLinesService, optional: true }],
      useFactory: (lines?: AccountSignalLinesService): SpacePastNeedsSource | null => lines ?? null,
    },
    // #3272.6 — le jeton, jamais le service : voir le docblock de `module-tokens.ts`.
    {
      provide: LOST_DEAL_REX_CONTEXT,
      inject: [{ token: CapitalisationService, optional: true }],
      useFactory:
        (capitalisation?: CapitalisationService): LostDealRexContextReader =>
        async account => {
          if (!capitalisation || !account.workspace_id) return null
          const entries = await capitalisation.lostDealRexForAccount(account.workspace_id, account.id)
          return lostDealRexContextFor(entries)
        },
    },
    // #3390.10/.11 — la méthode commerciale RETENUE pour le besoin ouvert du
    // compte actif : le jeton, jamais le service. `ProjectsModule` est déjà
    // importé ci-dessus et exporte `NeedVerdictService`.
    // #4071.1 — les faits du compte (socle #4069) : le jeton, jamais le service.
    {
      provide: ACCOUNT_FACTS_CONTEXT,
      inject: [{ token: AccountFactsService, optional: true }],
      useFactory:
        (facts?: AccountFactsService): AccountFactsContextReader =>
        async ({ workspaceId, accountId, userId }) => {
          if (!facts) return null
          const read = await facts.forAccount({ workspaceId, accountId, userId })
          return read ? accountFactsContextFor(read.facts) : null
        },
    },
    // #4759 — l'agrégat daté de l'historique des besoins : le jeton, jamais le service.
    {
      provide: NEEDS_HISTORY_CONTEXT,
      inject: [{ token: NeedsHistoryService, optional: true }],
      useFactory:
        (needs?: NeedsHistoryService): NeedsHistoryContextReader =>
        async ({ workspaceId, accountIds }) => {
          const out = new Map<string, string>()
          if (!needs) return out
          for (const [id, aggregate] of await needs.aggregateFor(workspaceId, accountIds)) {
            const line = needsAggregateLine(aggregate)
            if (line) out.set(id, line)
          }
          return out
        },
    },
    // #4071.3 — ce que l'espace a gardé : le jeton, jamais les services. Lecture seule, bornée, du plus récent
    // au plus ancien ; les recherches et listes visibles de CETTE personne (les siennes + celles de l'espace) ;
    // les résumés de conversation, EUX, ne sont que les siens (D65 : jamais ceux d'un collègue).
    {
      provide: WORKSPACE_RECALL_CONTEXT,
      inject: [
        { token: getRepositoryToken(SavedViewEntity), optional: true },
        { token: getRepositoryToken(TargetListEntity), optional: true },
        { token: getRepositoryToken(ConversationSummaryEntity), optional: true },
      ],
      useFactory:
        (
          views?: Repository<SavedViewEntity>,
          lists?: Repository<TargetListEntity>,
          summaries?: Repository<ConversationSummaryEntity>,
        ): WorkspaceRecallContextReader =>
        async ({ workspaceId, userId, excludeConversationId }) => {
          // Typé : `?? []` vaut `never[]`, et dans l'union `never[] | X[]` l'ordre des membres dépend du programme
          // compilé — sur la branche intégrée, `.filter` recevait `never` (défaut d'intégration 13/10).
          const [viewRows, listRows, summaryRows]: [
            SavedViewEntity[],
            TargetListEntity[],
            ConversationSummaryEntity[],
          ] = await Promise.all([
            views
              ?.find({
                where: [
                  { workspace_id: workspaceId, scope: 'discover', shared: true },
                  { workspace_id: workspaceId, scope: 'discover', owner_id: userId },
                ],
                order: { created_at: 'DESC' },
                take: 40,
              })
              .catch(() => []) ?? [],
            lists
              ?.find({
                where: [
                  { workspace_id: workspaceId, visibility: 'workspace' },
                  { workspace_id: workspaceId, created_by: userId },
                ],
                order: { updated_at: 'DESC' },
                take: 40,
              })
              .catch(() => []) ?? [],
            summaries
              ?.find({
                where: { user_id: userId, workspace_id: workspaceId, superseded_at: IsNull(), archived_at: IsNull() },
                order: { updated_at: 'DESC' },
                take: 20,
              })
              .catch(() => []) ?? [],
          ])
          return workspaceRecallContextFor({
            searches: viewRows.map(row => ({
              name: row.name,
              objective: row.objective,
              at: row.last_run_at ?? row.created_at,
            })),
            targetLists: listRows
              .filter(row => row.status !== 'archived')
              .map(row => ({ name: row.name, objective: row.objective, at: row.updated_at })),
            conversations: summaryRows
              .filter(row => row.conversation_id !== (excludeConversationId ?? null) && row.summary.trim())
              .map(row => ({ summary: row.summary, at: row.updated_at })),
            now: new Date(),
          })
        },
    },
    {
      provide: COMMERCIAL_METHOD_CONTEXT,
      inject: [{ token: NeedVerdictService, optional: true }],
      useFactory:
        (verdicts?: NeedVerdictService): CommercialMethodContextReader =>
        async ({ workspaceId, accountId, userId }) => {
          if (!verdicts) return null
          const needId = await verdicts.openNeedIdOfAccount(workspaceId, accountId)
          // Compte cadré sans besoin ouvert : la méthode du MÊME moteur, sur un verdict non évaluable.
          if (!needId)
            return commercialMethodContextFor(await verdicts.methodWithoutOpenNeed(workspaceId, userId), 'account')
          return commercialMethodContextFor(await verdicts.forNeed(workspaceId, needId, new Date(), userId))
        },
    },
    // #3295 — les règles APPRISES de l'espace (adoptées puis activées) : le
    // pont qui fait que l'apprentissage contrôlé modifie réellement Laura.
    {
      provide: WORKSPACE_LEARNED_RULES_CONTEXT,
      inject: [{ token: WorkspaceMethodRulesService, optional: true }],
      useFactory:
        (rules?: WorkspaceMethodRulesService): WorkspaceLearnedRulesContextReader =>
        async workspaceId => {
          if (!rules) return null
          return learnedRulesContextFor(await rules.enabledForWorkspace(workspaceId))
        },
    },
  ],
  // ChatContextService is reused by the MCP surface (`ask_bellum`) so the
  // assistant Q&A resolves the EXACT same server-side context as the Copilote.
  exports: [ChatContextService, DeepenResumeTurnRunner],
})
export class IaProxyModule {}
