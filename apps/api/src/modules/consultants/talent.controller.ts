import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  TALENT_DOCUMENT_TEXT_MAX,
  addExperienceSchema,
  cvFilesImportInputSchema,
  cvIntakeSchema,
  cvMailImportInputSchema,
  cvZipImportInputSchema,
  cvZipLargeImportStartSchema,
  cvZipLargeUploadTicketRequestSchema,
  importConsultantsCsvSchema,
  importAvailabilitySchema,
  hasPermission,
  draftTalentMessageInputSchema,
  prepareTalentMessageInputSchema,
  shiftLocalDays,
  talentDuplicateDecisionSchema,
  talentPoolSegmentSchema,
  talentDocumentKindSchema,
  talentPhotoSchema,
  talentRetentionSchema,
  talentSearchQuerySchema,
  upsertSkillSchema,
  validateSkillSchema,
  type ConsultantExperience,
  type ConsultantSkill,
  type TalentDocument,
  type TalentDocumentFileUrl,
  type TalentDocumentText,
  type TalentDuplicateDecision,
  type TalentDuplicateMatch,
  type TalentDuplicatePreview,
  type TalentDuplicatesReport,
  type TalentPage,
  type TalentMessageDraft,
  type TalentPreparedMessage,
  type TalentRetention,
  type TalentRow,
  type MissingExpertiseReport,
  type TalentStats,
  type CvBatchImportReport,
  type CvBatchImportJobState,
  type CvBatchFileOutcome,
  type ConsultantCsvImportReport,
  type CvZipImportJobStatus,
  type CvZipLargeUploadTicket,
  type CvZipManifest,
  type AvailabilityImportReport,
  type AtsExportReport,
} from '@bellum/contracts'
import { Throttle } from '@nestjs/throttler'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { DataExit } from '../workspace/data-exit.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CvAutoParseService } from './cv-auto-parse.service'
import { CvAutoReadStatusService, type CvAutoReadStatusPayload } from './cv-auto-read-status.service'
import { CvBatchImportService } from './cv-batch-import.service'
import { CvZipLargeImportService } from './cv-zip-large-import.service'
import { CvIntakeService } from './cv-intake.service'
import { SkillAliasService } from './skill-alias.service'
import { TalentMessageDraftService } from './talent-message-draft.service'
import { canonicalSkill, normaliseSkillText } from './skill-referential'
import { TalentPhotoService } from './talent-photo.service'
import { MissingExpertiseService } from './missing-expertise.service'
import { TalentPoolService } from './talent-pool.service'
import { TalentService } from './talent.service'
import { AvailabilityImportService } from './availability-import.service'
import { AtsExportService } from './ats-export.service'
import { TalentIdentityService } from './talent-identity.service'
import { TasksService } from '../tasks/tasks.service'

class TalentDuplicateDecisionDto extends createZodDto(talentDuplicateDecisionSchema) {}

/** #2327.20 — la question confiée à quelqu'un arrive dans SA file, sous deux jours. */
const ASSIGNED_REVIEW_DUE_IN_DAYS = 2

class TalentSearchDto extends createZodDto(talentSearchQuerySchema) {}

/**
 * Ce qu'on connaît de la personne au moment de la comparer, pendant la frappe.
 *
 * Tout est facultatif — c'est un formulaire en cours de saisie, pas un contrat.
 * Les bornes sont celles de `consultantUpsertSchema` : au-delà, ce n'est plus un
 * nom, et la comparaison n'a rien à gagner à charger la requête.
 */
const talentDuplicateQuerySchema = z
  .object({
    full_name: z.string().trim().max(200).optional(),
    email: z.string().trim().max(320).optional(),
    phone: z.string().trim().max(40).optional(),
  })
  .strict()
class TalentDuplicateQueryDto extends createZodDto(talentDuplicateQuerySchema) {}
class UpsertSkillDto extends createZodDto(upsertSkillSchema) {}
class ValidateSkillDto extends createZodDto(validateSkillSchema) {}
class AddExperienceDto extends createZodDto(addExperienceSchema) {}
class TalentRetentionDto extends createZodDto(talentRetentionSchema) {}

/**
 * Le dépôt d'un document.
 *
 * On reçoit du TEXTE, jamais un binaire : l'extraction se fait là où le fichier
 * est déjà lu (l'espace documentaire connecté, ou le poste de l'utilisateur).
 * Un FICHIER de CV passe par `cv-intake` (dépôt, nouvelle version, ZIP), qui
 * en conserve l'original depuis #4034 pour l'aperçu.
 */
const addDocumentSchema = z
  .object({
    kind: talentDocumentKindSchema.default('cv'),
    filename: z.string().trim().min(1).max(300),
    mimeType: z.string().trim().max(200).nullable().default(null),
    text: z.string().max(TALENT_DOCUMENT_TEXT_MAX * 2),
    sizeBytes: z.number().int().nonnegative().nullable().default(null),
  })
  .strict()
class AddDocumentDto extends createZodDto(addDocumentSchema) {}
class CvIntakeDto extends createZodDto(cvIntakeSchema) {}
class CvZipImportDto extends createZodDto(cvZipImportInputSchema) {}
class CvFilesImportDto extends createZodDto(cvFilesImportInputSchema) {}
class ImportConsultantsCsvDto extends createZodDto(importConsultantsCsvSchema) {}
class ImportAvailabilityDto extends createZodDto(importAvailabilitySchema) {}
class CvMailImportDto extends createZodDto(cvMailImportInputSchema) {}
class CvZipLargeUploadTicketDto extends createZodDto(cvZipLargeUploadTicketRequestSchema) {}
class CvZipLargeImportStartDto extends createZodDto(cvZipLargeImportStartSchema) {}
class TalentPhotoDto extends createZodDto(talentPhotoSchema) {}
class PrepareTalentMessageDto extends createZodDto(prepareTalentMessageInputSchema) {}
class DraftTalentMessageDto extends createZodDto(draftTalentMessageInputSchema) {}

/** #4347 — un appel modèle par geste : même borne que le composer de contact (`LLM_DRAFT_RATE_LIMIT`). */
const TALENT_MESSAGE_DRAFT_RATE_LIMIT = { 'default-1m': { limit: 20, ttl: 60_000 } }

/** Le vivier élargi : compétences typées, documents, recherche, rétention. */
@Controller('talents')
@RequireFeature('talent_pool')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class TalentController {
  constructor(
    private readonly talents: TalentService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly intakeService: CvIntakeService,
    /** #2568.1 / #2569.1 — le lot N : messagerie et archive ZIP. */
    private readonly batchImport: CvBatchImportService,
    /** #3065 (lot 2b) — l'import ZIP volumineux (ticket, mise en file, suivi). */
    private readonly largeImport: CvZipLargeImportService,
    private readonly aliases: SkillAliasService,
    private readonly pool: TalentPoolService,
    private readonly photos: TalentPhotoService,
    /** Le détecteur d'expertise manquante (PDF 4 §8.4). */
    private readonly missingExpertiseService: MissingExpertiseService,
    /** #2327 — la résolution d'identité (propose, ne fusionne jamais). */
    private readonly identity: TalentIdentityService,
    /** #2327.20 — « attribuer au recruteur » dépose une tâche dans sa file. */
    private readonly tasks: TasksService,
    /** #2326.7/.9 (épopée #2794) — tableau de disponibilités, met à jour, ne crée jamais. */
    private readonly availabilityImport: AvailabilityImportService,
    /** #2326.8 (épopée #2794) — export ATS du vivier entier. */
    private readonly atsExport: AtsExportService,
    /** #4347 — la rédaction du message au consultant par Laura. */
    private readonly messageDrafts: TalentMessageDraftService,
    /** c88 (04/10/2026) — la lecture automatique des CV (compteur + rattrapage). */
    @Optional() private readonly autoParse?: CvAutoParseService,
    /** Lot BATCH-CV (12/10/2026) — « N / total lus » et les échecs nommés. */
    @Optional() private readonly autoReadStatusService?: CvAutoReadStatusService,
  ) {}

  @Get()
  async search(@CurrentUser() user: CurrentUserPayload, @Query() query: TalentSearchDto): Promise<TalentPage> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Les montants suivent `finance:read`, comme la marge d'une mission : ils
    // sont RETIRÉS de la réponse, jamais mis à zéro.
    const page = await this.talents.search(
      workspaceId,
      query,
      { finance: hasPermission(role, 'finance:read') },
      await this.aliases.approvedAliases(workspaceId),
      user.userId,
    )
    // La photo est fusionnée APRÈS coup, par un service hors du moteur de
    // sélection (piège n°3 du PDF-22 §01) — voir `talent-photo.service.ts`.
    return this.photos.attach(workspaceId, page)
  }

  /** Le bandeau de statistiques du vivier (écran Vivier, PDF-22 §01). Compte
   *  sur TOUT l'espace, jamais sur le filtre courant. */
  @Get('stats')
  async stats(@CurrentUser() user: CurrentUserPayload): Promise<TalentStats> {
    return this.talents.stats(await this.talents.workspaceOf(user.userId))
  }

  /**
   * La file d'enrichissement du catalogue (§5.3).
   *
   * Ce que le produit ne comprend PAS, avec sa fréquence. Lecture ouverte :
   * cacher la file empêcherait de savoir quels profils le matching ne trouve
   * pas — et un faux négatif silencieux est le pire défaut d'un vivier.
   */
  /**
   * Les effectifs du pool de réactivation (§11).
   *
   * Lecture ouverte : savoir combien de profils dorment est la première chose
   * qui donne envie d'ouvrir l'écran.
   */
  @Get('pool')
  async poolCounts(@CurrentUser() user: CurrentUserPayload) {
    return { items: await this.pool.counts(await this.talents.workspaceOf(user.userId)) }
  }

  /** Le contenu d'un segment, avec la RAISON de chaque présence. */
  @Get('pool/:segment')
  async poolSegment(@CurrentUser() user: CurrentUserPayload, @Param('segment') segment: string) {
    const parsed = talentPoolSegmentSchema.safeParse(segment)
    if (!parsed.success) throw new NotFoundException('Segment inconnu')
    return { items: await this.pool.entries(await this.talents.workspaceOf(user.userId), parsed.data) }
  }

  /**
   * LES TALENTS QUI POURRAIENT ÊTRE LA PERSONNE QU'ON TAPE (§3.3, ligne 1).
   *
   * « Nom saisi → détection de doublon, PROPOSÉE, jamais fusionnée ». Elle
   * existait déjà — au dépôt de CV, où elle ARRÊTE l'écriture — et n'était
   * atteignable que par là : le formulaire de saisie, lui, créait une seconde
   * fiche sans rien dire, et le doublon se découvrait trois mois plus tard,
   * quand deux personnes ont poussé le même profil chez le même client.
   *
   * ⚠️ Une LECTURE, et c'est la moitié de la règle. Elle ne fusionne pas, elle
   * ne crée pas, elle ne marque rien : la décision « ce n'est pas la même
   * personne » est une affirmation, et elle doit venir d'un humain
   * (doctrine `c37_fusion_doublons`).
   *
   * Le moteur est celui du dépôt de CV, appelé tel quel : une seconde
   * définition du doublon divergerait de la première, et il faudrait alors
   * choisir laquelle croire.
   */
  @Get('duplicates')
  @WorkspaceRead()
  async duplicates(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: TalentDuplicateQueryDto,
  ): Promise<{ items: TalentDuplicateMatch[] }> {
    const fullName = (query.full_name ?? '').trim()
    const email = (query.email ?? '').trim()
    const phone = (query.phone ?? '').trim()
    // Rien à comparer : interroger le vivier entier sur des chaînes vides
    // rapprocherait tout le monde de tout le monde, et ferait une requête par
    // frappe pour un résultat qu'on connaît déjà.
    if (!fullName && !email && !phone) return { items: [] }
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return {
      items: await this.intakeService.findDuplicates(workspaceId, {
        fullName,
        email: email || null,
        phone: phone || null,
      }),
    }
  }

  /**
   * LES COMPÉTENCES QUI COÛTENT DES BESOINS — PDF 4 §8.4.
   *
   * « Trois besoins refusés sur la même compétence en un trimestre, et personne
   * ne fait le lien. » Le produit comptait déjà ces refus, mais par MOTIF
   * (`unstaffableByReason` fait un `GROUP BY staffable_reason`) : savoir que
   * 47 besoins sont partis faute de profil ne dit pas lequel recruter.
   *
   * ⚠️ Déclarée AVANT les routes en `:id` de ce contrôleur — `@Get(':id/skills')`
   * capturerait « missing-expertise » comme un identifiant de talent, et Nest
   * ordonne par déclaration, jamais par spécificité.
   *
   * Les montants suivent `finance:read`, comme partout ailleurs. Ils sont mis à
   * `null` et jamais retirés (D45) ; `revenueState` dit alors « masqué », pour
   * qu'un montant caché ne se lise pas comme un montant incalculable.
   */
  @Get('missing-expertise')
  @WorkspaceRead()
  async missingExpertise(@CurrentUser() user: CurrentUserPayload): Promise<{
    windowDays: number
    items: MissingExpertiseReport[]
  }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return {
      // La fenêtre vient du contrat : l'écran l'annonce sans la redéclarer.
      windowDays: this.missingExpertiseService.windowDays(),
      items: await this.missingExpertiseService.forWorkspace(workspaceId, {
        canReadFinance: hasPermission(role, 'finance:read'),
      }),
    }
  }

  /**
   * CE QUE LE RÉFÉRENTIEL APPELLERAIT CETTE COMPÉTENCE (§3.3, ligne 3).
   *
   * « Compétence saisie → proposition d'alias depuis le référentiel partagé,
   * jamais appliqué d'office ». Le référentiel existait, la file
   * d'enrichissement existait — mais `observe` est nourrie APRÈS
   * l'enregistrement, pour un administrateur qui triera plus tard. Personne ne
   * disait à celui qui TAPE que « k8s » se range sous « kubernetes », donc les
   * deux écritures continuaient à coexister dans le vivier.
   *
   * `canonical: null` n'est pas un échec : c'est le cas le plus fréquent, et
   * c'est voulu. Rapprocher « Outil maison Zephyr » du terme connu le plus
   * ressemblant inventerait une compétence — mieux vaut ne rien reconnaître que
   * reconnaître de travers. Le terme partira dans la file d'enrichissement à
   * l'enregistrement, où un humain tranchera.
   *
   * L'ordre importe : le vocabulaire de L'ESPACE passe avant le référentiel
   * partagé. « ELK » ne veut pas dire la même chose chez une ESN cyber et chez
   * une ESN data, et ce que l'équipe a tranché gagne.
   */
  @Get('skill-suggestion')
  @WorkspaceRead()
  async skillSuggestion(
    @CurrentUser() user: CurrentUserPayload,
    @Query('term') term: string | undefined,
  ): Promise<{ term: string; canonical: string | null; origin: 'workspace' | 'referential' | null }> {
    const raw = (term ?? '').trim()
    if (!raw) return { term: raw, canonical: null, origin: null }

    const workspaceId = await this.talents.workspaceOf(user.userId)
    const approved = await this.aliases.approvedAliases(workspaceId)
    const normalised = normaliseSkillText(raw)
    const fromWorkspace = approved.get(raw) ?? approved.get(normalised) ?? null
    if (fromWorkspace && normaliseSkillText(fromWorkspace) !== normalised) {
      return { term: raw, canonical: fromWorkspace, origin: 'workspace' }
    }

    const canonical = canonicalSkill(raw)
    // Déjà le canonique : il n'y a rien à proposer, et proposer « kubernetes »
    // à quelqu'un qui vient d'écrire « Kubernetes » ferait douter de l'outil.
    if (!canonical || normaliseSkillText(canonical) === normalised) {
      return { term: raw, canonical: null, origin: null }
    }
    return { term: raw, canonical, origin: 'referential' }
  }

  @Get('skill-aliases')
  async pendingAliases(@CurrentUser() user: CurrentUserPayload) {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    // Les deux listes restent SÉPARÉES : ce que ton équipe a écrit, et ce que
    // d'autres ESN ont validé. Les fondre ferait passer un vocabulaire
    // étranger pour le tien — et « ELK » ne veut pas dire la même chose chez
    // une ESN cyber et chez une ESN data.
    const [items, suggestions] = await Promise.all([
      this.aliases.pending(workspaceId),
      this.aliases.librarySuggestions(workspaceId),
    ])
    return { items, suggestions }
  }

  /** Trancher appartient à l'administration : un alias décide de ce que le
   *  matching rapproche, pour toute l'équipe. */
  @Put('skill-aliases/:id')
  @RequirePermission('team:manage')
  async decideAlias(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { decision: 'approved' | 'rejected'; canonicalTerm?: string },
  ) {
    const decided = await this.aliases.decide(
      id,
      await this.talents.workspaceOf(user.userId),
      user.userId,
      body.decision === 'rejected' ? 'rejected' : 'approved',
      body.canonicalTerm,
    )
    if (!decided) throw new NotFoundException('Proposition introuvable')
    return decided
  }

  /**
   * LA LIGNE DE VIVIER D'UN TALENT — ce que l'entête de sa fiche affiche.
   *
   * La fiche appelait `GET /consultants/:id`, qui rend la ligne SQL projetée :
   * le champ `availability` SAISI, sans la disponibilité DÉRIVÉE des
   * affectations, sans le nombre de compétences typées, sans la présence d'un
   * CV. L'entête ne pouvait donc ni afficher le badge du §6.2, ni décomposer la
   * complétude — et une fiche annonçait « disponible tout de suite » pendant
   * que la personne était en mission jusqu'en mars.
   *
   * Un segment LITTÉRAL après `:id`, comme `skills` et `documents` : un
   * `@Get(':id')` sur ce contrôleur capturerait `stats`, `pool` et
   * `duplicates`.
   *
   * La photo passe par le MÊME service que la liste (`TalentPhotoService`), qui
   * vit hors du moteur de sélection surveillé par GA-06 : elle s'affiche, elle
   * n'entre dans aucun classement (PDF-22 §01, piège n°3).
   */
  @Get(':id/summary')
  @WorkspaceRead()
  async summary(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<TalentRow> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Les montants suivent `finance:read` : RETIRÉS de la réponse, jamais mis
    // à zéro — même règle que la liste.
    const row = await this.talents.summary(workspaceId, id, { finance: hasPermission(role, 'finance:read') })
    if (!row) throw new NotFoundException('Talent introuvable')
    const page = await this.photos.attach(workspaceId, { items: [row], total: 1, page: 1, limit: 1 })
    // `attach` rend la page telle quelle quand elle est vide ; ici elle ne
    // l'est pas, mais un repli explicite vaut mieux qu'un `!`.
    return page.items[0] ?? row
  }

  @Get(':id/skills')
  async listSkills(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: ConsultantSkill[] }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return { items: await this.talents.listSkills(id, workspaceId) }
  }

  @Put(':id/skills')
  @RequirePermission('records:write')
  async upsertSkill(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpsertSkillDto,
  ): Promise<ConsultantSkill> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    const saved = await this.talents.upsertSkill(id, workspaceId, body)
    // Chaque terme écrit qui n'est pas au référentiel remonte dans la file
    // d'enrichissement (§5.3). Sans ça, `canonicalSkill()` rend `null` en
    // silence et personne ne sait quels mots le produit ne comprend pas — donc
    // quels profils le matching ne trouve pas. Best-effort : la file ne doit
    // jamais faire échouer une saisie.
    await this.aliases.observe(workspaceId, body.skill, user.userId)
    return saved
  }

  @Delete(':id/skills/:skillId')
  @RequirePermission('records:write')
  @HttpCode(204)
  async removeSkill(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('skillId', ParseUUIDPipe) skillId: string,
  ): Promise<void> {
    await this.talents.removeSkill(id, await this.talents.workspaceOf(user.userId), skillId)
  }

  /** #2328.6/.11/.12/.13/.14 — la validation CONSULTANT ou RECRUTEUR d'une
   *  compétence, indépendante de sa déclaration initiale. */
  @Put(':id/skills/:skillId/validation')
  @RequirePermission('records:write')
  async validateSkill(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() body: ValidateSkillDto,
  ): Promise<ConsultantSkill> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.talents.validateSkill(id, workspaceId, skillId, body)
  }

  /** #2328.22 — les expériences structurées du talent, base des preuves. */
  @Get(':id/experiences')
  async listExperiences(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: ConsultantExperience[] }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return { items: await this.talents.listExperiences(id, workspaceId) }
  }

  @Post(':id/experiences')
  @RequirePermission('records:write')
  async addExperience(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddExperienceDto,
  ): Promise<ConsultantExperience> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.talents.addExperience(id, workspaceId, body)
  }

  /**
   * Dépose un CV et crée la fiche (PDF 3 §3.3).
   *
   * Le doublon est cherché AVANT toute écriture : après, c'est trop tard — une
   * fiche en double se découvre trois mois plus tard, quand deux personnes ont
   * poussé le même profil chez le même client. Rend `duplicates` sans rien
   * écrire tant que l'utilisateur n'a pas dit « ce n'est pas la même personne ».
   */
  @Post('intake')
  @RequirePermission('records:write')
  async intake(@CurrentUser() user: CurrentUserPayload, @Body() body: CvIntakeDto) {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.intakeService.intake(workspaceId, user.userId, body)
  }

  /**
   * #2431.6 (épopée #2883) — le MANIFESTE : nombre de fichiers et doublons
   * INTERNES au lot, lu AVANT `intake/zip`, sans écrire une seule fiche.
   * Louis 06/10/2026 : plus aucun plafond en nombre de fichiers.
   */
  @Post('intake/zip/manifest')
  @RequirePermission('records:write')
  async intakeZipManifest(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CvZipImportDto,
  ): Promise<CvZipManifest> {
    await this.talents.workspaceOf(user.userId)
    return this.batchImport.previewZip(body.fileB64)
  }

  /**
   * #2569.1 — importer une archive ZIP entière de CV (lot N, retour bêta
   * François Thomas, 18/09/2026). Aucune pause sur un doublon : #2569.2
   * (la donnée la plus récente gagne) et #2569.3 (auto-validation / exception
   * isolée) tranchent seuls, fichier par fichier.
   */
  @Post('intake/zip')
  @RequirePermission('records:write')
  async intakeZip(@CurrentUser() user: CurrentUserPayload, @Body() body: CvZipImportDto): Promise<CvBatchImportReport> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.batchImport.importZip(workspaceId, user.userId, body.fileB64)
  }

  /**
   * #3065 (lot 2b) — au-delà de `CV_ZIP_MAX_ARCHIVE_BYTES`, l'archive ne
   * voyage plus dans ce corps de requête : cette route rend une URL d'upload
   * DIRECT vers le stockage, à laquelle le navigateur écrit lui-même. Aucun
   * octet ne transite par l'API.
   */
  @Post('intake/zip/large-upload-url')
  @RequirePermission('records:write')
  async intakeZipLargeUploadUrl(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CvZipLargeUploadTicketDto,
  ): Promise<CvZipLargeUploadTicket> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.largeImport.createUploadTicket(workspaceId, body)
  }

  /**
   * #3065 (lot 2b) — une fois l'upload direct terminé, démarre le traitement
   * en tâche de fond (job BullMQ) : l'API lit l'archive en STREAMING depuis
   * le stockage, un CV à la fois — jamais l'archive entière en mémoire.
   */
  @Post('intake/zip/large')
  @RequirePermission('records:write')
  async intakeZipLargeStart(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CvZipLargeImportStartDto,
  ): Promise<{ job_id: string; state: 'queued' | 'running' }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.largeImport.start(workspaceId, user.userId, body)
  }

  /**
   * #3065 (lot 2b) — le suivi : la progression (fichiers traités / total) et,
   * à la fin, le MÊME rapport que l'import en ligne — jamais un second format
   * d'affichage selon la taille de l'archive.
   */
  @Get('intake/zip/large/:jobId')
  @RequirePermission('records:write')
  async intakeZipLargeStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('jobId') jobId: string,
  ): Promise<CvZipImportJobStatus> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.largeImport.status(workspaceId, jobId)
  }

  /**
   * c88 (04/10/2026, import ZIP de 688 CV) — combien de CV de l'espace le
   * modèle n'a pas encore lus. Le vivier l'affiche et le suit pendant la
   * lecture (le compte baisse à mesure que la file avance). Même permission
   * que le suivi de l'import volumineux : le compte sert à qui importe.
   */
  @Get('intake/auto-read')
  @RequirePermission('records:write')
  async autoReadStatus(@CurrentUser() user: CurrentUserPayload): Promise<CvAutoReadStatusPayload> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    // Lot BATCH-CV (12/10/2026) — en plus du compte : la progression du lot en
    // cours et les fiches dont la lecture a échoué, chacune avec sa raison.
    if (this.autoReadStatusService) return this.autoReadStatusService.status(workspaceId)
    return {
      unread: await this.requireAutoParse().unreadCount(workspaceId),
      progress: null,
      failed: [],
      readThisWeek: null,
    }
  }

  /**
   * Lot BATCH-CV (Louis 12/10/2026, #3935) — « Relancer les échecs » : chaque
   * fiche de l'espace dont la lecture a échoué repart en file, au nom de son
   * propriétaire. Le seul geste du bandeau : la lecture elle-même est
   * automatique (#3947). Aucun crédit débité.
   */
  @Post('intake/auto-read/retry-failed')
  @HttpCode(202)
  @RequirePermission('records:write')
  async autoReadRetryFailed(@CurrentUser() user: CurrentUserPayload): Promise<{ queued: number }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    if (!this.autoReadStatusService) {
      throw new ServiceUnavailableException('La lecture automatique des CV est indisponible.')
    }
    return this.autoReadStatusService.retryFailed(workspaceId)
  }

  /**
   * c88 — le RATTRAPAGE ciblé (doctrine « un correctif de collecte rattrape
   * l'existant ») : « Lire les CV non lus » met en file les fiches de l'espace
   * qui ont un CV, aucun nom, jamais lues et JAMAIS corrigées à la main. Un
   * geste, jamais un passage automatique au déploiement. Aucun crédit débité.
   */
  @Post('intake/auto-read')
  @HttpCode(202)
  @RequirePermission('records:write')
  async autoReadBackfill(@CurrentUser() user: CurrentUserPayload): Promise<{ queued: number; unread: number }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    const autoParse = this.requireAutoParse()
    const { queued } = await autoParse.enqueueUnread(workspaceId, user.userId)
    return { queued, unread: await autoParse.unreadCount(workspaceId) }
  }

  private requireAutoParse(): CvAutoParseService {
    if (!this.autoParse) throw new ServiceUnavailableException('La lecture automatique des CV est indisponible.')
    return this.autoParse
  }

  /**
   * #3935.3 (08/10/2026) — combien de fiches ont un CV lu AVANT le correctif
   * de complétude (LinkedIn, langues, #3935.2) et restent à relire. Même
   * permission que le rattrapage d'identité : le compte sert à qui importe.
   */
  @Get('intake/completeness-catch-up')
  @RequirePermission('records:write')
  async completenessCatchUpStatus(@CurrentUser() user: CurrentUserPayload): Promise<{ pending: number }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return { pending: await this.requireAutoParse().completenessCatchUpCount(workspaceId) }
  }

  /**
   * #3935.3 — le rattrapage ciblé de complétude : met en file les fiches déjà
   * lues avant que l'extraction ne couvre LinkedIn et les langues. Un geste,
   * jamais un passage automatique au déploiement. Aucun crédit débité : le
   * texte du CV est déjà en base, rien n'est relu depuis le document source.
   */
  @Post('intake/completeness-catch-up')
  @HttpCode(202)
  @RequirePermission('records:write')
  async completenessCatchUpBackfill(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ queued: number; pending: number }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    const autoParse = this.requireAutoParse()
    const { queued } = await autoParse.enqueueCompletenessCatchUp(workspaceId, user.userId)
    return { queued, pending: await autoParse.completenessCatchUpCount(workspaceId) }
  }

  /**
   * #2326.6 (épopée #2794) — le manifeste d'un DOSSIER entier, même discipline
   * que `intake/zip/manifest` : nombre de fichiers et doublons INTERNES au
   * lot, lus AVANT tout traitement.
   */
  @Post('intake/files/manifest')
  @RequirePermission('records:write')
  async intakeFilesManifest(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CvFilesImportDto,
  ): Promise<CvZipManifest> {
    await this.talents.workspaceOf(user.userId)
    return this.batchImport.previewFiles(body.files)
  }

  /**
   * #2326.6 (épopée #2794) — importer un DOSSIER entier de CV, hors d'une
   * archive ZIP (#2183.4 côté dépôt unitaire ne couvre qu'un aller simple par
   * fichier, avec un doublon SAUTÉ ; ici la MÊME décision automatique à trois
   * issues que le ZIP — créer / auto-valider une fiche fiable / isoler une
   * exception, #2569.2/#2569.3).
   */
  @Post('intake/files')
  @RequirePermission('records:write')
  async intakeFiles(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CvFilesImportDto,
  ): Promise<CvBatchImportReport> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.batchImport.importFiles(workspaceId, user.userId, body.files)
  }

  /**
   * #2326.12 (épopée #2794) — L'ORCHESTRATEUR ASYNCHRONE : dépose le job et
   * rend la main tout de suite, au lieu d'attendre la fin du lot dans la
   * requête (`intake/zip` ci-dessus, inchangé). `GET intake/jobs/:jobId`
   * (juste en dessous) suit la progression — y compris après un rechargement
   * de page, #2326.27.
   */
  @Post('intake/zip/jobs')
  @RequirePermission('records:write')
  async intakeZipJob(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CvZipImportDto,
  ): Promise<{ jobId: string; total: number }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.batchImport.enqueueZip(workspaceId, user.userId, body.fileB64)
  }

  /** #2326.12 (épopée #2794) — même orchestrateur, pour un DOSSIER (#2326.6). */
  @Post('intake/files/jobs')
  @RequirePermission('records:write')
  async intakeFilesJob(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CvFilesImportDto,
  ): Promise<{ jobId: string; total: number }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.batchImport.enqueueFiles(workspaceId, user.userId, body.files)
  }

  /**
   * #2326.24/.25/.27 — le rapport de fin de JOB : progression en vol, puis
   * rapport final. Interrogeable depuis n'importe quelle connexion (une autre
   * page, un autre onglet) — le job n'appartient pas à la requête qui l'a lancé.
   */
  @Get('intake/jobs/:jobId')
  @RequirePermission('records:write')
  async intakeJobState(
    @CurrentUser() user: CurrentUserPayload,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<CvBatchImportJobState> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.batchImport.getJobState(workspaceId, jobId)
  }

  /**
   * #2568.1 — une pièce jointe d'un fil AUTORISÉ (déjà listé par
   * `GET /mailbox/attachments`) devient une fiche du vivier. Ne lit jamais le
   * corps du message (D65) — seule la pièce jointe traverse ce chemin.
   */
  @Post('intake/mail')
  @RequirePermission('records:write')
  async intakeMail(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CvMailImportDto,
  ): Promise<CvBatchFileOutcome> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.batchImport.importFromMailAttachment(workspaceId, user.userId, body.messageId, body.attachmentId)
  }

  /**
   * #2183.5 — import CSV d'un lot de consultants (« Format CSV/XLSX associé »).
   *
   * Même service que le dépôt de CV (`CvIntakeService`), même matière
   * d'identité : une ressemblance, quelle qu'elle soit, ARRÊTE la ligne. Le
   * XLSX n'est pas couvert — voir la ligne de registre 2183.5.
   */
  @Post('import-csv')
  @RequirePermission('records:write')
  async importCsv(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: ImportConsultantsCsvDto,
  ): Promise<ConsultantCsvImportReport> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.intakeService.importCsv(workspaceId, user.userId, body.content)
  }

  /**
   * #2326.7/.9 (épopée #2794) — tableau de DISPONIBILITÉS (nom/e-mail + date
   * + taux), CSV ou XLSX. Met à jour les fiches EXISTANTES, ne crée jamais un
   * talent — une ligne qui ne rapproche personne reste dans `outcomes`,
   * jamais écrite.
   */
  @Post('import-availability')
  @RequirePermission('records:write')
  async importAvailability(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: ImportAvailabilityDto,
  ): Promise<AvailabilityImportReport> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return body.format === 'xlsx'
      ? this.availabilityImport.importXlsx(workspaceId, body.content)
      : this.availabilityImport.importCsv(workspaceId, body.content)
  }

  /**
   * #2326.8 (épopée #2794) — export du vivier ENTIER au format ATS. Même
   * règle que `GET stats` (« sur tout l'espace, jamais le filtre courant ») :
   * le CSV lui-même n'est jamais construit ici (garde
   * `a-csv-leaves-only-through-the-workspace-rule`, web) — cette route rend
   * les LIGNES, le navigateur les transforme en fichier.
   */
  @Get('export/ats')
  // #2081.14 — une SORTIE de données : la règle d'espace « qui peut exporter » la tient.
  @DataExit()
  @RequirePermission('records:write')
  async exportAts(@CurrentUser() user: CurrentUserPayload): Promise<AtsExportReport> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.atsExport.export(workspaceId)
  }

  /**
   * #2327 — les doublons possibles d'une fiche EXISTANTE, avec l'état qui en
   * découle et la décision humaine en cours. Lecture seule.
   */
  @Get(':id/identity')
  @WorkspaceRead()
  async identityReport(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TalentDuplicatesReport> {
    return this.identity.reportForTalent(await this.talents.workspaceOf(user.userId), id)
  }

  /**
   * #2327.19 — les deux fiches côte à côte : champs identiques et différents,
   * documents, historique, conséquences de chaque action. Lecture seule.
   */
  @Get(':id/identity/:otherId')
  @WorkspaceRead()
  async identityPreview(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('otherId', ParseUUIDPipe) otherId: string,
  ): Promise<TalentDuplicatePreview> {
    return this.identity.preview(await this.talents.workspaceOf(user.userId), id, otherId)
  }

  /**
   * #2327.20 — une décision humaine sur une paire. Aucune ne fusionne ni
   * n'efface (`c37_fusion_doublons`) ; « attribuer » dépose une TÂCHE dans la
   * file de la personne choisie — même file que le reste du CRM.
   */
  @Post(':id/identity/decisions')
  @RequirePermission('records:write')
  async identityDecide(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TalentDuplicateDecisionDto,
  ): Promise<TalentDuplicateDecision> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    const decision = await this.identity.decide(workspaceId, user.userId, id, body)
    if (decision.action === 'assign_to_recruiter' && decision.assigneeId) {
      await this.tasks.create(user.userId, {
        title: 'Vérifier un doublon possible dans le vivier',
        details: `Deux fiches se ressemblent : /consultants/${id} et /consultants/${body.otherTalentId}. Ouvre la première, onglet « Identité », pour décider.`,
        dueOn: shiftLocalDays(new Date(), ASSIGNED_REVIEW_DUE_IN_DAYS),
        priority: 'normal',
        ownerId: decision.assigneeId,
        // #2395.8 (épopée #2871) — le seul appelant de ce chemin.
        objective: 'Décider si les deux fiches sont la même personne.',
        expectedResult: 'Les deux fiches sont fusionnées, ou confirmées comme deux personnes distinctes.',
      })
    }
    return decision
  }

  /** #2327.25 — annule une décision : datée, jamais effacée ; les copies sont archivées. */
  @Post(':id/identity/decisions/:decisionId/undo')
  @RequirePermission('records:write')
  @HttpCode(204)
  async identityUndo(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('decisionId', ParseUUIDPipe) decisionId: string,
  ): Promise<void> {
    await this.identity.undo(await this.talents.workspaceOf(user.userId), user.userId, decisionId)
  }

  @Get(':id/documents')
  async listDocuments(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: TalentDocument[] }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return { items: await this.talents.listDocuments(id, workspaceId) }
  }

  /**
   * #4034.3 — l'ORIGINAL d'un document : une URL signée de cinq minutes au
   * plus, fabriquée après le contrôle d'espace sur le talent ET le document.
   * 404 sans original conservé (CV importé avant #4034).
   */
  @Get(':id/documents/:documentId/file-url')
  @WorkspaceRead()
  async documentFileUrl(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<TalentDocumentFileUrl> {
    return this.talents.documentFileUrl(id, await this.talents.workspaceOf(user.userId), documentId)
  }

  /** #4034.4/.5 — le texte extrait d'un document, mis en page dans l'aperçu. */
  @Get(':id/documents/:documentId/text')
  @WorkspaceRead()
  async documentText(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<TalentDocumentText> {
    return this.talents.documentText(id, await this.talents.workspaceOf(user.userId), documentId)
  }

  @Post(':id/documents')
  @RequirePermission('records:write')
  async addDocument(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddDocumentDto,
  ) {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.talents.addDocument(id, workspaceId, user.userId, body)
  }

  @Delete(':id/documents/:documentId')
  @RequirePermission('records:write')
  @HttpCode(204)
  async removeDocument(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    await this.talents.removeDocument(id, await this.talents.workspaceOf(user.userId), documentId)
  }

  /**
   * #2185.51 — « Préparer un message », depuis la fiche consultant. Un
   * brouillon, jamais un envoi : aucun geste d'envoi n'existe sur ce chemin.
   */
  @Get(':id/messages')
  async listPreparedMessages(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: TalentPreparedMessage[] }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return { items: await this.talents.listPreparedMessages(id, workspaceId) }
  }

  /**
   * #4347 — Laura RÉDIGE l'objet et le corps à partir du consultant, du besoin et du client : la fenêtre
   * « Préparer un message » s'ouvre déjà remplie. Rien n'est enregistré ici (le brouillon ne devient une
   * ligne que par `POST :id/messages`, geste explicite) et rien n'est envoyé.
   */
  @Post(':id/messages/draft')
  @Throttle(TALENT_MESSAGE_DRAFT_RATE_LIMIT)
  @RequirePermission('records:write')
  async draftMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DraftTalentMessageDto,
  ): Promise<TalentMessageDraft> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.messageDrafts.draft(id, workspaceId, user.userId, body)
  }

  @Post(':id/messages')
  @RequirePermission('records:write')
  async prepareMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PrepareTalentMessageDto,
  ): Promise<TalentPreparedMessage> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.talents.prepareMessage(id, workspaceId, user.userId, body)
  }

  /**
   * Dépose (ou retire, `photoUrl: null`) la photo d'un talent (piège n°3 du
   * PDF-22 §01, dépôt du 31/08/2026).
   *
   * ⚠️ CRITÈRE PROTÉGÉ — passe par `TalentPhotoService`, HORS de la liste des
   * moteurs de sélection surveillés par `protected-criteria.spec.ts` (GA-06).
   * Elle s'AFFICHE (via `search()` → `photos.attach()`), elle n'entre dans
   * AUCUN classement.
   */
  @Put(':id/photo')
  @RequirePermission('records:write')
  async setPhoto(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TalentPhotoDto,
  ): Promise<{ photoUrl: string | null }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    return this.photos.setPhoto(id, workspaceId, body.photoUrl)
  }

  /** Le réglage de rétention, ET ce qu'il emporterait s'il était armé. */
  @Get('retention/settings')
  async retention(@CurrentUser() user: CurrentUserPayload): Promise<TalentRetention & { dueNow: number }> {
    const workspaceId = await this.talents.workspaceOf(user.userId)
    const [settings, preview] = await Promise.all([
      this.talents.readRetention(workspaceId),
      this.talents.previewPurge(workspaceId),
    ])
    return { ...settings, dueNow: preview.due }
  }

  /**
   * Régler la rétention. `team:manage` et non `records:write` : c'est une
   * politique d'espace, pas une saisie de fiche, et elle décide d'effacements
   * irréversibles — cette décision appartient à qui administre l'équipe.
   */
  @Put('retention/settings')
  @RequirePermission('team:manage')
  async setRetention(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: TalentRetentionDto,
  ): Promise<TalentRetention> {
    return this.talents.writeRetention(await this.talents.workspaceOf(user.userId), body)
  }
}
