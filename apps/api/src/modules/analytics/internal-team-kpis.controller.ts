import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards, Query } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  preflightVerdict,
  decideMessageLearningRuleSnapshotRequestSchema,
  type DecideMessageLearningRuleSnapshotRequest,
  type RecetteCase,
} from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { ChatbotFunnelService, type ChatbotFunnelOverview } from './chatbot-funnel.service'
import type { ContactReachability, EnrichmentCoverage } from './enrichment-coverage'
import { EnrichmentCoverageService } from './enrichment-coverage.service'
import { ProviderCostService, type ProviderCostOverview } from './provider-cost.service'
import type { QualityIndicator } from './quality-metrics'
import { QualityMetricsService } from './quality-metrics.service'
import { CrmKpisService } from './crm-kpis.service'
import { COMMAND_CATALOG } from '../ia-proxy/command-catalog'
import { ToolRegistryService } from '../tool-registry/tool-registry.service'
import { TeamKpisService, type TeamKpisDetail, type TeamKpisSummary } from './team-kpis.service'
import { ManagerKpiService } from './manager-kpi.service'
import type { BellumGrossMarginResult } from './manager-kpi'
import type { RapportRetention } from './retention-cohorts'
import { RetentionCohortsService } from './retention-cohorts.service'
import type {
  BehavioralMessageLearningSignals,
  MessageLearningSignals,
  QualityFlagSignals,
} from './message-learning-signals'
import { MessageLearningSignalsService } from './message-learning-signals.service'
import type { ActionOsAdoptionMetrics } from './action-os-adoption-metrics'
import { ActionOsAdoptionMetricsService } from './action-os-adoption-metrics.service'

/**
 * Manager team-KPIs endpoints for the backoffice `dashboard-manager` (Next.js),
 * which proxies them server-side with the shared internal secret — same pattern
 * as `/internal/admin` and `/internal/telemetry`. Cross-tenant by design (the
 * operator sees every team), so {@link InternalSecretGuard} is the only thing
 * standing between this and the whole customer base. It must never be removed.
 */
@Controller('internal/analytics')
@UseGuards(InternalSecretGuard)
export class InternalTeamKpisController {
  constructor(
    private readonly teamKpis: TeamKpisService,
    private readonly providerCosts: ProviderCostService,
    private readonly quality: QualityMetricsService,
    private readonly enrichmentCoverage: EnrichmentCoverageService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly crmKpis: CrmKpisService,
    private readonly managerKpis: ManagerKpiService,
    private readonly chatbotFunnel: ChatbotFunnelService,
    private readonly retentionCohorts: RetentionCohortsService,
    private readonly messageLearningSignals: MessageLearningSignalsService,
    private readonly actionOsAdoptionMetrics: ActionOsAdoptionMetricsService,
  ) {}

  /**
   * Coûts fournisseurs de la période (D19). **Backoffice uniquement** — décision
   * Louis 31/07 : la marge par client ne sort jamais côté application.
   */
  @Get('costs')
  getCosts(@Query('days') days?: string): Promise<ProviderCostOverview> {
    return this.providerCosts.overview(days ? Number.parseInt(days, 10) : undefined)
  }

  /**
   * La marge brute de BELLUM, seule — pour l'écran des coûts (#1661).
   *
   * ⚠️ POURQUOI UNE ROUTE ET PAS UN SIXIÈME CHAMP DE `manager-kpis` : cette
   * réponse-là est la SEULE dont l'écran des coûts ait besoin, et
   * `getManagerKpis` en calcule cinq — dont deux cohortes qui lisent
   * `profiles` et `user_actions` sur trois mois. Un écran technique ne doit
   * pas payer quatre indicateurs qu'il n'affiche pas.
   *
   * ⚠️ La DÉRIVATION, elle, reste unique : `ManagerKpiService.bellumGrossMargin`
   * (→ `measureBellumGrossMargin`, D436). Rien n'est recalculé ici. En
   * particulier, ce n'est PAS l'endroit où l'on convertirait des dollars en
   * euros pour « débloquer » le chiffre : le refus `currency_mismatch` est une
   * décision écrite, pas une lacune à combler.
   */
  @Get('bellum-margin')
  getBellumMargin(@Query('days') days?: string): Promise<BellumGrossMarginResult> {
    return this.managerKpis.bellumGrossMargin(days ? Number.parseInt(days, 10) : undefined)
  }

  @Get('teams')
  getTeams(@Query('days') days?: string): Promise<TeamKpisSummary> {
    return this.teamKpis.getTeams(days ? Number.parseInt(days, 10) : undefined)
  }

  @Get('teams/:workspaceId')
  getTeamDetail(@Param('workspaceId') workspaceId: string, @Query('days') days?: string): Promise<TeamKpisDetail> {
    return this.teamKpis.getTeamDetail(workspaceId, days ? Number.parseInt(days, 10) : undefined)
  }
  /**
   * Les neuf indicateurs de qualité du §12 des méta-analyses. **Back-office
   * uniquement** — arbitrage Louis du 03/08, même règle que les coûts : une
   * qualité affichée à l'utilisateur devient une promesse chiffrée.
   *
   * Chaque indicateur porte son ÉCHANTILLON : un taux sur douze actions n'est
   * pas un taux, et l'écran doit pouvoir le dire.
   */
  /**
   * La couverture de l'enrichissement — la mesure qui décide s'il faut payer un
   * fournisseur de repli.
   *
   * Apollo est le fournisseur par défaut ; cinq autres attendent derrière lui et
   * coûtent chacun un abonnement, mais ne sont appelés que quand Apollo n'a rien
   * trouvé. Leur valeur se résume donc au taux d'échec d'Apollo — qui ne vivait
   * jusqu'ici que dans une ligne de log, c'est-à-dire nulle part où compter.
   *
   * Lecture seule sur des colonnes qui existaient déjà. Back-office uniquement,
   * même raison que les coûts : un taux d'échec montré à un commercial se lit
   * comme une promesse sur le prochain enrichissement.
   */
  @Get('enrichment-coverage')
  getEnrichmentCoverage(
    @Query('days') days?: string,
  ): Promise<EnrichmentCoverage & { reachability: ContactReachability }> {
    return this.enrichmentCoverage.overview(days ? Number.parseInt(days, 10) : undefined)
  }

  @Get('quality')
  getQuality(@Query('days') days?: string): Promise<{ days: number; indicators: QualityIndicator[] }> {
    return this.quality.overview(days ? Number.parseInt(days, 10) : undefined)
  }

  /**
   * Les neuf indicateurs CRM du §16 (PDF 2). Back-office uniquement, même
   * arbitrage que les coûts et la qualité : un taux affiché à un commercial
   * devient une promesse chiffrée qu'il faut tenir.
   */
  @Get('crm-kpis/:workspaceId')
  getCrmKpis(@Param('workspaceId') workspaceId: string, @Query('days') days?: string) {
    return this.crmKpis.overview(workspaceId, days ? Number.parseInt(days, 10) : undefined)
  }

  /**
   * Les cinq KPI de matching (PDF 4 §16.3). Sous leur seuil, ils DISENT combien
   * d'observations manquent au lieu de rester muets — même règle que le DSO.
   */
  @Get('matching-kpis/:workspaceId')
  getMatchingKpis(@Param('workspaceId') workspaceId: string) {
    return this.crmKpis.matchingOverview(workspaceId)
  }

  /**
   * #2385.2 (épopée #2877 — moteur d'apprentissage des messages, absent) —
   * les deux signaux EXPRESS classables aujourd'hui depuis le journal des
   * transitions (`approved`/`cancelled`). Back-office uniquement, comme les
   * autres indicateurs de ce contrôleur : aucune règle n'est proposée ni
   * appliquée ici (#2385.11) — une lecture, pas un apprentissage.
   */
  @Get('message-learning-signals/:workspaceId')
  getMessageLearningSignals(@Param('workspaceId') workspaceId: string): Promise<MessageLearningSignals> {
    return this.messageLearningSignals.expressSignals(workspaceId)
  }

  /**
   * #2385.4 (épopée #2877, lot P06) — les signaux qualité DÉCLARÉS par les
   * relecteurs (faux fait, CTA, persona). Back-office, lecture seule ; le corps
   * des messages n'est jamais lu pour les deviner.
   */
  @Get('message-learning-signals/:workspaceId/quality')
  getQualityFlagSignals(@Param('workspaceId') workspaceId: string): Promise<QualityFlagSignals> {
    return this.messageLearningSignals.qualityFlagSignals(workspaceId)
  }

  /**
   * #2385.3 (première tranche, épopée #2877, lot g20 26/09) — envoi, réponse,
   * bounce, échec, expiration et délai de réponse, agrégés depuis le MÊME
   * journal que le signal express. `optOut` reste hors de cette tranche (nommé
   * dans le docblock de `computeBehavioralMessageLearningSignals`). Back-office
   * uniquement, même arbitrage que les autres indicateurs de ce contrôleur.
   */
  @Get('message-learning-signals/:workspaceId/behavioral')
  getBehavioralMessageLearningSignals(
    @Param('workspaceId') workspaceId: string,
  ): Promise<BehavioralMessageLearningSignals> {
    return this.messageLearningSignals.behavioralSignals(workspaceId)
  }

  /**
   * #2385.5 (épopée #2877) — le candidat de règle au niveau workspace, gouverné
   * par `messageLearningRuleScopeSchema` (`@bellum/contracts`). `null` sous le
   * seuil de `MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE` — jamais un candidat
   * inventé sur un échantillon trop petit. Back-office uniquement ; aucune
   * règle n'est créée ni appliquée ici (#2385.11).
   */
  /**
   * #2877 (#2385.5 GLOBAL, Louis 11/10/2026) — le candidat de règle GLOBAL, lu
   * sur la base commune anonyme (k ≥ 3 espaces). Back-office uniquement, comme
   * les quatre autres niveaux ; la génération des messages lit les MÊMES
   * cellules côté IA (`shared_message_learning.py`). `null` sous le seuil.
   */
  @Get('message-learning-global/proposed-rule')
  getProposedGlobalMessageLearningRule() {
    return this.messageLearningSignals.proposedGlobalRule()
  }

  @Get('message-learning-signals/:workspaceId/proposed-rule')
  getProposedMessageLearningRule(@Param('workspaceId') workspaceId: string) {
    return this.messageLearningSignals.proposedRule(workspaceId)
  }

  /**
   * #2385.5 (épopée #2877, LOT écrivain 28/09 passe 2) — la persistance
   * VERSIONNÉE et RÉVERSIBLE que le candidat calculé à la volée n'avait pas
   * encore. Un GESTE explicite (POST), jamais un effet de bord d'une lecture
   * — l'opérateur choisit QUAND figer un candidat en historique. `null` sous
   * le seuil, comme le candidat lui-même. Back-office uniquement.
   */
  @Post('message-learning-signals/:workspaceId/proposed-rule/snapshot')
  postProposedMessageLearningRuleSnapshot(@Param('workspaceId') workspaceId: string) {
    return this.messageLearningSignals.recordProposedRuleSnapshot(workspaceId)
  }

  /**
   * #2385.1 (épopée #2877, migration `1796405091234`) — LE geste explicite qui
   * sort un snapshot de `proposed` : adopter ou refuser une règle apprise,
   * jamais un effet de bord de sa création. Un snapshot déjà décidé refuse une
   * seconde décision (409), un snapshot inconnu refuse (404) — jamais deviné.
   * Back-office uniquement, même arbitrage que le reste de ce contrôleur.
   */
  @Post('message-learning-signals/:workspaceId/proposed-rule/snapshot/:version/decide')
  decideProposedMessageLearningRuleSnapshot(
    @Param('workspaceId') workspaceId: string,
    @Param('version', ParseIntPipe) version: number,
    @Body(new ZodValidationPipe(decideMessageLearningRuleSnapshotRequestSchema))
    dto: DecideMessageLearningRuleSnapshotRequest,
  ) {
    return this.messageLearningSignals.decideProposedRuleSnapshot(workspaceId, version, dto.decision)
  }

  /**
   * #2385.5 (épopée #2877, LOT écrivain 28/09 passe 2) — l'historique des
   * snapshots enregistrés, le plus récent d'abord. Lecture seule.
   */
  @Get('message-learning-signals/:workspaceId/proposed-rule/history')
  getProposedMessageLearningRuleHistory(@Param('workspaceId') workspaceId: string) {
    return this.messageLearningSignals.proposedRuleHistory(workspaceId)
  }

  /**
   * #2385.5 (épopée #2877, LOT écrivain 28/09 passe 2) — le candidat de règle
   * au niveau UTILISATEUR, second des 5 niveaux gouvernés à se peupler après
   * `workspace`. `null` sous le seuil, comme le niveau workspace.
   */
  @Get('message-learning-signals/:workspaceId/proposed-rule/user/:userId')
  getProposedUserMessageLearningRule(@Param('workspaceId') workspaceId: string, @Param('userId') userId: string) {
    return this.messageLearningSignals.proposedUserRule(workspaceId, userId)
  }

  /**
   * #2385.5 (épopée #2877, LOT écrivain 28/09 passe 2) — le candidat de règle
   * au niveau CAMPAGNE (`outreach_sequences.campaign_label`, c74), troisième
   * des 5 niveaux gouvernés à se peupler. `null` sous le seuil ou sans
   * séquence portant cette étiquette dans cet espace.
   */
  @Get('message-learning-signals/:workspaceId/proposed-rule/campaign/:campaignId')
  getProposedCampaignMessageLearningRule(
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.messageLearningSignals.proposedCampaignRule(workspaceId, campaignId)
  }

  /**
   * #2385.5 (épopée #2877, lot SRC4 28/09) — le candidat de règle au niveau
   * MESSAGE, le dernier des 5 niveaux gouvernés à se peupler. `null` presque
   * toujours en usage réel (un seul message n'atteint jamais le seuil
   * d'échantillon) — voir le docblock de `proposeMessageMessageLearningRule`.
   */
  @Get('message-learning-signals/:workspaceId/proposed-rule/message/:messageId')
  getProposedMessageMessageLearningRule(
    @Param('workspaceId') workspaceId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.messageLearningSignals.proposedMessageRule(workspaceId, messageId)
  }

  /**
   * #2442.13 (épopée #2879 — observabilité chat) — action VALIDÉE
   * (`approval_requests.state = 'approved'`), EXÉCUTÉE (`workflow_runs.status`
   * `done`/`partial`), DÉSACTIVÉE (intent `toggle_routine` exécuté avec
   * `enabled: false`) et date du PREMIER succès, agrégées PAR ESPACE — la
   * granularité que ce point demandait et qu'aucune métrique existante
   * (`manager-kpis.validatedActionCadence`, ci-dessous, globale et
   * hebdomadaire) ne porte. Back-office uniquement, même arbitrage que le
   * reste de ce contrôleur.
   */
  @Get('action-os-adoption/:workspaceId')
  getActionOsAdoptionMetrics(
    @Param('workspaceId') workspaceId: string,
    @Query('days') days?: string,
  ): Promise<ActionOsAdoptionMetrics> {
    return this.actionOsAdoptionMetrics.forWorkspace(workspaceId, days ? Number.parseInt(days, 10) : undefined)
  }

  /**
   * Les cinq indicateurs manager qui manquaient au catalogue (`@bellum/
   * contracts`, `schemas/manager-kpi.ts`) : usage à J+7 (#1946.14), cohorte des actifs à J+30,
   * rétention à 3 mois, marge brute de BELLUM (pas celle de l'ESN cliente),
   * cadence d'actions validées par semaine, consultants enregistrés par
   * commercial. Back-office uniquement, même arbitrage que les coûts et la
   * qualité — la marge en particulier ne sort jamais côté application (D19).
   */
  @Get('manager-kpis')
  async getManagerKpis(@Query('days') days?: string, @Query('weeks') weeks?: string) {
    const windowDays = days ? Number.parseInt(days, 10) : undefined
    const cadenceWeeks = weeks ? Number.parseInt(weeks, 10) : undefined
    const [
      // #1946.14 — l'usage à J+7 voyage avec le J+30 : deux repères du MÊME
      // moteur, lus au même endroit. Les séparer en deux routes donnerait deux
      // heures de lecture différentes pour une même phrase à l'écran.
      activeCohortAtDay7,
      activeCohortAtDay30,
      retentionAtThreeMonths,
      bellumGrossMargin,
      validatedActionCadence,
      consultantsByRep,
    ] = await Promise.all([
      this.managerKpis.activeCohortAtDay7(),
      this.managerKpis.activeCohortAtDay30(),
      this.managerKpis.retentionAtThreeMonths(),
      this.managerKpis.bellumGrossMargin(windowDays),
      this.managerKpis.validatedActionCadence(cadenceWeeks),
      this.managerKpis.consultantsRegisteredByRep(windowDays),
    ])
    return {
      activeCohortAtDay7,
      activeCohortAtDay30,
      retentionAtThreeMonths,
      bellumGrossMargin,
      validatedActionCadence,
      consultantsByRep,
    }
  }

  /**
   * #1658.1 — la rétention par COHORTE MENSUELLE D'ESPACES, M0 → M11.
   *
   * ⚠️ À NE PAS CONFONDRE AVEC `manager-kpis` CI-DESSUS, qui porte lui aussi
   * deux mesures nommées « cohorte » et « rétention ». Elles ne mesurent pas la
   * même chose, et les lire l'une pour l'autre donnerait deux chiffres
   * différents du même produit :
   *
   *   `manager-kpis`                      `retention-cohorts`
   *   ──────────────────────────────      ─────────────────────────────────
   *   grain : l'UTILISATEUR                grain : l'ESPACE (doctrine
   *                                        `c64_analytique_produit` — l'unité
   *                                        d'analyse est l'espace, jamais
   *                                        la personne)
   *   deux repères fixes (J+30, 3 mois)    douze mois glissants par cohorte
   *   « actif » = action tracée dans        « actif » = action validée DANS
   *   les 14 derniers jours                 LE MOIS considéré
   *   seuil de mesurabilité : 10           masquage à l'écran : 3 espaces
   *
   * L'horloge est passée par le contrôleur : un service qui la lit lui-même
   * n'est pas testable sans la figer.
   */
  @Get('retention-cohorts')
  getRetentionCohorts(): Promise<RapportRetention> {
    return this.retentionCohorts.cohortes(new Date())
  }

  /**
   * Le jeu de recette du copilote, prêt à jouer (§9.3, dette T6.3).
   *
   * Il ne stocke rien et ne juge rien : une recette est une observation
   * humaine. Ce qu'il automatise est la seule chose qu'on se trompait à faire à
   * la main — **savoir qu'un cas est BLOQUÉ avant de le jouer.** Quand la
   * capacité requise manque sur cet espace, le verdict est connu d'avance, et
   * jouer le cas ne prouverait rien ; l'ouvrir comme un défaut produit ferait
   * chercher un bug dans un connecteur jamais branché.
   *
   * `verdict: null` veut dire « à jouer », jamais « ça marche ».
   *
   * `userId` est requis : la disponibilité d'un outil est propre à un
   * utilisateur. Un jeu de recette calculé sur « l'espace en général »
   * annoncerait des cas jouables pour quelqu'un qui n'a rien connecté.
   */
  @Get('copilot-recette')
  async getCopilotRecette(@Query('userId') userId?: string): Promise<{
    cases: (RecetteCase & { key: string; missing: string[] })[]
  }> {
    // Sans utilisateur, on ne PRÉSUME rien : tous les cas sortent « à jouer »
    // avec leurs exigences visibles, plutôt qu'avec une disponibilité inventée.
    const connected = userId ? await this.connectedFamilies(userId) : null
    return {
      cases: COMMAND_CATALOG.map(command => {
        const missing = connected === null ? [] : command.requires.filter(family => !connected.includes(family))
        return {
          key: command.key,
          missing,
          query: command.prompt.fr,
          verdict: preflightVerdict(missing),
          observedMessage: null,
          observedToolResult: null,
          gap: null,
          evidence: [],
          expectedFix: null,
          priority: null,
        }
      }),
    }
  }

  /**
   * Le tunnel et les deux A/B du chatbot public — chantier n°1 (§11 du rapport
   * « Laura, chatbot commercial du site », 17/08/2026). Back-office
   * uniquement, même arbitrage que les coûts et la qualité : c'est un
   * indicateur de PILOTAGE produit, pas une promesse à montrer à un visiteur.
   *
   * `?period=` suit la syntaxe Plausible (`30d`, `7d`, `12mo`…) ; par défaut
   * `30d`. `configured:false` distingue « la mesure n'est pas branchée »
   * (`PLAUSIBLE_API_KEY` / `PLAUSIBLE_SITE_ID` absentes) de « Plausible a
   * répondu et personne n'a rien déclenché ».
   */
  @Get('chatbot-funnel')
  getChatbotFunnel(@Query('period') period?: string): Promise<ChatbotFunnelOverview> {
    return this.chatbotFunnel.overview(period?.trim() || undefined)
  }

  /** Les familles opérationnelles, ou `null` quand on ne peut pas le savoir. */
  private async connectedFamilies(userId: string): Promise<string[] | null> {
    try {
      const tools = await this.toolRegistry.list(userId)
      return [...new Set(tools.filter(tool => tool.capability_state === 'operational').map(tool => tool.family))]
    } catch {
      // Une panne de registre ne doit pas produire une liste de cas « bloqués »
      // qu'on irait débrancher un par un : on dit qu'on ne sait pas.
      return null
    }
  }
}
