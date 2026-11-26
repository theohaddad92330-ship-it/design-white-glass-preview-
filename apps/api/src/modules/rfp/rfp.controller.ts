import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  addRfpRequirementCommentSchema,
  assignRfpSectionOwnerSchema,
  confirmRfpImportSchema,
  createNeedFromRfpSchema,
  createRfpRequestSchema,
  previewRfpImportSchema,
  saveRfpImportSessionSchema,
  updateRfpRequirementSchema,
  type AddRfpRequirementComment,
  type AssignRfpSectionOwner,
  type ConfirmRfpImport,
  type CreateNeedFromRfp,
  type CreateRfpRequest,
  type SaveRfpImportSession,
  type UpdateRfpRequirement,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { ProjectPipelineService } from '../projects/project-pipeline.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { needFromRfp, previewNeedFromRfp } from './rfp-to-need'
import { RfpImportSessionService } from './rfp-import-session.service'
import { RfpService } from './rfp.service'

/**
 * RFP/RFQ Studio côté HTTP (addendum final p66-68).
 *
 * Les routes suivent l'ordre du travail réel : importer, décider, puis rédiger
 * exigence par exigence. Il n'existe volontairement AUCUNE route « rédiger tout
 * le dossier » — elle rendrait impossible de dire quelle réponse repose sur
 * quelle source, et cette traçabilité est toute la valeur du studio.
 */
@Controller('rfp')
// #2957 (#2179.1) — une surface de palier, comme le pipe des projets.
@RequireFeature('rfp')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class RfpController {
  constructor(
    private readonly rfp: RfpService,
    // #1097 — l'orchestration « appel d'offres → besoin » traverse deux modules.
    // Elle vit dans un CONTRÔLEUR, la sortie que GA-07 nomme elle-même : le
    // besoin reste écrit par le service qui possède la table, avec ses
    // invariants (plafond par projet, appartenance à l'espace).
    private readonly pipeline: ProjectPipelineService,
    private readonly workspaceContext: WorkspaceContextService,
    // #2957 (#2180.53) — l'import interruptible et reprenable.
    private readonly importSessions: RfpImportSessionService,
  ) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.rfp.list(user.userId)
  }

  /**
   * #2957 (#2180.53) — l'import EN COURS de l'appelant, pour le reprendre après
   * une interruption. Déclarée AVANT `:id` : sans cela `ParseUUIDPipe` la
   * prendrait pour un identifiant. `null` = aucun import à reprendre.
   */
  @Get('import-session')
  @WorkspaceRead()
  async currentImportSession(@CurrentUser() user: CurrentUserPayload) {
    // Enveloppé : Nest rend un corps VIDE pour `null`, que le client lit comme `undefined`.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { session: await this.importSessions.current(workspaceId, user.userId) }
  }

  /** Garde l'aperçu rendu (jamais les octets des fichiers) pour pouvoir le reprendre. */
  @Put('import-session')
  @RequirePermission('records:write')
  async saveImportSession(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(saveRfpImportSessionSchema)) body: SaveRfpImportSession,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.importSessions.save(workspaceId, user.userId, body)
  }

  /** « Annuler l'import » (#2180.52) : la session est archivée, rien n'est supprimé. */
  @Delete('import-session')
  @RequirePermission('records:write')
  async cancelImportSession(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.importSessions.close(workspaceId, user.userId, 'cancelled')
    return { cancelled: true }
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.rfp.findOne(user.userId, id)
  }

  /**
   * #2957 (#2180.54) — ce que le stockage porte pour CE dossier : les
   * fichiers BRUTS conservés à l'import, dans l'ordre de dépôt. Même patron
   * que `listNeedDocumentFiles` (`projects.controller.ts`) : une route à
   * part, parce qu'un document SUIVI (ici, une exigence) et son FICHIER ne
   * sont pas la même chose.
   */
  @Get(':id/documents')
  @WorkspaceRead()
  listDocuments(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.rfp.listSourceDocuments(user.userId, id)
  }

  /**
   * #2957 (#2180.54) — OUVRE un fichier source : une URL signée qui vit cinq
   * minutes, jamais une URL gardée ni publique.
   */
  @Get(':id/documents/:objectId/download')
  @WorkspaceRead()
  downloadDocument(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
  ) {
    return this.rfp.downloadSourceDocument(user.userId, id, objectId)
  }

  /**
   * #2571.2 — la prévisualisation du besoin, AVANT toute écriture.
   *
   * Une LECTURE pure : aucun besoin n'existe après cet appel. C'est elle qui
   * répond au retour client (#2571, François Thomas) — voir ses critères et
   * ses inconnues NOMMÉES avant de cliquer, sans ressaisir le brief.
   *
   * GA-05 — lecture pure de la donnée d'espace (le dossier RFP déjà importé),
   * aucune écriture, aucun crédit débité, rien qui sort de l'espace :
   * `@WorkspaceRead`, pas `@RequirePermission` (`ROLE_PERMISSIONS` ne porte
   * aucune permission de lecture).
   */
  @Get(':id/need-preview')
  @WorkspaceRead()
  async previewNeed(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    const { rfp } = await this.rfp.findOne(user.userId, id)
    // L'entité porte une `Date`, le contrat une chaîne ISO — même conversion
    // qu'à la confirmation (`createNeed` ci-dessous), faite ICI plutôt que dans
    // la fonction pure, qui reste testable sans TypeORM.
    return previewNeedFromRfp({
      ...rfp,
      due_at: rfp.due_at ? rfp.due_at.toISOString() : null,
    })
  }

  /** Importe et analyse. Le verdict rendu est une PROPOSITION, pas une décision. */
  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(createRfpRequestSchema)) body: CreateRfpRequest,
  ) {
    return this.rfp.create(user.userId, body)
  }

  /**
   * #2180.5 — la MÊME analyse que `create`, mais RIEN n'est écrit : l'écran
   * de preview (#2180.41-46) montre les indicateurs, puis laisse l'humain
   * exclure un document (#2180.49), en ajouter un (#2180.50), corriger
   * (#2180.48) ou confirmer (`POST /rfp/confirm`, #2180.47/.51/.52).
   */
  @Post('preview')
  preview(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(previewRfpImportSchema)) body: CreateRfpRequest,
  ) {
    return this.rfp.preview(user.userId, body)
  }

  /**
   * #2180.6 — la SEULE écriture d'un import prévisualisé : exactement le
   * brouillon rendu par `POST /rfp/preview`, jamais une ré-analyse.
   */
  @Post('confirm')
  async confirm(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(confirmRfpImportSchema)) body: ConfirmRfpImport,
  ) {
    // #2957 (#2179.31) — un besoin d'origine se VÉRIFIE dans l'espace de
    // l'appelant avant d'être posé en `need_id` : l'identifiant vient du client.
    if (body.sourceNeedId) {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
      if (!(await this.pipeline.hasNeed(workspaceId, body.sourceNeedId))) {
        throw new NotFoundException('Besoin introuvable.')
      }
    }
    const confirmed = await this.rfp.confirm(user.userId, body)
    // #2180.53 — l'import abouti n'est plus « à reprendre ».
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.importSessions.close(workspaceId, user.userId, 'confirmed')
    return confirmed
  }

  /** L'humain tranche. La proposition de l'IA reste consultable à côté. */
  @Post(':id/decision')
  decide(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('verdict') verdict: 'bid' | 'no_bid',
  ) {
    return this.rfp.decide(user.userId, id, verdict === 'no_bid' ? 'no_bid' : 'bid')
  }

  /**
   * #2957 (#2181.47) — « Marquer soumis », un geste déclaratif (voir
   * `RfpService.markSubmitted`) : jamais un envoi vérifié, jamais posé par
   * Laura elle-même.
   */
  @Post(':id/submitted')
  markSubmitted(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.rfp.markSubmitted(user.userId, id)
  }

  /**
   * Transforme l'appel d'offres en besoin ouvert (#1097) — « est-ce que ça sert
   * à Bellum de charger les AO reçus d'un compte ? ».
   *
   * Oui : Bellum lit déjà les appels d'offres PUBLICS et les marchés attribués,
   * mais un AO reçu en direct n'existe nulle part. Devenu besoin, il entre dans
   * la vue transverse ET dans le moteur de matching du vivier — déterministe,
   * explicable, sans crédit.
   *
   * Le projet est CHOISI par l'appelant : deviner ferait ranger le besoin dans
   * un pipe où personne ne le cherchera. Les compétences, elles, ne sont pas
   * dérivées du document — voir `needFromRfp`.
   *
   * #2571.2 — c'est la SEULE porte d'écriture de ce module : `previewNeed`
   * (juste au-dessus) ne fait que lire. Le besoin n'existe qu'après CET appel,
   * explicite, avec un projet choisi par un humain.
   */
  @Post(':id/need')
  async createNeed(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createNeedFromRfpSchema)) body: CreateNeedFromRfp,
  ) {
    // `findOne` rend le dossier ET sa matrice de conformité ; seul le dossier
    // porte le titre et l'échéance.
    const { rfp } = await this.rfp.findOne(user.userId, id)
    // #2179.36 — LA GARDE ANTI-DOUBLON. Un double-clic, ou la même requête
    // relancée après un timeout réseau, ne doit pas produire un second
    // `project_needs` pour le même dossier : `need_id` dit qu'un besoin est
    // déjà sorti d'ici, et un second appel se refuse plutôt que de rejouer
    // l'écriture en silence.
    if (rfp.need_id) {
      throw new ConflictException('Un besoin a déjà été créé pour cet appel d’offres.')
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // L'entité porte une `Date`, le contrat une chaîne ISO — la conversion se
    // fait ICI plutôt que dans la fonction pure, qui reste testable sans TypeORM.
    const need = await this.pipeline.addNeed(
      workspaceId,
      body.projectId,
      needFromRfp({ title: rfp.title, due_at: rfp.due_at ? rfp.due_at.toISOString() : null }),
    )
    await this.rfp.markNeedCreated(user.userId, id, need.id)
    return need
  }

  @Patch(':id/requirements/:requirementId')
  updateRequirement(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
    @Body(new ZodValidationPipe(updateRfpRequirementSchema)) body: UpdateRfpRequirement,
  ) {
    return this.rfp.updateRequirement(user.userId, id, requirementId, body)
  }

  /** #2957 (#2181.40) — attribuer une section entière à un rôle. */
  @Patch(':id/sections/owner')
  @RequirePermission('records:write')
  assignSectionOwner(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignRfpSectionOwnerSchema)) body: AssignRfpSectionOwner,
  ) {
    return this.rfp.assignSectionOwner(user.userId, id, body)
  }

  /** #2957 (#2181.15) — commenter une exigence (auteur/date posés par le serveur). */
  @Post(':id/requirements/:requirementId/comments')
  @RequirePermission('records:write')
  addRequirementComment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
    @Body(new ZodValidationPipe(addRfpRequirementCommentSchema)) body: AddRfpRequirementComment,
  ) {
    return this.rfp.addRequirementComment(user.userId, id, requirementId, body)
  }

  /** Rédige UNE exigence. Un `to_produce` en retour est l'information la plus
   *  utile de l'écran : il nomme ce qui manque et qui doit le produire. */
  @Post(':id/requirements/:requirementId/draft')
  draft(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
    @Body('approvedSources') approvedSources: { title: string; content: string }[] | undefined,
  ) {
    return this.rfp.draft(user.userId, id, requirementId, approvedSources ?? [])
  }
}
