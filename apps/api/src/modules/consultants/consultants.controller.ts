import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { CreditsService } from '../credits/credits.service'
import {
  hasPermission,
  latestCvParseDecisions,
  missingPartnerForEngagement,
  type WorkspaceRole,
} from '@bellum/contracts'
import type { Response } from 'express'
import type {
  ConsultantEngagementConflict,
  ConsultantEngagementResult,
  CvVersion,
  FieldSource,
  RecordImportMark,
} from '@bellum/contracts'
import { buildPdfDocument } from '../documents/pdf-builder'
import { buildWordDocument, safeFileName } from '../documents/document-builders'
import { ProvenanceService } from '../crm-core/provenance.service'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ConsultantsService, PARTNER_REQUIRED_MESSAGE, type TalentVisibility } from './consultants.service'
import { CvParseService } from './cv-parse.service'
import { SkillAliasService } from './skill-alias.service'
import { unknownSkillTerms } from './skill-seed'
import { CvStudioService, cvVersionToDocSections } from './cv-studio.service'
import { talentVisibility } from './talent-visibility'
import {
  ConsultantUpsertDto,
  RecordFieldReportDto,
  RecordInterviewTraitDto,
  RecordRampUpDto,
  SetConsultantOwnerDto,
} from './dto/consultant.dto'
import { CvRewriteDto } from './dto/cv-rewrite.dto'
import { CvRewriteBulkDto } from './dto/cv-rewrite-bulk.dto'
import { BulkCvRewriteService } from './bulk-cv-rewrite.service'
import { CvCommitDto } from './dto/cv-commit.dto'
import { GenerateCvVersionDto } from './dto/generate-cv-version.dto'
import { UpdateCvVersionSectionsDto } from './dto/update-cv-version-sections.dto'
import { AnonymisationSettingsDto } from './dto/anonymisation-settings.dto'
import { ArchiveConsultantsDto } from './dto/archive-consultants.dto'
import { EraseConsultantsDto } from './dto/erase-consultants.dto'
import { ConsultantErasureService } from './consultant-erasure.service'
import { ConsultantEngagementService } from './consultant-engagement.service'
import { RecordFeedbackDto } from './dto/record-feedback.dto'
import { SearchTalentByNameDto } from './dto/search-people-by-name.dto'
import { EnrichTalentDto } from './dto/enrich-talent.dto'
import { LinkedinLookupDto } from './dto/linkedin-lookup.dto'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'
import { SOFT_BRAKE_MESSAGE } from '../credits/soft-brake'

/**
 * Vivier de consultants (annexe méthodo p22).
 *
 * Base path propre (`/consultants`) — module autonome (règle #7) : le retirer
 * supprime le vivier et le matching sans toucher au reste. CRUD scopé workspace,
 * plus le matching d'un besoin (`/consultants/match/:opportunityId`).
 */
@Controller('consultants')
// Le Vivier (matching + réécriture de CV) est une surface de palier.
@RequireFeature('talent_pool')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class ConsultantsController {
  constructor(
    private readonly consultants: ConsultantsService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly credits: CreditsService,
    private readonly provenance: ProvenanceService,
    private readonly cvParse: CvParseService,
    private readonly studio: CvStudioService,
    private readonly aliases: SkillAliasService,
    private readonly brands: WorkspaceBrandService,
    private readonly bulkCvRewrite: BulkCvRewriteService,
    // #3781 — optionnel : sans lui, la route d'effacement répond 503, jamais un repli.
    @Optional() private readonly erasure?: ConsultantErasureService,
    // #4196 — optionnel pour la même raison : sans lui, les deux routes d'engagement répondent 503.
    @Optional() private readonly engagement?: ConsultantEngagementService,
  ) {}

  /**
   * La marque de l'espace — marque blanche, 01/09/2026.
   *
   * Elle entre dans les PROPRIÉTÉS du fichier exporté (`creator` / `author`),
   * qui voyagent avec lui : un dossier de compétences part chez un client de
   * l'ESN, et ses propriétés se lisent longtemps après l'envoi.
   */
  private async brandName(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return (await this.brands.getForWorkspace(workspaceId)).name
  }

  /** Théo D settings-espace.N5 — la signature proposée et le pied de document de l'espace, pour un dossier qui part chez un client. */
  private async documentIdentity(userId: string) {
    return this.brands.getDocumentIdentityForUser(userId)
  }

  /**
   * Ce que le référentiel n'a pas compris part dans la file d'alias.
   *
   * Posé dans le CONTRÔLEUR, comme le journal d'écriture : la garde GA-07 fige
   * les imports service → service, et le contrôleur est la couche où un geste
   * utilisateur traverse légitimement deux domaines.
   *
   * Trouvé en recette : la file n'était nourrie que par la saisie d'une
   * compétence une par une. Une fiche remplie ou un CV relu déposaient des
   * termes inconnus que personne ne voyait jamais — donc des profils que la
   * recherche ne trouvait pas, sans que rien ne le dise. Best-effort : une file
   * d'enrichissement qui ferait échouer un enregistrement serait pire que pas
   * de file.
   */
  private async observeUnknownSkills(workspaceId: string | null, stack: string[] | undefined, userId: string) {
    for (const term of unknownSkillTerms(stack ?? null)) {
      await this.aliases.observe(workspaceId, term, userId)
    }
  }

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.consultants.listForWorkspace(workspaceId, user.userId, await this.visibilityFor(workspaceId, role))
  }

  /**
   * #5017.2 — « consultants qui connaissent ce secteur » (fiche compte). Lecture seule, portée à l'espace
   * actif. Route littérale déclarée AVANT `:id`.
   */
  @Get('knowing-sector')
  @WorkspaceRead()
  async knowingSector(@Query('sector') sector: string | undefined, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.consultants.listKnowingSector(workspaceId, user.userId, (sector ?? '').slice(0, 200))
  }

  /**
   * Ce que l'appelant a le droit de voir sur une fiche (PDF 3 §13.1).
   *
   * Résolu dans le contrôleur : la décision dépend du rôle, qui vit dans le
   * contexte d'espace, et le service n'a pas à le connaître.
   */
  private async visibilityFor(workspaceId: string | null, role: WorkspaceRole): Promise<TalentVisibility> {
    return talentVisibility({ role, hideContactsFromSales: await this.consultants.hidesTalentContacts(workspaceId) })
  }

  /**
   * #3831.1 — « je tape un nom, je vois les homonymes, je choisis » : enrichir
   * une fiche SANS profil LinkedIn connu, sans jamais deviner sur le seul nom
   * (retour bêta 07/10/2026). Recherche GRATUITE (tier Apollo People-Search) :
   * AUCUN crédit débité ici, le reveal (`:id/enrich` ci-dessous) reste le
   * geste payant et séparé sur l'homonyme CHOISI. Route littérale déclarée
   * AVANT `:id`, qui l'avalerait sinon (même segment).
   */
  @Get('search-by-name')
  @RequirePermission('records:write')
  async searchTalentByName(@Query() dto: SearchTalentByNameDto, @CurrentUser() user: CurrentUserPayload) {
    const demo = await this.workspaceContext.isDemoWorkspace(user.userId)
    return this.consultants.searchPeopleByName(dto.fullName, dto.organizationName, { demo })
  }

  /**
   * Une fiche complète. La liste du vivier est PAGINÉE (`GET /talents`) et ne
   * porte que ce qu'une ligne affiche ; ouvrir une fiche recharge le reste.
   *
   * Déclaré AVANT les routes paramétrées plus spécifiques n'aurait rien changé
   * ici — `:id` ne peut pas absorber `match/:opportunityId`, qui porte deux
   * segments.
   */
  /** #4051 — « Importé le <date> depuis <source> » sur la fiche consultant ; `null` = jamais importée. */
  @Get(':id/import-mark')
  async importMark(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ importedFrom: RecordImportMark | null }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // La même porte que la fiche : on ne lit la trace que d'une fiche qu'on a le droit de voir.
    const found = await this.consultants.findOneScoped(
      id,
      workspaceId,
      user.userId,
      await this.visibilityFor(workspaceId, role),
    )
    if (!found) throw new NotFoundException('Consultant introuvable')
    return { importedFrom: await this.provenance.latestImportMark(workspaceId, 'consultant', id) }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const found = await this.consultants.findOneScoped(
      id,
      workspaceId,
      user.userId,
      await this.visibilityFor(workspaceId, role),
    )
    if (!found) throw new NotFoundException('Consultant introuvable')
    // #4577.3 — la fiche dit d'où vient chaque champ (`human` = « saisi à la main »). Lue ICI et non dans le service
    // (GA-07) ; un champ sans ligne de provenance reste absent, jamais deviné.
    const detailed = await this.provenance.currentSourcesDetailed('consultant', id)
    const field_sources: Record<string, FieldSource> = {}
    for (const [field, entry] of Object.entries(detailed)) if (entry) field_sources[field] = entry.source
    return { ...found, field_sources }
  }

  /**
   * Les trois montants du §8.1 RETIRÉS du corps quand `finance:read` manque.
   *
   * La garde n'existait qu'en LECTURE : `talent.service.ts` retire `minTjmCents`
   * et `costCents` de la liste, `toWire` les retire de la fiche. À l'écriture,
   * le corps entier partait dans `fromUpsert` — donc un `recruiter`, qui porte
   * `records:write` et pas `finance:read`, écrivait un coût chargé qu'il ne
   * pourrait jamais relire.
   *
   * ⚠️ RETIRER, jamais mettre à `null`. `fromUpsert` n'écrit que les clés
   * DÉFINIES : `null` serait une commande d'effacement, et le formulaire qui
   * masque ces champs les envoie précisément vides. Sans cette nuance, corriger
   * une faute de frappe sur un nom effacerait les trois montants de la fiche.
   *
   * Le critère est exactement celui de la lecture — même fonction, même absence
   * de permissions additives (comme {@link visibilityFor}) : deux critères
   * divergents produiraient un champ écrivable et illisible.
   */
  private withoutFinance(body: ConsultantUpsertDto, role: WorkspaceRole): ConsultantUpsertDto {
    if (hasPermission(role, 'finance:read')) return body
    // Copie : le corps de la requête appartient à l'appelant, et le muter
    // ferait mentir tout ce qui le relit après (journal, garde partenaire).
    const {
      min_tjm_cents: _min,
      cost_rate_cents: _cost,
      purchase_tjm_cents: _purchase,
      tjm_metadata: _tjmMetadata,
      ...rest
    } = body
    return rest as ConsultantUpsertDto
  }

  @Post()
  @RequirePermission('records:write')
  async create(@Body() body: ConsultantUpsertDto, @CurrentUser() user: CurrentUserPayload) {
    this.assertPartnerForSubcontracting(body)
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const created = await this.consultants.create(workspaceId, user.userId, this.withoutFinance(body, role))
    await this.observeUnknownSkills(workspaceId, body.stack, user.userId)
    return created
  }

  /**
   * « Un sous-traitant porte toujours son partenaire » (PDF 3 §2, règle 3).
   *
   * Sans lui, personne ne sait qui est responsable devant le client le jour où
   * la mission se passe mal — et c'est justement ce jour-là qu'on cherche
   * l'information. Le refus est explicite plutôt qu'un champ laissé vide : un
   * blanc se découvre trois mois plus tard.
   *
   * ⚠️ Cette lecture-ci porte sur le CORPS, ce qui suffit à la création (le corps
   * EST la ligne) mais PAS à une mise à jour partielle : un corps qui vide le
   * partenaire sans redire l'engagement passe ici sans rien dire. La règle est
   * donc reposée sur la ligne fusionnée dans `ConsultantsService.update`, et
   * tenue en dernier ressort par `consultants_subcontracting_partner_check`.
   */
  private assertPartnerForSubcontracting(body: ConsultantUpsertDto): void {
    if (!missingPartnerForEngagement(body)) return
    throw new BadRequestException(PARTNER_REQUIRED_MESSAGE)
  }

  @Put(':id')
  @RequirePermission('records:write')
  async update(@Param('id') id: string, @Body() body: ConsultantUpsertDto, @CurrentUser() user: CurrentUserPayload) {
    this.assertPartnerForSubcontracting(body)
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const updated = await this.consultants.update(id, workspaceId, user.userId, this.withoutFinance(body, role))
    if (!updated) throw new NotFoundException('Consultant introuvable')
    // Le journal d'écriture est posé ICI et non dans le service : la garde
    // GA-07 fige les imports service → service, et le contrôleur est la couche
    // où un geste utilisateur traverse légitimement deux domaines. Une saisie
    // humaine est de provenance `human`, donc prioritaire sur toute réécriture
    // ultérieure par un connecteur ou un modèle.
    await this.provenance.commit({
      workspaceId,
      entityType: 'consultant',
      entityId: id,
      source: 'human',
      actorId: user.userId,
      // #2327.21 — la règle qui a produit l'écriture : une saisie dans la fiche.
      rule: 'talent_form',
      changes: updated.changes,
    })
    await this.observeUnknownSkills(workspaceId, body.stack, user.userId)
    return updated.consultant
  }

  /**
   * Lit le CV et PROPOSE treize blocs, chacun avec sa citation (§4).
   *
   * **N'écrit rien.** Une compétence écrite avant validation deviendrait une
   * compétence du vivier — donc un profil poussé sur un besoin — sans que
   * personne l'ait relue. Gratuit : c'est le geste d'entrée du recruteur
   * (décision D1).
   *
   * #2184.37 / #2184.38 — ré-ouvrir la revue d'une fiche déjà validée AVANT
   * dit qui a revu chaque bloc et quand (`fieldHistory`). `CvParseService` ne
   * peut pas lire `ProvenanceService` lui-même (GA-07 fige les imports
   * service → service) : c'est le contrôleur qui compose les deux lectures,
   * comme pour `commitCvParse` ci-dessous.
   */
  @Post(':id/parse')
  @RequirePermission('records:write')
  async parseCv(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Salle de démonstration : lecture SCRIPTÉE, zéro appel modèle, zéro
    // crédit — et le geste se montre quand même.
    const demo = await this.workspaceContext.isDemoWorkspace(user.userId)
    const [proposal, history] = await Promise.all([
      this.cvParse.propose(id, workspaceId, user.userId, { demo }),
      this.provenance.history(workspaceId, 'consultant', id),
    ])
    return { ...proposal, fieldHistory: latestCvParseDecisions(history) }
  }

  /**
   * Écrit ce qu'un humain a validé, champ par champ (§4.2).
   *
   * C'est le SEUL chemin qui fait passer une fiche en `qualified` — invariant
   * du §3.3, et ce que l'AI Act attend d'un outil qui trie des candidats.
   */
  @Post(':id/parse/commit')
  @RequirePermission('records:write')
  async commitCvParse(@Param('id') id: string, @Body() body: CvCommitDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // La provenance ACTUELLE des colonnes, LUE AVANT l'écriture et passée au
    // service. C'est ce qui empêche une acceptation (provenance `model`)
    // d'écraser un nom corrigé à la main (provenance `human`) — « une
    // correction humaine gagne toujours, quelle que soit sa date ».
    //
    // Elle est lue ici et non dans le service parce que la garde GA-07 fige les
    // imports service → service : le contrôleur est la couche où un geste
    // d'utilisateur traverse légitimement deux domaines, comme pour l'édition
    // manuelle juste au-dessus.
    const currentSources = await this.provenance.currentSources('consultant', id)
    const outcome = await this.cvParse.commit(id, workspaceId, user.userId, body, currentSources)
    // Le journal d'écriture, posé dans le contrôleur comme pour l'édition
    // manuelle : un champ CORRIGÉ à la main est de provenance `human` et
    // l'emporte sur toute réécriture ultérieure.
    await this.provenance.commit({
      workspaceId,
      entityType: 'consultant',
      entityId: id,
      source: 'human',
      actorId: user.userId,
      // #2327.21 — la revue d'un CV lu : la règle se nomme.
      rule: 'cv_parse.review',
      changes: outcome.applied.map(field => ({
        field: `cv_parse.${field.detection}`,
        oldValue: null,
        newValue: field.provenance,
      })),
    })
    // Les colonnes RÉELLEMENT écrites sont journalisées sur ELLES-MÊMES, avec la
    // provenance de la décision. Sans ces lignes, la prochaine revue ne saurait
    // pas qui est passé : `cv_parse.identity` dit qu'une revue a eu lieu, pas que
    // `full_name` a changé de main — et un arbitre sans mémoire refuse ses
    // propres écritures (D379). Le service rend la liste : lui seul sait ce que
    // l'arbitre a laissé passer, et la recalculer ici la ferait diverger.
    //
    // Deux appels parce que la source est portée par le LOT, pas par la ligne :
    // « corriger » vaut `human` et l'emporte sur toute réécriture ultérieure,
    // « accepter » vaut `model` — accepter n'est pas écrire.
    for (const source of ['human', 'model'] as const) {
      const changes = outcome.written
        .filter(entry => entry.source === source)
        .map(entry => ({ field: entry.column, oldValue: entry.previous, newValue: entry.value }))
      // `commit` sort de lui-même sur un lot vide ; le dire ici évite deux
      // ouvertures de transaction pour rien à chaque revue.
      if (changes.length > 0) {
        await this.provenance.commit({
          workspaceId,
          entityType: 'consultant',
          entityId: id,
          source,
          actorId: user.userId,
          // #2327.21 — « corriger » et « accepter » sont deux règles distinctes.
          rule: source === 'human' ? 'cv_parse.corrected' : 'cv_parse.accepted',
          changes,
        })
      }
    }
    // Les compétences VALIDÉES d'un CV que le référentiel ne comprend pas
    // rejoignent la file d'alias : c'est là que le vocabulaire d'une ESN entre
    // dans le produit.
    const acceptedSkills = body.fields.find(field => field.detection === 'skills' && field.decision === 'accept')
    if (acceptedSkills && Array.isArray(acceptedSkills.value)) {
      await this.observeUnknownSkills(workspaceId, acceptedSkills.value.map(String), user.userId)
    }
    return outcome
  }

  /**
   * La règle d'anonymisation de l'espace (§9.2).
   *
   * Lecture ouverte : savoir ce qu'un dossier masquera avant de le composer
   * évite de découvrir un nom complet chez un client.
   */
  @Get('settings/anonymisation')
  async readAnonymisation(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.studio.settingsFor(workspaceId)
  }

  /** Modifier la règle est réservé à l'administration (§13.1). */
  @Put('settings/anonymisation')
  @RequirePermission('team:manage')
  async writeAnonymisation(@Body() body: AnonymisationSettingsDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.studio.writeSettings(workspaceId, body)
  }

  /** Les versions déjà générées, la plus récente d'abord (§9.2). */
  @Get(':id/cv-versions')
  async listCvVersions(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.studio.listVersions(id, workspaceId) }
  }

  /**
   * L'action « Comparer » (#2187.42, épopée #2943) : le diff entre DEUX
   * versions déjà générées.
   */
  @Get(':id/cv-versions/compare')
  async compareCvVersions(
    @Param('id') id: string,
    @Query('a') a: string,
    @Query('b') b: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!a || !b) throw new BadRequestException('Deux versions sont nécessaires pour comparer')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.studio.compare(id, a, b, workspaceId)
  }

  /**
   * Compose une version du dossier et l'ENREGISTRE (§9, BEL-ATS-202).
   *
   * Aucune génération n'écrase la précédente : quand un client répond trois
   * semaines plus tard, il faut savoir ce qu'il a reçu. Gratuit — le studio
   * compose depuis le CV source, il n'appelle aucun modèle. La réécriture par
   * modèle reste le geste séparé et payant qu'elle est.
   */
  @Post(':id/cv-versions')
  @RequirePermission('records:write')
  async generateCvVersion(
    @Param('id') id: string,
    @Body() body: GenerateCvVersionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.studio.generate(id, workspaceId, user.userId, body)
  }

  /**
   * L'action « Modifier » (#2187.42, épopée #2943) — réservée à une version
   * pas encore validée.
   */
  @Patch(':id/cv-versions/:versionId')
  @RequirePermission('records:write')
  async updateCvVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() body: UpdateCvVersionSectionsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.studio.updateSections(id, versionId, workspaceId, body.sections)
  }

  /**
   * Le geste humain de validation (#2333.8/.9) — quand la policy d'espace en
   * demande un distinct de la génération.
   */
  @Post(':id/cv-versions/:versionId/validate')
  @RequirePermission('records:write')
  async validateCvVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.studio.validate(id, versionId, workspaceId, user.userId)
  }

  /** Le dossier au format Word (§9.1). */
  @Get(':id/cv-versions/:versionId.docx')
  // #2081.14 — livrable commercial, décision Louis 19/09 : plus une sortie de données au sens de la règle d'espace.
  async downloadCvDocx(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() response: Response,
  ) {
    const version = await this.loadVersion(id, versionId, user.userId)
    const identity = await this.documentIdentity(user.userId)
    const buffer = await buildWordDocument({
      title: titleFor(version),
      subtitle: subtitleFor(version),
      sections: cvVersionToDocSections(version),
      // La marque de l'espace : un dossier de compétences part chez un CLIENT.
      brandName: await this.brandName(user.userId),
      signature: identity.signature,
      footer: identity.footer,
    })
    sendDocument(response, buffer, safeFileName(titleFor(version), 'docx'), WORD_MIME)
  }

  /** Le dossier au format PDF (§9.1). */
  @Get(':id/cv-versions/:versionId.pdf')
  // #2081.14 — livrable commercial, décision Louis 19/09 : plus une sortie de données au sens de la règle d'espace.
  async downloadCvPdf(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() response: Response,
  ) {
    const version = await this.loadVersion(id, versionId, user.userId)
    const identity = await this.documentIdentity(user.userId)
    const buffer = await buildPdfDocument({
      title: titleFor(version),
      subtitle: subtitleFor(version),
      sections: cvVersionToDocSections(version),
      // La marque de l'espace : un dossier de compétences part chez un CLIENT.
      brandName: await this.brandName(user.userId),
      signature: identity.signature,
      footer: identity.footer,
    })
    sendDocument(response, buffer, safeFileName(titleFor(version), 'pdf'), 'application/pdf')
  }

  private async loadVersion(id: string, versionId: string, userId: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const versions = await this.studio.listVersions(id, workspaceId)
    const version = versions.find(entry => entry.id === versionId)
    if (!version) throw new NotFoundException('Version introuvable')
    return version
  }

  /** Les missions d'un talent, la plus récente d'abord (fiche, onglet 7). */
  @Get(':id/missions')
  async missions(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const rows = await this.consultants.missionsOf(id, workspaceId, user.userId)
    if (!rows) throw new NotFoundException('Consultant introuvable')
    return { items: rows }
  }

  /**
   * L'historique horodaté des taux (§8.1) — sous `finance:read`.
   *
   * Le TJM cible est visible de tous, mais son HISTORIQUE dit ce qui s'est
   * négocié : c'est une information financière, et elle suit la même règle que
   * le coût.
   */
  @Get(':id/rate-history')
  @RequirePermission('finance:read')
  async rateHistory(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const rows = await this.consultants.rateHistory(id, workspaceId, user.userId)
    if (!rows) throw new NotFoundException('Consultant introuvable')
    return { items: rows }
  }

  /**
   * #2662.2 — archive une SÉLECTION en un geste (« nettoyer mon vivier »,
   * Louis 20/09/2026). Déclarée AVANT `:id/archive` pour la même raison que
   * `POST /contacts/send-email/bulk` : lisibilité du contrôleur, même si les
   * segments ne se recouvrent pas ici (`archive/bulk` ne finit pas par
   * `/archive`, `:id/archive` ne peut donc pas la capturer).
   *
   * Le MÊME geste que `archive()` juste en dessous, jamais une suppression —
   * le corps du dépôt sur ce point ne se re-litige pas.
   */
  @Post('archive/bulk')
  @RequirePermission('records:write')
  async archiveBulk(@Body() dto: ArchiveConsultantsDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.consultants.archiveBulk(dto.consultant_ids, workspaceId, user.userId, dto.reason?.trim() || null)
  }

  /**
   * #3781 — EFFACER des personnes du vivier (RGPD art. 17) : « supprimer
   * définitivement », retour bêta du 06/10/2026. Le SEUL chemin de suppression
   * d'un consultant depuis l'écran (doctrine c67 : « on archive, on ne
   * supprime pas — SAUF l'effacement RGPD d'une personne »). `records:write`
   * écarte les sièges en lecture seule au bord ; QUI peut effacer QUELLE fiche
   * (administrateur, ou porteur de la fiche) se décide dans le service, fiche
   * par fiche, avec un résultat par profil. Plus serré que le plafond global :
   * un geste irréversible. Déclarée avant `:id/archive` comme `archive/bulk`.
   */
  @Post('erase/bulk')
  @RequirePermission('records:write')
  @HttpCode(HttpStatus.OK)
  @Throttle({ 'default-1m': { limit: 10, ttl: 60_000 } })
  async eraseBulk(@Body() dto: EraseConsultantsDto, @CurrentUser() user: CurrentUserPayload) {
    if (!this.erasure) throw new ServiceUnavailableException('consultant_erasure_unavailable')
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const extraPermissions = await this.workspaceContext.extraPermissionsOf(workspaceId, user.userId)
    return this.erasure.eraseMany({
      ids: dto.consultant_ids,
      userId: user.userId,
      workspaceId,
      role,
      extraPermissions,
    })
  }

  /**
   * Sort une fiche du vivier actif, données conservées (§10 B13).
   *
   * Le geste que la suppression remplaçait à tort : une personne qui quitte
   * l'ESN n'est pas une fiche erronée, et effacer perdrait l'historique de
   * missions qui sert à vendre les suivants.
   */
  @Post(':id/archive')
  @RequirePermission('records:write')
  async archive(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const archived = await this.consultants.archive(id, workspaceId, user.userId, body?.reason?.trim() || null)
    if (!archived) throw new NotFoundException('Consultant introuvable')
    return archived
  }

  /**
   * #4196 — l'écart entre la fiche (disponibilité SAISIE À LA MAIN) et la
   * mission en cours : « La fiche dit X (saisi le …) ; la mission Y dit en
   * mission ». `null` quand il n'y en a pas — on n'affiche pas ce qu'on n'a pas.
   */
  @Get(':id/engagement')
  @WorkspaceRead()
  async engagementConflict(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ conflict: ConsultantEngagementConflict | null }> {
    if (!this.engagement) throw new ServiceUnavailableException('consultant_engagement_unavailable')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { conflict: await this.engagement.conflict(workspaceId, id) }
  }

  /** #4196 — « Aligner » : écriture HUMAINE de « en mission » + date, là où la saisie manuelle bloquait. */
  @Post(':id/engagement/align')
  @RequirePermission('records:write')
  async alignEngagement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ConsultantEngagementResult> {
    if (!this.engagement) throw new ServiceUnavailableException('consultant_engagement_unavailable')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const aligned = await this.engagement.align(workspaceId, user.userId, id)
    if (!aligned) throw new NotFoundException('Aucune affectation en cours pour ce consultant.')
    return aligned
  }

  /** Remet une fiche dans le vivier actif (§10 B14). */
  @Post(':id/reactivate')
  @RequirePermission('records:write')
  async reactivate(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const restored = await this.consultants.reactivate(id, workspaceId, user.userId)
    if (!restored) throw new NotFoundException('Consultant introuvable')
    return restored
  }

  /**
   * #2185.48 — « Valider disponibilité » : revalide la disponibilité DÉCLARÉE
   * sans en changer la valeur.
   */
  @Post(':id/availability/confirm')
  @RequirePermission('records:write')
  async confirmAvailability(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const confirmed = await this.consultants.confirmAvailability(id, workspaceId, user.userId)
    if (!confirmed) throw new NotFoundException('Consultant introuvable')
    return confirmed
  }

  /**
   * #2948 (#2329.47) — « TJM validé », un axe de l'accord à 7 conditions
   * (#2329.45-.51) avant présentation. Même patron que `confirmAvailability`.
   */
  @Post(':id/positioning/confirm-tjm')
  @RequirePermission('records:write')
  async confirmTjmValidated(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const confirmed = await this.consultants.confirmTjmValidated(id, workspaceId, user.userId)
    if (!confirmed) throw new NotFoundException('Consultant introuvable')
    return confirmed
  }

  /**
   * #2948 (#2329.51) — « CV validé ou règles d'usage acceptées ».
   */
  @Post(':id/positioning/confirm-cv')
  @RequirePermission('records:write')
  async confirmCvValidated(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const confirmed = await this.consultants.confirmCvValidated(id, workspaceId, user.userId)
    if (!confirmed) throw new NotFoundException('Consultant introuvable')
    return confirmed
  }

  /**
   * BEL-SC-238 (#3267) — enregistre un trait observé en ENTRETIEN
   * (communication, autonomie). Même patron que `confirmTjmValidated` : un
   * geste explicite, jamais déduit d'une autre écriture.
   */
  @Post(':id/interview-traits')
  @RequirePermission('records:write')
  async recordInterviewTrait(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: RecordInterviewTraitDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const recorded = await this.consultants.recordInterviewTrait(id, workspaceId, user.userId, body, user.email ?? null)
    if (!recorded) throw new NotFoundException('Consultant introuvable')
    return recorded
  }

  /** BEL-SC-238 (#3267) — le temps avant efficacité ANNONCÉ en entretien. */
  @Post(':id/ramp-up')
  @RequirePermission('records:write')
  async recordRampUp(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body() body: RecordRampUpDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const recorded = await this.consultants.recordRampUp(id, workspaceId, user.userId, body, user.email ?? null)
    if (!recorded) throw new NotFoundException('Consultant introuvable')
    return recorded
  }

  /**
   * #3406 — capitalise une information TERRAIN remontée par ce consultant.
   * Même patron que `recordInterviewTrait` : un geste explicite, jamais
   * déduit d'une autre écriture. APPEND-ONLY (aucune route de suppression ni
   * d'édition — voir le service).
   */
  @Post(':id/field-reports')
  @RequirePermission('records:write')
  async recordFieldReport(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: RecordFieldReportDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const recorded = await this.consultants.recordFieldReport(id, workspaceId, user.userId, body, user.email ?? null)
    if (!recorded) throw new NotFoundException('Consultant introuvable')
    return recorded
  }

  /**
   * #2185.10 — « Suivi par » : désigne (ou retire) le référent commercial.
   * `records:write`, même geste que le manager client d'une mission (#2836) :
   * poser qui est rattaché à la fiche.
   */
  @Patch(':id/owner')
  @RequirePermission('records:write')
  async setOwner(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: SetConsultantOwnerDto,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const updated = await this.consultants.setOwner(id, workspaceId, user.userId, body.ownerUserId)
    if (!updated) throw new NotFoundException('Consultant introuvable')
    return updated
  }

  /**
   * Ce qui partira si on supprime — AVANT de supprimer (PDF 3 §7.3).
   *
   * Lecture, donc pas de permission d'écriture : c'est justement l'écran qu'on
   * veut voir avant de décider, et le cacher pousserait à cliquer à l'aveugle.
   */
  @Get(':id/deletion-preview')
  async deletionPreview(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const preview = await this.consultants.deletionPreview(id, workspaceId, user.userId)
    if (!preview) throw new NotFoundException('Consultant introuvable')
    return preview
  }

  /**
   * Matching du vivier contre un besoin (`opportunities.id`).
   *
   * Lecture seule, aucun débit, rien d'écrit — pas de confirmation nécessaire. Le
   * besoin est relu dans le workspace de l'appelant : un id d'une autre équipe
   * (ou inconnu) est un 404, jamais un matching. Rend le vivier entier classé
   * plus la sélection poussable (1-2, jamais un profil bloqué).
   */
  @Get('match/:opportunityId')
  async match(@Param('opportunityId') opportunityId: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const result = await this.consultants.matchOpportunity(opportunityId, workspaceId, user.userId)
    if (!result) throw new NotFoundException('Besoin introuvable')
    return result
  }

  /**
   * REX d'un push (annexe méthodo p22 « Feedback : retenu / refusé, raison,
   * apprentissage »). Append-only : capitalise l'issue pour le prochain push.
   */
  @Post(':id/feedback')
  @RequirePermission('records:write')
  async recordFeedback(
    @Param('id') id: string,
    @Body() body: RecordFeedbackDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const saved = await this.consultants.recordFeedback(id, workspaceId, user.userId, body)
    if (!saved) throw new NotFoundException('Consultant introuvable')
    return saved
  }

  /** L'historique des pushs d'un consultant et leur issue. */
  @Get(':id/feedback')
  async listFeedback(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const rows = await this.consultants.listFeedback(id, workspaceId, user.userId)
    if (!rows) throw new NotFoundException('Consultant introuvable')
    return rows
  }

  /**
   * Le brief de soutenance d'un consultant sur un besoin (annexe méthodo p22).
   * Déterministe, lecture seule — prêt à donner au consultant avant qu'il
   * rencontre le client.
   */
  @Get(':id/brief/:opportunityId')
  async brief(
    @Param('id') id: string,
    @Param('opportunityId') opportunityId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const brief = await this.consultants.buildBrief(id, opportunityId, workspaceId, user.userId)
    if (!brief) throw new NotFoundException('Consultant ou besoin introuvable')
    return brief
  }

  /**
   * #2189.23-.30 (épopée #2940) — le brief D'ENTRETIEN, distinct du brief de
   * soutenance ci-dessus : objectif, pitch, deux expériences, gaps,
   * objections, questions pour le consultant. Lecture seule, déterministe.
   */
  @Get(':id/interview-brief/:opportunityId')
  async interviewBrief(
    @Param('id') id: string,
    @Param('opportunityId') opportunityId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const brief = await this.consultants.buildInterviewBrief(id, opportunityId, workspaceId, user.userId)
    if (!brief) throw new NotFoundException('Consultant ou besoin introuvable')
    return brief
  }

  /**
   * Réécrit le CV du consultant pour un besoin (annexe méthodo p22) — **1 crédit**
   * (décision Louis 31/07).
   *
   * Le seul appel LLM du vivier, et il produit un livrable que le commercial
   * envoie tel quel : il se facture comme une action, au même tarif qu'une
   * analyse ou qu'un enrichissement (monnaie unique). Sans CV source c'est un
   * 400 explicite : on ne laisse pas un modèle « composer » un CV à partir d'une
   * fiche déclarative, ça produirait un document entièrement inventé sur une
   * personne réelle.
   *
   * Même règle de prélèvement que l'enrichissement : on vérifie le solde AVANT
   * (402 immédiat, aucun appel modèle), et on ne débite qu'APRÈS un CV
   * réellement produit — un échec IA ne coûte rien. Relire un CV déjà écrit
   * (`GET :id/cv-rewrite/:opportunityId`) reste gratuit ; seule une nouvelle
   * génération repaye.
   */
  @Post(':id/cv-rewrite')
  @RequirePermission('records:write')
  async rewriteCv(@Param('id') id: string, @Body() body: CvRewriteDto, @CurrentUser() user: CurrentUserPayload) {
    // Salle de démonstration : même raison que la préparation d'un besoin — un
    // crédit et un appel modèle, alors que le bandeau promet ni l'un ni l'autre.
    // Un CV réécrit d'avance serait de surcroît un document nominatif fictif.
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      throw new HttpException(
        'La réécriture de CV est désactivée dans l’espace de démonstration : elle coûte 1 crédit et appelle un modèle. Le vivier et le matching restent consultables.',
        HttpStatus.FORBIDDEN,
      )
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    if (!(await this.credits.hasEnrichmentCredit(user.userId))) {
      throw new HttpException(SOFT_BRAKE_MESSAGE, HttpStatus.PAYMENT_REQUIRED)
    }
    const result = await this.consultants.rewriteCv(id, body.opportunity_id, workspaceId, user.userId)
    if (result.ok) {
      await this.credits.consumeEnrichmentCredit(user.userId, { reason: 'cv_rewrite' })
      return result.rewrite
    }
    if (result.code === 'not_found') throw new NotFoundException('Consultant ou besoin introuvable')
    if (result.code === 'no_cv') {
      throw new BadRequestException('Aucun CV enregistré pour ce consultant — collez son CV avant de l’adapter.')
    }
    throw new ServiceUnavailableException('La réécriture du CV a échoué. Réessayez dans un instant.')
  }

  /** Le CV déjà réécrit pour ce couple (consultant, besoin), s'il existe. */
  @Get(':id/cv-rewrite/:opportunityId')
  async getCvRewrite(
    @Param('id') id: string,
    @Param('opportunityId') opportunityId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const rewrite = await this.consultants.findCvRewrite(id, opportunityId, workspaceId, user.userId)
    if (!rewrite) throw new NotFoundException('Aucun CV réécrit pour ce besoin')
    return rewrite
  }

  /**
   * #1952.5 (épopée #2844, lot SRC5 28/09 soir) — LA RÉÉCRITURE EN LOT : le
   * même geste que `POST :id/cv-rewrite`, pour plusieurs consultants d'un
   * coup sur LE MÊME besoin, en tâche de fond (file `bulk-cv-rewrite`, suivi
   * par `bulk-cv-rewrite:progress`). Même refus démo, même vérification de
   * solde AVANT lancement — le débit par consultant reste EXACTEMENT celui
   * du geste unitaire (aucun prix de lot inventé, #1952.2 reste hors de
   * cette tranche).
   */
  @Post('cv-rewrite/bulk')
  @RequirePermission('records:write')
  async rewriteCvBulk(@Body() body: CvRewriteBulkDto, @CurrentUser() user: CurrentUserPayload) {
    const isDemo = await this.workspaceContext.isDemoWorkspace(user.userId)
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.bulkCvRewrite.enqueue(workspaceId, user.userId, body.opportunity_id, body.consultant_ids, isDemo)
  }

  @Get('cv-rewrite/bulk/:jobId')
  @WorkspaceRead()
  async rewriteCvBulkState(@Param('jobId') jobId: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.bulkCvRewrite.state(workspaceId, jobId)
  }

  /**
   * H-DECISIONS #4348 — « ajouter un consultant depuis l'URL de son profil
   * LinkedIn » : l'URL collée pré-remplit la fiche (nom, titre, parcours), qui
   * reste ÉDITABLE avant enregistrement. N'écrit rien.
   *
   * Coût : la règle d'enrichissement existante — 1 crédit par SUCCÈS, 0 résultat
   * = 0 débit (`talent_enrichment`, juste en dessous) ; la démo ne débite jamais.
   * Le solde est vérifié AVANT l'appel fournisseur, débité APRÈS un résultat.
   */
  @Post('linkedin-lookup')
  @RequirePermission('records:write')
  async linkedinLookup(@Body() dto: LinkedinLookupDto, @CurrentUser() user: CurrentUserPayload) {
    const demo = await this.workspaceContext.isDemoWorkspace(user.userId)
    if (!demo && !(await this.credits.hasEnrichmentCredit(user.userId))) {
      throw new HttpException(SOFT_BRAKE_MESSAGE, HttpStatus.PAYMENT_REQUIRED)
    }
    const outcome = await this.consultants.lookupLinkedinProfile(dto.url, { demo })
    if (!outcome.ok) {
      if (outcome.code === 'invalid_url') {
        throw new BadRequestException({
          message: 'Colle l’adresse d’un profil, du type linkedin.com/in/prenom-nom.',
          code: 'invalid_url',
        })
      }
      return { found: false as const, code: outcome.code }
    }
    if (!demo) await this.credits.consumeEnrichmentCredit(user.userId, { reason: 'talent_linkedin_lookup' })
    return { found: true as const, draft: outcome.draft }
  }

  /**
   * #2570 — un consultant du vivier s'enrichit comme un contact (retour bêta
   * François Thomas, call du 17/09/2026) : même cascade fournisseur, même
   * coût (1 crédit, monnaie unique), à la DEMANDE de l'utilisateur — jamais
   * déclenché automatiquement.
   *
   * Espace de démonstration : le geste se montre quand même (craft rule 9)
   * mais SANS appel réseau ni crédit — `hasEnrichmentCredit`/
   * `consumeEnrichmentCredit` sont déjà des no-op en démo (monnaie unique),
   * `demo` ci-dessous ne fait que couper l'appel fournisseur côté service.
   */
  @Post(':id/enrich')
  @RequirePermission('records:write')
  async enrichTalent(@Param('id') id: string, @Body() dto: EnrichTalentDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const demo = await this.workspaceContext.isDemoWorkspace(user.userId)
    if (!(await this.credits.hasEnrichmentCredit(user.userId))) {
      throw new HttpException(SOFT_BRAKE_MESSAGE, HttpStatus.PAYMENT_REQUIRED)
    }
    // Lue AVANT l'écriture (GA-07, même geste que `commitCvParse` ci-dessus) :
    // c'est ce qui empêche la cascade d'écraser un titre corrigé à la main.
    const currentSources = await this.provenance.currentSources('consultant', id)
    // #3831.1 — `apolloId` : l'homonyme choisi via `search-by-name`, présent
    // seulement quand la fiche n'a pas de profil LinkedIn.
    const outcome = await this.consultants.enrichTalent(id, workspaceId, user.userId, currentSources, {
      demo,
      apolloId: dto.apolloId,
    })
    if (!outcome.ok) {
      if (outcome.code === 'not_found') throw new NotFoundException('Consultant introuvable')
      if (outcome.code === 'no_identity') {
        throw new BadRequestException({
          message: 'Cette fiche n’a pas de nom : impossible de chercher qui que ce soit.',
          code: 'no_identity',
        })
      }
      if (outcome.code === 'no_match_key') {
        // #3831.1 — `code` DISTINCT de `no_identity` : seul celui-ci dit à
        // l'écran qu'une recherche libre par nom (`search-by-name`) reste
        // possible — deviner sur un message en français serait fragile.
        throw new BadRequestException({
          message:
            'Cette fiche n’a pas de profil LinkedIn enregistré : sans lui, la recherche ne peut pas identifier la bonne personne de façon fiable.',
          code: 'no_match_key',
        })
      }
      throw new ServiceUnavailableException('L’enrichissement a échoué. Réessayez dans un instant.')
    }
    await this.credits.consumeEnrichmentCredit(user.userId, { reason: 'talent_enrichment' })
    // Le journal ne porte que ce qui a RÉELLEMENT changé : un enrichissement
    // entièrement bloqué par une correction humaine ne doit rien y ajouter.
    if (outcome.written.length > 0) {
      await this.provenance.commit({
        workspaceId,
        entityType: 'consultant',
        entityId: id,
        source: 'pipeline',
        actorId: user.userId,
        rule: 'talent_enrichment.cascade',
        changes: outcome.written.map(field => ({
          field: field.field,
          oldValue: field.previous,
          newValue: field.value,
        })),
      })
    }
    return {
      consultant: outcome.consultant,
      written: outcome.written.map(field => ({ field: field.field, value: field.value, source: field.source })),
    }
  }
}

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Le titre d'un dossier — jamais le nom complet sur une version anonymisée. */
function titleFor(version: CvVersion): string {
  return `dossier-competences-${version.versionKind}`
}

function subtitleFor(version: CvVersion): string {
  return `Généré le ${version.generatedAt.slice(0, 10)}`
}

/**
 * Envoie un fichier en PIÈCE JOINTE.
 *
 * `Content-Disposition: attachment` et non `inline` : un dossier de compétences
 * se télécharge pour être relu puis envoyé, il ne s'ouvre pas dans un onglet
 * qu'on refermera sans le garder.
 */
function sendDocument(response: Response, buffer: Buffer, filename: string, mime: string): void {
  response.setHeader('Content-Type', mime)
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  response.setHeader('Content-Length', String(buffer.byteLength))
  response.end(buffer)
}
