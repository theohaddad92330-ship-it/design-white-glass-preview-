import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
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
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import { isFailure } from '@bellum/utils'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  needExportRequestSchema,
  needRequiresStaffing,
  submissionOutcomeReasonSchema,
  openNeedsQuerySchema,
  financeScopeKindSchema,
  DEFAULT_ENTRY_STAGE,
  isPipelineStage,
  can,
  splitStageActions,
  STAGE_ACTION_TASKS,
  stageActionExecution,
  dayKey,
  type StageActionResult,
  type PipelineStage,
  type ProjectContact,
  type ProjectCrmExportResponse,
  type NeedVerdictResponse,
  type NeedQualificationResponse,
  type ProjectNeed,
  type ProjectRow,
  type StageMoveOutcome,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { CrmTaskService, type CrmTaskFailure } from '../crm/crm-task.service'
import { DecisionGatesService } from '../decision-gates/decision-gates.service'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { DataExit } from '../workspace/data-exit.decorator'
import { needRowsToCsv, needRowsToJson, orderLikeSelection } from './need-export'
import { buildBesoinTask } from './besoin-task'
import { UpdateProjectAmountDto } from './dto/update-amount.dto'
import { UpdateProjectRisksDto } from './dto/update-risks.dto'
import { UpdateProjectScopeDto } from './dto/update-scope.dto'
import { UpdateProjectSectorsDto } from './dto/update-sectors.dto'
import { UpdateBtmmpDto } from './dto/update-btmmp.dto'
import {
  AddLossReasonDto,
  ChangeNeedConvergenceStateDto,
  ChangeNeedStatusDto,
  CreateNeedDocumentDto,
  CreateNeedStepDto,
  CreateProjectDocumentDto,
  CreateProjectStepDto,
  CreateProjectDto,
  CreateAccountNeedDto,
  CreateProjectNeedDto,
  CrossStaffableGateDto,
  CrossProfileTypeAgreementGateDto,
  LeadConversionDto,
  LinkProjectContactDto,
  OpenNeedsQueryDto,
  RenameStageDto,
  UpdateNeedDocumentStatusDto,
  UpdateNeedStepDto,
  UpdateProjectDocumentStatusDto,
  UpdateProjectStepDto,
  UpdateProjectCloseDateDto,
  UpdateProjectForecastCategoryDto,
  UpdateProjectNeedDto,
  UpdateProjectOwnerDto,
  UpdateProjectStageDto,
  UpdateProjectCaseDimensionsDto,
} from './dto/project.dto'
import type {
  NeedDocument,
  NeedDocumentFile,
  NeedDocumentFilesResponse,
  NeedStep,
  OpenNeedsCommercialAuditSignals,
  OpenNeedsResponse,
  ProjectDocument,
  ProjectStep,
  ProjectSynthesis,
  SignedDownload,
} from '@bellum/contracts'
import { toStoredFile, StorageService } from '../storage/storage.service'
import { demoProjectSynthesis } from '../demo/demo-scripts'
import { NeedProposalsService } from '../analysis/need-proposals.service'
import { NeedDocumentsService } from './need-documents.service'
import { NeedStepsService } from './need-steps.service'
import { ProjectStepsService } from './project-steps.service'
import { ProjectDocumentsService } from './project-documents.service'
import { ProjectSynthesisService } from './project-synthesis.service'
import { NeedCommercialStateService } from './need-commercial-state.service'
import { NeedVerdictService } from './need-verdict.service'
import { AccountStrategy5PService } from '../accounts/account-strategy-5p.service'
import { NeedContradictionsService } from './need-contradictions.service'
import { NeedCompileTextService, type NeedCompileTextResult } from './need-compile-text.service'
import { demoNeedCompileText } from '../demo/demo-scripts'
import { OpenNeedsService } from './open-needs.service'
import type { ReverseProspectsResult } from './reverse-need-prospects'
import { ProjectPipelineService, type PipelineScope } from './project-pipeline.service'
import { DealProbabilityService } from './deal-probability.service'
import { SharedBaseReaderService } from '../shared-base/shared-base-reader.service'
import type { CommercialTransitionEntry } from '../commercial-transitions/commercial-transitions.service'
import { ProjectsService } from './projects.service'
import { AccountGateService } from '../account-gate/account-gate.service'
import { DeliveryService } from '../delivery/delivery.service'
import { AcceptNeedProposalDto, DismissNeedProposalDto } from './dto/need-proposal.dto'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'
import { TasksService } from '../tasks/tasks.service'
import { MailboxService } from '../mailbox/mailbox.service'
import { MatchingService } from '../consultants/matching/matching.service'
import { SubmissionsService } from '../consultants/submissions.service'

/** Map a project→CRM export failure onto its HTTP status. `no_provider` =
 *  nothing connected yet (409, actionable), `export_failed` = the CRM's own
 *  rejection (502). */
function throwCrmTaskFailure(problem: CrmTaskFailure): never {
  const { code, message } = problem
  if (code === 'no_provider') throw new HttpException(message, HttpStatus.CONFLICT)
  if (code === 'export_failed') throw new HttpException(message, HttpStatus.BAD_GATEWAY)
  throw new InternalServerErrorException(message)
}

/** #2171.27 — un échec IA n'invente jamais de synthèse (doctrine « jamais de
 *  donnée fictive ») ; une synthèse vague sans fait pour la porter n'atteint
 *  jamais l'écran non plus (#2171.28, `ProjectSynthesisService.generate`). */
function throwProjectSynthesisFailure(code: 'ia_failed' | 'vague_without_fact'): never {
  if (code === 'vague_without_fact') {
    throw new HttpException(
      'La synthèse générée ne cite aucun fait à l’appui — régénérez-la.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    )
  }
  throw new HttpException('Synthèse indisponible pour le moment.', HttpStatus.BAD_GATEWAY)
}

/** La langue de l'appelant, pour les libellés d'étape par défaut. Tout ce qui
 *  n'est pas `en` retombe sur le français, la langue du produit. */
function readLanguage(value: string | undefined): 'fr' | 'en' {
  return value === 'en' ? 'en' : 'fr'
}

/**
 * Le périmètre que l'appelant DEMANDE sur le pipe (`?scope=own|workspace`).
 *
 * La forme vient de `financeScopeKindSchema` — les deux portées du dépôt sont
 * nommées une seule fois (`FINANCE_SCOPE_KINDS`), et en recopier la liste ici
 * garantirait qu'une troisième portée n'arrive jamais des deux côtés. Le nom du
 * schéma dit « finance » parce que le chiffre d'affaires a eu besoin de la
 * question le premier ; « qui regarde, et sur quel périmètre » n'a rien de
 * financier.
 *
 * ⚠️ Une valeur illisible rend « l'espace » plutôt que de REFUSER — même règle
 * que `readPropagationFilters` : un lien collé de travers doit montrer quelque
 * chose. Ce qui empêche le mensonge n'est pas le refus, c'est que la réponse
 * porte le périmètre RÉELLEMENT servi : l'écran qui a demandé « le mien » et
 * reçoit `kind: 'workspace'` sait qu'il ne doit pas écrire « Mon pipe ».
 *
 * ⚠️ Aucune vérification de droit ici, et ce n'est pas un oubli : `own` est
 * strictement plus ÉTROIT que ce que l'appelant obtenait déjà sans paramètre.
 * On ne peut rien voir de plus en le demandant.
 */
function readPipelineScope(value: string | undefined, userId: string): PipelineScope {
  const parsed = financeScopeKindSchema.safeParse(value)
  return parsed.success && parsed.data === 'own' ? { kind: 'own', userId } : { kind: 'workspace' }
}

/**
 * LA PORTE d'un document de besoin — un chemin de l'API, jamais une URL de
 * magasin.
 *
 * Une URL signée dans une réponse de LISTE vivrait cinq minutes (donc
 * périmerait dans un onglet resté ouvert) et voyagerait vers tous les lecteurs
 * de la réponse, y compris ceux qui n'ouvriront jamais la pièce. Ici la
 * signature se demande au clic, après vérification du droit.
 *
 * La dérivation vit à UN seul endroit : la liste et le dépôt la partagent,
 * sans quoi deux chemins écriraient deux portes différentes.
 */
function needDocumentDownloadPath(needId: string, documentId: string): string {
  return `/projects/needs/${needId}/documents/${documentId}/download`
}

/**
 * Le PROJET — l'objet pivot du CRM/ATS.
 *
 * Chemin propre (`/projects`) plutôt qu'une sous-route de `/accounts` : ça évite
 * toute collision d'ordre sur `:id` et garde le module autonome (règle #7).
 */
/**
 * #2939 (#2174.3/.5) — `free_brief` (coller un brief) et `email` (coller un
 * e-mail) SEULEMENT : les deux modes d'entrée de l'étape 1, jamais un
 * troisième kind deviné (les onze autres de `NEED_COMPILATION_SOURCE_KINDS`
 * restent hors de cette porte).
 */
const compileNeedTextSchema = z
  .object({
    text: z.string().trim().min(1).max(20_000),
    sourceKind: z.enum(['free_brief', 'email']),
  })
  .strict()
class CompileNeedTextDto extends createZodDto(compileNeedTextSchema) {}
class NeedExportDto extends createZodDto(needExportRequestSchema) {}
// #4195 — retenir un positionnement : l'étape est FIXÉE par la route ; le corps ne porte que les
// conditions chiffrées facultatives (mêmes bornes que `advanceSubmissionSchema`).
class RetainSubmissionDto extends createZodDto(
  z
    .object({
      // Un « retenu » est une clôture : le motif voyage avec (mêmes bornes que `advanceSubmissionSchema`).
      outcomeReason: submissionOutcomeReasonSchema.optional(),
      outcomeDetail: z.string().trim().max(2000).optional(),
      proposedRateCents: z.number().int().min(0).max(500_000).nullable().optional(),
      plannedDays: z.number().int().positive().max(3650).nullable().optional(),
      dailyCostCents: z.number().int().min(0).max(500_000).nullable().optional(),
    })
    .strict(),
) {}
// #4195 — fenêtre où « retenu » peut pourvoir le besoin : de « à qualifier » à « négociation » ;
// jamais depuis une veille, une réactivation ou un statut clos.
const RETAIN_FILLS_NEED_FROM: readonly string[] = [
  'to_qualify',
  'qualified',
  'to_match',
  'matching',
  'shortlist_ready',
  'submitted',
  'client_review',
  'interview',
  'negotiation',
]

/** #2939 (#2174.10) — même forme que `AttachContactDto`
 *  (`account-entities.controller.ts`) : `entity_id: null` détache. */
class SetProjectEntityDto extends createZodDto(z.object({ entity_id: z.string().guid().nullable() }).strict()) {}

/** #4195 — fin de mission = début + durée en mois − 1 jour (dates ISO, UTC). */
function missionEndsOn(startOn: string, durationMonths: number): string {
  const end = new Date(`${startOn.slice(0, 10)}T00:00:00Z`)
  end.setUTCMonth(end.getUTCMonth() + durationMonths)
  end.setUTCDate(end.getUTCDate() - 1)
  return end.toISOString().slice(0, 10)
}

@Controller('projects')
// Le pipe des projets est une surface de palier.
@RequireFeature('needs')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly pipeline: ProjectPipelineService,
    private readonly openNeeds: OpenNeedsService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly crmTask: CrmTaskService,
    private readonly needProposals: NeedProposalsService,
    private readonly needDocuments: NeedDocumentsService,
    private readonly needSteps: NeedStepsService,
    private readonly projectSteps: ProjectStepsService,
    private readonly projectDocuments: ProjectDocumentsService,
    private readonly projectSynthesis: ProjectSynthesisService,
    // ⚠️ Le stockage est injecté ICI et pas dans `NeedDocumentsService` : un
    // domaine n'appelle pas le service d'un autre (GA-07), et c'est le
    // contrôleur qui a déjà résolu l'espace et tranché le droit.
    private readonly storage: StorageService,
    private readonly needVerdict: NeedVerdictService,
    private readonly needContradictions: NeedContradictionsService,
    private readonly brands: WorkspaceBrandService,
    // Journal des portes de décision — `@Optional()` : retirer le journal ne
    // doit jamais empêcher de clore un projet.
    @Optional() private readonly gates?: DecisionGatesService,
    // Les deux seules actions que le panneau d'effets confie au serveur.
    // `@Optional()` pour la même raison que le journal : déplacer un projet ne
    // doit pas dépendre de la présence d'un autre module.
    @Optional() private readonly delivery?: DeliveryService,
    @Optional() private readonly accountGate?: AccountGateService,
    // #2172.39 - la PROCHAINE ACTION d'une conversion est une tache sur le
    // projet : c'est deja la seule source de `next_action` que la carte du pipe
    // relit (`ROW_PROJECTION`). `@Optional()` comme ses deux voisines - retirer
    // le module des taches ne doit pas empecher de convertir une piste, la
    // reponse dit alors que l'action n'a pas ete posee au lieu de le taire.
    @Optional() private readonly tasks?: TasksService,
    // #2339.7 — résoudre LE positionnement retenu du besoin converti, pour le
    // rattacher à la mission créée (`submissionId`/`consultantId`).
    // `@Optional()` même raison que ses voisins : retirer le Vivier ne doit
    // pas empêcher de convertir une piste, la mission naît alors sans
    // positionnement rattaché, comme avant ce lot.
    @Optional() private readonly submissions?: SubmissionsService,
    // #2939 (#2174.3/.5) — coller un brief ou un e-mail à l'étape 1 de
    // l'assistant. `@Optional()` même raison que ses voisins : retirer ce
    // service ne doit pas empêcher de créer un besoin à la main.
    @Optional() private readonly needCompileText?: NeedCompileTextService,
    // #3390.9 — les 5P du compte du besoin, lus à côté de la méthode. Composé ICI (un contrôleur,
    // hors garde service→service GA-07) ; `@Optional()` : sans lui, le contexte garde `fiveP: null`.
    @Optional() private readonly accountStrategy5P?: AccountStrategy5PService,
    // #4016 L1 — le CA probable du trimestre. `@Optional()` comme ses voisins :
    // sans lui, la route répond 404 au lieu d'empêcher le pipe de démarrer.
    @Optional() private readonly dealProbability?: DealProbabilityService,
    // #4016 L1 — l'a priori de la base anonyme commune. `@Optional()` : sans
    // elle, la probabilité se calibre sur l'espace seul.
    @Optional() private readonly sharedBase?: SharedBaseReaderService,
    // #4339.2 — les services EXISTANTS que les propositions du panneau « Changer de colonne » appellent : le
    // matching du vivier et la messagerie (brouillon, jamais d'envoi). `@Optional()` comme leurs voisins :
    // déplacer une affaire ne doit pas dépendre d'un autre module ; une proposition sans son service échoue
    // en le disant (`unavailable`), elle ne réussit pas à vide.
    @Optional() private readonly matching?: MatchingService,
    @Optional() private readonly mailbox?: MailboxService,
    // Refonte Théo — fiche besoin : « Avant la mission » et « Doublons », déjà calculés pour Laura.
    @Optional() private readonly needCommercialState?: NeedCommercialStateService,
  ) {}

  private readonly logger = new Logger(ProjectsController.name)

  /**
   * Porte G8 — la clôture d'un projet.
   *
   * Best-effort et volontairement muette en cas d'échec : la décision est déjà
   * prise et persistée, refuser la réponse HTTP parce que le journal est
   * indisponible transformerait une panne d'audit en panne de produit.
   *
   * Aucun « manque » n'est deviné ici : la liste reste vide tant que l'écran ne
   * pose pas la question. Inventer des manques rendrait la relecture fausse,
   * ce qui est pire que de ne pas la faire.
   */
  private async recordCloseGate(
    workspaceId: string,
    userId: string,
    projectId: string,
    stage: 'won' | 'lost',
    lossReason: string | null,
  ): Promise<void> {
    if (!this.gates) return
    try {
      await this.gates.record(workspaceId, userId, {
        gate: 'project_close',
        decision: 'accept',
        subject: 'project',
        subjectId: projectId,
        reason: stage === 'lost' ? lossReason : 'Projet signé',
        missing: [],
      })
    } catch {
      // Journalisé côté service ; rien à ajouter ici.
    }
  }

  /**
   * Tous les projets de l'espace, plus récents d'abord. `account_id` restreint
   * au dossier d'un compte (onglet Projets, BEL-CRM-104).
   *
   * #2801 — `id` restreint à UN SEUL projet : c'est ce que lit la fiche
   * `/projects/$id`, même précédent que `GET /delivery/missions?id=…`.
   * ⚠️ Illisible ⇒ AUCUN filtre, comme `account_id` juste au-dessus : un
   * identifiant abîmé rend le pipe entier plutôt qu'une erreur, et c'est la
   * fiche qui doit alors dire « introuvable » (elle retrouve son projet par
   * identité dans la réponse, jamais la première ligne venue).
   *
   * #4137 — `archived=only` ne rend que les dossiers ARCHIVÉS de l'espace (on
   * archive, on ne supprime pas) ; absent, la lecture est inchangée.
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('account_id') accountId?: string,
    @Query('id') id?: string,
    @Query('archived') archived?: string,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const parsedId = z.string().guid().safeParse(id)
    return this.projects.listForWorkspace(
      workspaceId,
      accountId?.trim() || undefined,
      parsedId.success ? parsedId.data : undefined,
      // #4137 — `?archived=only` : les dossiers rangés SEULEMENT. Toute autre valeur = lecture historique.
      { archivedOnly: archived === 'only' },
    )
  }

  /**
   * L'état du pipe : cinq colonnes, leurs projets, leurs montants SAISIS et le
   * nombre de projets sans montant, compté à part. Aucune pondération, aucune
   * probabilité — un pipe pondéré que personne ne tient produit un chiffre faux
   * que la direction finit par croire.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * `?scope=own` — L'APPELANT DIT QUEL PÉRIMÈTRE IL DEMANDE
   * ─────────────────────────────────────────────────────────────────────────────
   * Le cockpit écrit « **Mon** pipe » et lisait celui de l'ESPACE : sur une ESN à
   * cinq commerciaux, le même chiffre s'affichait cinq fois sous cinq « mon ».
   * C'était la seule chose FAUSSE À L'ÉCRAN plutôt qu'absente — et un chiffre
   * juste sur le mauvais périmètre ne se remarque pas.
   *
   * La route ne devient pas personnelle pour autant : `/projects` montre le pipe
   * complet (c'est son objet), l'état vide de `/missions` décide d'après ce que
   * l'ESPACE a gagné, et le copilote annonce au modèle qu'il parle de l'espace.
   * Le défaut reste donc « l'espace », et c'est le cockpit qui demande le sien.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * ⚠️ POURQUOI CETTE ROUTE N'EST PAS SOUS DROIT FINANCIER — ET NE DOIT PAS L'ÊTRE
   * ─────────────────────────────────────────────────────────────────────────────
   * La source du 26/08 (PDF 2) décrit un état « sans droit financier » où les
   * blocs 1, 2 et 4 du cockpit disparaissent. Le bloc 1 est celui-ci, et il ne
   * disparaît pas. **C'est la source qui se trompe**, pour deux raisons mesurées
   * dans ce dépôt :
   *
   *  1. **La ligne que `finance:read` protège est déjà tracée, et le montant du
   *     pipe est du bon côté.** Ce qui se garde, c'est la MARGE et le COÛT
   *     CHARGÉ — qui relève de la paie. Le montant VENDU, lui, sort sans
   *     permission partout ailleurs : `GET /delivery/missions` rend le tarif
   *     vendu de chaque mission à tout membre et ne vide que `marginPercent`
   *     (D45), et `missionSchema` dit en toutes lettres que `daily_rate` n'est
   *     délibérément pas derrière `finance:read`. Un montant de pipe est un
   *     montant vendu ESPÉRÉ : le mettre sous droit financier contredirait la
   *     ligne à l'endroit exact où elle a été tracée.
   *  2. **`sales` ne porte pas `finance:read`** — il porte `finance:read:own`.
   *     Garder cette route derrière `finance:read` fermerait l'écran `/projects`
   *     au commercial dont c'est le pipe. Le geste censé le protéger lui
   *     retirerait son outil.
   *
   * Noté ici pour que la prochaine relecture de la source ne le re-signale pas.
   * Tenu par `cockpit-scope-is-owned.spec.ts`, qui relit `ROLE_PERMISSIONS`
   * plutôt que de croire ce paragraphe.
   */
  @Get('pipeline')
  async pipelineSummary(
    @CurrentUser() user: CurrentUserPayload,
    @Query('lang') lang?: string,
    @Query('scope') scope?: string,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pipeline.summary(workspaceId, readLanguage(lang), readPipelineScope(scope, user.userId))
  }

  /** Les libellés effectifs des cinq étapes (ceux de l'espace, défauts compris). */
  @Get('stage-labels')
  async stageLabels(@CurrentUser() user: CurrentUserPayload, @Query('lang') lang?: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { stages: await this.pipeline.effectiveStageLabels(workspaceId, readLanguage(lang)) }
  }

  /**
   * #4016 L1 (décision Louis 11/10/2026) — le CA PROBABLE du trimestre : chaque
   * affaire ouverte datée dans le trimestre, avec sa probabilité CALIBRÉE (méthode
   * nommée, intervalle, axes, axes non évaluables nommés).
   *
   * ⚠️ Contrairement au pipe nominal, un CA PROBABLE est un prévisionnel de
   * chiffre d'affaires : il porte le droit de LIRE un chiffre d'affaires, que le
   * commercial a (`finance:read:own`). Tranché sans Louis (11/10/2026).
   */
  @Get('probable-quarter')
  @RequirePermission('finance:read:own')
  async probableQuarter(@CurrentUser() user: CurrentUserPayload, @Query('scope') scope?: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    if (!this.dealProbability) throw new NotFoundException()
    // La base commune est lue ICI (le contrôleur compose ; un service ne va pas
    // chercher celui d'un autre module, GA-07). Sans elle : aucun a priori.
    const shared = this.sharedBase
    return this.dealProbability.probableQuarter(
      workspaceId,
      readPipelineScope(scope, user.userId),
      shared
        ? shared.caseOutcomesElsewhereFor(workspaceId)
        : () => Promise.resolve({ status: 'not_enough_shared_data' as const }),
    )
  }

  /** Renommer une étape. Un libellé vide remet le défaut. */
  @Put('stage-labels/:stage')
  @RequirePermission('records:write')
  @HttpCode(204)
  async renameStage(
    @Param('stage') stage: string,
    @Body() body: RenameStageDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    if (!isPipelineStage(stage)) throw new NotFoundException('Étape inconnue')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.pipeline.renameStage(workspaceId, stage as PipelineStage, body.label)
  }

  /**
   * #2195.33 — OUVRIR UNE AFFAIRE. La porte que le pipe n'avait pas.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * LE CLIC EST LA DÉCISION
   * ───────────────────────────────────────────────────────────────────────────
   * Une écriture CRM/ERP passe par une porte : geste d'utilisateur =
   * auto-approuvé, geste de système = demande visible avec prévisualisation
   * figée. Cette route est le PREMIER cas, et uniquement lui — le panneau de
   * renouvellement NAVIGUE vers l'écran de création pré-rempli, il n'appelle
   * jamais cette route tout seul. **On ne crée jamais une affaire sans qu'un
   * humain valide.**
   *
   * ───────────────────────────────────────────────────────────────────────────
   * LA MÊME PORTE QUE SES VOISINES, ET C'EST VÉRIFIÉ
   * ───────────────────────────────────────────────────────────────────────────
   * `@RequirePermission('records:write')` + `WorkspacePermissionGuard` posé sur
   * la classe : le cloisonnement par business unit s'applique ici comme aux
   * huit autres `@Post` du contrôleur. Une route d'écriture qui l'oublierait
   * ouvrirait le pipe d'une BU à une autre — d'où la garde
   * `projects.create-is-a-human-gesture.spec.ts`, qui la lit dans le fichier.
   *
   * ⚠️ Déclarée AVANT toute route `:id/...` n'aurait aucun sens ici (c'est un
   * POST sur la racine), mais elle est posée près de `@Get()` pour que la
   * lecture et l'écriture de la même ressource se lisent ensemble.
   *
   * Trois réponses distinctes, et la distinction compte :
   *  - 404 : le compte n'existe pas DANS CET ESPACE. Jamais 403 — la différence
   *    entre les deux dirait si l'identifiant existe ailleurs.
   *  - 409 : une affaire du même libellé existe déjà sur ce compte. Le doublon
   *    est refusé, pas écrasé : on archive, on ne remplace pas.
   *  - 201 : l'affaire, telle que la base l'a écrite.
   *
   * Le rattachement au renouvellement est BEST-EFFORT et jamais silencieux : la
   * réponse porte `renewal_linked`, pour que l'écran puisse dire « l'affaire est
   * créée, le lien à la mission n'a pas pu être posé » plutôt que de laisser
   * croire à un rattachement qui n'a pas eu lieu.
   */
  @Post()
  @RequirePermission('records:write')
  @HttpCode(201)
  async create(@Body() body: CreateProjectDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const created = await this.projects.createForWorkspace(workspaceId, {
      accountId: body.account_id,
      label: body.label,
      detail: body.detail ?? null,
      objective: body.objective ?? null,
      // L'étape d'entrée par défaut est la PREMIÈRE colonne du pipe, lue dans le
      // contrat et jamais retapée : une affaire qu'un humain vient de saisir a,
      // par construction, déjà été regardée.
      stage: body.stage ?? DEFAULT_ENTRY_STAGE,
      expectedCloseOn: body.expected_close_on ?? null,
      estimatedAmount: body.estimated_amount ?? null,
      ownerId: body.owner_id ?? null,
      scopeLabel: body.scope_label ?? null,
    })
    if (!created) {
      // `createForWorkspace` rend `null` pour deux raisons opposées, et les
      // confondre ferait chercher un compte qui existe. On les sépare en
      // relisant ce que la base a déjà : un libellé identique sur ce compte
      // veut dire « déjà là », tout le reste veut dire « compte introuvable ».
      const existing = await this.projects.listForWorkspace(workspaceId, body.account_id)
      const duplicate = existing.find(row => row.kind === 'manual' && row.label === body.label.trim())
      // #2174.1 — LE DOUBLON REND CE QUI EXISTE, il n'échoue pas. L'assistant
      // de besoin passe par cette même porte et compte dessus : le projet créé
      // au nom du compte accueille le DEUXIÈME besoin du même compte, et un
      // double clic ne doit pas faire deux affaires ni une erreur. Rien n'est
      // écrasé — `ON CONFLICT DO NOTHING` a déjà refusé le doublon en base,
      // on relit la ligne qui était là.
      if (duplicate) return { project: duplicate, renewal_linked: false }
      throw new NotFoundException('Ce compte est introuvable dans votre espace de travail.')
    }

    // Le lien vers la mission renouvelée est posé par le module qui POSSÈDE la
    // table `missions` (GA-07) : écrire dans la table d'un autre module depuis
    // ici serait exactement le chemin que la décision refusait dans l'autre
    // sens. `@Optional()` : retirer le module de delivery ne doit pas empêcher
    // d'ouvrir une affaire — la réponse dit alors que le lien n'a pas été posé.
    let renewalLinked = false
    if (body.renewal_of_mission_id && this.delivery) {
      renewalLinked = await this.delivery.linkRenewalOpportunity(workspaceId, body.renewal_of_mission_id, created.id)
    }

    return { project: created, renewal_linked: renewalLinked }
  }

  @Get('loss-reasons')
  async lossReasons(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.pipeline.listLossReasons(workspaceId) }
  }

  @Post('loss-reasons')
  @RequirePermission('records:write')
  async addLossReason(@Body() body: AddLossReasonDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pipeline.addLossReason(workspaceId, body.label)
  }

  @Delete('loss-reasons/:id')
  @RequirePermission('records:write')
  @HttpCode(204)
  async archiveLossReason(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.pipeline.archiveLossReason(workspaceId, id)
  }

  /**
   * Ce que l'ESN a appris de ses propres usages (restitution V2 §6). Déclaré
   * AVANT `:id/...` pour que le chemin littéral gagne le routage.
   */
  @Get('learning')
  async learning(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { rows: await this.projects.summarizeLearning(workspaceId) }
  }

  /**
   * « Comparer à un projet similaire sur un autre compte » (restitution V2 §7).
   * Lecture seule, aucun crédit. La référence et les candidats sont relus dans
   * l'espace de l'appelant ; un id d'une autre équipe est un 404.
   */
  @Get(':id/similar')
  async similar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const result = await this.projects.findSimilar(id, workspaceId)
    if (!result) throw new NotFoundException('Projet introuvable')
    return result
  }

  /* ── Les rôles recherchés ────────────────────────────────────────────────── */

  /**
   * L'écran « Besoins ouverts » (BEL-CRM-101) — la vue TRANSVERSE, tous comptes
   * confondus. Déclarée AVANT `:id/needs` : `needs` n'est pas un identifiant de
   * projet, et une route paramétrée déclarée d'abord l'avalerait.
   */
  @Get('needs')
  async listOpenNeeds(
    @Query() query: OpenNeedsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OpenNeedsResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.openNeeds.list(workspaceId, query)
  }

  /**
   * #2842 (reste, 26/09) — les deux signaux `clientNeeds`/`needDetailing` de
   * l'audit commercial (`/settings/profile/audit`). Route littérale, déclarée
   * avant `:id/needs` comme `needs/proposals` juste au-dessus.
   */
  @Get('needs/commercial-audit-signals')
  @WorkspaceRead()
  async needsCommercialAuditSignals(@CurrentUser() user: CurrentUserPayload): Promise<OpenNeedsCommercialAuditSignals> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.openNeeds.commercialAuditSignals(workspaceId)
  }

  /* #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
   * `GET/PATCH projects/commercial-load-settings` vivaient ici ET sur
   * `/workspaces/commercial-load-settings`, et `max_open_needs` était écrit
   * des DEUX côtés. Il n'en reste qu'une porte,
   * `WorkspaceCommercialLoadSettingsController`, sur la table de production
   * — un réglage vit à un seul endroit (GA-26). */

  /**
   * Les besoins PROPOSÉS par l'analyse, en attente d'un geste (PDF 4, PE5).
   *
   * Ils ne sont PAS dans le pipe : un pipe qui se remplit tout seul de besoins
   * que personne n'a validés devient inutilisable en une semaine. Déclarée
   * avant `:id/needs` comme les autres routes littérales.
   */
  @Get('needs/proposals')
  async listNeedProposals(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.needProposals.pending(workspaceId) }
  }

  /**
   * #2647.1 — les mêmes propositions, CLOISONNÉES à un seul compte : la
   * section « Besoins » en tête du dossier compte. `pending(workspaceId)`
   * seul (juste au-dessus) lit tout l'espace — c'est la vue transverse
   * BEL-CRM-101 ; celle-ci ajoute le compte au `where` pour que deux comptes
   * du même espace ne partagent jamais la même liste. Déclarée avant
   * `:id/needs` comme les autres routes littérales de ce fichier.
   */
  @Get('needs/proposals/account/:accountId')
  async listNeedProposalsForAccount(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.needProposals.pending(workspaceId, accountId) }
  }

  /**
   * Accepter une proposition : elle DEVIENT un besoin, sur un projet choisi.
   *
   * Le projet est fourni par l'utilisateur et jamais deviné : rattacher au
   * hasard produirait un besoin sur la mauvaise affaire, et personne ne le
   * verrait avant de l'envoyer à un client.
   */
  @Post('needs/proposals/:proposalId/accept')
  @RequirePermission('records:write')
  async acceptNeedProposal(
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() body: AcceptNeedProposalDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const proposal = await this.needProposals.findPending(workspaceId, proposalId)
    if (!proposal) throw new NotFoundException('Proposition introuvable ou déjà traitée.')
    const need = await this.pipeline.addNeed(workspaceId, body.projectId, {
      title: proposal.title,
      // Une proposition porte des TERMES (`text[]`) ; un besoin porte des
      // compétences typées. Elles sortent en « souhaitée » et jamais en
      // « obligatoire » : une compétence obligatoire absente EXCLUT le profil
      // (`missing_required_skill`), et écarter quelqu'un sur un mot lu dans une
      // annonce serait une décision que personne n'a prise. Le recruteur qui
      // ouvre le besoin coche ce qui est vraiment éliminatoire.
      skills: proposal.skills.map(term => ({ term, required: false, level: null })),
      // La provenance voyage AVEC le besoin : six mois plus tard, « d'où vient
      // ce besoin » est la question qui décide si la source vaut la peine.
      // Deux champs, deux questions : `source` dit QUOI (une offre d'emploi —
      // toutes les propositions sont des `job_ad`), `provenance` dit QUI l'a
      // apporté (le pipeline, pas un humain). L'URL de l'offre reste sur la
      // proposition, qui pointe le besoin créé (`created_need_id`) : la
      // colonne `provenance` n'accepte que ces quatre valeurs.
      source: 'job_posting',
      provenance: 'pipeline',
    })
    await this.needProposals.markAccepted(workspaceId, proposalId, user.userId, need.id)
    return need
  }

  @Post('needs/proposals/:proposalId/dismiss')
  @RequirePermission('records:write')
  async dismissNeedProposal(
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() body: DismissNeedProposalDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.needProposals.dismiss(workspaceId, proposalId, user.userId, body.reason)
  }

  @Get(':id/needs')
  async listNeeds(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: ProjectNeed[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.pipeline.listNeeds(workspaceId, id) }
  }

  /**
   * #2558.1 — CRÉER UN BESOIN AU NOM D'UN COMPTE, avec ou sans projet.
   *
   * Déclarée AVANT `:id/needs` pour la même raison que `GET needs` plus haut :
   * `needs` n'est pas un identifiant de projet, et une route paramétrée
   * déclarée d'abord l'avalerait.
   *
   * ⚠️ Elle ne REMPLACE pas `POST /projects/:id/needs`, qui reste la porte du
   * geste « ajouter une ligne à CE projet » (avec son plafond de lignes par
   * projet). Celle-ci fait l'autre geste : « ce client cherche quelqu'un » —
   * la majorité des missions d'ESN ne produisent aucun signal public (retour
   * bêta du 17/09/2026), et leur inventer un projet fabriquait de la donnée
   * vide pour satisfaire une contrainte technique.
   */
  /**
   * #2939 (#2174.3/.5) — COLLER UN BRIEF OU UN E-MAIL, à l'étape 1 de
   * l'assistant. Déclarée AVANT `:id/needs` pour la même raison que `needs`
   * juste au-dessus : `needs` n'est pas un identifiant de projet.
   *
   * Le MÊME outil de compilation que la carte de Laura (`compile_need`,
   * apps/ia) — jamais un second chemin d'extraction. `records:write` : lire
   * un texte pour PROPOSER un besoin n'engage rien de plus que de le taper à
   * la main, rien n'est écrit ici.
   */
  @Post('needs/compile-text')
  @RequirePermission('records:write')
  async compileNeedText(
    @Body() body: CompileNeedTextDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<NeedCompileTextResult> {
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      return demoNeedCompileText(body.sourceKind)
    }
    if (!this.needCompileText) {
      return { status: 'unavailable', error: 'Le service de compilation est indisponible pour le moment.' }
    }
    return this.needCompileText.compileText(body.text, body.sourceKind)
  }

  /**
   * #4016 L11 — L'EXPORT DE MASSE de la sélection de besoins, en fichier (CSV
   * ou JSON) à reprendre dans un outil tiers. Décision Louis 11/10/2026 :
   * RENVERSE `c43_actions_de_masse` (« aucune action de masse ne sort »).
   *
   * `@DataExit()` : la règle d'espace « qui peut exporter » le tient, au même
   * endroit que tous les autres fichiers sortants (#2081.14) — c'est elle, et
   * non le rôle seul, qui décide si le fichier part. Un FICHIER, jamais une
   * poussée : rien n'est écrit chez un tiers par cette route.
   */
  @Post('needs/export')
  @DataExit()
  @RequirePermission('data:export')
  @HttpCode(HttpStatus.OK)
  async exportNeeds(
    @Body() body: NeedExportDto,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const page = await this.openNeeds.list(
      workspaceId,
      openNeedsQuerySchema.parse({ offset: 0, limit: body.needIds.length }),
      { needIds: body.needIds },
    )
    const rows = orderLikeSelection(page.data, body.needIds)
    const stamp = new Date().toISOString().slice(0, 10)
    if (body.format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="besoins-${stamp}.json"`)
      return needRowsToJson(rows, new Date(), body.audience)
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="besoins-${stamp}.csv"`)
    return needRowsToCsv(rows, body.audience, body.lang)
  }

  @Post('needs')
  @RequirePermission('records:write')
  async addNeedForAccount(
    @Body() body: CreateAccountNeedDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectNeed> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Même garde que sur l'autre porte : un porteur hors de l'espace serait un
    // responsable que personne ne voit, et que personne ne réclamerait.
    if (body.owner_id) await this.workspaceContext.assertMember(body.owner_id, workspaceId)
    const { account_id: accountId, ...input } = body
    return this.pipeline.addNeedForAccount(workspaceId, accountId, input, user.userId)
  }

  @Post(':id/needs')
  @RequirePermission('records:write')
  async addNeed(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateProjectNeedDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectNeed> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Même garde que sur le porteur d'un projet : attribuer à quelqu'un hors de
    // l'espace créerait un propriétaire fantôme — le besoin aurait un
    // responsable que personne ne voit, et personne ne le réclamerait.
    if (body.owner_id) await this.workspaceContext.assertMember(body.owner_id, workspaceId)
    return this.pipeline.addNeed(workspaceId, id, body, user.userId)
  }

  @Patch('needs/:needId')
  @RequirePermission('records:write')
  async updateNeed(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Body() body: UpdateProjectNeedDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectNeed> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    if (body.owner_id) await this.workspaceContext.assertMember(body.owner_id, workspaceId)
    return this.pipeline.updateNeed(workspaceId, needId, body)
  }

  /**
   * La porte d'état d'un besoin (PDF 2 §7.4). Séparée du patch générique, et
   * c'est le point : le statut est le seul champ dont un mauvais réglage
   * déplace du travail sans que personne ne l'ait décidé.
   */
  @Post('needs/:needId/submissions/:submissionId/retain')
  @RequirePermission('records:write')
  async retainSubmission(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() body: RetainSubmissionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!this.submissions) throw new NotFoundException('Vivier indisponible')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const need = await this.pipeline.getNeed(workspaceId, needId)
    const submission = await this.submissions.advance(user.userId, submissionId, { ...body, stage: 'accepted' })

    const inWindow = RETAIN_FILLS_NEED_FROM.includes(need.status)
    // Sans affaire on ne peut pas dénombrer : le positionnement qu'on vient de retenir compte pour un.
    const retained = need.project_id
      ? (await this.submissions.acceptedForOpportunity(workspaceId, need.project_id)).filter(r => r.needId === needId)
          .length
      : 1
    if (!inWindow || retained < need.headcount) {
      return { submission, need: { status: need.status, changed: false, reason: null } }
    }
    try {
      const filled = await this.pipeline.changeNeedStatus(
        workspaceId,
        needId,
        'won',
        submission.consultantName ? `Pourvu : ${submission.consultantName} retenu` : 'Pourvu : positionnement retenu',
        user.userId,
        'human',
      )
      return { submission, need: { status: filled.status, changed: true, reason: null } }
    } catch (err) {
      if (!(err instanceof BadRequestException)) throw err
      return { submission, need: { status: need.status, changed: false, reason: err.message } }
    }
  }

  @Patch('needs/:needId/status')
  @RequirePermission('records:write')
  async changeNeedStatus(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Body() body: ChangeNeedStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectNeed> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pipeline.changeNeedStatus(
      workspaceId,
      needId,
      body.status,
      body.reason ?? null,
      user.userId,
      body.source ?? 'human',
      body.resume_on ?? null,
    )
  }

  /**
   * #2952 (#2305.13/.14/.15/.16/.18) — LA PORTE DE CONVERGENCE : le seul
   * appelant de `assertExplicitConvergenceTransition`/
   * `assertConvergenceCitesFoundingSignals` (`@bellum/contracts`), posées et
   * testées sans appelant depuis leur livraison. Ce clic EST le geste humain
   * explicite que l'invariant #2305.18 exige — aucun batch, aucune reprise,
   * aucun minuteur n'appelle cette route.
   */
  @Patch('needs/:needId/convergence-state')
  @RequirePermission('records:write')
  async changeNeedConvergenceState(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Body() body: ChangeNeedConvergenceStateDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectNeed> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pipeline.changeNeedConvergenceState(workspaceId, needId, body.to, body.foundingSignalIds ?? [])
  }

  /**
   * #2173.49 — ARCHIVER : un rangement NEUTRE (décision Louis, 17/09/2026,
   * par QCM). `status` ne bouge JAMAIS pour ce geste — deux portes séparées
   * du patch générique ET de la porte d'état, exactement pour ça.
   */
  @Post('needs/:needId/archive')
  @RequirePermission('records:write')
  async archiveNeed(
    @Param('needId', ParseUUIDPipe) needId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectNeed> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pipeline.archiveNeed(workspaceId, needId, true)
  }

  /**
   * #2173.49 — DÉSARCHIVER. `unarchive`, et non `reactivate` : ce dernier
   * désigne déjà un AUTRE geste sur un besoin (la porte d'état vers
   * `to_reactivate`) — les confondre ferait croire que désarchiver change le
   * statut, ce que la décision de Louis refuse explicitement.
   */
  @Post('needs/:needId/unarchive')
  @RequirePermission('records:write')
  async unarchiveNeed(
    @Param('needId', ParseUUIDPipe) needId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectNeed> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pipeline.archiveNeed(workspaceId, needId, false)
  }

  /**
   * La porte G3 (§7.6). Le franchissement est journalisé par le contrôleur —
   * le service ne va pas chercher le service d'un autre module (règle §3.2).
   */
  @Patch('needs/:needId/staffable')
  @RequirePermission('records:write')
  async crossStaffableGate(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Body() body: CrossStaffableGateDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectNeed> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const need = await this.pipeline.crossStaffableGate(workspaceId, needId, body.verdict, body.reason ?? null)

    // « Pas encore » n'est pas un franchissement : journaliser un « je ne sais
    // pas » remplirait le journal des portes de lignes qui ne décident rien.
    if (body.verdict !== 'unknown' && this.gates) {
      try {
        await this.gates.record(workspaceId, user.userId, {
          gate: 'need_staffable',
          subject: 'need',
          subjectId: need.id,
          decision: body.verdict === 'no' ? 'refuse' : 'accept',
          reason: need.staffable_reason ?? null,
          missing: [],
        })
      } catch {
        // Journalisé côté service ; une trace en échec n'annule pas une
        // décision que le recruteur a prise.
      }
    }
    return need
  }

  /**
   * #2323.18 — la porte PRÉSENTER, accord sur le type de profil. Même patron
   * que {@link crossStaffableGate}, sans journal de porte : ce flag n'est pas
   * au catalogue des portes de décision, et l'y ajouter sans que l'issue ne
   * le demande fabriquerait une entrée qu'aucune spec ne donne.
   */
  @Patch('needs/:needId/profile-type-agreement')
  @RequirePermission('records:write')
  async crossProfileTypeAgreementGate(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Body() body: CrossProfileTypeAgreementGateDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectNeed> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pipeline.crossProfileTypeAgreementGate(workspaceId, needId, body.agreement)
  }

  /**
   * « Un besoin sans candidat ouvre une piste » — la prospection inversée lue
   * depuis un BESOIN plutôt que depuis un compte (voir le docblock de
   * `reverse-need-prospects.ts`). Lecture seule, aucun crédit, aucune
   * écriture : on ne fait que MONTRER d'autres comptes qui cherchent la même
   * compétence dans la même zone.
   */
  @Get('needs/:needId/reverse-prospects')
  async reverseProspects(
    @Param('needId', ParseUUIDPipe) needId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ReverseProspectsResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const result = await this.openNeeds.findReverseProspects(needId, workspaceId, user.userId)
    if (!result) throw new NotFoundException('Besoin introuvable')
    return result
  }

  /**
   * #2320.1 (épopée #2795) — la chronologie des STATUTS d'un besoin (matching
   * → qualifié → présenté → gagné/perdu…), lue dans le journal
   * `commercial_transitions` (#2320.23) que `changeNeedStatus` écrit déjà.
   * Lecture seule, aucun crédit.
   *
   * ⚠️ Distinct de `GET needs/:needId/history` ci-dessus : celui-ci relit les
   * DÉCISIONS des portes (`DecisionGatesService.forSubject`, ex. « staffable,
   * raison X »), pas les changements de statut — deux journaux différents,
   * jamais fusionnés sous le même nom de route.
   */
  @Get('needs/:needId/status-history')
  @WorkspaceRead()
  async needStatusHistory(
    @Param('needId', ParseUUIDPipe) needId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: CommercialTransitionEntry[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.pipeline.needStatusHistory(workspaceId, needId) }
  }

  /**
   * Les DOCUMENTS d'un besoin — devis, NDA, contrat cadre — et leur statut
   * (fiche besoin, dossier du 26/08 image 02). Lecture seule : voir le
   * docblock de `NeedDocumentsService`.
   */
  @Get('needs/:needId/documents')
  @WorkspaceRead()
  async listNeedDocuments(
    @Param('needId', ParseUUIDPipe) needId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: NeedDocument[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.needDocuments.list(workspaceId, needId) }
  }

  /**
   * Ce que le STOCKAGE porte pour ce besoin (31/08/2026).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI UNE ROUTE SÉPARÉE DE `documents`
   * ─────────────────────────────────────────────────────────────────────────
   * Un document et son fichier ne sont pas la même chose, et le contrat le dit
   * déjà : `needDocumentSchema` décrit une pièce qu'on SUIT (« la NDA est
   * signée »), qu'on l'ait reçue ou non. Les faits de FICHIER — poids, type,
   * échéance de conservation, porte de téléchargement — appartiennent au
   * stockage, qui ne connaît pas les besoins. Les fondre aurait fait porter à
   * `NeedDocument` des champs `null` sur toutes les lignes d'avant ce lot, et
   * transformé « on suit une pièce qu'on n'a pas » en « il manque une donnée ».
   *
   * `usedBytes` / `quotaBytes` voyagent avec : l'écran peut ainsi annoncer un
   * refus de quota AVANT de faire attendre deux minutes.
   */
  @Get('needs/:needId/document-files')
  @WorkspaceRead()
  async listNeedDocumentFiles(
    @Param('needId', ParseUUIDPipe) needId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<NeedDocumentFilesResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const byDocument = await this.needDocuments.objectIdsOf(workspaceId, needId)
    const objects = await this.storage.byIds(workspaceId, [...byDocument.values()])
    const files: NeedDocumentFile[] = []
    for (const [documentId, objectId] of byDocument) {
      const record = objects.get(objectId)
      // Un objet référencé mais introuvable est SAUTÉ, jamais inventé : c'est
      // ce qui arrive à une pièce dont la purge de rétention a emporté le
      // fichier, et l'écran doit alors dire « plus de fichier », pas mentir.
      if (record) files.push({ ...toStoredFile(record, needDocumentDownloadPath(needId, documentId)), documentId })
    }
    return { files, usedBytes: await this.storage.usedBytes(workspaceId), quotaBytes: this.storage.quotaBytes() }
  }

  /**
   * DÉPOSE un document sur un besoin — le geste que la fiche n'avait pas.
   *
   * Deux écritures et un retour en arrière, comme pour un justificatif de note
   * de frais : les octets, puis la ligne, et si la ligne échoue les octets
   * repartent. Sans quoi le quota de l'espace enflerait sans qu'aucune ligne ne
   * le dise.
   */
  @Post('needs/:needId/documents')
  @RequirePermission('records:write')
  async createNeedDocument(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Body() body: CreateNeedDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ document: NeedDocument; file: NeedDocumentFile }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const stored = await this.storage.put({
      workspaceId,
      domain: 'need_document',
      fileName: body.fileName,
      contentType: body.contentType,
      fileB64: body.fileB64,
      uploadedBy: user.userId,
      today: new Date().toISOString().slice(0, 10),
    })
    try {
      const document = await this.needDocuments.create(workspaceId, needId, {
        kind: body.kind,
        // Un nom vide retombe sur le nom du FICHIER — jamais sur une chaîne
        // inventée. C'est le seul repli honnête : il désigne la même pièce.
        name: body.name.trim() || stored.fileName,
        storageObjectId: stored.id,
      })
      return {
        document,
        file: { ...toStoredFile(stored, needDocumentDownloadPath(needId, document.id)), documentId: document.id },
      }
    } catch (error) {
      await this.storage.remove(workspaceId, stored.id)
      throw error
    }
  }

  /** Dire où en est une pièce : envoyée, en attente, signée, refusée. Le second
   *  geste qui manquait — un fichier qu'on peut ouvrir mais dont l'état ne
   *  bouge jamais est un classeur, pas un suivi d'affaire. */
  @Patch('needs/:needId/documents/:documentId/status')
  @RequirePermission('records:write')
  async updateNeedDocumentStatus(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() body: UpdateNeedDocumentStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<NeedDocument> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.needDocuments.updateStatus(workspaceId, needId, documentId, body.status)
  }

  /**
   * OUVRE la pièce — une URL signée qui vit cinq minutes.
   *
   * ⚠️ L'URL n'est signée qu'APRÈS que le BESOIN a été retrouvé dans l'espace
   * du demandeur et que le document a été retrouvé sur CE besoin. Le stockage
   * ne connaît ni l'un ni l'autre : c'est ce qui interdit de lui confier la
   * vérification, et ce qui fait qu'un identifiant deviné n'ouvre rien.
   *
   * Pas de `finance:read` ici, contrairement à un justificatif de note de
   * frais : un devis porte un montant, mais c'est le montant de l'affaire, que
   * la fiche besoin affiche déjà à qui la lit. Fermer le fichier aurait gardé
   * une porte à côté d'une fenêtre ouverte.
   */
  @Get('needs/:needId/documents/:documentId/download')
  @WorkspaceRead()
  async downloadNeedDocument(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SignedDownload> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const objectId = (await this.needDocuments.objectIdsOf(workspaceId, needId)).get(documentId)
    if (!objectId) {
      // Le document EXISTE peut-être, mais nous ne détenons pas ses octets. Le
      // dire évite d'envoyer chercher une pièce qui est pourtant à l'écran.
      throw new NotFoundException('Ce document n’a pas de fichier stocké ici.')
    }
    return this.storage.signedUrlFor(workspaceId, objectId)
  }

  /**
   * Les « prochaines étapes » COCHABLES d'un besoin (fiche besoin, dossier du
   * 26/08 image 02) — distinctes de `needNextAction`, une dérivation non
   * persistée qui reste à côté (voir `need-step.ts`).
   */
  @Get('needs/:needId/steps')
  @WorkspaceRead()
  async listNeedSteps(
    @Param('needId', ParseUUIDPipe) needId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: NeedStep[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.needSteps.list(workspaceId, needId) }
  }

  @Post('needs/:needId/steps')
  @RequirePermission('records:write')
  async createNeedStep(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Body() body: CreateNeedStepDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<NeedStep> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.needSteps.create(workspaceId, needId, body)
  }

  /** Cocher, décocher, ou marquer « en attente » — le geste qui manquait :
   *  avant ce lot, la seule « prochaine étape » de la fiche était une
   *  étiquette dérivée, non cochable. */
  @Patch('needs/:needId/steps/:stepId')
  @RequirePermission('records:write')
  async updateNeedStep(
    @Param('needId', ParseUUIDPipe) needId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() body: UpdateNeedStepDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<NeedStep> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.needSteps.updateStatus(workspaceId, needId, stepId, body)
  }

  /**
   * L'« Historique » d'un besoin — ce qui a été DÉCIDÉ dessus, le plus récent
   * d'abord.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CE N'EST PAS `GET /decision-gates/need/:needId`
   * ─────────────────────────────────────────────────────────────────────────
   * Cette lecture existe déjà (`DecisionGatesController.forSubject`), et elle
   * n'est pas réécrite ici : `this.gates.forSubject` est LA MÊME méthode, sur
   * LE MÊME service, déjà injecté dans ce contrôleur pour la porte G3
   * ci-dessus. Seule la PORTE change. `decision-gates` est réservé à
   * `team:manage` — relire les décisions d'une ÉQUIPE est un geste
   * d'encadrement — alors que la fiche d'un besoin s'ouvre à quiconque voit ce
   * besoin. La réserver à `team:manage` aurait fermé l'onglet au recruteur
   * qui vient justement de décider (« non staffable, raison X ») sur SON
   * propre besoin.
   *
   * `@Optional()` sur `this.gates` (voir le constructeur) : une fiche sans
   * historique reste une fiche, elle ne doit pas dépendre d'un module tiers.
   */
  @Get('needs/:needId/history')
  @WorkspaceRead()
  async needHistory(@Param('needId', ParseUUIDPipe) needId: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    if (!this.gates) return { crossings: [] }
    return { crossings: await this.gates.forSubject(workspaceId, 'need', needId) }
  }

  /**
   * Refonte Théo — fiche besoin (`affaires/besoin.html#besoin-avant-mission`, AFFAIRES-B5) : ce qui
   * MANQUERA au passage en mission, relu sur `missionHandoffCheck` (le même contrôle que Laura) — aucun
   * second calcul. `@WorkspaceRead()`, comme l'historique : rien qui ne soit déjà sur la fiche.
   */
  @Get('needs/:needId/handoff-check')
  @WorkspaceRead()
  async needHandoffCheck(@Param('needId', ParseUUIDPipe) needId: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const check = await this.needCommercialState?.missionHandoffCheck(workspaceId, needId)
    if (!check) throw new NotFoundException('Besoin introuvable')
    return check
  }

  /**
   * Refonte Théo — fiche besoin (`affaires/besoin.html#besoin-doublons`, AFFAIRES-B4) : les doublons
   * PROBABLES du même besoin dans le même compte. Une lecture : on nomme, on ne fusionne jamais.
   */
  @Get('needs/:needId/duplicates')
  @WorkspaceRead()
  async needDuplicates(@Param('needId', ParseUUIDPipe) needId: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const duplicates = await this.needCommercialState?.duplicateCandidates(workspaceId, needId)
    if (!duplicates) throw new NotFoundException('Besoin introuvable')
    return duplicates
  }

  /**
   * LE VERDICT « GO / NO-GO » d'un besoin — six axes, trois issues.
   *
   * ⚠️ Une LECTURE, et rien d'autre. Elle ne lance aucun rapprochement : elle
   * relit le dernier DÉJÀ exécuté. Lancer un matching est une mutation qui
   * écrit un journal de conformité, et une obligation de conformité ne se
   * déclenche pas parce que quelqu'un a ouvert un onglet. Aucun rapprochement
   * en magasin ⇒ deux axes non renseignés, qui le DISENT, et le verdict devient
   * « je manque de données ». Voir le docblock de {@link NeedVerdictService}.
   *
   * `@WorkspaceRead()`, comme l'historique juste au-dessus et pour la même
   * raison : ce que la réponse porte est déjà visible de quiconque ouvre cette
   * fiche — les compteurs viennent du besoin lui-même, et les noms des profils
   * sont ceux que l'onglet Positionnements affiche déjà. Aucun MONTANT ne sort
   * ici : l'axe économique rend des ÉTATS, et les centimes qu'il compare sont
   * ceux que `OpenNeedRow` sert déjà à cet écran.
   */
  @Get('needs/:needId/verdict')
  @WorkspaceRead()
  async needVerdictFor(
    @Param('needId', ParseUUIDPipe) needId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<NeedVerdictResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const verdict = await this.needVerdict.forNeed(workspaceId, needId, new Date(), user.userId)
    // #3390.9 — les 5P du compte (readiness + prochaine dimension), jamais recalculés ici.
    const accountId = this.accountStrategy5P ? await this.needVerdict.accountIdOf(workspaceId, needId) : null
    const strategy = accountId ? await this.accountStrategy5P?.strategyFor(accountId, workspaceId) : null
    if (!strategy || !verdict.commercialContext) return verdict
    return {
      ...verdict,
      commercialContext: {
        ...verdict.commercialContext,
        fiveP: { readiness: strategy.readiness, nextDimension: strategy.next_action_dimension },
      },
    }
  }

  /**
   * #2323.32/.34/.35/.36 / #2323.38-.45 — « CE QUE LE POSTE EXIGE » : la
   * question prioritaire par axe, et les contradictions détectées.
   *
   * ⚠️ Une LECTURE, comme `/verdict` juste au-dessus : `NeedContradictionsService`
   * ne calcule rien, il lit le besoin et trois agrégations de l'espace, et
   * passe le tout aux deux modules purs (`need-qualification-questions.ts`,
   * `need-contradictions.ts`). `@WorkspaceRead()` : tout ce que la réponse
   * porte est déjà visible sur cette même fiche.
   */
  @Get('needs/:needId/qualification')
  @WorkspaceRead()
  async needQualificationFor(
    @Param('needId', ParseUUIDPipe) needId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<NeedQualificationResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.needContradictions.forNeed(workspaceId, needId)
  }

  /** Les motifs de non-staffabilité de l'espace. Lecture ouverte : savoir ce
   *  que l'ESN ne sait pas faire n'est pas une information sensible, c'est ce
   *  qui évite de repromettre. */
  @Get('needs/unstaffable-reasons')
  async listUnstaffableReasons(
    @CurrentUser() user: CurrentUserPayload,
    @Query('lang') lang?: string,
  ): Promise<{ items: { label: string; used: boolean }[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pipeline.listUnstaffableReasons(workspaceId, lang === 'en' ? 'en' : 'fr')
  }

  @Delete('needs/:needId')
  @RequirePermission('records:write')
  @HttpCode(204)
  async removeNeed(
    @Param('needId', ParseUUIDPipe) needId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.pipeline.removeNeed(workspaceId, needId)
  }

  /* ── Les interlocuteurs ──────────────────────────────────────────────────── */

  @Get(':id/contacts')
  async listContacts(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: ProjectContact[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.pipeline.listContacts(workspaceId, id) }
  }

  @Put(':id/contacts/:contactId')
  @RequirePermission('records:write')
  @HttpCode(204)
  async linkContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() body: LinkProjectContactDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.pipeline.linkContact(workspaceId, id, contactId, body.role)
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermission('records:write')
  @HttpCode(204)
  async unlinkContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.pipeline.unlinkContact(workspaceId, id, contactId)
  }

  /* ── Le cycle ────────────────────────────────────────────────────────────── */

  /**
   * Déplacer le projet dans son cycle. Aucune transition n'est interdite :
   * reculer est un geste de correction, et un pipe qui l'interdit se fait
   * contourner par des projets qu'on n'ose plus toucher.
   */
  @Patch(':id/stage')
  @RequirePermission('records:write')
  async updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectStageDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #4195 — lue AVANT le déplacement : seule une VRAIE signature (`won` depuis un autre
    // stade) crée les missions ; un second « gagné » ne produit rien.
    const previousStage = body.stage === 'won' ? ((await this.projects.getRow(id, workspaceId))?.stage ?? null) : null
    const updated = await this.projects.updateStage(
      id,
      workspaceId,
      body.stage,
      body.loss_reason ?? null,
      user.userId,
      {
        strategy: body.strategy,
        buying_model: body.buying_model,
        organisation: body.organisation,
        loss_reason_code: body.loss_reason_code,
      },
    )
    if (!updated) throw new NotFoundException('Projet introuvable')

    // Porte G8 — clore un projet est une décision, pas un déplacement. Elle est
    // journalisée ICI et non dans le service : c'est le contrôleur qui connaît
    // l'humain qui a cliqué, et la règle §3.2 veut qu'un service n'aille pas
    // chercher le service d'un autre module. Best-effort et APRÈS le
    // déplacement : une décision déjà prise ne doit pas échouer parce que son
    // journal est indisponible.
    if (body.stage === 'won' || body.stage === 'lost') {
      await this.recordCloseGate(workspaceId, user.userId, id, body.stage, body.loss_reason ?? null)
    }

    const signing = body.stage === 'won' && previousStage !== 'won'
    const actions = await this.applyStageActions(
      workspaceId,
      user.userId,
      updated,
      body.accepted_actions ?? [],
      signing,
    )
    return { project: updated, actions }
  }

  /**
   * Exécute ce que l'utilisateur a coché, et REND le reste.
   *
   * Le panneau d'effets cochait « créer la mission » par défaut depuis le
   * premier jour et le client jetait la liste au moment d'envoyer : aucune
   * mission n'a jamais été créée par ce chemin. On exécute donc ce que le
   * serveur sait faire, et tout le reste ressort en `pending` — un rappel
   * affiché reste honnête, une case qui ne fait rien ne l'est pas.
   *
   * Orchestration DANS LE CONTRÔLEUR, comme la porte G8 juste au-dessus : c'est
   * la couche où un geste utilisateur traverse légitimement deux domaines
   * (§3.2, mesurée par la garde GA-07).
   */
  private async applyStageActions(
    workspaceId: string,
    userId: string,
    project: ProjectRow,
    accepted: readonly string[],
    signing: boolean,
  ): Promise<StageMoveOutcome> {
    const { server: asked, pending } = splitStageActions(accepted)
    const performed: string[] = []
    const failed: Array<{ key: string; reason: string }> = []
    // #4195 — `create_mission` n'est plus une case : la signature l'exécute TOUJOURS, une fois,
    // que l'ancien client l'ait envoyée ou non ; hors signature (second « gagné », autre étape),
    // la clé est ignorée.
    const server = [...(signing ? (['create_mission'] as const) : []), ...asked.filter(key => key !== 'create_mission')]
    const created: StageActionResult[] = []

    for (const key of server) {
      try {
        // #4339.2 — une proposition « tâche » / « brouillon » / « matching » : le service EXISTANT, un résultat visible.
        const execution = stageActionExecution(key)
        if (execution && execution.kind !== 'account') {
          const result = await this.executeProposal(workspaceId, userId, project, key, execution)
          if ('failure' in result) failed.push({ key, reason: result.failure })
          else {
            performed.push(key)
            created.push(result)
          }
          continue
        }
        if (key === 'create_mission') {
          if (!this.delivery) {
            failed.push({ key, reason: 'unavailable' })
            continue
          }
          const retained = await this.retainedOf(workspaceId, project.id)
          // #4291.8 (#4270.4) — un besoin gagné au forfait encadré n'a aucun positionnement à attendre : il devient
          // sa propre mission SUIVIE (forfait, sans staffing), pas la mission « à staffer » générique de l'affaire.
          const allNeeds = [...(await this.needsOf(workspaceId, project.id)).values()]
          const retainedNeedIds = new Set(retained.map(item => item.needId))
          const forfaitNeeds = allNeeds.filter(need => !needRequiresStaffing(need) && !retainedNeedIds.has(need.id))
          const staffedUnfilled = allNeeds.some(need => needRequiresStaffing(need) && !retainedNeedIds.has(need.id))
          let forfaitFailed = false
          for (const need of forfaitNeeds) {
            try {
              await this.delivery.create(userId, {
                accountId: project.account_id,
                opportunityId: project.id,
                label: project.label,
                needId: need.id,
                ...(need.start_on ? { startedOn: need.start_on } : {}),
                ...(need.start_on && need.duration_months
                  ? { endsOn: missionEndsOn(need.start_on, need.duration_months) }
                  : {}),
                contractKind: 'forfait',
              })
            } catch (err) {
              forfaitFailed = true
              this.logger.error('stage action failed', { error: err, tags: { action: key, needId: need.id } })
            }
          }
          if (forfaitFailed) failed.push({ key, reason: 'failed' })
          // Le chemin historique (une mission sans positionnement) reste celui d'une affaire SANS forfait,
          // ou dont d'autres besoins staffés attendent encore leur positionnement.
          if (retained.length === 0 && (forfaitNeeds.length === 0 || staffedUnfilled)) {
            const soleNeed = await this.soleNeedOf(workspaceId, project.id)
            const sole =
              soleNeed && this.submissions ? await this.acceptedSubmissionOf(workspaceId, soleNeed.needId) : null
            await this.delivery.create(userId, {
              accountId: project.account_id,
              opportunityId: project.id,
              label: project.label,
              ...(soleNeed ?? {}),
              ...(sole ? { submissionId: sole.id, consultantId: sole.consultantId } : {}),
              contractKind: 'inconnu',
            })
          } else if (retained.length > 0) {
            // Une mission par positionnement retenu, pré-remplie depuis le positionnement et son
            // besoin. Une mission qui échoue ne prive pas les suivantes (l'unicité
            // (affaire, positionnement) rend un doublon inoffensif).
            const needs = await this.needsOf(workspaceId, project.id)
            let anyFailed = false
            for (const item of retained) {
              try {
                const need = item.needId ? needs.get(item.needId) : undefined
                await this.delivery.create(userId, {
                  accountId: project.account_id,
                  opportunityId: project.id,
                  label: project.label,
                  submissionId: item.id,
                  consultantId: item.consultantId,
                  ...(need ? { needId: need.id } : {}),
                  ...(item.proposedRateCents != null && item.proposedRateCents > 0
                    ? { dailyRate: item.proposedRateCents / 100 }
                    : {}),
                  ...(need?.start_on ? { startedOn: need.start_on } : {}),
                  // Fin = début + durée − 1 jour, SEULEMENT si les deux existent : jamais inventée.
                  ...(need?.start_on && need.duration_months
                    ? { endsOn: missionEndsOn(need.start_on, need.duration_months) }
                    : {}),
                  contractKind: need?.contract_kind ?? 'inconnu',
                })
              } catch (err) {
                anyFailed = true
                this.logger.error('stage action failed', { error: err, tags: { action: key, submissionId: item.id } })
              }
            }
            if (anyFailed) {
              failed.push({ key, reason: 'failed' })
              continue
            }
          }
          if (forfaitFailed) continue
          performed.push(key)
        } else if (key === 'park_account') {
          if (!this.accountGate) {
            failed.push({ key, reason: 'unavailable' })
            continue
          }
          // Le motif de la perte devient le motif de l'écartement : c'est la
          // seule raison qu'on ait, et en redemander une ici la ferait remplir
          // n'importe comment.
          await this.accountGate.decide(workspaceId, project.account_id, 'parked', project.loss_reason ?? null)
          performed.push(key)
        }
      } catch (err) {
        // Le déplacement lui-même est DÉJÀ écrit : une action qui échoue ne le
        // défait pas, elle se dit.
        this.logger.error('stage action failed', { error: err, tags: { action: key } })
        failed.push({ key, reason: err instanceof HttpException ? err.message : 'failed' })
      }
    }

    return { performed, pending, failed, created }
  }

  /**
   * #4339.2 — exécute UNE proposition cochée et REND son résultat visible, ou la raison de son échec.
   *
   *  · tâche : `TasksService.create`, datée (`dueInDays`), rattachée à l'affaire et au compte — elle remonte dans
   *    Aujourd'hui à son échéance ;
   *  · brouillon : `MailboxService.createDraft` au premier contact de l'affaire qui porte une adresse. Le copilote ne
   *    fait JAMAIS partir d'e-mail : sans adresse, aucun brouillon n'est inventé (`no_recipient`) ;
   *  · matching : `MatchingService.matchNeed`, le MÊME appel que « Classer les profils » sur le besoin, pour chaque
   *    besoin de l'affaire (`no_need` s'il n'y en a aucun : un matching à vide n'apprend rien).
   */
  private async executeProposal(
    workspaceId: string,
    userId: string,
    project: ProjectRow,
    key: string,
    execution: NonNullable<ReturnType<typeof stageActionExecution>>,
  ): Promise<StageActionResult | { failure: string }> {
    if (execution.kind === 'task') {
      const text = STAGE_ACTION_TASKS[key]
      if (!this.tasks || !text) return { failure: 'unavailable' }
      const due = new Date()
      due.setDate(due.getDate() + execution.dueInDays)
      const task = await this.tasks.create(userId, {
        title: text.title,
        dueOn: dayKey(due),
        priority: 'normal',
        objective: text.objective,
        expectedResult: text.expectedResult,
        accountId: project.account_id,
        projectId: project.id,
      })
      return { key, kind: 'task', id: task.id, href: null }
    }
    if (execution.kind === 'draft') {
      if (!this.mailbox) return { failure: 'unavailable' }
      const contacts = await this.pipeline.listContacts(workspaceId, project.id)
      const recipient = contacts.find(contact => contact.email?.trim())?.email?.trim()
      if (!recipient) return { failure: 'no_recipient' }
      const draft = await this.mailbox.createDraft(userId, {
        to: recipient,
        cc: [],
        subject: `Suite à ma proposition — ${project.label}`,
        body: `Bonjour,\n\nJe reviens vers vous au sujet de « ${project.label} » : avez-vous pu regarder le profil que je vous ai présenté ? Je reste à votre disposition pour caler un entretien.\n\nBien cordialement,`,
        appendSignature: true,
        documentIds: [],
      } as Parameters<MailboxService['createDraft']>[1])
      return { key, kind: 'draft', id: draft.draftId ?? null, href: draft.webUrl ?? null }
    }
    if (execution.kind === 'matching') {
      if (!this.matching) return { failure: 'unavailable' }
      const needs = await this.pipeline.listNeeds(workspaceId, project.id)
      if (needs.length === 0) return { failure: 'no_need' }
      const { role } = await this.workspaceContext.resolveActiveWorkspace(userId)
      let firstRanked: string | null = null
      for (const need of needs) {
        const run = await this.matching.matchNeed(need.id, workspaceId, userId, {
          canReadFinance: can(role, [], 'finance:read'),
        })
        if (run && !firstRanked) firstRanked = need.id
      }
      return firstRanked ? { key, kind: 'matching', id: firstRanked, href: null } : { failure: 'no_need' }
    }
    return { failure: 'unavailable' }
  }

  /**
   * LE RÔLE D'ORIGINE D'UNE MISSION — et seulement quand il est CERTAIN
   * (arbitrage du 31/08/2026, colonne `missions.need_id`).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI « EXACTEMENT UN », ET PAS « LE PREMIER »
   * ─────────────────────────────────────────────────────────────────────────
   * `create_mission` naît d'un PROJET qui passe à « gagné », et un projet porte
   * souvent plusieurs rôles (`ProjectNeedsPanel` existe pour ça). Prendre le
   * premier de la liste, ou le plus récent, ou le seul encore ouvert,
   * attribuerait à un rôle précis une mission dont personne n'a dit qu'elle
   * venait de lui — et ce lien inventé serait relu six mois plus tard comme un
   * fait, exactement ce que la doctrine « jamais de donnée fictive » refuse.
   *
   * Une affaire à un seul rôle est le cas ordinaire, et il n'y a là aucune
   * ambiguïté : la mission vient de ce rôle-là.
   *
   * Rend un OBJET à étaler (`{ needId }`) plutôt qu'un `string | null` : le
   * champ du contrat est `.optional()`, donc l'étalement d'un objet vide est ce
   * qui exprime « je ne le dis pas », là où un `needId: undefined` explicite
   * ferait passer une absence pour une réponse.
   *
   * ⚠️ Une lecture en échec ne fait PAS échouer la création : la mission est le
   * geste demandé, le lien n'en est qu'une décoration utile. Sans lui, l'écran
   * dit « non mesuré » — ce qui est exactement vrai.
   *
   * #2191.11 / #2191.13 — LA DATE DE DÉBUT ET LE TJM CIBLE DU BESOIN, à LA
   * MÊME CONDITION.
   *
   * Le PROJET ne porte ni l'un ni l'autre (`applyStageActions` ne les invente
   * pas). Le BESOIN, lui, les porte déjà (`start_on`, `target_tjm_cents`) —
   * une donnée qu'un commercial a tapée UNE fois en créant le besoin, et qui
   * se retapait pourtant à la main sur la fiche mission juste après. `null` /
   * absent reste `undefined` ici : ni date ni TJM inventés quand le besoin ne
   * les porte pas non plus.
   */
  private async soleNeedOf(
    workspaceId: string,
    projectId: string,
  ): Promise<{ needId: string; startedOn?: string; dailyRate?: number } | null> {
    try {
      const needs = await this.pipeline.listNeeds(workspaceId, projectId)
      if (needs.length !== 1) return null
      const only = needs[0]
      if (!only) return null
      return {
        needId: only.id,
        startedOn: only.start_on ?? undefined,
        // Le besoin porte son TJM cible en CENTIMES ; la mission le porte en
        // EUROS (`createMissionRequestSchema.dailyRate`) — même conversion que
        // le reste de la facturation.
        dailyRate: only.target_tjm_cents != null ? only.target_tjm_cents / 100 : undefined,
      }
    } catch (err) {
      this.logger.error('lecture des besoins du projet en échec', { error: err, tags: { projectId } })
      return null
    }
  }

  /** #4195 — les positionnements retenus de l'affaire ; une lecture en échec rend `[]` (chemin historique). */
  private async retainedOf(workspaceId: string, projectId: string) {
    if (!this.submissions) return []
    try {
      return await this.submissions.acceptedForOpportunity(workspaceId, projectId)
    } catch (err) {
      this.logger.error('lecture des positionnements retenus en échec', { error: err, tags: { projectId } })
      return []
    }
  }

  private async needsOf(workspaceId: string, projectId: string): Promise<Map<string, ProjectNeed>> {
    try {
      return new Map((await this.pipeline.listNeeds(workspaceId, projectId)).map(need => [need.id, need]))
    } catch (err) {
      this.logger.error('lecture des besoins du projet en échec', { error: err, tags: { projectId } })
      return new Map()
    }
  }

  /**
   * #2339.7 (épopée #2795) — LE positionnement RETENU du besoin converti, pour
   * rattacher la mission au TALENT réellement positionné (`missions.submission_id`).
   * Même prudence que `soleNeedOf` juste au-dessus : une erreur de lecture ne
   * doit jamais faire échouer la création de la mission, elle rend seulement
   * `null` — la mission naît alors sans rattachement, comme avant ce lot.
   */
  private async acceptedSubmissionOf(
    workspaceId: string,
    needId: string,
  ): Promise<{ id: string; consultantId: string } | null> {
    if (!this.submissions) return null
    try {
      return await this.submissions.acceptedForNeed(workspaceId, needId)
    } catch (err) {
      this.logger.error('lecture du positionnement retenu en échec', { error: err, tags: { needId } })
      return null
    }
  }

  /**
   * #2172.36 -> .40 / .53 - CONVERTIR UNE PISTE EN OPPORTUNITE.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI UNE ROUTE, ET PAS QUATRE APPELS DEPUIS L'ECRAN
   * ───────────────────────────────────────────────────────────────────────────
   * Les cinq champs du contrat atterrissent dans TROIS tables : la ligne elle-
   * meme (etape, porteur, objectif), une tache (la prochaine action), un role
   * (le besoin eventuel). Laisser le client enchainer quatre requetes rendrait
   * une conversion a moitie faite indiscernable d'une conversion reussie : le
   * formulaire se ferme, et personne ne sait laquelle des quatre a echoue.
   *
   * Ce qui est demande ici est EXACTEMENT ce que le contrat fige, et rien de
   * plus : tout ce que le dossier sait deja - le compte, le libelle, le
   * perimetre, les faits sources, la date, l'expertise rapprochee - est REPRIS,
   * jamais retape (#2172.53).
   *
   * L'ordre n'est pas indifferent : la ligne d'abord (c'est elle qui fait
   * entrer la piste dans le pipe, et c'est elle qui peut ne pas exister), les
   * deux satellites ensuite. La reponse dit ce qui a ete ecrit - un `null` sur
   * la tache ou le role se lit, il ne se devine pas.
   */
  @Post(':id/convert')
  @RequirePermission('records:write')
  async convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: LeadConversionDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ project: ProjectRow; next_action: { id: string } | null; need: { id: string } | null }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Meme garde que sur le porteur d'un projet et sur celui d'un besoin :
    // attribuer a quelqu'un hors de l'espace creerait un porteur fantome.
    await this.workspaceContext.assertMember(body.owner_id, workspaceId)

    const project = await this.projects.applyConversion(
      id,
      workspaceId,
      { stage: body.initial_stage, ownerId: body.owner_id, objective: body.objective },
      user.userId,
    )
    if (!project) throw new NotFoundException('Projet introuvable')

    const task = this.tasks
      ? await this.tasks.create(
          user.userId,
          {
            title: body.next_action.title,
            dueOn: body.next_action.due_on,
            priority: 'normal',
            ownerId: body.owner_id,
            accountId: project.account_id,
            projectId: project.id,
            // #2395.8 (épopée #2871) — le même objectif que celui déjà
            // saisi pour l'opportunité (`body.objective`), jamais un second
            // texte deviné : cette tâche EST le premier pas vers lui.
            objective: body.objective,
            // #2395.8, seconde moitié — cette première étape a eu lieu et
            // l'opportunité a avancé : rien de plus n'est vérifiable depuis
            // cette route, qui ne demande pas de critère de succès distinct.
            expectedResult: `« ${body.next_action.title} » a eu lieu, l’opportunité a avancé.`,
          },
          // #2105.7 — cette tâche naît d'une conversion, pas du composeur manuel.
          'lead_conversion',
        )
      : null

    // `null` = il n'y a pas encore de besoin, et c'est une vraie reponse. En
    // creer un vide donnerait un role sans intitule dans le pipe de quelqu'un.
    const need = body.need
      ? await this.pipeline.addNeed(workspaceId, id, { title: body.need, owner_id: body.owner_id })
      : null

    return { project, next_action: task ? { id: task.id } : null, need: need ? { id: need.id } : null }
  }

  @Patch(':id/owner')
  @RequirePermission('records:write')
  async updateOwner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectOwnerDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Attribuer à quelqu'un hors de l'espace créerait un porteur fantôme : la
    // ligne aurait un propriétaire que personne ne voit.
    if (body.owner_id) await this.workspaceContext.assertMember(body.owner_id, workspaceId)
    const updated = await this.projects.updateOwner(id, workspaceId, body.owner_id)
    if (!updated) throw new NotFoundException('Projet introuvable')
    return updated
  }

  /**
   * #2939 (#2174.10) — RATTACHER LE PROJET À UNE ENTITÉ DU COMPTE (filiale,
   * BU) — voir `ProjectPipelineService.setProjectEntity` pour la raison de
   * cette porte. `entity_id: null` détache, même geste que
   * `PATCH /contacts/:contactId/entity`.
   */
  @Patch(':id/entity')
  @RequirePermission('records:write')
  async setProjectEntity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetProjectEntityDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ entity_id: string | null }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pipeline.setProjectEntity(workspaceId, id, body.entity_id)
  }

  @Patch(':id/close-date')
  @RequirePermission('records:write')
  async updateCloseDate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectCloseDateDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const updated = await this.projects.updateExpectedClose(id, workspaceId, body.expected_close_on)
    if (!updated) throw new NotFoundException('Projet introuvable')
    return updated
  }

  /**
   * #3246 — stratégie / modèle d'achat d'une affaire (clôturée ou non), SANS
   * rejouer le déplacement d'étape. Lecture : `null` = jamais saisi. La lecture
   * porte la même permission que l'écriture : elle n'alimente que le formulaire
   * d'écriture (un lecteur seul n'a rien à y voir, et GA-05 gèle les routes nues).
   */
  @Get(':id/case-dimensions')
  @RequirePermission('records:write')
  async readCaseDimensions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const dims = await this.projects.readCaseDimensions(id, workspaceId)
    if (!dims) throw new NotFoundException('Projet introuvable')
    return dims
  }

  @Patch(':id/case-dimensions')
  @RequirePermission('records:write')
  async updateCaseDimensions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectCaseDimensionsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const dims = await this.projects.updateCaseDimensions(id, workspaceId, body)
    if (!dims) throw new NotFoundException('Projet introuvable')
    return dims
  }

  /**
   * Saisir/effacer le montant d'affaire estimé. `estimated_amount: null` efface.
   * Aucun crédit débité — c'est une saisie manuelle, pas un enrichissement.
   */
  @Patch(':id/amount')
  @RequirePermission('records:write')
  async updateAmount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectAmountDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const updated = await this.projects.updateAmount(id, workspaceId, body.estimated_amount)
    if (!updated) throw new NotFoundException('Projet introuvable')
    return updated
  }

  /**
   * L2 Pipe — saisir/effacer la catégorie DÉCLARÉE de l'opportunité
   * (`forecast_category: null` efface). Même porte que le montant et le risque.
   */
  @Patch(':id/forecast-category')
  @RequirePermission('records:write')
  async updateForecastCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectForecastCategoryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const updated = await this.projects.updateForecastCategory(id, workspaceId, body.forecast_category)
    if (!updated) throw new NotFoundException('Projet introuvable')
    return updated
  }

  /**
   * #2324.37 — saisir/effacer les risques de l'affaire (`risks: null` efface).
   * Même porte que le montant ; c'est aussi la route qu'emprunte le clic sur
   * une carte `propose_opportunity_update` de Laura (champ `risk`).
   */
  @Patch(':id/risks')
  @RequirePermission('records:write')
  async updateRisks(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectRisksDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const updated = await this.projects.updateRisks(id, workspaceId, body.risks)
    if (!updated) throw new NotFoundException('Projet introuvable')
    return updated
  }

  /**
   * #3266.1 (#3292) — saisir/effacer le grain équipe/site/projet de
   * l'opportunité (`scope_label: null` efface). Même porte que les risques.
   */
  @Patch(':id/scope')
  @RequirePermission('records:write')
  async updateScope(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectScopeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const updated = await this.projects.updateScope(id, workspaceId, body.scope_label)
    if (!updated) throw new NotFoundException('Projet introuvable')
    return updated
  }

  /**
   * Le secteur d'APPLICATION de la demande, et la famille de prestation achetée
   * (addendum Stelya §4.1, doctrine C05).
   *
   * Les colonnes existaient depuis le 24/08 et l'axe `sector` du matching les
   * LISAIT ; aucune route ne pouvait les écrire. L'axe retombait donc toujours
   * sur le secteur du COMPTE, en le disant — mais personne ne pouvait faire
   * mieux que ce repli.
   */
  @Patch(':id/sectors')
  @RequirePermission('records:write')
  async updateSectors(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectSectorsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const updated = await this.projects.updateSectors(id, workspaceId, body)
    if (!updated) throw new NotFoundException('Projet introuvable')
    return updated
  }

  /**
   * Qualification BTMMP (annexe méthodo p21). Fusion present-only : un axe
   * absent n'écrase rien.
   */
  @Patch(':id/btmmp')
  @RequirePermission('records:write')
  async updateBtmmp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBtmmpDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const updated = await this.projects.updateBtmmp(id, workspaceId, body)
    if (!updated) throw new NotFoundException('Projet introuvable')
    return updated
  }

  /**
   * Exporter le projet vers le CRM connecté (Théo TF1 p39). Le projet est relu
   * côté serveur dans l'espace de l'appelant ; aucun CRM connecté → 409 avec un
   * message actionnable, refus du CRM → 502.
   */
  @Post(':id/export-crm')
  @RequirePermission('data:export')
  async exportToCrm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectCrmExportResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const row = await this.projects.getRow(id, workspaceId)
    if (!row) throw new NotFoundException('Projet introuvable')

    const result = await this.crmTask.exportTask(
      user.userId,
      buildBesoinTask(row, (await this.brands.getForUser(user.userId)).name),
    )
    if (isFailure(result)) throwCrmTaskFailure(result.problem)
    return result.output
  }

  /**
   * #2171.22 — Section « Actions et prochaines étapes » de la fiche
   * opportunité, COCHABLE — distincte de `ProjectRow.next_action` (une
   * dérivation non persistée, qui reste à côté). Même objet, même contrat
   * que `needs/:needId/steps` — voir `project-step.ts`.
   */
  @Get(':id/steps')
  @WorkspaceRead()
  async listProjectSteps(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: ProjectStep[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.projectSteps.list(workspaceId, id) }
  }

  @Post(':id/steps')
  @RequirePermission('records:write')
  async createProjectStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateProjectStepDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectStep> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.projectSteps.create(workspaceId, id, body)
  }

  @Patch(':id/steps/:stepId')
  @RequirePermission('records:write')
  async updateProjectStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() body: UpdateProjectStepDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectStep> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.projectSteps.updateStatus(workspaceId, id, stepId, body)
  }

  /**
   * #2171.27 — Section « Synthèse et décision actuelle » : sept questions,
   * faits et hypothèses distingués (#2171.44), ce qu'il ne faut pas faire
   * (#2171.47). Génération à la demande, jamais persistée — voir le docblock
   * de `ProjectSynthesisService` pour la raison. En démonstration, la réponse
   * est SCRIPTÉE (`demoProjectSynthesis`), même garde que
   * `MissionExtractionController.extract`.
   */
  @Post(':id/synthesis')
  @RequirePermission('records:write')
  async generateProjectSynthesis(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectSynthesis> {
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      return demoProjectSynthesis(id)
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const result = await this.projectSynthesis.generate(id, workspaceId)
    if (!result.ok) {
      if (result.code === 'not_found') throw new NotFoundException('Opportunité introuvable')
      throwProjectSynthesisFailure(result.code)
    }
    return result.synthesis
  }

  /**
   * #2171.24 (épopée #2951) — Section « Documents » de la fiche opportunité :
   * devis, NDA, contrat cadre, et leur statut. Voir le docblock de
   * `ProjectDocumentsService` — PAS de fichier joint dans cette tranche,
   * contrairement à `needs/:needId/documents`.
   */
  @Get(':id/documents')
  @WorkspaceRead()
  async listProjectDocuments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: ProjectDocument[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.projectDocuments.list(workspaceId, id) }
  }

  @Post(':id/documents')
  @RequirePermission('records:write')
  async createProjectDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateProjectDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectDocument> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.projectDocuments.create(workspaceId, id, body)
  }

  @Patch(':id/documents/:documentId/status')
  @RequirePermission('records:write')
  async updateProjectDocumentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() body: UpdateProjectDocumentStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProjectDocument> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.projectDocuments.updateStatus(workspaceId, id, documentId, body.status)
  }

  /**
   * #2171.39 — ARCHIVER l'opportunité. Deux portes dédiées, comme
   * `archive[Un]archiveNeed` — séparées du patch générique (`stage`/`owner`/
   * `amount`/`risks`) pour qu'aucune ne puisse jamais toucher `archived_at`
   * par accident, et l'inverse.
   */
  @Post(':id/archive')
  @RequirePermission('records:write')
  async archiveOpportunity(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const result = await this.projects.archiveOpportunity(id, workspaceId, true)
    if (result.status === 'not_found') throw new NotFoundException('Opportunité introuvable')
    if (result.status === 'already') throw new BadRequestException('Cette opportunité est déjà archivée.')
    return result.row
  }

  /** #2171.39 — DÉSARCHIVER. Remet `archived_at` à `NULL`, ne touche à rien d'autre. */
  @Post(':id/unarchive')
  @RequirePermission('records:write')
  async unarchiveOpportunity(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const result = await this.projects.archiveOpportunity(id, workspaceId, false)
    if (result.status === 'not_found') throw new NotFoundException('Opportunité introuvable')
    if (result.status === 'already') throw new BadRequestException('Cette opportunité n’est pas archivée.')
    return result.row
  }
}
