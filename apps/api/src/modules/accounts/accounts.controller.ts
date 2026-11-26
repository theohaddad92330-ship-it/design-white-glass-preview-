import { changesReferenceDate } from './account-changes-reference'
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpCode,
  HttpStatus,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  UseGuards,
  forwardRef,
} from '@nestjs/common'
import {
  addToPortfolioSchema,
  createAccountShareRequestSchema,
  type ActiveAnalysisRun,
  type MarketPortfolioRead,
  type MarketResolutionDecisionRecord,
  marketResolutionDecisionRequestSchema,
  portfolioScopeFor,
  type AccountCostSummary,
  type AccountListItem,
  type MetricSeriesResponse,
  type OfferDomain,
  type AccountProfileProvenance,
  type AccountMarketContext,
  type AccountMarketPaths,
  MARKET_PATHS_DETAIL_MAX,
  type AccountChanges,
  type AccountKnownMovements,
  type AccountRegistryAnnouncements,
  type AccountRecentHires,
  type MarketCohortIndexRead,
  MARKET_MEMORY_SCORING_ENABLED,
  type SimilarAccountSuggestion,
  SIMILAR_TWIN_MIN_MISSIONS,
  discriminantCommonTechnos,
  MARKET_MEMORY_TELEMETRY,
  measureMarketPrefilter,
  generatedPlanWeeks,
  projectAccountPlanActions,
  withDataforgeVersion,
  withoutInternshipSignals,
  dropInternshipRows,
  type ListCanonicalActionsResponse,
  type AccountStrategy5P,
  type AccountVariationSignal,
  type AccountInterestPenetrability,
  type AccountInterestPenetrabilityPortfolio,
  ACCOUNT_JOB_OFFER_TERM_MAX,
  type AccountJobOffers,
  type AccountSignalLines,
  type WorkspaceSignalHistory,
  workspaceSignalHistoryQuerySchema,
} from '@bellum/contracts'
import { isFailure, unwrap } from '@bellum/utils'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { AnalysisService } from '../analysis/analysis.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { AnalysisRunsService } from '../analysis/analysis-runs.service'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ContactsService } from '../contacts/contacts.service'
import { attachDecisionMakers } from './signal-decision-makers'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { AccountMissionsService } from '../delivery/account-missions.service'
import type { MarketCompanyLookup } from '../market-memory/market-memory.service'
import { marketPortfolioLookups } from '../market-memory/portfolio-lookups'
import {
  AccountIntelligenceContextService,
  type AccountIntelligenceContext,
} from '../account-intelligence/account-intelligence-context.service'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceMarketService } from '../workspace/workspace-market.service'
import { StockSnapshotService } from '../pilotage/stock-snapshot.service'
import { AccountKnownService } from './account-known.service'
import { AccountChangesService } from './account-changes.service'
import type { MarketPersonPathsReader } from '../market-memory/market-person-path-view'
import { AccountSignalLinesService } from './account-signal-lines.service'
import { CommonAccountResolverService } from '../common-accounts/common-account-resolver.service'
import { AccountStrategy5PService } from './account-strategy-5p.service'
import { AccountInterestPenetrabilityService } from './account-interest-penetrability.service'
import { AccountVariationSignalsService } from './account-variation-signals.service'
import { AccountDeclaredPartnerService } from './account-declared-partner.service'
import { AccountShareService } from './account-share.service'
import { AccountTimelineService } from './account-timeline.service'
import { FirstEuroService } from './first-euro.service'
import {
  AccountsService,
  pickDominantSignal,
  readSignalPreview,
  signalFreshnessOf,
  type AccountFailure,
} from './accounts.service'
import { sharedRoleFamilies, withSharedCriterion } from './similar-scoring'
import { BulkImportContactsDto } from '../contacts/dto/bulk-import-contacts.dto'
import { CreateContactFromCrmDto } from '../contacts/dto/create-contact-from-crm.dto'
import { AbsorbAccountDto } from './dto/absorb-account.dto'
import { ArchiveFailedShellsDto } from './dto/archive-failed-shells.dto'
import {
  nextReanalysisFor,
  nextReanalysisReasonFor,
  watchCadenceFor,
} from '../watchlist-refresh/watchlist-refresh.queue'
import { DeclareSignalsDto } from './dto/declare-signals.dto'
import { ClassifyContactsDto } from '../contacts/dto/classify-contacts.dto'
import { ImportContactsCsvDto } from '../contacts/dto/import-contacts-csv.dto'
import { parseContactCsv } from '../contacts/csv-import'
import { CreateAccountDto } from './dto/create-account.dto'
import { ListAccountsDto } from './dto/list-accounts.dto'
import { ActionPlanItemsService } from '../actions/action-plan-items.service'
import { AddAttackAngleDto, AddPlanActionDto } from './dto/add-plan-item.dto'
import { SetCommercialStatusDto } from './dto/set-commercial-status.dto'
import { SetBestReferenceDto } from './dto/set-best-reference.dto'
import { SetBetProfileDto } from './dto/set-bet-profile.dto'
import { SetCommitteeEntryLevelDto } from './dto/set-committee-entry-level.dto'
import { AssignAccountBusinessUnitDto } from './dto/assign-account-business-unit.dto'
import { NeedPlayDto } from './dto/need-play.dto'
import { NeedPlayService } from './need-play.service'
import { buildTechStructure, type TechStructure } from './account-tech-structure'
import { UpdateRelationshipMemoryDto } from './dto/update-relationship-memory.dto'
import { SOFT_BRAKE_MESSAGE } from '../credits/soft-brake'

/**
 * Combien de mois de photos le bandeau du portefeuille demande.
 *
 * TROIS, et pas deux : une variation se calcule sur deux photos, mais un mois
 * dont le balayage n'est pas encore passé ferait retomber la lecture sur « non
 * mesuré » alors que la précédente existe. Trois donnent le mois écoulé, sa
 * référence, et une marge. Borné de toute façon par
 * `METRIC_SERIES_MAX_MONTHS` côté service — ce nombre-ci est un BESOIN d'écran,
 * pas un plafond de sécurité, et les deux n'ont pas à se ressembler.
 */
const PORTFOLIO_SERIES_MONTHS = 3

function throwAccountFailure(failure: AccountFailure): never {
  const { code, message } = failure
  switch (code) {
    case 'not_found':
      throw new NotFoundException(message)
    case 'invalid_input':
      throw new BadRequestException(message)
    case 'create_failed':
    case 'archive_failed':
    case 'delete_failed':
    case 'absorb_failed':
    case 'detach_failed':
      throw new InternalServerErrorException(message)
    default: {
      const _exhaustive: never = code
      throw new InternalServerErrorException(`Unknown account failure code: ${String(_exhaustive)}`)
    }
  }
}

/**
 * Ce contrôleur figurait dans la liste gelée de GA-05 : aucune de ses écritures
 * ne déclarait de permission, et `WorkspacePermissionGuard` étant fail-open, le
 * rôle `viewer` — documenté « strictly read-only … refused on every mutation » —
 * créait, archivait et reclassait des comptes. `finance`, dont la matrice dit
 * « AUCUN droit d'écriture sur les fiches », aussi.
 *
 * Les LECTURES restent ouvertes à l'espace : voir un compte de son équipe est le
 * principe même du portefeuille partagé (D5). Seules les écritures sont gardées.
 */
@Controller('accounts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AccountsController {
  private readonly logger = new Logger(AccountsController.name)

  constructor(
    private readonly accountsService: AccountsService,
    @Inject(forwardRef(() => AnalysisService))
    private readonly analysisService: AnalysisService,
    @Inject(forwardRef(() => AnalysisRunsService))
    private readonly analysisRuns: AnalysisRunsService,
    private readonly shareService: AccountShareService,
    private readonly timeline: AccountTimelineService,
    private readonly contactsService: ContactsService,
    // Phase 2: resolves the caller's active workspace so every browser-facing
    // read is scoped by `workspace_id` (the team's accounts) rather than `user_id`.
    private readonly workspaceContext: WorkspaceContextService,
    // Plan d'attaque d'un besoin (D9) — la seule surface payante de l'écran
    // Besoins : elle génère, elle ne redévoile pas.
    private readonly needPlay: NeedPlayService,
    // Product analytics — best-effort, `@Optional()` so unit specs that build the
    // controller without the global AnalyticsModule keep working.
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // Le domaine que vend l'espace, pour que le classifieur de contacts cesse de
    // raisonner en informatique chez une ESN qui vend autre chose. Résolu ici et
    // pas dans le service : c'est le contrôleur qui connaît l'appelant, et le
    // brancher dans `ContactsService` ajouterait un lien service→service là où le
    // point de résolution du profil vendeur existe déjà.
    //
    // ⚠️ En DERNIÈRE position, et c'est une règle et non un hasard : une
    // vingtaine de specs construisent ce contrôleur à la main, positionnellement.
    // Inséré au milieu, ce paramètre a fait recevoir le service d'analytics à la
    // place du lecteur de profil — le compilateur l'a vu, ce qui n'est vrai que
    // parce que les deux types sont incompatibles. Un ajout va en FIN, comme
    // pour une énumération.
    @Optional() private readonly esnProfile?: EsnProfileReader,
    /**
     * LA PHOTO MENSUELLE, lue depuis le module qui la PREND (31/08/2026).
     *
     * `@Optional()` et en DERNIÈRE position, pour la raison écrite juste
     * au-dessus : une vingtaine de specs construisent ce contrôleur à la main,
     * positionnellement. Sans elle, la route rend une série vide — donc
     * « non mesuré », jamais un chiffre inventé.
     */
    @Optional() private readonly stockSnapshots?: StockSnapshotService,
    /**
     * LA DISTANCE AU PREMIER EURO (PDF 2 §7.4, 01/09/2026).
     *
     * `@Optional()` et en DERNIÈRE position, pour la raison écrite deux
     * paragraphes plus haut : une vingtaine de specs construisent ce contrôleur
     * à la main, positionnellement. Inséré au milieu, ce paramètre décale tout
     * ce qui suit — et les specs le prouvent en tombant. Absente, la route
     * répond 503 plutôt que d'inventer une distance.
     */
    @Optional() private readonly firstEuro?: FirstEuroService,
    /**
     * #1577 — LA MÉMOIRE MARCHÉ, LUE ICI ET PAS DANS LE SERVICE.
     *
     * C'est GA-07 qui décide de l'endroit, et elle le dit elle-même : « passe
     * par un contrat partagé, un événement, ou fais l'orchestration dans le
     * contrôleur — c'est là que vit un geste utilisateur ». Sa mesure exclut
     * explicitement les `.controller.ts`. Lire la mémoire depuis
     * `accounts.service` aurait fait monter le cliquet d'un cran pour un
     * enrichissement de PAGE qui n'a rien à faire dans la requête SQL.
     *
     * ⚠️ L'autre chemin — injecter les REPOSITORIES de la mémoire et compter
     * soi-même — est REFUSÉ, et pour une raison déjà payée : l'arbitrage des
     * homonymes vit dans `resolveMarketCompany` (#1617), et deux chemins qui
     * refont la même dérivation divergent. C'est exactement le défaut que #1617
     * venait de corriger, où la lecture groupée retenait la DERNIÈRE ligne lue
     * et la lecture unitaire la PREMIÈRE.
     *
     * `@Optional()` et en DERNIÈRE position, pour la raison écrite plus haut :
     * une vingtaine de specs construisent ce contrôleur à la main,
     * positionnellement. Absent, le champ n'est rendu sur aucune ligne — et
     * « la mémoire n'a pas été lue » n'est pas « ce compte n'est pas couvert ».
     */
    @Optional() private readonly marketMemory?: MarketMemoryService,
    /**
     * #1576 — les missions signées de l'espace, pour la raison « compte jumeau ».
     *
     * `@Optional()` et APRÈS `marketMemory`, pour la raison écrite juste
     * au-dessus : une vingtaine de specs construisent ce contrôleur à la main,
     * positionnellement. Absent, aucune carte ne dit « où tu as gagné une
     * mission » et toutes retombent sur la raison suivante — jamais une
     * affirmation fausse, seulement une raison plus faible.
     */
    @Optional() private readonly accountMissions?: AccountMissionsService,
    /**
     * #1618 — la lecture croisée d’un dossier de compte.
     *
     * `@Optional()` et en DERNIÈRE position, pour la raison écrite deux fois
     * au-dessus. ⚠️ Ce paramètre a d’abord été inséré AVANT `accountMissions` :
     * une vingtaine de specs construisent ce contrôleur positionnellement, si
     * bien que le service des missions recevait le mock de la lecture croisée
     * et que la raison « compte jumeau » retombait silencieusement sur « socle
     * technique ». Rien ne jetait — la carte affichait simplement une raison
     * plus faible. Un nouvel optionnel se pose ICI, jamais au milieu.
     *
     * Absent, la route le DIT (`unavailable`) au lieu de rendre un contexte
     * vide : « je n’ai pas lu » n’est pas « il n’y a rien ».
     */
    @Optional() private readonly intelligence?: AccountIntelligenceContextService,
    /**
     * LE CLOISONNEMENT DE PÉRIMÈTRE (BU / agence), #2005.9 / #2081.17.
     *
     * `@Optional()` et en DERNIÈRE position — pour la raison écrite au-dessus :
     * une vingtaine de specs construisent ce contrôleur positionnellement.
     *
     * ⚠️ Optionnel pour le CONSTRUCTEUR, jamais pour la RÈGLE : absent,
     * `resolveBusinessUnitScope` LÈVE au lieu de servir tout l'espace. Un
     * cloisonnement qui se désactive tout seul quand une dépendance manque
     * n'est pas un cloisonnement. Le graphe DI le fournit toujours en
     * production (`AccountsModule` importe `BusinessUnitModule`, et
     * `injectable-constructors-are-resolvable.spec.ts` le prouve).
     */
    @Optional() private readonly businessUnits?: BusinessUnitService,
    /**
     * #2123.46 — la porte canonique des actions du plan, pour l'alias déprécié
     * `POST :id/plan/actions`. `@Optional()` et en DERNIÈRE position, pour la
     * raison écrite plus haut (specs positionnelles). Absente, l'alias répond
     * 503 plutôt que de réécrire le JSON de l'analyse.
     */
    @Optional() private readonly planItems?: ActionPlanItemsService,
    /**
     * #2556 — LA DÉDUCTION « COMPTE CONNU » ET SES MOUVEMENTS.
     *
     * `@Optional()` et en DERNIÈRE position, pour la même raison que tous les
     * paramètres au-dessus : une vingtaine de specs construisent ce
     * contrôleur positionnellement. Absent, la route répond 503 (comme
     * `firstEuro` juste au-dessus) — jamais `known: false`, qui affirmerait
     * une réponse qu'on n'a pas pu calculer.
     */
    @Optional() private readonly accountKnown?: AccountKnownService,
    /**
     * #2861 (#2437.2, niveau ESPACE) — la langue du marché de l'espace, qui
     * sert de DÉFAUT à la langue d'un contact créé depuis le CRM (jamais
     * deviné depuis une adresse, jamais posé sur une fiche déjà là — voir
     * `createFromCrmPresence`). `@Optional()` et en DERNIÈRE position, même
     * raison que tous les paramètres au-dessus : absent, le contact se crée
     * sans langue par défaut (`locale: null`), comportement d'avant ce lot.
     */
    @Optional() private readonly workspaceMarket?: WorkspaceMarketService,
    /**
     * BEL-SC-225 (#3254, P0) — la projection AccountStrategy5P.
     *
     * `@Optional()` et en DERNIÈRE position, même raison que tous les
     * paramètres au-dessus : une vingtaine de specs construisent ce
     * contrôleur positionnellement. Absent, la route le DIT (`unavailable`)
     * au lieu de rendre une projection vide — même discipline que
     * `intelligence` juste au-dessus.
     */
    @Optional() private readonly strategy5PService?: AccountStrategy5PService,
    /**
     * BEL-SC-229 (#3258, P0) — la matrice AccountInterestPenetrability.
     *
     * `@Optional()` et en DERNIÈRE position, même raison que `strategy5PService`
     * juste au-dessus.
     */
    @Optional() private readonly interestPenetrabilityService?: AccountInterestPenetrabilityService,
    @Optional() private readonly variationSignalsService?: AccountVariationSignalsService,
    /**
     * #2265.5 (épopée #2851) — le badge « partenaire déclaré ». `@Optional()` et
     * en DERNIÈRE position, pour la raison écrite plus haut (specs positionnelles).
     */
    @Optional() private readonly declaredPartners?: AccountDeclaredPartnerService,
    /**
     * #4180 (EX-10) — « ce qui a changé depuis la dernière vérification ». `@Optional()` et en DERNIÈRE
     * position, même raison que tous les paramètres au-dessus : absent, la route répond 503 plutôt que
     * « rien de nouveau », une réponse qu'on n'aurait pas pu calculer.
     */
    @Optional() private readonly accountChanges?: AccountChangesService,
    /**
     * #4755 / #4756 (lot 761) — les lignes du tableau « Signaux et besoins ». `@Optional()` et en DERNIÈRE
     * position (specs positionnelles) ; absent, la route le DIT (503), jamais un tableau vide.
     */
    @Optional() private readonly signalLines?: AccountSignalLinesService,
    /**
     * Lot 793 — le référentiel pivot (compte → BM-A / DF / groupe). `@Optional()` et en DERNIÈRE position (specs
     * positionnelles) ; absent, les lecteurs lisent comme avant ce lot (SIREN seul), jamais une donnée devinée.
     */
    @Optional() private readonly commonAccounts?: CommonAccountResolverService,
  ) {}

  /**
   * La portée BU de l'appelant — résolue au bord, une seule fois, comme le
   * cloisonnement de portefeuille juste à côté.
   *
   * ⚠️ LÈVE si le service manque. Le repli « pas de service, donc pas de
   * filtre » serait un fail-open : la première erreur de câblage ouvrirait
   * l'espace entier sans qu'aucun écran ne change d'apparence.
   */
  private async resolveBusinessUnitScope(workspaceId: string, userId: string) {
    // La règle du fail-closed vit dans `resolve-business-unit-scope.ts` : cinq
    // contrôleurs l'appliquent maintenant, et cinq copies de ce `if`
    // divergeraient le jour où l'une est « simplifiee » en `?? null` (GA-26).
    return resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)
  }

  /**
   * LA PORTE DE PÉRIMÈTRE D'UNE ROUTE QUI ADRESSE UN COMPTE — R15N-16.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT QU'ELLE RÉPARE, ET POURQUOI IL ÉTAIT PIRE QU'UNE ABSENCE
   * ─────────────────────────────────────────────────────────────────────────
   * Mesuré le 15/09/2026 : le périmètre BU était résolu pour la LISTE des
   * comptes et pour l'agrégat de portefeuille, et nulle part ailleurs. Un
   * membre cloisonné ne voyait pas un compte hors de ses périmètres dans sa
   * liste, mais l'OUVRAIT par son URL directe, et toutes les routes de
   * fragment (`:id/timeline`, `:id/similar`, `:id/branches`…) répondaient avec
   * lui. Un cloisonnement qui tient sur la liste et tombe sur la fiche donne la
   * SENSATION d'être protégé : c'est ce qui le rend plus dangereux qu'un
   * cloisonnement absent.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * TROIS PROPRIÉTÉS
   * ─────────────────────────────────────────────────────────────────────────
   * 1. **`'workspace'` est byte-identique.** C'est le niveau de tout le monde à
   *    cette heure : la porte s'efface avant la moindre lecture de compte, donc
   *    ce lot ne retire rien à personne et n'ajoute aucune requête. L'ESPACE,
   *    lui, est déjà tenu en aval — chacune de ces sous-routes passe
   *    `workspaceId` au service qu'elle appelle. Cette porte-ci ajoute la
   *    seconde borne, le PÉRIMÈTRE, et rien d'autre. Son témoin est dans
   *    GA-335 (`business-unit-account-routes.spec.ts`) : sans cloisonnement,
   *    aucune lecture de compte de plus.
   * 2. **`not_found`, jamais `forbidden`** — la convention déjà tenue par
   *    `findOneForWorkspace` hors espace. « Ce compte existe mais tu n'y as pas
   *    droit » est déjà une fuite d'information.
   * 3. **Elle LÈVE si le service de périmètre manque** (via
   *    {@link resolveBusinessUnitScope}) : une porte qui s'ouvre toute seule
   *    quand une dépendance saute n'est pas une porte.
   *
   * Les routes qui LISENT déjà le compte n'utilisent PAS cette porte : elles
   * passent le périmètre à `findOneForWorkspace`, ce qui ne coûte rien de plus.
   */
  private async assertAccountInScope(id: string, workspaceId: string, userId: string): Promise<void> {
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, userId)
    if (!businessUnitScope) return
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
  }

  /**
   * RATTACHER un compte à un périmètre (#2081.10), ou l'en détacher.
   *
   * Sous `records:write`, comme toute correction de fiche : décider quelle
   * agence porte un compte est un geste d'organisation du portefeuille, pas
   * une lecture.
   *
   * ⚠️ DEUX vérifications, et il en faut deux : le PÉRIMÈTRE appartient à
   * l'espace (`findInWorkspace`, qui rend `not_found` hors espace) et le COMPTE
   * aussi (`assignBusinessUnit`, dont le `UPDATE` porte `workspace_id`). N'en
   * faire qu'une laisserait passer l'autre moitié de la fuite.
   */
  @Put(':id/business-unit')
  @RequirePermission('records:write')
  async assignBusinessUnit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignAccountBusinessUnitDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // R15N-16 — TROISIÈME vérification, et c'est celle qui protège les deux
    // autres : sans elle, un membre cloisonné RATTACHERAIT à son propre
    // périmètre un compte qu'il n'a pas le droit de voir, et le verrait
    // ensuite légitimement. La porte à côté de la serrure.
    await this.assertAccountInScope(id, workspaceId, user.userId)
    if (body.businessUnitId) {
      if (!this.businessUnits) throw new ServiceUnavailableException('business_unit_scope_unavailable')
      await this.businessUnits.findInWorkspace(workspaceId, body.businessUnitId)
    }
    await this.accountsService.assignBusinessUnit(workspaceId, id, body.businessUnitId)
    return { assigned: true }
  }

  @Get()
  async findAll(@CurrentUser() user: CurrentUserPayload, @Query() query: ListAccountsDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Le cloisonnement de portefeuille (décision D5) se décide ICI, au bord, et
    // une seule fois : la règle est une fonction pure et testée, pas une
    // condition enfouie dans une requête que personne ne relit.
    const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
    const scope = portfolioScopeFor(role, visibility, user.userId)
    // Le second cloisonnement, ORTHOGONAL au premier : « qui porte ce compte »
    // et « quel périmètre le porte » sont deux questions, et les deux bornes
    // s'AJOUTENT à celle de l'espace, jamais ne la remplacent.
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const marketCoveredIds = await this.resolveMarketCoveredIds(workspaceId, scope, query.marketCovered, user.userId)
    // #2150.14/.15/.18 — `favorite`/`ownership` sont des filtres PERSONNELS ;
    // `user.userId` le service en a besoin même quand `scope` est `null`.
    const page = await this.accountsService.findAccountsByWorkspace(
      workspaceId,
      query,
      scope,
      marketCoveredIds,
      businessUnitScope,
      user.userId,
    )
    const withPaths = await this.withMarketPaths(page, workspaceId)
    // #2265.5 — le partenaire DÉCLARÉ par l'espace, marqué pour le badge de ligne.
    if (!this.declaredPartners) return withPaths
    return { ...withPaths, data: await this.declaredPartners.flag(workspaceId, withPaths.data) }
  }

  /**
   * #1575.1 — LE CLIC SUR LE CINQUIÈME COMPTEUR, TRADUIT EN LISTE DE COMPTES.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI ICI, ET PAS DANS LE SERVICE
   * ─────────────────────────────────────────────────────────────────────────
   * Même raison que `withMarketPaths` juste en dessous, et c'est GA-07 qui la
   * donne : la couverture n'est pas une expression SQL, c'est l'arbitrage
   * `resolveMarketCompany` sur les tables d'un AUTRE module. Le contrôleur est
   * l'endroit nommé pour composer les deux ; `accounts.service` ne peut pas les
   * joindre sans faire monter le cliquet.
   *
   * La population interrogée est `listPortfolioLookups` — la MÊME que celle qui
   * a produit le chiffre affiché (`GET /accounts/market-memory-portfolio`).
   * Deux populations donneraient « 3 avec des parcours observés » ouvrant une
   * liste de 2, et c'est très exactement la divergence que GA-258 empêche.
   *
   * ⚠️ CE QU'ON NE FAIT PAS QUAND ON N'A PAS PU LIRE. Ni rendre le portefeuille
   * entier (le libellé promettrait un filtre qui n'a pas eu lieu), ni rendre
   * zéro compte (« aucun compte n'est couvert » est une affirmation, et on n'a
   * rien lu). On le DIT. Le compteur n'étant pas rendu quand la mémoire est
   * illisible (#1575.3), ce chemin ne s'atteint que par une URL périmée.
   */
  private async resolveMarketCoveredIds(
    workspaceId: string,
    scope: { ownerId: string; includeUnassigned: true } | null,
    marketCovered: ListAccountsDto['marketCovered'],
    userId: string,
  ): Promise<readonly string[] | undefined> {
    if (marketCovered !== 'covered') return undefined

    if (!this.marketMemory) {
      throw new ServiceUnavailableException(
        'Les observations du marché ne sont pas disponibles : impossible de filtrer sur les comptes avec des parcours observés.',
      )
    }

    // MÊME population que la liste : le compteur « comptes couverts » et la
    // liste qu'il ouvre doivent porter sur les mêmes comptes, donc sur le même
    // périmètre. Sans cette ligne, le compteur annoncerait des comptes qu'un
    // membre cloisonné ne peut pas ouvrir.
    const accounts = await this.accountsService.listPortfolioLookups(
      workspaceId,
      scope,
      await this.resolveBusinessUnitScope(workspaceId, userId),
    )
    const refs = await this.marketMemory.coveredRefsFor(
      accounts.map(account => ({
        ref: account.id,
        name: account.company_name,
        website: account.website,
        // Le SEUL départage que le corpus permet entre deux homonymes (#1617),
        // passé comme sur la route du portefeuille — sans lui, deux « CGI » de
        // deux pays entreraient en ambiguïté et sortiraient du filtre.
        country: account.registry_country,
      })),
      // #1617.4 — les MÊMES corrections que l'agrégat du portefeuille. Le
      // compteur « N comptes couverts » et la liste que le clic rend viennent
      // de la même boucle : leur passer des corrections différentes les ferait
      // se contredire à l'écran.
      { workspaceId },
    )

    // `null` = « je n'ai pas pu lire », distinct de `[]` = « aucun n'est couvert ».
    if (refs === null) {
      throw new ServiceUnavailableException(
        'Les observations du marché n’ont pas pu être lues : impossible de filtrer sur les comptes avec des parcours observés.',
      )
    }

    // #1639 — LA SEULE MESURE HONNÊTE DE CE QUE LA MÉMOIRE MARCHÉ FAIT GAGNER.
    //
    // Ici, et nulle part ailleurs dans le dépôt, un préfiltre réduit vraiment
    // une population AVANT qu'un crédit puisse partir : le commercial part de
    // son portefeuille entier et n'en garde que les comptes sur lesquels le
    // corpus sait dire quelque chose. Les deux nombres sont relevés au même
    // instant, sur la même liste — c'est un FAIT, pas une estimation.
    //
    // ⚠️ Ce qui n'est PAS compté ici : « combien d'appels payants ont été
    // évités ». Personne n'a eu à décider de les déclencher, donc le chiffre
    // serait une soustraction contre un monde qui n'a pas eu lieu — flatteur,
    // impossible à démentir, et il finirait dans une phrase commerciale
    // (`PAID_CALLS_AVOIDED_REFUSAL`, `@bellum/contracts`).
    //
    // `measureMarketPrefilter` rend `null` quand il n'y a rien à mesurer (un
    // portefeuille vide n'a pas été « filtré à 0 % » : il n'a pas été filtré) —
    // et alors AUCUNE ligne ne part, plutôt qu'une ligne de zéros qui se lirait
    // comme un constat. Best-effort, comme tout le reste du traceur : une
    // panne de télémétrie ne fait pas tomber un écran de portefeuille.
    const measure = measureMarketPrefilter({ candidatesBefore: accounts.length, candidatesAfter: refs.length })
    if (measure) {
      void this.analytics?.track(MARKET_MEMORY_TELEMETRY.prefilterEvent, {
        userId,
        workspaceId,
        properties: {
          [MARKET_MEMORY_TELEMETRY.candidatesBeforeProperty]: measure.candidatesBefore,
          [MARKET_MEMORY_TELEMETRY.candidatesAfterProperty]: measure.candidatesAfter,
          market_candidates_removed: measure.candidatesRemoved,
        },
      })
    }

    return refs
  }

  /**
   * #1577 — le nombre de parcours observés, posé sur les lignes de LA PAGE.
   *
   * Une seule lecture pour les 25 lignes, comme `resolveLastAnalyzedByAccount`
   * et `resolveOwnerNames` juste à côté : le service de mémoire prend une liste
   * et rend une carte, il n'y a pas de N+1 à créer ici.
   *
   * TROIS SORTIES, ET C'EST TOUT L'INTÉRÊT DE LA MÉTHODE :
   *  · mémoire absente, ou lecture `unavailable` ⇒ le champ n'est posé sur
   *    AUCUNE ligne. Une panne de la mémoire ne se raconte pas comme « aucun de
   *    tes comptes n'est couvert » — ce serait rassurant, et faux ;
   *  · compte non couvert ⇒ `null`, et l'écran n'écrit rien. Jamais
   *    « 0 parcours observés » : le seuil `MARKET_MEMORY_MIN_PATHS` est
   *    appliqué par le service et sous le seuil la couverture est VIDE, pas
   *    partielle ;
   *  · compte couvert ⇒ le nombre.
   *
   * ⚠️ Le `country` n'est pas passé : la ligne de liste ne le porte pas. Deux
   * homonymes restent donc ambigus, donc `null`, donc sans fragment — ce qui est
   * la réponse voulue (#1617 : « on ne devine pas »), une mauvaise jointure
   * étant pire qu'une absence de donnée.
   */
  private async withMarketPaths<T extends { data: AccountListItem[] }>(
    page: T,
    // #1617.4 — l'espace dont on lit les corrections de rapprochement.
    workspaceId: string,
  ): Promise<T> {
    if (!this.marketMemory || page.data.length === 0) return page
    const read = await this.marketMemory.pathsFor(
      page.data.map(account => ({
        ref: account.id,
        name: account.company_name,
        website: account.website ?? null,
      })),
      { workspaceId },
    )
    if (read.status !== 'ok') return page
    return {
      ...page,
      data: page.data.map(account => ({
        ...account,
        market_paths_observed: read.paths.get(account.id) ?? null,
      })),
    }
  }

  /**
   * #1618 — LA lecture croisée d'un dossier de compte.
   *
   * Elle existe pour une seule raison : sans elle, chaque écran décidait seul
   * s'il fallait croire DataForge ou la mémoire marché, et deux écrans
   * pouvaient afficher deux vérités sur le même compte. L'ordre est CODÉ, pas
   * commenté — correction humaine > donnée courante > DataForge > mémoire
   * marché > inférence — et chaque valeur rendue porte sa provenance.
   *
   * ⚠️ `@Optional()`, comme le portefeuille juste en dessous : sans le module
   * monté, la route le DIT. Un contexte vide se lirait « on ne sait rien de ce
   * compte », ce qui est faux et rassurant à la fois.
   */
  @Get(':id/intelligence-context')
  @WorkspaceRead()
  async intelligenceContext(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountIntelligenceContext | { status: 'unavailable'; reason: string }> {
    if (!this.intelligence) return { status: 'unavailable', reason: 'account_intelligence_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // R15N-16 — la porte de périmètre, avant de composer quoi que ce soit.
    await this.assertAccountInScope(id, workspaceId, user.userId)
    // Défense en profondeur : le compte d'un AUTRE espace n'existe pas ici,
    // même si son identifiant a été deviné. Le filtre vit dans la REQUÊTE, pas
    // dans une vérification préalable qu'on pourrait oublier d'appeler — c'est
    // `contextFor` qui porte `workspaceId`, et son `null` rend 404 juste après.
    // ⚠️ FUSION VAGUE 14 : deux lots ont posé la borne de PÉRIMÈTRE ici, l'un
    // par la porte ci-dessus, l'autre par une lecture inline. La seconde a été
    // retirée — elle faisait DEUX lectures du compte par requête, et la seconde
    // tombait aussi sans cloisonnement, ce que le témoin de GA-335 interdit.
    const context = await this.intelligence.contextFor(id, workspaceId)
    if (!context) throw new NotFoundException('Compte introuvable dans cet espace.')
    return context
  }

  /**
   * BEL-SC-225 (#3254, P0) — LA PROJECTION `AccountStrategy5P`.
   *
   * Maison canonique du ticket : Laura, Analyser, Contacts, Plans d'action et
   * Pilotage lisent tous CETTE route (ou le service qu'elle appelle),
   * jamais une copie locale. Même discipline que `:id/intelligence-context`
   * juste au-dessus : `@Optional()`, `unavailable` plutôt qu'un objet vide
   * quand le module n'est pas monté, et la porte de périmètre AVANT toute
   * lecture.
   */
  @Get(':id/strategy-5p')
  @WorkspaceRead()
  async strategy5P(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountStrategy5P | { status: 'unavailable'; reason: string }> {
    if (!this.strategy5PService) return { status: 'unavailable', reason: 'account_strategy_5p_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    const strategy = await this.strategy5PService.strategyFor(id, workspaceId)
    if (!strategy) throw new NotFoundException('Compte introuvable dans cet espace.')
    return strategy
  }

  /**
   * BEL-SC-229 (#3258, P0) — LA MATRICE `AccountInterestPenetrability`.
   *
   * Même discipline que `:id/strategy-5p` juste au-dessus : `@Optional()`,
   * `unavailable` plutôt qu'un objet vide quand le module n'est pas monté,
   * et la porte de périmètre AVANT toute lecture.
   */
  /**
   * #3920.10 (Louis 15/10) — LES QUATRE SIGNAUX DE VARIATION d'un compte (offres mois/mois, effectif 6 mois,
   * marchés gagnés 12 mois, mouvements de décideurs IT 6 mois). Chacun daté avec sa base ; inconnu =
   * `not_measured`, jamais 0. Lecture seule, porte de périmètre AVANT la lecture.
   */
  @Get(':id/variation-signals')
  @WorkspaceRead()
  async variationSignals(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ signals: AccountVariationSignal[] } | { status: 'unavailable'; reason: string }> {
    if (!this.variationSignalsService) return { status: 'unavailable', reason: 'account_variation_signals_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    const signals = await this.variationSignalsService.signalsFor(id, workspaceId)
    if (!signals) throw new NotFoundException('Compte introuvable dans cet espace.')
    return { signals }
  }

  @Get(':id/interest-penetrability')
  @WorkspaceRead()
  async interestPenetrability(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountInterestPenetrability | { status: 'unavailable'; reason: string }> {
    if (!this.interestPenetrabilityService) {
      return { status: 'unavailable', reason: 'account_interest_penetrability_unavailable' }
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    const matrix = await this.interestPenetrabilityService.matrixFor(id, workspaceId)
    if (!matrix) throw new NotFoundException('Compte introuvable dans cet espace.')
    return matrix
  }

  /**
   * BEL-SC-229 (#3258.13, épopée #3362, lot P01) — LA LECTURE PORTEFEUILLE de
   * la matrice `AccountInterestPenetrability`.
   *
   * Le bilan du 29/09 sur #3362 avait écarté ce point comme « un système à
   * part » — `matrixFor` (et `useAccountInterestPenetrability`) ne lisaient
   * qu'UN compte à la fois, alors que Pilotage a besoin d'un survol du
   * PORTEFEUILLE. Cette route compose `portfolioFor` (le service), qui
   * compose lui-même `matrixFor` compte par compte — jamais un second calcul
   * de quadrant (GA-26).
   *
   * Déclarée AVANT `:id`, comme `market-memory-portfolio` juste en dessous :
   * une route littérale posée après `:id/interest-penetrability` (au-dessus)
   * ne collide pas — elle collide avec le futur `:id` bare, donc elle est
   * groupée ici avec les autres routes littérales pour ne jamais l'oublier
   * (GA-178).
   *
   * Même population que `GET /accounts` et `market-memory-portfolio` :
   * `listPortfolioLookups` avec le MÊME cloisonnement (rôle/visibilité +
   * périmètre BU) — un survol qui compterait plus de comptes que la liste
   * n'en montre laisserait deux nombres vrais et personne pour savoir lequel
   * croire (#1408).
   */
  @Get('interest-penetrability-portfolio')
  @WorkspaceRead()
  async interestPenetrabilityPortfolio(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountInterestPenetrabilityPortfolio | { status: 'unavailable'; reason: string }> {
    if (!this.interestPenetrabilityService) {
      return { status: 'unavailable', reason: 'account_interest_penetrability_unavailable' }
    }
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
    const scope = portfolioScopeFor(role, visibility, user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const lookups = await this.accountsService.listPortfolioLookups(workspaceId, scope, businessUnitScope)
    return this.interestPenetrabilityService.portfolioFor(lookups, workspaceId)
  }

  /**
   * #1633 / #1635 — CE QUE LA MÉMOIRE MARCHÉ SAIT DU PORTEFEUILLE, EN UN APPEL.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * UNE SEULE ROUTE POUR TROIS ÉCRANS, ET C'EST LA RAISON D'ÊTRE DU LOT
   * ───────────────────────────────────────────────────────────────────────────
   * `/pilotage/qualite` (#1633), `/pilotage/marche` (#1635) et le territoire
   * (#1634) posent la même question. Trois routes auraient produit trois
   * dérivations, donc trois nombres — c'est mot pour mot ce que #1621 décrit
   * (« 41 dans Account, 38 dans Partners, 44 dans Laura »).
   *
   * Déclarée AVANT `:id`, comme `sectors` et `companies` : une route littérale
   * placée après se ferait avaler par la route dynamique (GA-178).
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI SUR CE CONTRÔLEUR-CI
   * ───────────────────────────────────────────────────────────────────────────
   * Parce que le DÉNOMINATEUR doit être la même population que `GET /accounts`,
   * et que la seule façon de le garantir est d'appeler le même service avec le
   * même cloisonnement — pas de le réécrire ailleurs (#1408). Les quatre
   * dépendances nécessaires y sont déjà injectées, et rien de nouveau n'est
   * câblé.
   *
   * Et parce que `PilotageController` est derrière la porte `manager_cockpit`
   * alors que `/pilotage/marche` ne l'est pas : y poser la route l'aurait fermée
   * à un écran qui doit l'ouvrir.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * CE QUI SORT QUAND ON NE SAIT PAS
   * ───────────────────────────────────────────────────────────────────────────
   * `unavailable`, jamais des zéros. Un portefeuille rendu « 0 couvert sur 0 »
   * sur une panne se lit « le marché ne connaît aucun de tes comptes », ce qui
   * est rassurant et faux — le défaut le plus cher du dépôt, d'un cran plus haut.
   */
  @Get('market-memory-portfolio')
  @WorkspaceRead()
  async marketMemoryPortfolio(@CurrentUser() user: CurrentUserPayload): Promise<MarketPortfolioRead> {
    // Sans le module de mémoire monté (specs unitaires, ou service retiré), on
    // le DIT. « Je n'ai pas lu » n'est pas « il n'y a rien ».
    if (!this.marketMemory) return { status: 'unavailable', reason: 'market_memory_unavailable' }

    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
    const scope = portfolioScopeFor(role, visibility, user.userId)
    const accounts = await this.accountsService.listPortfolioLookups(
      workspaceId,
      scope,
      await this.resolveBusinessUnitScope(workspaceId, user.userId),
    )

    // Les expertises DÉCLARÉES de l'espace (#1635.4). Le lecteur de profil est
    // `@Optional()` : absent, le fit structurel ne se rend pas du tout — il ne
    // se rend pas « à zéro », ce qui accuserait le portefeuille d'un trou qui
    // est le nôtre.
    const answers = this.esnProfile ? await this.esnProfile.getAnswers(user.userId).catch(() => null) : null

    // ⚠️ La mise en forme des clés ne s'écrit plus ici (#1581.1) : le contexte du
    // copilote pose la même question au même service, et ce qui se recopiait le
    // plus facilement est le détail qui change le résultat — le PAYS, seul
    // départage entre deux homonymes du corpus (#1617). Un agrégat qui compterait
    // en ambiguïté ce que le pays sait trancher annoncerait une file de revue qui
    // n'a pas lieu d'être, et deux appelants rendraient deux chiffres.
    return this.marketMemory.portfolioFor(marketPortfolioLookups(accounts), {
      expertises: answers?.expertise_areas ?? [],
      // #1617.4 — les corrections de rapprochement de CET espace. Sans lui, un
      // compte départagé à la main reviendrait dans la file de revue au rendu
      // suivant, et la correction n'aurait servi à rien.
      workspaceId,
    })
  }

  /** Distinct sectors observed in the workspace's accounts. Used by the
   *  filter dropdown so the user only sees real values. Declared
   *  BEFORE `:id` to avoid the dynamic route swallowing the literal. */
  @Get('sectors')
  @WorkspaceRead()
  async listSectors(@CurrentUser() user: CurrentUserPayload): Promise<string[]> {
    // #2084.24 — le cloisonnement vaut aussi sur les FACETTES : une facette qui
    // déborde dessine en creux le portefeuille que la liste vient de cacher.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    return this.accountsService.listSectors(workspaceId, businessUnitScope)
  }

  /** #2159.26 — les étiquettes EN USAGE sur les comptes de l'espace, pour le
   *  filtre de liste. Même souci de routage que `sectors`. */
  @Get('tags')
  @WorkspaceRead()
  async listTags(@CurrentUser() user: CurrentUserPayload): Promise<string[]> {
    // #2084.24 — le cloisonnement vaut aussi sur les FACETTES.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    return this.accountsService.listTags(workspaceId, businessUnitScope)
  }

  /** Distinct company names in the workspace. Same routing concern as `sectors`. */
  @Get('companies')
  @WorkspaceRead()
  async listCompanies(@CurrentUser() user: CurrentUserPayload): Promise<string[]> {
    // #2084.24 — LA fuite nommée par la revue : sans cette clause, un membre
    // cloisonné lisait ici les RAISONS SOCIALES de tout l'espace.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    return this.accountsService.listCompanies(workspaceId, businessUnitScope)
  }

  /**
   * #2145.9 / #2100.9 — le job d'analyse EN COURS, mis en avant sur Aujourd'hui.
   *
   * Même cloisonnement que la liste (`portfolioScopeFor` + périmètre BU) :
   * Aujourd'hui ne montre jamais un job qu'un membre cloisonné ne pourrait pas
   * ouvrir. Déclarée AVANT `:id`, même souci de routage que `sectors`.
   */
  @Get('analyzing')
  @WorkspaceRead()
  async listActiveAnalysisRuns(@CurrentUser() user: CurrentUserPayload): Promise<ActiveAnalysisRun[]> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
    const scope = portfolioScopeFor(role, visibility, user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const rows = await this.accountsService.listActiveAnalysisRuns(workspaceId, scope, businessUnitScope)
    return rows.map(row => ({
      account_id: row.id,
      company_name: row.company_name,
      started_at: new Date(row.started_at).toISOString(),
    }))
  }

  /**
   * #2306.24 — LA VUE AGRÉGÉE : quels comptes du portefeuille ont été analysés
   * avec un profil ESN plus ancien que celui d'aujourd'hui.
   *
   * La fiche compte répond déjà à cette question un compte à la fois
   * (`ranWithOlderProfile`, `:id/profile-provenance` plus bas, consommé par
   * `AccountProfileProvenance.tsx`) — rien n'agrégeait sur le portefeuille
   * entier. Même prédicat, calculé par `AnalysisRunsService
   * .listAccountsWithOlderProfile` (jamais un second calcul).
   *
   * `currentEsnProfileVersion: null` (lecteur de profil absent, ou lecture en
   * échec) rend une liste vide plutôt qu'une comparaison inventée.
   *
   * Déclarée AVANT `:id` — sinon la route dynamique avalerait le littéral,
   * même souci de routage que `sectors`/`hygiene`.
   */
  @Get('impacted-by-profile-change')
  @WorkspaceRead()
  async listImpactedByProfileChange(@CurrentUser() user: CurrentUserPayload): Promise<{
    currentEsnProfileVersion: number | null
    accounts: { accountId: string; companyName: string; esnProfileVersion: number }[]
  }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const versions = this.esnProfile ? await this.esnProfile.getProfileVersions(user.userId).catch(() => null) : null
    const currentEsnProfileVersion = versions?.esnProfileVersion ?? null
    const accounts = await this.analysisRuns.listAccountsWithOlderProfile(
      workspaceId,
      businessUnitScope,
      currentEsnProfileVersion,
    )
    return { currentEsnProfileVersion, accounts }
  }

  /**
   * #2091.31 — le signal de PORTEFEUILLE EXISTANT pour la carte « prioriser
   * la semaine » de `/welcome` : cet écran ne chargeait jusqu'ici aucun compte
   * suivi, donc ne pouvait jamais distinguer un utilisateur qui sort tout
   * juste d'onboarding (portefeuille par construction vide) d'un utilisateur
   * qui a déjà des comptes en attente. Réutilise `accountsAwaitingAction`
   * (même requête que le pont copilote `accounts/to-act`, jamais une seconde,
   * GA-26) avec `limit=1` : seule l'EXISTENCE compte ici, pas la liste.
   *
   * Déclarée AVANT `:id` — sinon la route dynamique avalerait le littéral.
   */
  @Get('to-act/summary')
  @WorkspaceRead()
  async hasAccountsToAct(@CurrentUser() user: CurrentUserPayload): Promise<{ hasAccountsToAct: boolean }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const rows = await this.accountsService.accountsAwaitingAction(workspaceId, 30, 1)
    return { hasAccountsToAct: rows.length > 0 }
  }

  /**
   * Les contrôles de qualité qui concernent un COMPTE, compte par compte.
   *
   * Le cockpit dit « 7 comptes suivis sans prochaine action » ; il ne dit pas si
   * la ligne qu'on a sous les yeux est l'une des sept, et c'est là que le geste
   * se fait. Le calcul ne remonte pas ici : les prédicats sont ceux du cockpit,
   * au caractère près (GA-53).
   *
   * Déclarée AVANT `:id` — sinon la route dynamique avalerait le littéral et
   * `hygiene` se ferait lire comme un identifiant de compte.
   *
   * `@WorkspaceRead` (D39 · 28/08/2026) : c'est l'arrivée de cette route qui a
   * fait rougir le cliquet GA-05 une seconde fois pour une raison qui n'était
   * pas la sienne — la matrice n'a AUCUNE permission de lecture à lui donner.
   * Le marqueur n'ouvre rien : `JwtGuard` et la résolution d'espace
   * server-side la gardent, exactement comme avant.
   */
  @Get('hygiene')
  @WorkspaceRead()
  async hygiene(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #2084.24 — le cloisonnement vaut aussi sur les agrégats : cette réponse
    // NOMME les comptes (par identifiant) que l'écran marquera.
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    return this.accountsService.hygieneByAccount(workspaceId, businessUnitScope)
  }

  /**
   * #4621.3 — archive les coquilles d'analyses échouées VIDES d'un JOUR de création (lot daté : 199 du 18/10,
   * 823 du 20/10). Réservé à l'administration de l'espace (`team:manage`), exécuté dans l'espace de l'appelant et
   * jamais au-delà. On archive, on ne supprime pas ; `dryRun` mesure sans écrire, `expected` refuse un lot qui
   * n'a pas la taille annoncée. Déclarée AVANT `:id`.
   */
  @Post('archive-failed-shells')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('team:manage')
  async archiveFailedShells(@Body() dto: ArchiveFailedShellsDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #4785 — une route qui ARCHIVE reste dans le périmètre Business Unit de l'appelant (GA-336).
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    return unwrap(
      await this.accountsService.archiveFailedShells(workspaceId, dto, businessUnitScope),
      throwAccountFailure,
    )
  }

  /**
   * #4294.9 — l'audit des doublons : ce que « Rattacher » toucherait, AVANT d'écrire.
   * Lecture seule ; déclarée AVANT `:id`. Cloisonnée par espace et par unité, comme `hygiene`.
   */
  @Get('duplicates/audit')
  @WorkspaceRead()
  async duplicatesAudit(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    return this.accountsService.auditDuplicates(workspaceId, businessUnitScope)
  }

  /**
   * La timeline unifiée d'un compte (addendum p59-60).
   *
   * Déclarée AVANT `:id` — sinon la route dynamique avalerait le littéral, et
   * `/accounts/:id/timeline` se ferait lire comme un identifiant de compte.
   */
  // Mesurée le 29/08 : lecture pure de l'historique d'un compte de l'espace,
  // bornée par `workspaceId` résolu du JWT. Elle faisait partie des onze
  // routes nues d'`accounts.controller.ts` que D39 avait laissées « non
  // mesurées » — un cas non mesuré ne se traite pas en masse, il se mesure un
  // par un. Celui-ci l'est.
  /**
   * LA DISTANCE AU PREMIER EURO (PDF 2 §7.4, `BEL-ACC-107` PR4).
   *
   * Déclarée AVANT `:id`, comme la timeline au-dessus — sinon la route
   * dynamique avalerait le littéral.
   *
   * ⚠️ Ce que cette route rend n'est PAS une probabilité : un COMPTE d'étapes
   * restantes et une SOMME de délais médians observés sur des missions closes.
   * `estimatedDays` vaut `null` sous dix missions closes, et l'écran écrit
   * alors « pas assez d'historique pour estimer » — jamais un nombre.
   */
  @WorkspaceRead()
  @Get(':id/first-euro')
  async firstEuroForAccount(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    // Un service non injecté ne se remplace pas par une distance devinée : on
    // le DIT. Même doctrine que les autres dépendances optionnelles de ce
    // contrôleur — jamais une valeur de remplissage.
    if (!this.firstEuro) throw new ServiceUnavailableException('Distance au premier euro indisponible')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // R15N-16 — la porte de périmètre : la distance au premier euro d'un compte
    // hors périmètre n'est pas une donnée de moins, c'est le compte entier.
    await this.assertAccountInScope(id, workspaceId, user.userId)
    return this.firstEuro.forAccount(id, workspaceId)
  }

  /**
   * #1582 — LE CONTEXTE MARCHÉ D'UN COMPTE, derrière le popover de sa ligne.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI UNE ROUTE PAR COMPTE, ET PAS UN CHAMP DE PLUS SUR LA LISTE
   * ─────────────────────────────────────────────────────────────────────────
   * Le popover s'ouvre sur UN compte, à la demande. Poser ces deux nombres sur
   * les 25 lignes de la page ferait payer à chaque chargement une lecture que
   * l'utilisateur n'ouvrira presque jamais — alors que `findAll` porte déjà le
   * seul champ dont la LIGNE a besoin (`market_paths_observed`), qui est aussi
   * ce qui décide si l'icône se rend.
   *
   * ⚠️ **Ici, et contrairement à la liste, le pays VOYAGE.** La fiche de compte
   * porte `registry_country` ; la ligne de liste ne l'a pas. C'est ce qui
   * permet à `resolveMarketCompany` de départager deux homonymes au lieu de
   * rendre `null` par prudence (#1617).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * TROIS RÉPONSES, ET C'EST TOUT L'INTÉRÊT DE LA ROUTE
   * ─────────────────────────────────────────────────────────────────────────
   * · **503** — mémoire non montée, ou lecture `unavailable`. Une panne ne se
   *   raconte JAMAIS comme « ce compte n'est pas couvert » : ce serait une
   *   bonne nouvelle fausse, exactement le défaut que GA-179 a corrigé sur la
   *   colonne Accessibilité.
   * · **`null`** — le compte est lu, il n'est pas couvert. L'écran ne rend rien
   *   (« ne rien afficher si aucune observation suffisamment couverte
   *   n'existe », #1582). Sous `MARKET_MEMORY_MIN_PATHS` la couverture est
   *   VIDE et non partielle : il n'y a pas de « 0 parcours » à montrer.
   * · **l'objet** — les parcours observés, et COMBIEN d'ESN ont été vues.
   *   `esn_observed: 0` sur un compte couvert est une vraie mesure : l'écran
   *   écrit « à qualifier », jamais « aucune ESN ». Depuis #1608 / #1630.10,
   *   l'objet porte aussi `observed_zone` — l'empreinte de zone du corpus
   *   (ville / région / pays), `null` quand aucune des trois n'est connue.
   *   Lue par l'onglet Sites ; le popover d'origine (#1582) l'ignore.
   *
   * Composé DANS LE CONTRÔLEUR, comme `withMarketPaths` juste au-dessus et
   * comme `CoverageController.observedRoleFamilies` : GA-07 est au plafond et
   * nomme elle-même cet endroit. Aucune ligne de `AccountsService` ne bouge.
   */
  @WorkspaceRead()
  @Get(':id/market-context')
  async marketContext(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountMarketContext | null> {
    if (!this.marketMemory) throw new ServiceUnavailableException('Observations du marché indisponibles')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Porte d'appartenance AVANT toute lecture : un compte hors de l'espace
    // rend 404, jamais le contexte marché d'une autre ESN.
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = unwrap(
      await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope),
      throwAccountFailure,
    )
    // Sans raison sociale il n'y a rien à rapprocher — et on n'interroge pas la
    // mémoire sur un nom vide, qui rapprocherait n'importe quoi.
    if (!account.company_name?.trim()) return null
    const read = await this.marketMemory.coverageFor({
      ref: id,
      name: account.company_name,
      website: account.website ?? null,
      country: account.registry_country ?? null,
    })
    if (read.status !== 'ok') throw new ServiceUnavailableException('Observations du marché indisponibles')
    // `covered: false` ⇒ `marketPaths` est `null` (le contrat le REFUSE
    // autrement) : le second test n'est pas une ceinture, il donne son type au
    // champ obligatoire du contrat.
    if (!read.coverage.covered || read.coverage.marketPaths === null) return null

    // #1640.2 — L'INDEX PAR COHORTE, ET L'UNIQUE ENDROIT OÙ SON INTERRUPTEUR SE LIT.
    //
    // `MARKET_MEMORY_SCORING_ENABLED` est lu ICI et nulle part ailleurs (GA-26,
    // « un réglage vit à un seul endroit ») : c'est la porte par laquelle le
    // chiffre SORT du serveur. Tant qu'il vaut `false`, aucune lecture de
    // cohorte n'est faite — pas de requête, pas de coût — et le champ reste
    // ABSENT : la carte du dossier continue de n'écrire que « Recours externe
    // observé » ou « Non mesuré », exactement comme avant ce lot.
    //
    // ⚠️ Le jour où ce drapeau passe à `true`, la clé i18n `fit.noGrade`
    // (`marketMemory.json`, FR et EN, lue par `MarketStructuralFitCard.tsx`)
    // devient FAUSSE et change DANS LE MÊME LOT : elle dit aujourd'hui, à
    // raison, qu'on ne sait pas encore comparer un compte à des entreprises de
    // taille voisine.
    //
    // ⚠️ Un `unavailable` ne devient PAS une absence d'index : la panne de
    // cette lecture-ci ne doit pas emporter le contexte marché, qui est déjà
    // lu et juste. Le champ reste absent — « on ne sait pas », jamais « il n'y
    // a rien » — et le journal porte la raison.
    //
    // ⚠️ Le type est ANNOTÉ, jamais déduit : `MARKET_MEMORY_SCORING_ENABLED`
    // est un littéral `false`, et TypeScript réduirait sinon cette variable au
    // seul type `null`. La ligne suivante compilerait quand même aujourd'hui et
    // cesserait de compiler le jour où le drapeau change — un rouge gratuit
    // dans le lot le plus délicat, celui de la calibration.
    const cohortIndex: MarketCohortIndexRead | null = MARKET_MEMORY_SCORING_ENABLED
      ? await this.marketMemory.cohortIndexFor({
          ref: id,
          name: account.company_name,
          website: account.website ?? null,
          country: account.registry_country ?? null,
        })
      : null
    return {
      paths_observed: read.coverage.marketPaths,
      esn_observed: read.coverage.esnObserved.length,
      // #1608 / #1630.10 — simple pass-through : `MarketMemoryService` a déjà
      // décidé si elle est `null` (rien à trois valeurs, ou sous le seuil) ou
      // un objet, éventuellement partiel. Lu par l'onglet Sites.
      observed_zone: read.coverage.observedZone,
      // #1607.2 — la pile observée, que cette façade jetait alors que
      // `coverageFor` la calcule depuis #1579. Elle s'affiche déjà AVANT de
      // dépenser un crédit (l'aperçu de `/search`) : la perdre une fois le
      // compte au portefeuille était l'inverse de ce que l'utilisateur attend.
      // Simple pass-through, comme `observed_zone` juste au-dessus.
      observed_stack: read.coverage.observedStack.map(entry => entry.techno),
      // #1611.3 — LE COMPTAGE, QUE LA LIGNE AU-DESSUS JETTE.
      //
      // `observedStack` porte `{ techno, persons }` ; la projection ci-dessus
      // garde le libellé et perd le nombre. L'écran ne pouvait donc distinguer
      // une expertise corroborée par dix parcours d'une corroborée par le
      // strict plancher du corpus — la carte des angles renforcés était binaire.
      //
      // Les deux champs coexistent à dessein : celui du dessus est lu par des
      // onglets déjà ouverts, et un champ qui change de forme pendant un
      // déploiement casse durablement. Simple pass-through, comme `observed_zone`.
      observed_stack_detail: read.coverage.observedStack,
      // #1609 — les familles de rôles observées, pour orienter une recherche de
      // contacts ACTUELS. Aucune identité ne traverse : le corpus n'en porte pas.
      // Le seau résiduel n'est pas retiré ici — il se filtre à l'affichage, avec
      // le même `isResidualRoleFamily` que l'aperçu de `/search`.
      role_families: read.coverage.roleFamilies.map(row => ({ family: row.family, persons: row.persons })),
      // #1607.3 — les ESN observées, NOMMÉES, pour que `IncumbentEsnCard`
      // corrobore un titulaire que l'analyse a nommé. Simple pass-through,
      // comme `observed_stack_detail` : `MarketMemoryService` a déjà décidé
      // du contenu (dédupliqué, plancher `MARKET_OBSERVATION_MIN_PERSONS`).
      esn_observed_detail: read.coverage.esnObserved,
      // Lot 773 (f) — les ex-ESN présentes chez ce compte : un COMPTAGE (aucune identité), absent quand non mesuré.
      ...(read.coverage.exEsnPresent ? { ex_esn_present: read.coverage.exEsnPresent } : {}),
      // #1640.2 — `undefined` tant que le drapeau est `false` (l'état
      // d'aujourd'hui) ou qu'une lecture a échoué ; `null` quand l'entreprise
      // n'est pas rapprochée du corpus ; l'objet sinon. Un champ AJOUTÉ : un
      // onglet resté ouvert sur l'ancien front lit tout le reste à l'identique.
      cohort_index: cohortIndex?.status === 'ok' ? cohortIndex.index : undefined,
    }
  }

  /**
   * #4755 / #4756 / #4762 (lot 761) — LES LIGNES DU TABLEAU « SIGNAUX ET BESOINS » : les quatre familles, une
   * ligne par fait daté, Actuel / Historique, doublons fusionnés, aucune source nommée
   * (`AccountSignalLinesService`). Porte d'appartenance AVANT toute lecture, comme `:id/market-context` : un
   * compte hors de l'espace (ou hors de la business unit du lecteur) rend 404 ; le service refiltre ensuite
   * CHAQUE requête par l'espace et le compte.
   */
  /** Lot 775 — la porte des parcours observés, liée à l'espace ici : le lecteur de lignes ne connaît pas le service. */
  private marketPathsReader(workspaceId: string): MarketPersonPathsReader | undefined {
    const memory = this.marketMemory
    return memory ? lookups => memory.personPathsFor(lookups, { workspaceId }) : undefined
  }

  /**
   * #5192 (lot 781) — LE DÉTAIL des parcours observés que résume la carte « Observé sur le marché ». Même porte
   * d'appartenance (espace + périmètre BU) que `:id/market-context` ; `personPathsFor` est la lecture existante (lot 775).
   * Colonnes énumérées à la main : ni `id` (clé de ligne), ni pseudonyme, ni lieu — aucun identifiant ne sort, et le
   * schéma du contrat est `.strict()`. Plafonné à `MARKET_PATHS_DETAIL_MAX`, `paths_total` dit le total réel.
   * Une panne est un 503, jamais une liste vide (« on n'a pas pu lire » ≠ « il n'y en a pas »).
   */
  @WorkspaceRead()
  @Get(':id/market-paths')
  async marketPaths(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountMarketPaths> {
    if (!this.marketMemory) throw new ServiceUnavailableException('Observations du marché indisponibles')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = unwrap(
      await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope),
      throwAccountFailure,
    )
    if (!account.company_name?.trim()) return { paths_total: 0, paths: [] }
    // Lot 793 — les parcours rangés sous le BM-A du compte (référentiel pivot) ; le compte lui-même, pas son groupe.
    const common = await this.commonAccounts?.resolveForWorkspace(workspaceId, [id]).catch(() => undefined)
    const set = common?.sets.get(id)
    const commonKeys = (set?.members ?? [])
      .filter(member => set?.direct.includes(member.commonId) && member.bmAccountId)
      .map(member => member.bmAccountId as string)
    const read = await this.marketMemory.personPathsFor(
      [
        {
          ref: id,
          name: account.company_name,
          website: account.website ?? null,
          country: account.registry_country ?? null,
          ...(commonKeys.length > 0 ? { commonKeys } : {}),
        },
      ],
      { workspaceId },
    )
    if (read.status !== 'ok') throw new ServiceUnavailableException('Observations du marché indisponibles')
    const all = read.paths.get(id) ?? []
    return {
      paths_total: all.length,
      paths: all.slice(0, MARKET_PATHS_DETAIL_MAX).map(path => ({
        job_title: path.jobTitle,
        role_family: path.roleFamily,
        skills: [...path.skills],
        start_date: path.startDate,
        end_date: path.endDate,
        date_precision: path.datePrecision,
        work_status: path.workStatus,
        esn_name: path.esnName,
        daily_rate_eur: path.dailyRateEur,
      })),
    }
  }

  @WorkspaceRead()
  @Get(':id/signal-lines')
  async signalLinesOf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountSignalLines> {
    if (!this.signalLines) throw new ServiceUnavailableException('Signaux du compte indisponibles')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
    const lines = await this.signalLines.forAccount({
      workspaceId,
      accountId: id,
      marketPaths: this.marketPathsReader(workspaceId),
      commonAccounts: this.commonAccounts?.readerFor(workspaceId),
    })
    if (!lines) throw new NotFoundException('Compte introuvable')
    return lines
  }

  /**
   * #4742 — LA STRUCTURE TECHNIQUE DU COMPTE : CRM, ERP, données, hébergement, outils métier.
   *
   * Chaque technologie est rangée dans son axe et porte sa preuve datée (l'offre
   * qui la nomme, ou l'analyse) — jamais déduite du secteur. Un axe sans preuve
   * reste nommé dans `not_observed_axes` : la structure se présente comme
   * PARTIELLE, jamais comme « 0 ». Même porte d'appartenance que
   * `:id/market-context` : un compte hors de l'espace rend 404.
   */
  @WorkspaceRead()
  @Get(':id/tech-structure')
  async techStructure(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<TechStructure> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = unwrap(
      await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope),
      throwAccountFailure,
    )
    const analysis = account.raw_analysis as {
      it_job_signals?: Parameters<typeof buildTechStructure>[0]['jobSignals']
      detected_tech_stack?: string[]
      technology_stack?: { name?: string | null }[]
    }
    return buildTechStructure({
      jobSignals: analysis?.it_job_signals,
      detectedTechStack: [...(analysis?.detected_tech_stack ?? []), ...(account.apollo_enrichment?.technologies ?? [])],
      analysedTechnologies: analysis?.technology_stack,
      analysedAt: account.signals_collected_at
        ? new Date(account.signals_collected_at).toISOString().slice(0, 10)
        : null,
    })
  }

  /**
   * #2556 — UN COMPTE CONNU DOIT VALOIR MIEUX QU'UN ANNUAIRE.
   *
   * Retour client (François Thomas, call bêta du 17/09/2026) : sur un compte
   * déjà connu, la moindre donnée manquante détruit la confiance — donc pas de
   * panneau qui affiche « quelque chose » à tout prix. `known` se DÉDUIT
   * (#2556.1, `AccountKnownService.known` — voir sa doc pour le risque assumé
   * du compte importé en masse et jamais travaillé) ; sur un compte NON connu,
   * la réponse s'arrête là (`since: null`, `lines: []`), sans lire ni contacts
   * ni interventions.
   *
   * Porte d'appartenance AVANT toute lecture, comme `marketContext` juste
   * au-dessus : un compte hors de l'espace rend 404. `previous_analysis_at` du
   * compte déjà lu sert d'ancre à la fenêtre `since` (voir la doc du service
   * pour le repli à 30 jours) — jamais « depuis ta dernière visite », un
   * repère par utilisateur qui n'existe pas dans ce dépôt.
   */
  @WorkspaceRead()
  @Get(':id/known-movements')
  async knownMovements(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountKnownMovements> {
    if (!this.accountKnown) throw new ServiceUnavailableException('Mouvements de compte indisponibles')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = unwrap(
      await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope),
      throwAccountFailure,
    )
    return this.accountKnown.movements(workspaceId, id, account.company_name ?? '', account.previous_analysis_at)
  }

  /**
   * #4180 (EX-10) — CE QUI A CHANGÉ depuis la dernière vérification : nouveaux responsables, changements
   * d'entité, besoins documentés, offres de recrutement, événements — chacun daté du fait. « Rien de
   * nouveau » se dit et n'efface rien. La dernière vérification est `previous_analysis_at` (la même ancre que
   * `known-movements`) ; absente, la réponse le DIT (`no_reference`) au lieu de comparer à une date devinée.
   * Porte d'appartenance AVANT toute lecture : un compte hors de l'espace rend 404.
   */
  @WorkspaceRead()
  @Get(':id/changes-since-check')
  async changesSinceCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountChanges> {
    if (!this.accountChanges) throw new ServiceUnavailableException('Changements de compte indisponibles')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = unwrap(
      await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope),
      throwAccountFailure,
    )
    const changes = await this.accountChanges.changes({
      workspaceId,
      userId: user.userId,
      accountId: id,
      companyName: account.company_name ?? '',
      lastCheckedAt: changesReferenceDate(
        account.previous_analysis_at,
        await this.accountsService.resolveLastAnalyzedAt(id),
      ),
    })
    if (!changes) throw new ServiceUnavailableException('Changements de compte indisponibles')
    return changes
  }

  /**
   * #3916.b — TOUTES les annonces de registre public du compte (créations,
   * cessions, dépôts, procédures, ouvertures d'établissement), lues en continu
   * par la veille — pas seulement les 8 que l'analyse a figées. Porte
   * d'appartenance AVANT toute lecture : un compte hors de l'espace rend 404.
   */
  @WorkspaceRead()
  @Get(':id/registry-announcements')
  async registryAnnouncements(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountRegistryAnnouncements> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = unwrap(
      await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope),
      throwAccountFailure,
    )
    return this.accountsService.registryAnnouncements(account.siren)
  }

  /**
   * #3970 (lot P07) — « qui a rejoint l'entreprise ces 6 derniers mois, à quel
   * rôle, depuis quand, et est-ce que ça colle à mon contexte ? ». Lu sur le
   * parcours DÉJÀ rapporté par l'enrichissement des contacts du compte, jamais
   * une collecte neuve. Porte d'appartenance AVANT toute lecture : un compte
   * hors de l'espace ou du périmètre rend 404.
   */
  @WorkspaceRead()
  @Get(':id/recent-hires')
  async recentHires(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountRecentHires> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = unwrap(
      await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope),
      throwAccountFailure,
    )
    return this.accountsService.recentHires(workspaceId, user.userId, account)
  }

  /**
   * Louis 30/10 — « rechercher d'autres métiers, en afficher plus, 5 par 5, jusqu'à 50 » : les offres
   * d'emploi du compte pour le métier saisi (vide : tous métiers). Porte d'appartenance AVANT toute
   * lecture : un compte hors de l'espace ou du périmètre rend 404. En démo, les offres semées du dossier.
   */
  @WorkspaceRead()
  @Get(':id/job-offers')
  async jobOffers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('term') termRaw?: string,
  ): Promise<AccountJobOffers> {
    const term = typeof termRaw === 'string' ? termRaw.split(/\s+/).filter(Boolean).join(' ') : ''
    if (term.length > ACCOUNT_JOB_OFFER_TERM_MAX) {
      throw new BadRequestException(`Le métier cherché tient en ${ACCOUNT_JOB_OFFER_TERM_MAX} caractères.`)
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = unwrap(
      await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope),
      throwAccountFailure,
    )
    const demo = await this.workspaceContext.isDemoWorkspace(user.userId)
    return this.accountsService.jobOffers(account, term, demo)
  }

  /**
   * #1617.4 — « C'EST BIEN CETTE ENTREPRISE » / « CE N'EST PAS EXACT ».
   *
   * ───────────────────────────────────────────────────────────────────────────
   * LE CHEMIN D'ÉCRITURE QUI MANQUAIT
   * ───────────────────────────────────────────────────────────────────────────
   * La première moitié de ce lot a posé la table, la règle pure et les deux
   * chemins de LECTURE. Rien ne pouvait remplir la table : « une lecture sans
   * chemin d'écriture », le défaut n°1 de ce dépôt. Voici la porte.
   *
   * `PUT` et non `POST`, parce que le geste est IDEMPOTENT sur
   * `(workspace_id, account_id)` : la dernière décision vaut, « une correction
   * humaine gagne toujours, quelle que soit sa date ». Deux clics ne laissent
   * qu'une vérité, et la lecture n'a jamais à départager deux lignes.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * CE QU'ELLE N'ÉCRIT PAS
   * ───────────────────────────────────────────────────────────────────────────
   * RIEN dans les tables `market_*` partagées. Les espaces sont des ESN, donc
   * des concurrents : la décision de l'un ne devient jamais la vérité de
   * l'autre, et le corpus reste en lecture seule pour tout le produit. On
   * PROPOSE, on ne fusionne jamais — ici on enregistre une décision d'espace,
   * qui se SUPERPOSE à la lecture sans rien réécrire dessous.
   *
   * `records:write` : c'est une écriture sur la donnée de l'espace, donc la
   * même famille que les autres corrections de fiche — un `viewer` ne réécrit
   * pas le rapprochement du portefeuille de son équipe.
   *
   * ⚠️ Le corps est validé par `safeParse` et NON par `parse` : un `ZodError`
   * nu ne traverse pas `ZodValidationExceptionFilter` (qui n'attrape que la
   * `ZodValidationException` de nestjs-zod) et sortirait en 500 opaque sur une
   * saisie fautive. Et la raison de l'humain se range dans `message`, pas dans
   * `error` — sinon l'écran affiche « Bad Request » à la place du texte écrit
   * pour lui.
   */
  @RequirePermission('records:write')
  @Put(':id/market-resolution')
  async recordMarketResolution(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<MarketResolutionDecisionRecord> {
    if (!this.marketMemory) throw new ServiceUnavailableException('Observations du marché indisponibles')

    const parsed = marketResolutionDecisionRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestException(
        'Décision illisible : « c’est bien cette entreprise » doit porter la clé du corpus désignée, et « ce n’est pas exact » ne doit en porter aucune.',
      )
    }

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Porte d'appartenance AVANT toute écriture, comme `:id/market-context`
    // juste au-dessus : un compte hors de l'espace rend 404, et SURTOUT rien
    // n'est écrit — une décision enregistrée puis refusée laisserait une trace
    // dans un espace qui n'a rien demandé.
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)

    // ⚠️ L'espace et l'auteur viennent du JETON, jamais du corps — c'est tout
    // le cloisonnement de cette table, dont la raison d'être est de séparer des
    // concurrents. Le schéma `.strip()` les aurait de toute façon jetés ;
    // les relire ici les rendrait atteignables.
    return this.marketMemory.recordResolutionDecision({
      workspaceId,
      accountId: id,
      reviewedBy: user.userId,
      decision: parsed.data,
    })
  }

  @WorkspaceRead()
  @Get(':id/timeline')
  async timelineForAccount(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // R15N-16 — la porte de périmètre. L'historique d'un compte RACONTE le
    // compte : le cloisonner à moitié n'aurait aucun sens.
    await this.assertAccountInScope(id, workspaceId, user.userId)
    return this.timeline.forAccount(id, workspaceId)
  }

  @Get('similar-to-explore')
  @WorkspaceRead()
  async listSimilarCompaniesToExplore(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // `userId` → profil vendeur server-side pour le re-classement hybride
    // (secteur/géo/taille) des suggestions — voir similar-scoring.ts.
    const suggestions = await this.accountsService.listSimilarCompaniesToExplore(workspaceId, user.userId)
    return this.withSimilarityHeadlines(workspaceId, suggestions, { allowTwin: true })
  }

  /**
   * #1576 / #1632 — LA RAISON PRINCIPALE, REMONTÉE À CE QU'ON PEUT PROUVER.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI ICI, ET PAS DANS LE SERVICE QUI FABRIQUE LES SUGGESTIONS
   * ───────────────────────────────────────────────────────────────────────────
   * Les deux raisons fortes se lisent dans d'AUTRES modules : les missions
   * signées dans `delivery`, les piles observées dans `market-memory`. GA-07
   * interdit qu'un service en importe un autre — la composition se fait au
   * contrôleur, exactement comme `withMarketPaths` et `resolveMarketCoveredIds`
   * juste au-dessus.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * L'ORDRE, ET LE SILENCE
   * ───────────────────────────────────────────────────────────────────────────
   * `twin` > `tech` > `sector`, une seule raison par carte (le retour l'exige).
   * Chaque remontée est OPTIONNELLE : un module absent, une lecture en panne,
   * un corpus qui ne connaît pas l'entreprise ⇒ la carte garde la raison que le
   * service a posée. Aucune de ces situations ne produit une phrase fausse ;
   * elles produisent une phrase plus faible, et vraie.
   *
   * ⚠️ Le rapprochement du compte de référence se fait sur SON NOM, et c'est
   * une valeur qu'on vient nous-mêmes d'émettre depuis la même table — pas une
   * jointure entre deux référentiels. Un nom PORTÉ PAR DEUX comptes est écarté
   * plutôt que départagé au hasard : une mauvaise jointure est pire qu'une
   * absence de donnée (#1617).
   */
  private async withSimilarityHeadlines(
    workspaceId: string,
    suggestions: SimilarAccountSuggestion[],
    options: { allowTwin: boolean },
  ): Promise<SimilarAccountSuggestion[]> {
    if (suggestions.length === 0) return suggestions

    const referenceNames = new Set(
      suggestions.map(suggestion => suggestion.similarity_headline?.referenceAccount).filter(Boolean) as string[],
    )
    if (referenceNames.size === 0) return suggestions

    // Le compte de référence, avec ce qu'il faut pour interroger la mémoire :
    // `null` marque un nom AMBIGU (deux comptes le portent) — on ne départage pas.
    const lookupByName = new Map<
      string,
      { id: string; website: string | null; registry_country: string | null } | null
    >()
    for (const account of await this.accountsService.listPortfolioLookups(workspaceId)) {
      if (!referenceNames.has(account.company_name)) continue
      lookupByName.set(
        account.company_name,
        lookupByName.has(account.company_name)
          ? null
          : { id: account.id, website: account.website, registry_country: account.registry_country },
      )
    }

    const twinAccountIds = options.allowTwin ? await this.resolveTwinAccountIds(workspaceId) : new Set<string>()
    const upgraded = suggestions.map(suggestion => {
      const reference = suggestion.similarity_headline?.referenceAccount
      const lookup = reference ? lookupByName.get(reference) : undefined
      if (!reference || !lookup || !twinAccountIds.has(lookup.id)) return suggestion
      return { ...suggestion, similarity_headline: { kind: 'twin' as const, referenceAccount: reference } }
    })

    // Tout est déjà à la raison la plus forte : la lecture du corpus ne
    // changerait rien, elle ne part pas.
    if (upgraded.every(suggestion => suggestion.similarity_headline?.kind === 'twin')) return upgraded

    return this.withTechnoAffinity(upgraded, lookupByName)
  }

  /** Les comptes de l'espace où une mission a été SIGNÉE — vide sous le seuil
   *  {@link SIMILAR_TWIN_MIN_MISSIONS}, ou si le module n'est pas là. */
  private async resolveTwinAccountIds(workspaceId: string): Promise<ReadonlySet<string>> {
    if (!this.accountMissions) return new Set()
    try {
      const { accountIds, missionsTotal } = await this.accountMissions.signedMissionsByAccount(workspaceId)
      // Sous le seuil, on ne nomme rien : « on ne calcule pas une ressemblance
      // sur deux observations » (#1576).
      return missionsTotal >= SIMILAR_TWIN_MIN_MISSIONS ? accountIds : new Set()
    } catch (error) {
      this.logger.warn('lecture des missions signées impossible — la raison « compte jumeau » est omise', { error })
      return new Set()
    }
  }

  /**
   * `tech` — au moins trois technologies communes DISCRIMINANTES, observées des
   * deux côtés par la mémoire marché.
   *
   * Une seule lecture groupée pour les comptes de référence ET les suggestions.
   * Le calcul, lui, est une fonction pure des contrats
   * (`discriminantCommonTechnos`) : le seuil et la borne d'ubiquité vivent à un
   * seul endroit.
   */
  private async withTechnoAffinity(
    suggestions: SimilarAccountSuggestion[],
    lookupByName: ReadonlyMap<string, { id: string; website: string | null; registry_country: string | null } | null>,
  ): Promise<SimilarAccountSuggestion[]> {
    if (!this.marketMemory) return suggestions

    const lookups: MarketCompanyLookup[] = []
    for (const [name, lookup] of lookupByName) {
      if (!lookup) continue
      lookups.push({
        ref: `account:${lookup.id}`,
        name,
        website: lookup.website,
        country: lookup.registry_country,
      })
    }
    suggestions.forEach((suggestion, index) => {
      lookups.push({ ref: `candidate:${index}`, name: suggestion.company_name, website: null })
    })

    // #2127.30 — LA MÊME LISTE DE LOOKUPS SERT DEUX LECTURES INDÉPENDANTES.
    //
    // Les piles observées (`observedStacksFor`) et les familles de rôles
    // (`roleFamiliesManyFor`) viennent de tables distinctes : une entreprise peut
    // être couverte pour l'une sans l'être pour l'autre. Les composer en série
    // ferait dépendre « métiers recrutés en commun » d'une panne ou d'une absence
    // de pile technologique, qui n'a rien à voir.
    const [stacksRead, familiesRead] = await Promise.all([
      this.marketMemory.observedStacksFor(lookups),
      this.marketMemory.roleFamiliesManyFor(lookups),
    ])

    return suggestions.map((suggestion, index) => {
      if (suggestion.similarity_headline?.kind === 'twin') return suggestion
      const reference = suggestion.similarity_headline?.referenceAccount
      const lookup = reference ? lookupByName.get(reference) : undefined
      if (!reference || !lookup) return suggestion

      let next = suggestion

      // #2127.30 — au moins une famille de rôles recrutée des DEUX côtés. Un côté
      // non couvert (`null`) ne produit jamais « aucun métier en commun ».
      if (familiesRead.status === 'ok') {
        const referenceFamilies = familiesRead.families.get(`account:${lookup.id}`) ?? null
        const candidateFamilies = familiesRead.families.get(`candidate:${index}`) ?? null
        if (sharedRoleFamilies(referenceFamilies, candidateFamilies)) {
          next = withSharedCriterion(next, 'role_family')
        }
      }

      // `unavailable` ⇒ on n'a rien lu. Aucune carte ne change — surtout pas vers
      // « pas d'environnement commun », qui serait une affirmation.
      if (stacksRead.status !== 'ok') return next

      const referenceStack = stacksRead.stacks.get(`account:${lookup.id}`)
      const candidateStack = stacksRead.stacks.get(`candidate:${index}`)
      if (!referenceStack || !candidateStack) return next

      // #2127.29 — les DEUX entreprises sont couvertes : le recours à des externes est
      // OBSERVÉ des deux côtés — la même dérivation que « Recours à des externes :
      // Observé » du contexte marché (couverture ⇒ observé). Un côté non couvert est
      // sorti juste au-dessus : il ne produit jamais « n'externalise pas ».
      next = withSharedCriterion(next, 'external_use')

      const technologies = discriminantCommonTechnos(
        referenceStack,
        candidateStack,
        stacksRead.technoFrequency,
        stacksRead.corpusCompanies,
      )
      if (technologies.length === 0) return next
      return {
        ...next,
        similarity_headline: { kind: 'tech' as const, referenceAccount: reference, technologies },
      }
    })
  }

  /**
   * Lot 764 (31/10/2026) — L'HISTORIQUE DE TOUS MES COMPTES au même niveau que l'onglet « Signaux et besoins » :
   * la MÊME lecture (`AccountSignalLinesService`, mêmes familles, même fusion, même frontière Actuel/Historique),
   * pour tous les comptes du PÉRIMÈTRE du lecteur, en un nombre constant de requêtes. Seules les lignes passées
   * voyagent ; un compte sans passé n'est pas listé. Lecture de base seulement : aucun appel fournisseur.
   */
  @Get('signal-history')
  @WorkspaceRead()
  async signalHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<WorkspaceSignalHistory> {
    // Lot 785 (#5213) — PAGINÉ (50 comptes par défaut) ; un paramètre inconnu est refusé, jamais avalé.
    const parsed = workspaceSignalHistoryQuerySchema.safeParse(rawQuery ?? {})
    if (!parsed.success) throw new BadRequestException('Paramètres de l’historique invalides')
    if (!this.signalLines) throw new ServiceUnavailableException('Historique des signaux indisponible')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    return this.signalLines.forWorkspace({
      workspaceId,
      businessUnitScope,
      marketPaths: this.marketPathsReader(workspaceId),
      commonAccounts: this.commonAccounts?.readerFor(workspaceId),
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      search: parsed.data.q,
    })
  }

  @Get('signals')
  @WorkspaceRead()
  async listSignals(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #2040.17 — `userId` → profil vendeur server-side : les natures de signal
    // que ses réponses rendent décisives remontent en tête de la Veille.
    // #2084.24 — et le périmètre : la Veille NOMME les comptes, ligne à ligne.
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const items = await this.accountsService.listAccountSignals(workspaceId, user.userId, businessUnitScope)
    // #4088.2 — « qui ça concerne » : le décideur de tête de chaque compte, par le
    // classement des contacts (cache 60 s). Jamais bloquant : une lecture qui casse
    // rend la Veille SANS décideur (champ absent), jamais une Veille muette.
    try {
      const heads = await this.contactsService.topDecisionMakers(
        [...new Set(items.map(i => i.account_id))],
        user.userId,
      )
      return attachDecisionMakers(items, heads)
    } catch (error) {
      this.logger.warn(`listSignals: décideurs indisponibles — ${(error as Error).message}`)
      return items
    }
  }

  /**
   * LES PHOTOS MENSUELLES QUE LE BANDEAU DU PORTEFEUILLE COMPARE (31/08/2026).
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE ROUTE N'EXISTAIT PAS, ALORS QUE TOUT ÉTAIT ÉCRIT
   * ─────────────────────────────────────────────────────────────────────────────
   * `StockSnapshotService.seriesFor` et `metricDelta` sont livrés, testés — et
   * n'avaient AUCUN appelant : `PilotageController` ne lit que `baselineFor`, et
   * `apps/web` ne connaissait ni l'un ni l'autre. Le défaut n°1 du dépôt, « du
   * code juste que personne n'appelle », dans sa forme exacte. Sans cette porte,
   * « +5 ce mois » n'avait qu'une façon d'exister : être inventé.
   *
   * ⚠️ ORCHESTRATION DANS LE CONTRÔLEUR, ET C'EST LA RÈGLE. GA-07 est à son
   * plafond (243 imports service → service, zéro marge) et son message le dit :
   * « fais l'orchestration dans le contrôleur ». La garde exclut d'ailleurs
   * explicitement les `*.controller.ts` de son comptage. Recopier la lecture de
   * série ici — bornage des mois, filtrage des clés inconnues, unité — en aurait
   * fait une SECONDE définition, qui aurait divergé au premier correctif.
   *
   * ⚠️ Elle ne rend PAS ce que le portefeuille affiche aujourd'hui : la valeur
   * courante vient de la liste elle-même, comme sur les deux écrans de pilotage.
   * Une photo dit ce qui était vrai, jamais ce qui l'est.
   *
   * Déclarée AVANT `:id`, comme les littérales au-dessus. `@WorkspaceRead()` :
   * lecture d'espace, sans montant, sans écriture.
   */
  @Get('portfolio-series')
  @WorkspaceRead()
  async portfolioSeries(@CurrentUser() user: CurrentUserPayload): Promise<MetricSeriesResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Sans le module de pilotage monté (specs unitaires), la route rend une
    // série VIDE et `monthsCovered: 0` — c'est-à-dire « aucune photo », que
    // l'écran sait déjà rendre en « non mesuré ». Jamais une erreur, et surtout
    // jamais un `+0` : `metricDelta` refuse de conclure sans deux photos.
    if (!this.stockSnapshots) return { series: [], monthsCovered: 0 }
    return this.stockSnapshots.seriesFor(workspaceId, PORTFOLIO_SERIES_MONTHS)
  }

  /**
   * Portfolio-wide "besoins" feed. Declared BEFORE `:id` so the literal path
   * wins the route match (same reason as `signals`/`sectors` above).
   */
  @Get('needs')
  @WorkspaceRead()
  async listNeeds(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #2084.24 — le cloisonnement vaut aussi sur les agrégats : chaque ligne de
    // l'écran Besoins nomme un compte et cite ses douleurs.
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    return this.accountsService.listAccountNeeds(workspaceId, businessUnitScope)
  }

  /**
   * Les plans d'attaque déjà payés par l'ÉQUIPE. Lecture pure, gratuite : elle
   * dit à l'écran quel bouton afficher (« Préparer », 1 crédit — ou « Voir le
   * plan », qui ne coûte rien). Déclaré avant `:id` comme les routes littérales
   * au-dessus.
   */
  @Get('needs/plays')
  async listNeedPlays(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #2084.24 — le cloisonnement vaut aussi sur les agrégats : un plan NOMME
    // le compte qu'il attaque.
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    return this.needPlay.listForWorkspace(workspaceId, businessUnitScope)
  }

  /**
   * Prépare l'attaque d'un besoin — **1 crédit** (décision Louis 31/07, D9
   * option A).
   *
   * Ce que le crédit achète est une GÉNÉRATION : les besoins eux-mêmes sortent
   * de `raw_analysis`, déjà facturée, et les refacturer serait vendre deux fois
   * la même chose. Le plan appartient ensuite à l'équipe — un deuxième siège qui
   * ouvre le même besoin le relit sans repayer (`charged: false`).
   */
  /**
   * ⚠️ `contacts:enrich` — la permission manquait, et un `viewer` pouvait donc
   * DÉPENSER un crédit de l'espace. Le service débite
   * `consumeEnrichmentCredit` (`need-play.service.ts:150`) : c'est cette
   * famille-là qui décide, pas la forme de la route.
   *
   * Déclarée le 28/08 pour ramener le cliquet GA-05 à son gel après l'ajout de
   * `GET /accounts/hygiene` — et le geste juste n'était pas de couvrir la route
   * neuve (une LECTURE d'agrégats, qu'aucune permission d'écriture ne décrit)
   * mais de fermer un vrai trou d'écriture resté ouvert.
   */
  @RequirePermission('contacts:enrich')
  @Post('needs/play')
  async createNeedPlay(@Body() body: NeedPlayDto, @CurrentUser() user: CurrentUserPayload) {
    // Salle de démonstration : ce geste appelle un modèle ET débite un crédit,
    // deux choses que le bandeau annonce ne pas arriver. Contrairement à
    // Découvrir ou aux appels d'offres, on ne le SCRIPTE pas : le livrable est
    // un plan d'attaque nominatif, et un plan écrit d'avance sur des contacts
    // fictifs se lirait comme une recommandation, pas comme une démonstration.
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      throw new HttpException(
        'La préparation d’un besoin est désactivée dans l’espace de démonstration : elle coûte 1 crédit et appelle un modèle. Le dossier, le copilote et les livrables restent ouverts.',
        HttpStatus.FORBIDDEN,
      )
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #2084.24 — le cloisonnement vaut aussi en écriture, et celle-ci adresse
    // son compte par le CORPS et non par l'URL : c'est ce qui l'avait rangée
    // avec les créations au registre de dette, alors qu'elle vise bien un
    // compte EXISTANT. ⚠️ Elle DÉBITE un crédit de l'espace — une écriture
    // payante sur un compte d'une autre unité agit ET facture. La porte passe
    // donc avant `generate`, qui débite.
    await this.assertAccountInScope(body.account_id, workspaceId, user.userId)
    const result = await this.needPlay.generate(
      {
        accountId: body.account_id,
        kind: body.kind,
        label: body.label,
        detail: body.detail,
        offer: body.offer,
        urgency: body.urgency,
      },
      workspaceId,
      user.userId,
    )
    if (result.ok) return { play: result.play, charged: result.charged }
    if (result.code === 'not_found') throw new NotFoundException('Compte introuvable')
    if (result.code === 'insufficient_credits') {
      throw new HttpException(SOFT_BRAKE_MESSAGE, HttpStatus.PAYMENT_REQUIRED)
    }
    throw new ServiceUnavailableException('La préparation a échoué. Réessayez dans un instant — rien n’a été débité.')
  }

  /**
   * #2165.13 — les comptes marqués « meilleure référence », pour le preset
   * Découvrir « Proches de mes meilleures références ». Déclarée avant `:id`
   * comme les routes littérales au-dessus (sinon `:id` la capture).
   */
  @Get('best-references')
  @WorkspaceRead()
  async listBestReferences(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #2084.24 — le cloisonnement vaut aussi sur les agrégats : cette liste
    // NOMME les comptes marqués « meilleure référence ».
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    return this.accountsService.listBestReferenceSectors(workspaceId, businessUnitScope)
  }

  /**
   * #3245 (recette prod 02/10) — les profils de pari DÉCLARÉS de tous les
   * dossiers, pour l'écran Réglages › Charge commerciale. Déclarée avant `:id`
   * comme les routes littérales au-dessus. Cloisonnée par unité.
   */
  @Get('bet-profiles')
  @RequirePermission('records:write')
  async listBetProfiles(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    return this.accountsService.listBetProfiles(workspaceId, businessUnitScope)
  }

  /**
   * `:id` GOURMAND — n°20 (30/08/2026) : sans `ParseUUIDPipe`, un id qui n'en
   * est pas un (ex. une route littérale d'un AUTRE contrôleur capturée par
   * l'ordre d'enregistrement des modules) partait jusqu'au SQL et Postgres
   * jetait `invalid input syntax for type uuid` → 500 opaque en production.
   * Le pipe REND l'échec propre (400) mais ne restitue pas la route capturée —
   * seul l'ordre des modules dans `app.module.ts` fait ça (voir GA-178).
   */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = unwrap(
      await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope),
      throwAccountFailure,
    )
    // Activation funnel: opening a COMPLETED dossier = « dossier consulté »
    // (self-serve onboarding step ③). Gated on the terminal status so progress
    // polling during a run never counts; best-effort, never blocks the read.
    if (account.status === 'completed') {
      void this.analytics?.track('account_viewed', {
        userId: user.userId,
        workspaceId,
        properties: { accountId: account.id },
      })
    }
    // Surface freshness. ``last_analyzed_at`` is the REAL last-analysis date
    // (``MAX(analysis_runs.completed_at)``), or null when no completed run exists
    // — the client decides how to present that. ``age_days`` stays derived from
    // ``updated_at`` (whole-day staleness heuristic); the two answer different
    // questions and both are surfaced.
    // #2128.1 — QUI PORTE CE COMPTE, nommé. `assigned_to` voyageait déjà dans
    // le `SELECT a.*` ci-dessus, mais un uuid ne s'affiche pas : c'est la
    // dérivation qui manquait, pas la donnée. `resolveOwner` est la porte
    // publique de celle que la LISTE des comptes utilise déjà — la liste et le
    // dossier nomment le même collègue, donc ils n'ont pas deux façons de le
    // nommer (GA-26).
    //
    // `null` veut dire « lu, personne ne le porte » — pas « on ne sait pas » :
    // le champ est TOUJOURS présent sur cette réponse, et c'est ce qui permet à
    // l'écran de dire « propriétaire non renseigné » plutôt que de laisser un
    // vide que le lecteur comblera tout seul (GA-18/GA-19).
    const [lastAnalyzedAt, owner, businessUnit, activeAnalysisByColleague, followed] = await Promise.all([
      this.accountsService.resolveLastAnalyzedAt(account.id),
      this.accountsService.resolveOwner(account.assigned_to ?? null),
      this.resolveAccountBusinessUnit(workspaceId, account.business_unit_id ?? null),
      // #2128.19 — un collègue a-t-il déjà une analyse en cours sur CE compte ?
      this.accountsService.resolveActiveAnalysisByColleague(account.id, workspaceId, user.userId),
      // #4267.1 — la cadence de veille suit le SUIVI EXPLICITE, plus le statut commercial.
      this.accountsService.isFollowed(account.id),
    ])
    const [declaredPartner] = this.declaredPartners
      ? await this.declaredPartners.flag(workspaceId, [account])
      : [undefined]
    const offerDomain = await this.offerDomainOf(user.userId)
    // #4044 — le dossier est servi SANS ses offres de stage (signaux déjà stockés compris) : la veille,
    // la synthèse, la fiche PDF et le compteur de signaux lisent tous cette réponse.
    return {
      ...withoutInternshipSignals(account),
      ...(declaredPartner?.is_declared_partner ? { is_declared_partner: true as const } : {}),
      age_days: this.accountsService.computeAgeDays(account.updated_at),
      last_analyzed_at: lastAnalyzedAt,
      watch_cadence: watchCadenceFor(followed),
      // #4283.8 — la date de la prochaine ré-analyse automatique (15 jours), dite sur la fiche d'un compte suivi.
      next_reanalysis_at: nextReanalysisFor(followed, lastAnalyzedAt ? new Date(lastAnalyzedAt) : null),
      // Recette 21/10 K4 — la raison de l'absence de date d'un compte SUIVI, jamais un null muet.
      next_reanalysis_reason: nextReanalysisReasonFor(followed, lastAnalyzedAt ? new Date(lastAnalyzedAt) : null),
      signal_freshness: signalFreshnessOf(
        dropInternshipRows(account.recent_signals, { jobsOnly: true }),
        lastAnalyzedAt,
        offerDomain,
      ),
      // LUDOVIC-C LC.8 — le signal DOMINANT de la liste des comptes, MÊME source et même choix
      // (`pickDominantSignal`, pack de l'espace) : le motif du verdict le cite.
      signal_preview: readSignalPreview(
        pickDominantSignal(dropInternshipRows(account.recent_signals, { jobsOnly: true }), offerDomain),
      ),
      owner,
      business_unit: businessUnit,
      active_analysis_by_colleague: activeAnalysisByColleague,
    }
  }

  /** LUDB.7 bis — le domaine d'offre de l'espace de l'appelant ; inconnu ou illisible = `undefined` (choix d'avant). */
  private async offerDomainOf(userId: string): Promise<string | undefined> {
    if (!this.esnProfile) return undefined
    try {
      return (await this.esnProfile.resolveProfileData(userId)).offerDomain || undefined
    } catch {
      return undefined
    }
  }

  /**
   * #2128.2 — LA BU DU COMPTE, NOMMÉE. `business_unit_id` voyageait déjà dans
   * le `SELECT a.*` de `findOneForWorkspace`, mais un uuid ne s'affiche pas :
   * c'est la dérivation (nom résolu) qui manquait, même motif que
   * `resolveOwner` juste au-dessus (#2128.1). `null` = lu, aucune BU posée —
   * jamais une affirmation. Pas de requête `business_units` sans identifiant
   * (le chemin le plus chaud du produit ne paie pas un aller-retour inutile).
   */
  private async resolveAccountBusinessUnit(
    workspaceId: string,
    businessUnitId: string | null,
  ): Promise<{ id: string; name: string } | null> {
    if (!businessUnitId || !this.businessUnits) return null
    const [unit] = await this.businessUnits.findByIds(workspaceId, [businessUnitId])
    return unit ? { id: unit.id, name: unit.name } : null
  }

  /**
   * "Comptes similaires à CE compte" (Théo p.41) — seeded by the account's NAF
   * code so the results are genuinely same-sector. Workspace-scoped: returns []
   * for an account outside the caller's workspace (never leaks another team's).
   */
  @Get(':id/similar')
  async listSimilar(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // R15N-16 — la porte de périmètre : la RÉFÉRENCE de cette ressemblance est
    // le compte lui-même, donc la réponse le nomme.
    //
    // ⚠️ FUSION VAGUE 14 — deux lots ont posé cette borne, différemment. La
    // version précédente rendait `[]` hors périmètre, au nom de la sémantique
    // écrite au-dessus (« [] hors de ce que l'appelant peut voir »). Cette
    // sémantique-là parle de l'ESPACE et elle SURVIT : `listSimilarToAccount`
    // porte `workspaceId`, donc un compte d'une autre équipe rend toujours `[]`.
    // Le PÉRIMÈTRE est l'autre dimension, et GA-335 la classe parmi les routes
    // de FRAGMENT, qui lèvent — c'est la règle qui vit à un seul endroit, avec
    // son témoin (sans cloisonnement, aucune lecture de plus).
    await this.assertAccountInScope(id, workspaceId, user.userId)
    const suggestions = await this.accountsService.listSimilarToAccount(id, workspaceId, user.userId)
    // #1632 — pas de `twin` sur le dossier d'un compte : la référence EST ce
    // compte, et « ressemble à lui, où tu as gagné une mission » ne dit rien de
    // la suggestion. Seul `tech` a du sens ici.
    return this.withSimilarityHeadlines(workspaceId, suggestions, { allowTwin: false })
  }

  /**
   * #2127.37 — MASQUE une suggestion « compte similaire », pour l'appelant sur
   * ce compte. PERSISTANT et PAR PERSONNE (QCM de Louis du 15/09/2026) : une
   * autre personne de l'espace continue de la voir.
   */
  @Post(':id/similar/:siren/dismiss')
  @RequirePermission('records:write')
  async dismissSimilarSuggestion(
    @Param('id') id: string,
    @Param('siren') siren: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ dismissed: true }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    await this.accountsService.dismissSimilarSuggestion(workspaceId, user.userId, id, siren)
    return { dismissed: true }
  }

  /**
   * #2127.37 — DÉMASQUE une suggestion déjà masquée par l'appelant. La ligne
   * n'est jamais supprimée (doctrine « on archive, on ne supprime pas ») :
   * cette route bascule `dismissed_at`, elle ne détruit rien.
   */
  @Delete(':id/similar/:siren/dismiss')
  @RequirePermission('records:write')
  async restoreSimilarSuggestion(
    @Param('id') id: string,
    @Param('siren') siren: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ dismissed: false }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    await this.accountsService.restoreSimilarSuggestion(workspaceId, user.userId, id, siren)
    return { dismissed: false }
  }

  /**
   * "Historique des analyses" (Théo P0 : « Un compte racine, plusieurs
   * AnalysisRun. Historique, refresh, debug, export ») — the append-only run log
   * for this account, newest first. Workspace-scoped like `:id/similar`: the
   * account membership is verified first, so an account outside the caller's
   * workspace yields `[]` (never leaks another team's run history).
   */
  @Get(':id/runs')
  async listRuns(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope)
    if (isFailure(account)) return []
    const runs = await this.analysisRuns.listForAccount(id)
    // #3235 — `dataforge_version` : la version DataForge qui décrit le compte,
    // lue par la façade (seul chemin autorisé), posée sur chaque run listé.
    const dataforgeVersion = this.intelligence ? await this.intelligence.dataforgeVersionFor(id, workspaceId) : null
    if (!dataforgeVersion) return runs
    return runs.map(run => ({ ...run, versioning: withDataforgeVersion(run.versioning ?? null, dataforgeVersion) }))
  }

  /**
   * #3212.4/.6 (épopée #3235) — « pourquoi cela a changé », jusqu'à l'écran.
   * `null` quand il n'y a rien d'honnête à montrer (compte hors périmètre,
   * moins de deux runs terminés, ou verdict inchangé) — jamais un tiroir vide
   * qui laisserait croire qu'une révision a été vérifiée puis tue.
   */
  @Get(':id/verdict-revision')
  @WorkspaceRead()
  async verdictRevision(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope)
    if (isFailure(account)) return null
    const revision = await this.analysisRuns.explainVerdictChange(id)
    return revision ? { ...revision, changedAt: revision.changedAt.toISOString() } : null
  }

  /**
   * #4180 — « Même verdict depuis le … » : quand les deux dernières analyses terminées portent le MÊME verdict,
   * la date depuis laquelle il tient (`compareLastRuns`, jusqu'ici lu par Laura seule). `null` dans tous les
   * autres cas (verdict changé — c'est `verdict-revision` —, illisible, moins de deux analyses, hors périmètre) :
   * jamais une date devinée.
   */
  @Get(':id/verdict-unchanged')
  @WorkspaceRead()
  async verdictUnchanged(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope)
    if (isFailure(account)) return null
    const comparison = await this.analysisRuns.compareLastRuns(id)
    if (comparison?.status !== 'unchanged' || !comparison.unchangedSince) return null
    return { unchangedSince: comparison.unchangedSince.toISOString() }
  }

  /**
   * « Ce qui a changé » depuis la version précédente du dossier (D213).
   *
   * ⚠️ Rend `{ digest: null }` — jamais un tiroir vide — quand aucune version
   * précédente n'est conservée. « On n'a pas de quoi comparer » et « rien n'a
   * changé » sont deux phrases différentes, et un tiroir vide dirait la seconde
   * en pensant la première.
   *
   * La section INCHANGÉ voyage avec le reste : c'est elle qui distingue
   * « j'ai vérifié » de « je n'ai rien regardé ».
   */
  @Get(':id/changes')
  async changeDigest(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope)
    if (isFailure(account)) return { digest: null }
    return { digest: await this.accountsService.changeDigest(id, workspaceId) }
  }

  /**
   * Quel profil ESN a réellement produit ce dossier (recette finale §6 et §13).
   *
   * La provenance était déjà ÉCRITE à chaque run (`analysis_runs.profile_provenance`)
   * et n'était lue par personne : un accesseur sans appelant. Or c'est exactement
   * la question que pose le rapport — « le score SG écrit “profil ESN non
   * précisé” : inspecter la ligne profile_context de l'utilisateur, le snapshot du
   * job, la version utilisée » — et son exigence : « une analyse sans profil doit
   * être marquée générique et ne doit pas prétendre être personnalisée ».
   *
   * Scopé espace de travail comme `:id/runs` : l'appartenance du compte est
   * vérifiée d'abord, donc un compte d'une autre équipe rend 404 plutôt que de
   * révéler avec quel profil elle travaille.
   *
   * `null` = aucun run n'a encore déclaré sa provenance (dossier antérieur à la
   * traçabilité). L'interface n'affiche alors RIEN, au lieu d'annoncer une
   * personnalisation qu'elle ne peut pas prouver.
   */
  @Get(':id/profile-provenance')
  async getProfileProvenance(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountProfileProvenance | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope)
    if (isFailure(account)) return null
    const provenance = await this.analysisRuns.getProfileProvenance(id)
    if (!provenance) return null
    // La révision d'AUJOURD'HUI, pour que l'écran puisse dire « ce dossier a été
    // produit avec un profil différent ». Elle manquait, et c'est tout ce qui
    // manquait : la révision du RUN était figée depuis le premier jour et
    // n'avait aucun consommateur. Une lecture en échec rend `null` — on ne
    // construit pas un avertissement sur une comparaison impossible.
    const current = await this.esnProfile?.getProfileVersions(user.userId).catch(() => null)
    return { ...provenance, currentEsnProfileVersion: current?.esnProfileVersion ?? null }
  }

  /**
   * Cost transparency per account (Drive backlog #12, Matteo gap-analysis : « pas
   * assez de visibilité sur les coûts réels des requêtes/APIs »). Surfaces the
   * ALREADY-tracked run cost so the commercial can pilot spend — nothing invented,
   * every figure reads a stored column (``accounts.api_cost_euros`` +
   * ``analysis_runs.cost_eur``). Workspace-scoped like ``:id/runs``: the account
   * membership is verified first, so an account outside the caller's workspace
   * yields a 404 (never leaks another team's spend).
   */
  @Get(':id/cost')
  async getCost(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<AccountCostSummary> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = unwrap(
      await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope),
      throwAccountFailure,
    )
    const runs = await this.analysisRuns.costSummaryForAccount(account.id)
    // ``api_cost_euros`` is a Postgres numeric (arrives as a string) — coerce, and
    // keep null for legacy rows that never stored a cost rather than inventing 0.
    const apiCost = account.api_cost_euros === null ? null : Number(account.api_cost_euros)
    return {
      account_id: account.id,
      api_cost_euros: apiCost !== null && Number.isFinite(apiCost) ? apiCost : null,
      analyses_count: runs.analysesCount,
      total_run_cost_euros: runs.totalCostUsd,
      last_run_cost_euros: runs.lastRunCostUsd,
    }
  }

  /**
   * Paginated slice of ``raw_analysis.branches`` so the web map / table can
   * render large Pappers branch lists (Capgemini ≈ 1180 rows) without
   * loading them all at once. ``offset`` + ``limit`` are query-string
   * integers, both bounded so a misbehaving client can't request a 100k
   * window.
   */
  @Get(':id/branches')
  async listBranches(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('offset') offsetRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const offset = Math.max(0, Number.parseInt(offsetRaw ?? '0', 10) || 0)
    const limit = Math.min(50, Math.max(1, Number.parseInt(limitRaw ?? '10', 10) || 10))
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // R15N-16 — la porte de périmètre : les établissements SONT le dossier du
    // compte, séparés de lui seulement pour ne pas les charger d'un coup.
    await this.assertAccountInScope(id, workspaceId, user.userId)
    return unwrap(
      await this.accountsService.getBranchesForWorkspace(id, workspaceId, offset, limit),
      throwAccountFailure,
    )
  }

  @Post()
  @RequirePermission('records:write')
  async create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateAccountDto) {
    return unwrap(await this.accountsService.create(user.userId, dto), throwAccountFailure)
  }

  /**
   * « Ajouter à mon portefeuille » depuis Découvrir (décision produit D6) — le
   * geste qui ATTRIBUE vraiment le compte à son commercial. Aucun crédit :
   * explorer et mettre de côté restent gratuits, seule l'analyse consomme.
   *
   * Déclaré AVANT les routes `:id/…` : `portfolio` n'est pas un identifiant de
   * compte, et une route paramétrée déclarée d'abord l'avalerait.
   */
  @Post('portfolio')
  @RequirePermission('records:write')
  async addToPortfolio(@Body() body: unknown, @CurrentUser() user: CurrentUserPayload) {
    const input = addToPortfolioSchema.parse(body)
    const { account, created } = unwrap(
      await this.accountsService.addToPortfolio(user.userId, input),
      throwAccountFailure,
    )
    return { id: account.id, company_name: account.company_name, siren: account.siren, created }
  }

  /** Retirer un compte de son portefeuille, par le SIREN du candidat Découvrir. */
  @Delete('portfolio/:siren')
  @RequirePermission('records:write')
  async removeFromPortfolio(@Param('siren') siren: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.accountsService.removeFromPortfolio(user.userId, siren), throwAccountFailure)
  }

  @Post(':id/share')
  @RequirePermission('data:export')
  async createShareLink(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: CurrentUserPayload) {
    // Verify the account is visible to the caller's workspace before minting a
    // slug (Phase 2: team-scoped); reuses the same not_found / forbidden
    // semantics as the rest of the controller. `user.userId` still stamps the
    // share as created-by.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = unwrap(
      await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope),
      throwAccountFailure,
    )
    // #2914 (#2128.11) — `section` absente/vide dans le corps = 'full', le
    // comportement historique de ce endpoint.
    const { section } = createAccountShareRequestSchema.parse(body ?? {})
    return this.shareService.mintShareLink(account.id, user.userId, account.company_name, section)
  }

  /**
   * « Rattacher ce dossier à un autre » (#1111) — ce que le geste FERA.
   *
   * Un GET, parce qu'il n'écrit rien : la prévisualisation est la même fonction
   * pure que l'écriture applique, donc les deux ne peuvent pas diverger.
   */
  @Get(':id/absorb/preview')
  @RequirePermission('records:write')
  async previewAbsorb(@Param('id') id: string, @Query('into') into: string, @CurrentUser() user: CurrentUserPayload) {
    // R15N-16 — la porte de périmètre : l'aperçu RÉVÈLE le contenu des deux
    // dossiers (contacts déplacés, statut restauré). C'est une lecture.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    await this.assertAccountInScope(into, workspaceId, user.userId)
    return unwrap(await this.accountsService.previewAbsorb(id, into, user.userId), throwAccountFailure)
  }

  /**
   * Rattacher ce dossier en double à celui qu'on garde (#1111).
   *
   * Rien n'est supprimé : le dossier devient une entité du compte gardé, ses
   * contacts le rejoignent, et lui-même est ARCHIVÉ avec un pointeur vers son
   * nouveau parent. Tout le reste reste sur le dossier archivé, qui demeure
   * lisible — et l'écran le dit AVANT le clic.
   */
  @Post(':id/absorb')
  @RequirePermission('records:write')
  async absorb(@Param('id') id: string, @Body() body: AbsorbAccountDto, @CurrentUser() user: CurrentUserPayload) {
    // #2084.24 — le cloisonnement vaut aussi en écriture. L'aperçu juste
    // au-dessus vérifiait DEUX comptes ; l'écriture qu'il annonce n'en
    // vérifiait aucun. ⚠️ Les deux bouts, et pas seulement la source :
    // rattacher à son propre dossier un dossier d'une autre unité revient à se
    // l'offrir, puis à le voir légitimement.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    await this.assertAccountInScope(body.into, workspaceId, user.userId)
    return unwrap(await this.accountsService.absorbAccount(id, body.into, user.userId), throwAccountFailure)
  }

  /**
   * #2634.1 — « Ajouter un signal depuis LinkedIn », l'appelant qui manquait à
   * `AccountsService.declareSignals` (posé le 22/09/2026, jamais exposé).
   * JAMAIS de scraping : le serveur ne contacte jamais LinkedIn — l'écran
   * reçoit une URL et/ou le texte qu'un commercial a lui-même copié, ou un
   * export qu'il possède déjà (doctrine `c79_collecte_large_mais_propre`,
   * « les données que le client branche lui-même »).
   */
  @Post(':id/signals/declare')
  @RequirePermission('records:write')
  async declareSignals(
    @Param('id') id: string,
    @Body() body: DeclareSignalsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    return unwrap(await this.accountsService.declareSignals(id, workspaceId, user.userId, body), throwAccountFailure)
  }

  /**
   * Les dossiers du MÊME GROUPE que celui-ci (#1111) — les deux sens du lien.
   *
   * Raison d'être : `merged_into_id` était écrite et jamais relue. Un dossier
   * archivé par un rattachement n'avait donc aucune explication à l'écran, et
   * le dossier gardé ne disait pas ce qui lui avait été rattaché.
   *
   * Aucune permission d'écriture exigée, comme les autres lectures de ce
   * contrôleur : voir de quel groupe un dossier fait partie n'écrit rien. Le
   * cloisonnement tient au `user_id` de `findOne`, qui filtre les DEUX bouts —
   * un lien ne peut donc pas traverser deux espaces.
   */
  // Lire les dossiers rattachés révèle l'existence et le nom d'autres comptes de
  // l'espace : c'est une lecture de données de compte, gardée comme telle.
  @Get(':id/links')
  @RequirePermission('records:write')
  async links(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    // R15N-16 — la porte de périmètre, et #4786 : le périmètre DESCEND dans la
    // lecture elle-même. La porte seule laissait la cible de « fusionné dans »
    // et la liste des rattachés hors cloisonnement, parce que le service lisait
    // sans clause BU — une agence y nommait les comptes d'une autre.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    return unwrap(await this.accountsService.getAccountLinks(id, workspaceId, businessUnitScope), throwAccountFailure)
  }

  /**
   * #4158 EX-03 (.60/.61/.62) — les autres ENTITÉS du groupe, une fiche chacune,
   * avec leur responsable, leurs notes et leurs actions. Le compte ouvert passe la
   * porte de périmètre, puis chaque entité listée est filtrée par la même clause BU :
   * la vue groupe ne montre rien au-delà des droits du lecteur.
   */
  @Get(':id/group-entities')
  @RequirePermission('records:write')
  async groupEntities(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
    return this.accountsService.getGroupEntities(id, workspaceId, businessUnitScope)
  }

  /**
   * « Détacher ce dossier » (#1111) — ce que le geste FERA.
   *
   * Un GET, parce qu'il n'écrit rien : même fonction pure que l'écriture
   * applique, donc les deux ne peuvent pas diverger.
   */
  // L'aperçu d'une ÉCRITURE exige la permission de cette écriture : il révèle le
  // statut qui serait restauré et les contacts qui reviendraient. Quelqu'un qui
  // ne peut pas détacher n'a pas à savoir ce que détacher ferait.
  //
  // ⚠️ Ne jamais écrire un décorateur de route en toutes lettres dans un
  // commentaire de ce fichier : la garde GA-05 les compte par expression
  // régulière, et en trouverait une route de plus, sans permission. Le dépôt a
  // déjà payé ce défaut — GA-19 comptait ses propres commentaires.
  @Get(':id/detach/preview')
  @RequirePermission('records:write')
  @RequirePermission('records:write')
  async previewDetach(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    // R15N-16 — la porte de périmètre : l'aperçu RÉVÈLE le statut restauré et
    // les contacts qui reviendraient. C'est une lecture.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    return unwrap(await this.accountsService.previewDetach(id, user.userId), throwAccountFailure)
  }

  /**
   * Détacher ce dossier de celui auquel il avait été rattaché (#1111).
   *
   * C'est ce qui rend le rattachement RÉVERSIBLE : le dossier retrouve le
   * statut qu'il avait — celui qui a été enregistré, jamais un statut choisi —,
   * ses contacts reviennent, et le lien disparaît.
   */
  @Post(':id/detach')
  @RequirePermission('records:write')
  async detach(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    // #2084.24 — le cloisonnement vaut aussi en écriture.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    return unwrap(await this.accountsService.detachAccount(id, user.userId), throwAccountFailure)
  }

  /**
   * Théo A comptes-fiche-reference.A2 — « Créer une copie de travail » d'un dossier
   * de référence : l'archive reste figée, la copie s'actualise. Idempotent.
   */
  @Post(':id/working-copy')
  @RequirePermission('records:write')
  async createWorkingCopy(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    // #2084.24 — le cloisonnement vaut aussi en écriture.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    return unwrap(await this.accountsService.createWorkingCopy(id, user.userId), throwAccountFailure)
  }

  @Post(':id/archive')
  @RequirePermission('records:write')
  async archive(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    // #2084.24 — le cloisonnement vaut aussi en écriture. Archiver fait
    // disparaître un dossier du portefeuille de TOUTE son unité, pas seulement
    // de l'écran de celui qui clique.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    return unwrap(await this.accountsService.archive(id, user.userId), throwAccountFailure)
  }

  /**
   * Tri commercial manuel (Théo p.39) — déplace un compte entre
   * À qualifier / En observation / À potentiel / En cours d'ouverture /
   * Client actif / Hors priorité / En veille. Scoped `user_id`.
   * Vérifie d'abord l'appartenance au workspace du caller (404 sinon).
   *
   * #2117.21 — c'est LE chemin humain : la requête porte le jeton d'un
   * commercial qui vient de cliquer, donc `origin: 'human'`. Aucun autre
   * appelant du service ne le passe, et le défaut du service refuse
   * « En veille » — c'est ce qui rend la règle vraie, pas une convention.
   */
  @Patch(':id/commercial-status')
  @RequirePermission('records:write')
  async setCommercialStatus(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SetCommercialStatusDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
    await this.accountsService.setCommercialStatus(id, user.userId, dto.status, dto.reason, 'human')
    return { id, commercial_status: dto.status }
  }

  /**
   * #2165.13 — marquer/démarquer ce compte comme la meilleure référence.
   * Geste HUMAIN, auto-approuvé (le clic EST la décision, doctrine CLAUDE.md
   * sur les écritures CRM) : pas de porte à ouvrir pour un simple marqueur.
   */
  @Patch(':id/best-reference')
  @RequirePermission('records:write')
  async setBestReference(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SetBestReferenceDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
    await this.accountsService.setBestReference(id, workspaceId, dto.value)
    return { id, is_best_reference: dto.value }
  }

  /**
   * #3245 (#3209.6) — déclarer le profil de pari d'un compte (horizon, taille,
   * accès, ressource). Geste HUMAIN, auto-approuvé : le clic EST la
   * déclaration, exactement comme `best-reference`. Un champ `null` retire la
   * déclaration.
   */
  @Get(':id/bet-profile')
  @RequirePermission('records:write')
  async getBetProfile(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
    return this.accountsService.getBetProfile(id, workspaceId)
  }

  @Patch(':id/bet-profile')
  @RequirePermission('records:write')
  async setBetProfile(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body() dto: SetBetProfileDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
    await this.accountsService.setBetProfile(id, workspaceId, dto)
    return { id, ...dto }
  }

  /**
   * #3282 / #3263.30 — le niveau d'entrée du comité d'achat, saisi par le
   * commercial dans une liste fermée. Geste HUMAIN auto-approuvé (le choix EST
   * la déclaration). « Trop haut » se calcule côté écran sur cette valeur.
   */
  @Get(':id/committee-entry-level')
  @WorkspaceRead()
  async getCommitteeEntryLevel(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
    return this.accountsService.getCommitteeEntryLevel(id, workspaceId)
  }

  @Patch(':id/committee-entry-level')
  @RequirePermission('records:write')
  async setCommitteeEntryLevel(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SetCommitteeEntryLevelDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
    await this.accountsService.setCommitteeEntryLevel(id, workspaceId, dto)
    return { id, level: dto.level }
  }

  /**
   * Mémoire de relation — bloc « Mémoire » de la couche zéro (annexe méthodo p8).
   * Fusion present-only : un champ absent n'écrase rien. Scopé workspace en
   * lecture (404 hors scope), écrit sous l'attribution created-by.
   */
  @Patch(':id/relationship-memory')
  @RequirePermission('records:write')
  async setRelationshipMemory(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateRelationshipMemoryDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
    const memory = await this.accountsService.setRelationshipMemory(id, user.userId, dto)
    return { id, relationship_memory: memory }
  }

  /**
   * Bulk-import manually-entered contacts (CSV upload parsed client-side)
   * onto an account. Access is enforced first: ``findOneForWorkspace`` returns a
   * ``not_found`` failure — surfaced as 404 — for any account outside the
   * caller's workspace, so a user can never inject contacts into another team's
   * row (Phase 2: team-scoped visibility). ``user.userId`` stays as created-by on
   * the imported contacts.
   */
  @Post(':id/contacts/bulk')
  @RequirePermission('records:write')
  async importContacts(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: BulkImportContactsDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
    return this.contactsService.bulkImportManual(id, user.userId, dto.contacts)
  }

  /**
   * #1995 — CRÉER LA FICHE D'UNE PERSONNE QUE SEUL LE CRM CONNECTÉ CONNAÎT.
   *
   * Laura la nomme (« déjà dans votre CRM, fiche Bellum absente ») et propose
   * une carte ; le CLIC de l'utilisateur appelle cette route — « une écriture
   * passe par une porte : geste d'utilisateur = auto-approuvé, le clic EST la
   * décision ». Aucun chemin d'écriture n'existe côté copilote : l'outil ne
   * fait que PRÉPARER la proposition.
   *
   * Même garde d'accès que l'import en masse juste au-dessus :
   * `findOneForWorkspace` rend `not_found` — donc 404 — pour un compte hors de
   * l'espace du caller, avant toute écriture.
   *
   * Trois issues rendues telles quelles (`created` / `duplicate` /
   * `ambiguous`) : une ambiguïté n'est pas une erreur serveur, c'est un fait
   * que l'écran doit pouvoir dire.
   */
  @Post(':id/contacts/from-crm')
  @RequirePermission('records:write')
  async createContactFromCrm(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateContactFromCrmDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
    // #2861 (#2437.2, niveau ESPACE) — la langue du marché sert de défaut à
    // la langue du contact créé. `@Optional()` : sans le service, `undefined`
    // traverse tel quel et `createFromCrmPresence` garde son comportement
    // d'avant (`locale: null`).
    const defaultLocale = (await this.workspaceMarket?.resolveForWorkspace(workspaceId))?.defaultLocale
    return this.contactsService.createFromCrmPresence(id, user.userId, dto, defaultLocale)
  }

  /**
   * Import d'un fichier de prospection exporté par l'utilisateur (décision Louis
   * du 03/08 : PAS de scraping — l'utilisateur exporte depuis sa propre session,
   * Bellum lit le fichier).
   *
   * Deux temps, délibérément. `dryRun` lit le fichier et rend ce qu'on a
   * compris : colonnes reconnues, colonnes IGNORÉES (jamais devinées), lignes
   * écartées avec leur raison, doublons repérés. L'utilisateur voit cela AVANT
   * que quoi que ce soit ne soit écrit — un import qui commence par écrire ne
   * laisse aucune place au « ah non, ce n'est pas la bonne colonne ».
   */
  @Post(':id/contacts/import-csv')
  @RequirePermission('records:write')
  async importContactsCsv(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ImportContactsCsvDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)

    const preview = parseContactCsv(dto.content)
    if (dto.dryRun) return { preview, imported: null }

    const imported = await this.contactsService.bulkImportManual(
      id,
      user.userId,
      preview.contacts.map(contact => ({
        full_name: contact.fullName,
        title: contact.title ?? undefined,
        email: contact.email ?? undefined,
        linkedin_url: contact.linkedinUrl ?? undefined,
        entity: contact.companyName ?? undefined,
      })),
    )
    return { preview, imported }
  }

  /**
   * "Ingestion liste perso" (Drive backlog #10) — deterministically classify a
   * pasted/imported contact list into the family / decision-level taxonomy, score
   * each row 1-5, and flag (never drop) low-value rows so the rep can review before
   * importing. Ownership is enforced first (``findOneForWorkspace`` → 404 for any
   * account outside the caller's workspace) exactly like ``importContacts``. No DB
   * write, no LLM call — pure heuristic on the job title.
   */
  @Post(':id/contacts/classify')
  async classifyContacts(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ClassifyContactsDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    unwrap(await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope), throwAccountFailure)
    return this.contactsService.classifyImportedContacts(dto.contacts, await this.sellerDomain(user.userId))
  }

  /**
   * Le domaine d'offre DOMINANT de l'espace, ou `null`.
   *
   * Un profil illisible ne fait pas échouer un classement : on retombe sur le
   * périmètre historique, qui est celui de tous les espaces existants. Refuser
   * de classer parce qu'un profil est abîmé serait échanger un mauvais motif
   * d'exclusion contre une erreur franche, ce qui est pire.
   */
  private async sellerDomain(userId: string): Promise<OfferDomain | null> {
    if (!this.esnProfile) return null
    try {
      return (await this.esnProfile.resolveProfileData(userId)).offerDomain ?? null
    } catch {
      return null
    }
  }

  /**
   * #2871 (#2395.1/.5/.11) — LE PLAN DU COMPTE, AU CONTRAT CANONIQUE.
   *
   * Projection en LECTURE SEULE : les étapes du plan GÉNÉRÉ (`raw_analysis`)
   * deviennent des `Action` proposées, les lignes `action_plan_items` déjà
   * persistées passent par leur adaptateur, et une étape actée gagne sur sa
   * projection — les MÊMES adaptateurs que `GET /action-os/actions`
   * (`projectAccountPlanActions`, GA-26). Rien n'est écrit : la lecture des
   * lignes ne sème pas (`listPersistedForAccount`), aucune ligne n'est créée
   * pour une étape sans geste.
   *
   * Ouvre un compte par son id : espace ET périmètre BU (GA-333/GA-335/GA-336),
   * « introuvable » hors périmètre. Les lignes illisibles sont NOMMÉES dans
   * `unavailable` plutôt qu'un plan amputé rendu comme complet.
   */
  // Lecture bornée à l'espace ET au périmètre résolus server-side, rien d'écrit (GA-05).
  @Get(':id/actions')
  @WorkspaceRead()
  async listCanonicalActions(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ListCanonicalActionsResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    const account = unwrap(
      await this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope),
      throwAccountFailure,
    )
    if (!this.planItems) throw new ServiceUnavailableException('plan_items_unavailable')
    const unavailable: ListCanonicalActionsResponse['unavailable'] = []
    const [lastAnalyzedAt, persisted] = await Promise.all([
      this.accountsService.resolveLastAnalyzedAt(account.id),
      this.planItems.listPersistedForAccount(user.userId, account.id).catch((err: unknown) => {
        this.logger.warn('account canonical actions: plan items unreadable', {
          accountId: account.id,
          error: err instanceof Error ? err.message : String(err),
        })
        unavailable.push('plan_item')
        return []
      }),
    ])
    const actions = projectAccountPlanActions({
      context: {
        workspaceId,
        accountId: account.id,
        accountName: account.company_name?.trim() || null,
        // La version du plan : la date qui l'a PRODUIT (celle que la fiche
        // affiche). Un compte jamais analysé n'a pas de plan généré à dater ;
        // sa création borne alors l'instant, sans en inventer un autre.
        analysisVersion: lastAnalyzedAt ?? new Date(account.created_at).toISOString(),
      },
      weeks: generatedPlanWeeks((account.raw_analysis as unknown as Record<string, unknown> | null) ?? {}),
      persisted,
    })
    return { actions, unavailable }
  }

  // #2123.46 — alias déprécié le 17/09, à retirer après la vague 25.
  // Le web (Vercel) et l'API (Railway) ne basculent pas au même instant, et un
  // onglet ouvert garde l'ancien bundle : sans cette route, « Ajouter au plan »
  // y rendrait une 404. Elle n'écrit plus `raw_analysis.user_plan_actions` :
  // elle traduit l'ancien corps et appelle la MÊME porte que `POST /plan-items`
  // (`ActionPlanItemsService.createFromPlan`) — une seule écriture (GA-26).
  @Post(':id/plan/actions')
  @RequirePermission('records:write')
  async addPlanAction(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body() dto: AddPlanActionDto) {
    // #2084.24 — le cloisonnement vaut aussi en écriture. ⚠️ La porte passe
    // AVANT le 503 : un service absent ne doit pas être le seul rempart, et
    // « indisponible » ne doit pas devenir l'aveu qu'un compte existe.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    if (!this.planItems) throw new ServiceUnavailableException('plan_items_unavailable')
    return this.planItems.createFromLegacyPlanAction(user.userId, id, dto)
  }

  @Post(':id/plan/angles')
  @RequirePermission('records:write')
  async addAttackAngle(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AddAttackAngleDto,
  ) {
    // #2084.24 — le cloisonnement vaut aussi en écriture.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    const result = await this.accountsService.appendUserAttackAngle(id, user.userId, dto)
    if (!result) throw new NotFoundException('Account not found')
    return result
  }

  @Delete(':id')
  @RequirePermission('records:write')
  async delete(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    // #2084.24 — le cloisonnement vaut aussi en écriture. ⚠️ La porte passe
    // AVANT l'annulation ci-dessous : placée après, un membre cloisonné
    // couperait l'analyse en vol d'un compte d'une autre unité sans jamais
    // rien supprimer — une nuisance pleinement efficace, et invisible.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInScope(id, workspaceId, user.userId)
    // Cancel any in-flight analysis BEFORE soft-deleting the row, so the
    // worker doesn't keep burning Claude/Firecrawl credits writing to an
    // account that should disappear from the user-visible portfolio.
    //
    // #2704.9 — le périmètre qui vient de valider le compte doit AUSSI border
    // cette annulation. Sans lui, `cancel()` retombe sur son repli
    // « propriétaire seul » et rate le run d'un coéquipier cloisonné sur la
    // même unité : le compte disparaît, son analyse continue d'écrire dans le
    // vide. Trou pré-existant relevé en marge du correctif espace de #2704.
    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)
    await this.analysisService.cancel(id, user.userId, { workspaceId, businessUnitScope })
    return unwrap(await this.accountsService.delete(id, user.userId), throwAccountFailure)
  }
}
