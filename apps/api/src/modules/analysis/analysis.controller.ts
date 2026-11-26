import { WorkspaceLauraModeService } from '../workspace/workspace-laura-mode.service'
import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import { analysisEntityAnswerSchema, type AnalysisVocabularyTerm } from '@bellum/contracts'
import { isFailure, unwrap } from '@bellum/utils'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { AccountsService } from '../accounts/accounts.service'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AccountVocabularyService } from './account-vocabulary.service'
import { AnalysisRunsService } from './analysis-runs.service'
import { AnalysisHistoryQueryDto } from './dto/analysis-history-query.dto'
import { ReplanService } from './replan.service'
import { AnalysisOnDemandService, type OnDemandFailure } from './analysis-ondemand.service'
import { AnalysisRefreshService, type RefreshFailure } from './analysis-refresh.service'
import { AnalysisService, type AnalysisAccountScope, type AnalysisFailure } from './analysis.service'
import { OrgEnrichmentPlannerService, type OrgEnrichmentFailure } from './org-enrichment-planner.service'
import { StartAnalysisDto } from './dto/start-analysis.dto'
import { LaunchPlanQueryDto } from './dto/launch-plan-query.dto'
import { EnrichContactsDto } from './dto/enrich-contacts.dto'
import {
  DeclareOrgPeopleDto,
  ProposeOrgPeopleFromFileDto,
  ProposeOrgPeopleFromTextDto,
  UndeclareOrgPersonDto,
} from './dto/declare-org-people.dto'
import { VerifyRelationDto } from './dto/verify-relation.dto'
import { RefreshAnalysisDto } from './dto/refresh-analysis.dto'
import { DeepenQuoteDto } from './dto/deepen-quote.dto'
import { AnalysisDeepenService } from './analysis-deepen.service'
import { CreditsService } from '../credits/credits.service'
import type { AccountEntity } from '../../database/entities/account.entity'
import { ReplanDto } from './dto/replan.dto'
import { OrgEnrichmentPlanDto, OrgEnrichmentConfirmDto } from './dto/org-enrichment-plan.dto'
import { OrgEnrichNextDto, OrgEnrichEntityDto, OrgEnrichGapsDto } from './dto/org-enrich-job.dto'
import { OrgEnrichmentJobService } from './org-enrichment-job.service'
import { OrgFreshnessService } from './org-freshness.service'
import { OrgFocusWeightsService } from './org-focus-weights.service'
import { OrgFocusWeightsDto } from './dto/org-focus-weights.dto'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'

function throwAnalysisFailure(problem: AnalysisFailure): never {
  const { code, message } = problem
  switch (code) {
    case 'not_found':
      throw new NotFoundException(message)
    case 'create_failed':
      throw new InternalServerErrorException(message)
    case 'quota_exceeded':
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
    case 'demo_workspace':
      // 403 — a demo workspace may not launch REAL analyses (demo mode C1); the
      // message tells the user to open one of the seeded demo dossiers instead.
      throw new HttpException(message, HttpStatus.FORBIDDEN)
    case 'identity_mismatch':
      // 409 — GA-96. La demande est cohérente en soi mais elle CONTREDIT l'état
      // du dossier : on ne peut pas à la fois rafraîchir ce dossier-ci et
      // l'ancrer sur une autre société. C'est un conflit, pas une panne (500)
      // ni une saisie invalide (400) — le message nomme les deux identités et
      // rien n'a été débité.
      throw new HttpException(message, HttpStatus.CONFLICT)
    case 'not_cancellable':
      // 409 — audit H1 : l'état du dossier contredit la demande d'annulation.
      throw new HttpException(message, HttpStatus.CONFLICT)
    case 'no_entity_question':
      // 409 — #2164.17 : le run n'attend plus de réponse (repris ou terminé).
      throw new HttpException(message, HttpStatus.CONFLICT)
    case 'invalid_entity_answer':
      // 400 — #2164.17 : un SIREN hors des candidats posés.
      throw new BadRequestException(message)
    case 'budget_exceeded':
      // 402 — #2975, la porte de coût par espace a refusé AVANT tout débit.
      // Même statut que `insufficient_credits` (contacts) : le message NOMME
      // déjà la limite dépassée (`WorkspaceBudgetService.checkGate`).
      throw new HttpException(message, HttpStatus.PAYMENT_REQUIRED)
    default: {
      const _exhaustive: never = code
      throw new InternalServerErrorException(`Unknown analysis failure code: ${String(_exhaustive)}`)
    }
  }
}

function throwOnDemandFailure(problem: OnDemandFailure): never {
  const { code, message } = problem
  switch (code) {
    case 'not_found':
      throw new NotFoundException(message)
    case 'ia_failed':
      throw new BadGatewayException(message)
    case 'precondition_failed':
      throw new ConflictException(message)
    default: {
      const _exhaustive: never = code
      throw new InternalServerErrorException(`Unknown on-demand failure code: ${String(_exhaustive)}`)
    }
  }
}

function throwOrgEnrichmentFailure(problem: OrgEnrichmentFailure): never {
  const { code, message } = problem
  switch (code) {
    case 'not_found':
      throw new NotFoundException(message)
    case 'invalid_params':
      // 400 — le mode demande un paramètre absent (l'entité de « Cette
      // direction », le niveau de « Niveau hiérarchique») : une saisie
      // incomplète, pas un compte introuvable ni une panne.
      throw new HttpException(message, HttpStatus.BAD_REQUEST)
    case 'insufficient_credits':
      // 402 — même code que les autres refus « plus de crédits » du produit.
      throw new HttpException(message, HttpStatus.PAYMENT_REQUIRED)
    case 'ia_failed':
      throw new BadGatewayException(message)
    default: {
      const _exhaustive: never = code
      throw new InternalServerErrorException(`Unknown org-enrichment failure code: ${String(_exhaustive)}`)
    }
  }
}

function throwRefreshFailure(problem: RefreshFailure): never {
  const { code, message } = problem
  switch (code) {
    case 'not_found':
      throw new NotFoundException(message)
    case 'ia_failed':
      throw new BadGatewayException(message)
    case 'precondition_failed':
      throw new ConflictException(message)
    case 'refreshed_recently':
      // 409 et non 429 : ce n'est pas un débit trop rapide, c'est un état — cet
      // axe est DÉJÀ à jour. Un 429 ferait réessayer, ce qui est exactement ce
      // qu'on veut éviter.
      throw new ConflictException(message)
    case 'insufficient_credits':
      // 402 Payment Required — same code the single-contact enrichment uses for
      // "out of enrichment credits"; the web hook keys the upsell toast off it.
      throw new HttpException(message, HttpStatus.PAYMENT_REQUIRED)
    default: {
      const _exhaustive: never = code
      throw new InternalServerErrorException(`Unknown refresh failure code: ${String(_exhaustive)}`)
    }
  }
}

@Controller('analysis')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AnalysisController {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly onDemandService: AnalysisOnDemandService,
    private readonly refreshService: AnalysisRefreshService,
    private readonly accountsService: AccountsService,
    private readonly vocabularyService: AccountVocabularyService,
    // Phase 2: resolves the caller's active workspace so the vocabulary read is
    // scoped by `workspace_id` (the team's accounts) rather than `user_id`.
    private readonly workspaceContext: WorkspaceContextService,
    // #1092 : la mise en file de la re-planification. Le service métier
    // (`onDemandService.replan`) reste le seul chemin de calcul — le worker
    // l'appelle tel quel.
    private readonly replanJobs: ReplanService,
    // Planificateur d'enrichissement de l'organigramme (§11 FINAL, P1) : le
    // coût annoncé avant confirmation, les cinq modes de ciblage.
    private readonly orgEnrichmentPlanner: OrgEnrichmentPlannerService,
    private readonly orgEnrichmentJobs: OrgEnrichmentJobService,
    private readonly orgFreshnessService: OrgFreshnessService,
    private readonly orgFocus: OrgFocusWeightsService,
    /**
     * LE CLOISONNEMENT DE PÉRIMÈTRE (BU / agence) — revue sécurité 15/09/2026.
     *
     * `@Optional()` et en DERNIÈRE position : des specs construisent ce
     * contrôleur POSITIONNELLEMENT, et un paramètre requis ajouté au milieu les
     * casserait toutes. ⚠️ Optionnel pour le CONSTRUCTEUR, jamais pour la
     * RÈGLE : absent, `resolveBusinessUnitScope` LÈVE au lieu de servir tout
     * l'espace.
     */
    @Optional() private readonly businessUnits?: BusinessUnitService,
    /**
     * #2452 — le devis d'un approfondissement depuis /chat, et le solde qu'il
     * compare. `@Optional()` et en DERNIÈRE position pour la même raison que
     * `businessUnits` ; absents, la route répond 503 au lieu d'un devis vide
     * qui se lirait « rien à payer » (voir `deepenQuote`).
     */
    @Optional() private readonly deepenService?: AnalysisDeepenService,
    @Optional() private readonly credits?: CreditsService,
    // #2451.1 — le mode de contexte par défaut de l'espace, résolu ICI (le
    // geste utilisateur s'orchestre au contrôleur, GA-07). Optionnel, EN FIN.
    @Optional() private readonly lauraMode?: WorkspaceLauraModeService,
    // Théo B r2-mes-analyses — l'historique des analyses de l'espace. Optionnel, EN FIN (specs positionnelles).
    @Optional() private readonly analysisRuns?: AnalysisRunsService,
  ) {}

  @Post('start')
  @RequirePermission('analysis:run')
  async start(@Body() dto: StartAnalysisDto, @CurrentUser() user: CurrentUserPayload) {
    // #2451.1 — lu seulement quand le lancement ne porte aucun mode.
    const workspaceDefaultMode = dto.context_mode ? undefined : await this.lauraMode?.resolveForUser(user.userId)
    return unwrap(await this.analysisService.start(dto, user.userId, { workspaceDefaultMode }), throwAnalysisFailure)
  }

  /**
   * #2704 — LE PÉRIMÈTRE D'UN COMPTE, résolu au BORD, comme partout ailleurs
   * dans ce contrôleur (`listVocabulary`) et dans `AccountsController`.
   *
   * C'est le seul endroit où l'on décide « de quel espace parle cet appelant »
   * pour les trois gestes qui portent une analyse en vol (statut, reprise,
   * annulation). Le service le REÇOIT : il n'a pas à inventer un second modèle
   * de droits, et `resolveBusinessUnitScope` LÈVE plutôt que d'ouvrir l'espace
   * entier si le service d'unités n'est pas câblé (fail-closed).
   */
  private async accountScope(userId: string): Promise<AnalysisAccountScope> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return {
      workspaceId,
      businessUnitScope: await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId),
    }
  }

  /**
   * Théo B r2-mes-analyses.N1/A5 — « Mes analyses » : l'historique des analyses lancées dans l'espace.
   * `?scope=space` (défaut) = tout l'espace, `?scope=me` = les miennes. Route LITTÉRALE à un segment : jamais
   * capturée par `status/:accountId`. Le périmètre d'unité s'applique au compte de chaque run.
   */
  @Get('history')
  @RequirePermission('analysis:run')
  async history(@Query() query: AnalysisHistoryQueryDto, @CurrentUser() user: CurrentUserPayload) {
    if (!this.analysisRuns) throw new ServiceUnavailableException('analysis history unavailable')
    const scope = await this.accountScope(user.userId)
    return this.analysisRuns.listHistory({
      workspaceId: scope.workspaceId,
      viewerId: user.userId,
      scope: query.scope ?? 'space',
      businessUnitScope: scope.businessUnitScope,
      limit: query.limit,
    })
  }

  /** « Retirer cet élément de l'historique » : masque MA ligne, jamais le dossier ni le run d'un collègue. */
  @Post('history/:runId/hide')
  @RequirePermission('analysis:run')
  @HttpCode(200)
  async hideFromHistory(@Param('runId') runId: string, @CurrentUser() user: CurrentUserPayload) {
    if (!this.analysisRuns) throw new ServiceUnavailableException('analysis history unavailable')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const hidden = await this.analysisRuns.hideForUser({ runId, userId: user.userId, workspaceId })
    if (!hidden) throw new NotFoundException('Analyse introuvable dans ton historique')
    return { id: runId }
  }

  @Get('status/:accountId')
  async status(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    // #2704 — à deux dans un espace, le coéquipier qui rouvre son onglet lit le
    // MÊME run : sans ce périmètre, il recevait 404 et restait à 0 % pour
    // toujours.
    return unwrap(
      await this.analysisService.getStatus(accountId, user.userId, await this.accountScope(user.userId)),
      throwAnalysisFailure,
    )
  }

  /**
   * #1583 — ce que « Lancer » ferait MAINTENANT, sans rien lancer ni débiter :
   * démo (0 crédit), dossier récent déjà là (0 crédit, on rouvrirait), ou
   * coût canonique d'une analyse neuve. La note de coût de l'écran de
   * recherche interroge cette route avant le clic, pour ne jamais annoncer un
   * chiffre que le clic ne débiterait pas.
   *
   * Route LITTÉRALE à un segment (comme `org-focus-weights` plus bas) — ne
   * peut donc jamais être capturée par `status/:accountId`, qui en a deux.
   */
  @Get('launch-plan')
  @RequirePermission('analysis:run')
  async launchPlan(@Query() query: LaunchPlanQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.analysisService.planLaunch(
      { companyName: query.company_name, siren: query.siren, scopeMode: query.scope_mode, relaunch: query.relaunch },
      user.userId,
    )
  }

  /**
   * « Vocabulaire du groupe » (Théo P1 p.17/21) — the account's reading grid
   * persisted from the analysis (`account_vocabulary`): one row per term with
   * sens / impact commercial / source / statut de vérité. Workspace-scoped like
   * `GET /accounts/:id/runs`: the account membership is verified first, so an
   * account outside the caller's workspace yields `[]` (never leaks another
   * team's grid).
   */
  @Get(':accountId/vocabulary')
  async listVocabulary(
    @Param('accountId') accountId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AnalysisVocabularyTerm[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Le périmètre de l'appelant, comme sur la liste de comptes : le
    // vocabulaire d'un compte hors périmètre se lit comme un compte absent.
    const account = await this.accountsService.findOneForWorkspace(
      accountId,
      workspaceId,
      await resolveBusinessUnitScope(this.businessUnits, workspaceId, user.userId),
    )
    if (isFailure(account)) return []
    return this.vocabularyService.listForAccount(accountId)
  }

  /** État de la reconstruction du graphe d'organigramme lancée derrière une
   *  recherche ciblée (voir `org-rebuild.queue.ts`). Le client s'en sert pour
   *  savoir QUAND la carte d'influence a de nouveau quelque chose à montrer —
   *  sinon la reconstruction se terminerait sans que rien ne bouge à l'écran. */
  @Get(':accountId/organigram-rebuild')
  async orgRebuildState(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onDemandService.orgRebuildState(accountId, user.userId), throwOnDemandFailure)
  }

  /** Re-run Phase 2 (contact discovery) for an account. Synchronous: blocks
   *  until the IA service responds. Used by the "Enrichir contacts" button. */
  @Post(':accountId/enrich-contacts')
  @RequirePermission('contacts:enrich')
  async enrichContacts(
    @Param('accountId') accountId: string,
    @Body() dto: EnrichContactsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return unwrap(await this.onDemandService.enrichContacts(accountId, user.userId, dto.scope), throwOnDemandFailure)
  }

  /**
   * Re-run ONLY Phase 4 (plan) with a "change strategy" override — a different
   * angle / entry mode / entity — reusing the stored research + contacts (Théo
   * Palier-2 §3).
   *
   * REND LA MAIN (202) — le calcul dure une à deux minutes, et la passerelle qui
   * sert l'application coupe à 120 s. Mesuré en production le 26/08 : un
   * `502 ROUTER_EXTERNAL_TARGET_ERROR` à 120 176 ms sur un calcul qui avait
   * abouti et enregistré son plan (#1092). Le client suit `GET :id/replan`.
   *
   * Les refus connus d'avance (espace de démonstration, compte inconnu, analyse
   * pas terminée) restent SYNCHRONES : rien à attendre pour les apprendre.
   */
  @Post(':accountId/replan')
  @RequirePermission('analysis:run')
  @HttpCode(HttpStatus.ACCEPTED)
  async replan(@Param('accountId') accountId: string, @Body() dto: ReplanDto, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.replanJobs.enqueue(accountId, user.userId, dto.strategy), throwOnDemandFailure)
  }

  /**
   * État de la re-planification en cours sur ce compte (`queued` / `running` /
   * `done` / `unknown`).
   *
   * `unknown` = plus aucune trace du job. Ce n'est PAS un échec : le plan a
   * peut-être été enregistré, et l'écran doit inviter à REGARDER plutôt qu'à
   * relancer — relancer repaie un calcul peut-être déjà fait.
   */
  @Get(':accountId/replan')
  @RequirePermission('analysis:run')
  async replanStatus(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.replanJobs.status(accountId, user.userId), throwOnDemandFailure)
  }

  /** « Générer un angle d'attaque à la demande » (Théo TF1 p31). Relance la
   *  stratégie (phase 1) et ACCUMULE l'angle recommandé le plus frais dans la
   *  liste d'angles du dossier — sans écraser les précédents. Synchrone, comme
   *  les autres boutons à la demande ; aucun débit de crédit. */
  @Post(':accountId/generate-angle')
  @RequirePermission('analysis:run')
  async generateAngle(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onDemandService.generateAttackAngle(accountId, user.userId), throwOnDemandFailure)
  }

  /**
   * #2298.4 (19/09/2026, lot I3) — « Recalculer la relation (gratuit) », le
   * bouton du bandeau « à revérifier » de l'onglet Accès
   * (`SegmentStaleCollectionNotice`, dimension `access_relation`). Synchrone,
   * comme les autres boutons à la demande ; ZÉRO débit de crédit, ZÉRO appel
   * sortant — voir le docblock de
   * `AnalysisOnDemandService.recalculateRelationAxis`.
   */
  @Post(':accountId/addressability/relation/recalculate')
  @RequirePermission('analysis:run')
  async recalculateRelationAxis(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onDemandService.recalculateRelationAxis(accountId, user.userId), throwOnDemandFailure)
  }

  /** Re-run Phase 3 (organigram + contact enrichment) over the existing
   *  contacts of an account. Used by the "Enrichir organigramme" button. */
  @Post(':accountId/enrich-organigram')
  @RequirePermission('contacts:enrich')
  async enrichOrganigram(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onDemandService.enrichOrganigram(accountId, user.userId), throwOnDemandFailure)
  }

  /** « Recalculer le chemin » (annexe organigramme §6) — réordonne la séquence
   *  d'approche depuis le graphe déjà stocké. Aucun appel IA, aucun crédit :
   *  c'est un recalcul déterministe, pas une recherche. 412 quand il n'y a rien
   *  d'exploitable à réordonner. */
  @Post(':accountId/recompute-path')
  @RequirePermission('analysis:run')
  async recomputePath(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onDemandService.recomputeOrgPath(accountId, user.userId), throwOnDemandFailure)
  }

  /**
   * Déclarer des personnes qu'on connaît et que Bellum n'a pas trouvées (#1103).
   *
   * « Ici il faudrait pouvoir […] soit charger un organigramme si on en a un,
   * soit pouvoir décrire des éléments et ensuite ça intègre. »
   *
   * Trois portes d'entrée à l'écran — le formulaire, un fichier, un texte que
   * Laura structure — et UNE seule écriture : celle-ci. Aucun second chemin
   * d'écriture, donc aucun moyen que deux portes divergent.
   *
   * `records:write` et non `analysis:run` : on n'analyse rien, on écrit ce
   * qu'un humain sait. Aucun crédit.
   */
  @Post(':accountId/org-people')
  @RequirePermission('records:write')
  async declareOrgPeople(
    @Param('accountId') accountId: string,
    @Body() body: DeclareOrgPeopleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return unwrap(
      await this.onDemandService.declareOrgPeople(accountId, user.userId, body.people, {
        createContacts: body.createContacts,
      }),
      throwOnDemandFailure,
    )
  }

  /**
   * #3740.1 — aperçu d'un organigramme importé : ce que Bellum sait déjà de
   * chaque personne, avant toute écriture. Lecture seule, aucun crédit.
   */
  @Post(':accountId/org-people/preview')
  @RequirePermission('records:write')
  async previewOrgPeople(
    @Param('accountId') accountId: string,
    @Body() body: DeclareOrgPeopleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return unwrap(
      await this.onDemandService.previewOrgPeople(accountId, user.userId, body.people),
      throwOnDemandFailure,
    )
  }

  /**
   * « Décris ton organigramme » (#1103) — met en lignes un texte libre.
   *
   * Ne DÉCLARE rien : rend une proposition que l'écran affiche, avec ce qui a
   * été RETIRÉ faute d'être nommé dans le texte. Le clic de validation passe
   * ensuite par la route de déclaration ci-dessus — une seule écriture, donc
   * aucune divergence entre les trois portes d'entrée.
   *
   * Appelle un modèle : c'est la seule des trois portes qui le fasse, et donc
   * la seule refusée en espace de démonstration.
   */
  @Post(':accountId/org-people/from-text')
  @RequirePermission('records:write')
  async proposeOrgPeopleFromText(
    @Param('accountId') accountId: string,
    @Body() body: ProposeOrgPeopleFromTextDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // #3740 (reste) — les deux entrées sont exclusives, le DTO l'a déjà
    // vérifié (`.refine`) : `text` gagne quand les deux seraient présentes.
    const input = body.text?.trim() ? { text: body.text } : { file: { base64: body.fileBase64!, name: body.fileName } }
    return unwrap(
      await this.onDemandService.proposeOrgPeopleFromText(accountId, user.userId, input),
      throwOnDemandFailure,
    )
  }

  /**
   * #2553 / #3740 — « importer mon organigramme » (PDF, image, PowerPoint).
   * Même contrat que `from-text` : une PROPOSITION, jamais d'écriture ; la
   * validation passe par `org-people`. Appelle un modèle (lecture d'image,
   * mise en lignes) : refusée en espace de démonstration.
   */
  @Post(':accountId/org-people/from-file')
  @RequirePermission('records:write')
  async proposeOrgPeopleFromFile(
    @Param('accountId') accountId: string,
    @Body() body: ProposeOrgPeopleFromFileDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return unwrap(
      await this.onDemandService.proposeOrgPeopleFromFile(accountId, user.userId, {
        fileB64: body.fileB64,
        filename: body.filename,
      }),
      throwOnDemandFailure,
    )
  }

  /**
   * #4072.1 — « l'organigramme lit ce que les documents de l'espace disent ».
   * Même contrat que `from-text` : une PROPOSITION datée du document, jamais
   * d'écriture ; la validation passe par `org-people`. Aucun modèle appelé.
   */
  @Post(':accountId/org-people/from-documents')
  @RequirePermission('records:write')
  async proposeOrgPeopleFromDocuments(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(
      await this.onDemandService.proposeOrgPeopleFromDocuments(accountId, user.userId),
      throwOnDemandFailure,
    )
  }

  /** Retirer une déclaration (#1103). */
  @Post(':accountId/org-people/remove')
  @RequirePermission('records:write')
  async undeclareOrgPerson(
    @Param('accountId') accountId: string,
    @Body() body: UndeclareOrgPersonDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return unwrap(
      await this.onDemandService.undeclareOrgPerson(accountId, user.userId, body.fullName),
      throwOnDemandFailure,
    )
  }

  /** « Vérifier une relation » (annexe organigramme p22) — cherche la preuve d'UN
   *  lien inféré de l'organigramme. ⚠️ COÛTE 1 à 2 crédits, débités APRÈS la
   *  preuve — une recherche qui ne trouve rien n'est pas facturée. (Ce
   *  commentaire a dit « aucun crédit » jusqu'au 28/08, à côté du code qui
   *  débite.) Réponse `{found:false}` quand
   *  aucune preuve n'a été trouvée — le lien reste alors inchangé (l'absence de
   *  preuve n'est pas une preuve du contraire). 412 quand le lien est introuvable
   *  dans le dossier ou déjà vérifié. */
  @Post(':accountId/verify-relation')
  @RequirePermission('analysis:run')
  async verifyRelation(
    @Param('accountId') accountId: string,
    @Body() body: VerifyRelationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return unwrap(
      await this.onDemandService.verifyOrgRelation(accountId, user.userId, {
        fromId: body.fromId,
        toId: body.toId,
        type: body.type,
      }),
      throwOnDemandFailure,
    )
  }

  /** (Re)discover the account's French sites — the "Rechercher les sites" button
   *  in the (empty) Sites tab. Re-runs Phase 1 research (the only source of
   *  ``sites_france``) and re-persists it, returning ``{ matched, total }``.
   *  Synchronous single-phase run like the other on-demand buttons; no credit
   *  debit (mirrors enrich-contacts / enrich-organigram). */
  @Post(':accountId/research-site')
  @RequirePermission('analysis:run')
  async researchSite(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onDemandService.researchSites(accountId, user.userId), throwOnDemandFailure)
  }

  /** Partial re-run by dimension (Théo P1) — refresh ONE axis of a completed
   *  dossier (signals / contacts / entities / strategy) instead of the whole
   *  4-phase pipeline. Re-runs only the matching phase, reusing the stored
   *  outputs of the others, and debits one enrichment credit on success (a
   *  fraction of a full analysis slot). 402 when the enrichment pool is empty. */
  @Post(':accountId/refresh')
  @RequirePermission('analysis:run')
  async refresh(
    @Param('accountId') accountId: string,
    @Body() dto: RefreshAnalysisDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return unwrap(
      await this.refreshService.refresh(accountId, user.userId, dto.dimension, dto.scope),
      throwRefreshFailure,
    )
  }

  /**
   * #2452.2 / #2452.4 / #2452.5 — « Approfondir » depuis une réponse de /chat :
   * ce qui sera RÉUTILISÉ (0 crédit) et le coût SUPPLÉMENTAIRE, avant tout clic.
   * Lecture seule — l'exécution reste `POST :accountId/refresh`, axe par axe.
   *
   * Les comptes sont résolus ICI, dans le périmètre de l'appelant (même règle
   * que la barre de statut) : un identifiant qu'une réponse de Laura aurait
   * cité hors de ce périmètre n'arrive jamais au devis.
   */
  @Post('deepen/quote')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('analysis:run')
  async deepenQuote(@Body() dto: DeepenQuoteDto, @CurrentUser() user: CurrentUserPayload) {
    if (!this.deepenService || !this.credits) {
      throw new ServiceUnavailableException("Le devis d'approfondissement est indisponible.")
    }
    const scope = await this.accountScope(user.userId)
    const accounts: AccountEntity[] = []
    for (const accountId of new Set(dto.targets.map(target => target.accountId))) {
      const scoped = await this.accountsService.findOneForWorkspace(
        accountId,
        scope.workspaceId,
        scope.businessUnitScope,
      )
      if (!isFailure(scoped)) {
        accounts.push(scoped.output)
        continue
      }
      const owned = await this.accountsService.findOne(accountId, user.userId)
      if (!isFailure(owned)) accounts.push(owned.output)
    }
    const { credits_remaining } = await this.credits.getCredits(user.userId)
    return this.deepenService.quote({ scope, targets: dto.targets, accounts, remaining: credits_remaining })
  }

  /** User-initiated cancellation of an in-flight analysis. Aborts the worker,
   *  revokes the progress callback secret, removes the BullMQ job and marks
   *  the account as cancelled — all best-effort, but always returns 200 with
   *  the canonical `{ accountId }` payload so the UI can settle the cache. */
  @Post(':accountId/cancel')
  @RequirePermission('analysis:run')
  async cancel(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    // #2704 — même périmètre que le statut : qui voit la barre peut l'arrêter.
    return unwrap(
      await this.analysisService.cancelByUser(accountId, user.userId, await this.accountScope(user.userId)),
      throwAnalysisFailure,
    )
  }

  /** #2164.17 — la question d'identité d'un run en pause (`{ question: null }` sinon). */
  @Get(':accountId/entity-question')
  @RequirePermission('analysis:run') // #2164.17 — même permission que entity-answer
  async entityQuestion(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    // #2704 — même périmètre que le statut : qui voit la barre voit la question.
    return unwrap(
      await this.analysisService.entityQuestion(accountId, user.userId, await this.accountScope(user.userId)),
      throwAnalysisFailure,
    )
  }

  /** #2164.17 — la réponse : le SIREN choisi parmi les candidats ; le run reprend aussitôt. */
  @Post(':accountId/entity-answer')
  @RequirePermission('analysis:run')
  async entityAnswer(
    @Param('accountId') accountId: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const parsed = analysisEntityAnswerSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Choisis une des sociétés proposées.')
    return unwrap(
      await this.analysisService.answerEntityQuestion(
        accountId,
        user.userId,
        parsed.data,
        await this.accountScope(user.userId),
      ),
      throwAnalysisFailure,
    )
  }

  /** User-initiated resume after a failed analysis. Re-enqueues the BullMQ
   *  job for the same accountId; the worker reads outbox
   *  ``analysis.phase_completed`` events at start and skips already-done
   *  phases, picking up exactly where the previous attempt failed. */
  @Post(':accountId/resume')
  @RequirePermission('analysis:run')
  async resume(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    // #2704 — même périmètre que le statut : le run reprend pour son lanceur.
    return unwrap(
      await this.analysisService.resume(accountId, user.userId, await this.accountScope(user.userId)),
      throwAnalysisFailure,
    )
  }

  /**
   * Le FOCUS du plan d'action de l'espace — combien de place chaque axe obtient.
   *
   * Route LITTÉRALE à UN segment, donc jamais capturée par les routes
   * `:accountId/…` de ce contrôleur, qui en ont deux. Rend les DÉFAUTS, l'ÉCART
   * réglé et l'EFFECTIF : sans les défauts, un champ vide se lirait « zéro »
   * alors qu'il veut dire « valeur par défaut ».
   */
  @Get('org-focus-weights')
  @WorkspaceRead()
  async orgFocusWeights(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.orgFocus.view(workspaceId)
  }

  /**
   * Régler le focus du plan pour l'espace ACTIF.
   *
   * « Jamais un prisme IT par défaut » : une ESN qui ne vend pas d'IT met
   * `itChallenges` à 0 et l'axe disparaît de ses plans. Un axe réglé à sa valeur
   * par défaut n'est pas stocké — il continue de SUIVRE le défaut.
   */
  @Post('org-focus-weights')
  @RequirePermission('analysis:run')
  async saveOrgFocusWeights(@Body() dto: OrgFocusWeightsDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.orgFocus.save(workspaceId, dto.weights)
  }

  /**
   * Planificateur d'enrichissement de l'organigramme (§11 FINAL) — l'estimation
   * SEULE : combien de contacts, combien de vagues, combien de crédits pour un
   * mode de ciblage donné. Ne crée rien, ne débite rien — une preview affichée
   * AVANT tout bouton de confirmation (« Le coût est annoncé avant plan complet
   * et avant toute vague personnalisée », §11). Zéro appel IA.
   */
  @Post(':accountId/enrichment-plan')
  @RequirePermission('contacts:enrich')
  async enrichmentPlan(
    @Param('accountId') accountId: string,
    @Body() dto: OrgEnrichmentPlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return unwrap(await this.orgEnrichmentPlanner.estimate(accountId, user.userId, dto), throwOrgEnrichmentFailure)
  }

  /**
   * Lance UNE vague du mode demandé (§11 FINAL) — le clic « Lancer » après
   * l'estimation ci-dessus. Débite APRÈS succès (`targeted_refresh`, jamais un
   * nombre recopié). `remaining > 0` dans la réponse : le même mode, relancé,
   * reprend au prochain lot — voir le docblock de `confirmWave` pour ce que
   * « reprenable » couvre ici, et ce qu'il ne couvre PAS encore (aucun job
   * persistant à statut/historique, aucune file BullMQ dédiée).
   */
  @Post(':accountId/enrichment-confirm')
  @RequirePermission('contacts:enrich')
  async enrichmentConfirm(
    @Param('accountId') accountId: string,
    @Body() dto: OrgEnrichmentConfirmDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return unwrap(await this.orgEnrichmentPlanner.confirmWave(accountId, user.userId, dto), throwOrgEnrichmentFailure)
  }

  /**
   * « Enrichir les N suivants » — la porte PERSISTANTE du planificateur (§11).
   *
   * Contrairement à `enrichment-confirm`, ce geste ÉCRIT : il crée un job dont
   * les vagues sont figées, ou reprend celui qui n'est pas fini sur ce compte —
   * une vague tombée au milieu se reprend exactement là où elle s'est arrêtée.
   * Débit APRÈS succès, comme partout ailleurs.
   */
  @Post(':accountId/enrich-next')
  @RequirePermission('contacts:enrich')
  async enrichNext(
    @Param('accountId') accountId: string,
    @Body() dto: OrgEnrichNextDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return unwrap(
      await this.orgEnrichmentJobs.advance(accountId, user.userId, { mode: 'next_batch' }, dto.batchSize),
      throwOrgEnrichmentFailure,
    )
  }

  /** « Cette direction » — même job persistant, borné à une entité nommée. */
  @Post(':accountId/enrich-entity')
  @RequirePermission('contacts:enrich')
  async enrichEntity(
    @Param('accountId') accountId: string,
    @Body() dto: OrgEnrichEntityDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return unwrap(
      await this.orgEnrichmentJobs.advance(
        accountId,
        user.userId,
        { mode: 'direction', entity: dto.entity },
        dto.batchSize,
      ),
      throwOrgEnrichmentFailure,
    )
  }

  /** « Rôles manquants » — vise les zones blanches déjà calculées, sans les
   *  recalculer. Même job persistant, même reprise. */
  @Post(':accountId/enrich-gaps')
  @RequirePermission('contacts:enrich')
  async enrichGaps(
    @Param('accountId') accountId: string,
    @Body() dto: OrgEnrichGapsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return unwrap(
      await this.orgEnrichmentJobs.advance(accountId, user.userId, { mode: 'missing_roles' }, dto.batchSize),
      throwOrgEnrichmentFailure,
    )
  }

  /** L'historique des plans d'enrichissement d'un dossier — l'écran y lit le
   *  coût ANNONCÉ et le coût RÉEL côte à côte, et ce qu'il reste à reprendre. */
  @Get(':accountId/enrichment-jobs')
  @RequirePermission('contacts:enrich')
  async enrichmentJobs(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.orgEnrichmentJobs.list(accountId, user.userId), throwOrgEnrichmentFailure)
  }

  /**
   * La file de revérification de l'organigramme — ce qui est PÉRIMÉ ou jamais
   * vérifié, le plus ancien d'abord.
   *
   * Dérivée du graphe stocké à chaque lecture : une file persistée aurait deux
   * propriétaires et divergerait à la première vérification qui ne dépile pas
   * sa ligne. Aucun appel IA, aucun crédit.
   */
  @Get(':accountId/org-freshness')
  @WorkspaceRead()
  async orgFreshness(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.orgFreshnessService.queueFor(accountId, user.userId), throwOrgEnrichmentFailure)
  }
}
