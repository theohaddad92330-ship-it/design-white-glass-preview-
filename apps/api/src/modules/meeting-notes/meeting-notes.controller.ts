import type { MeetingCascade, MeetingRecap, TranscriptionStatus } from '@bellum/contracts'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Optional,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { JwtGuard } from '../auth/jwt.guard'
import {
  ApproveInternalDto,
  CreateTasksDto,
  ExtractMeetingDocumentDto,
  RecapStatusQueryDto,
  StructureNotesDto,
  TranscribeDto,
} from './dto/meeting-notes.dto'
import { MeetingNotesService, type MeetingApprovalResult } from './meeting-notes.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * Le cycle du compte rendu : transcrire, structurer, poser les actions.
 *
 * Trois routes et non une : une chaîne qui s'exécute d'un bloc ne laisse aucune
 * place au « non, cette action n'est pas pour moi ».
 */
@Controller('meeting-notes')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MeetingNotesController {
  constructor(
    private readonly notes: MeetingNotesService,
    /**
     * LE CLOISONNEMENT DE PÉRIMÈTRE (BU) — revue sécurité 15/09/2026. Le compte
     * passé en CONTEXTE au modèle est un compte que l'appelant peut ouvrir.
     * Résolu ICI (GA-07 : l'orchestration vit dans le contrôleur).
     */
    @Optional() private readonly workspaceContext?: WorkspaceContextService,
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  private async businessUnitScopeOf(userId: string) {
    if (!this.workspaceContext) {
      throw new ServiceUnavailableException('business_unit_scope_unavailable')
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)
  }

  /**
   * #2777 — la MÊME résolution que `businessUnitScopeOf`, en best-effort.
   *
   * `approveInternal` ne dépendait avant ce lot d'AUCUN des deux services
   * optionnels : la faire échouer dur si `workspaceContext` manque romprait
   * `next_steps`/`contacts`/`recap`/`need`/`learnings`, qui n'ouvrent jamais
   * un compte par cette porte. Seule `opportunity` (résolution du nom de
   * compte avant de le proposer au CRM) en a besoin — `null` = même défaut
   * qu'un compte sans périmètre déclaré, jamais une erreur qui romprait tout
   * le lot pour les six autres sorties.
   */
  private async businessUnitScopeIfAvailable(userId: string) {
    if (!this.workspaceContext) return null
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)
  }

  /** La transcription est-elle activée ? L'écran le demande AVANT de proposer
   *  le dépôt d'un fichier — un bouton qui échoue au clic est pire qu'un bouton
   *  absent. */
  @Get('status')
  status(): TranscriptionStatus {
    return this.notes.status()
  }

  /** #2103.1 — ce rendez-vous a-t-il déjà un compte rendu ? L'agenda l'appelle
   *  avant de proposer d'en rédiger un, pour ne jamais reproposer un CR déjà
   *  écrit. */
  @Get('recap-status')
  @WorkspaceRead()
  recapStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: RecapStatusQueryDto,
  ): Promise<{ exists: boolean }> {
    return this.notes.recapExists(user.userId, query.sourceEventId)
  }

  @Post('transcribe')
  @HttpCode(200)
  transcribe(@CurrentUser() user: CurrentUserPayload, @Body() dto: TranscribeDto): Promise<{ text: string }> {
    return this.notes.transcribe(user.userId, dto)
  }

  /** #2103.4 — le texte d'un document joint (PDF/Word), avant de le proposer
   *  comme matière d'un compte rendu. Lecture pure, aucune écriture. */
  @Post('extract-document')
  // GA-05 — déclarée : une lecture, jamais une écriture (le texte extrait ne
  // devient un compte rendu qu'au geste « Enregistrer », sur une autre route).
  @WorkspaceRead()
  @HttpCode(200)
  extractDocument(@Body() dto: ExtractMeetingDocumentDto): Promise<{ text: string; partial: boolean }> {
    return this.notes.extractDocument(dto)
  }

  @Post('structure')
  @HttpCode(200)
  async structure(@CurrentUser() user: CurrentUserPayload, @Body() dto: StructureNotesDto): Promise<MeetingRecap> {
    return this.notes.structure(user.userId, dto, await this.businessUnitScopeOf(user.userId))
  }

  /**
   * Les neuf sorties du rendez-vous, prêtes à afficher.
   *
   * Une route de plus que `structure`, et non un remplacement : le compte rendu
   * nu reste utile là où il est déjà lu (l'onglet Plan d'un compte). La cascade
   * y ajoute les cartes, leurs puces et le récapitulatif d'avant validation.
   */
  @Post('cascade')
  // Lecture d'espace : avec un `accountId`, `structure()` appelle
  // `findOneForWorkspace` pour donner au modèle le contexte du compte. Rien
  // n'est écrit — la cascade se contente de construire des cartes à valider.
  @WorkspaceRead()
  @HttpCode(200)
  cascade(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: StructureNotesDto,
  ): Promise<{ recap: MeetingRecap; cascade: MeetingCascade }> {
    return this.notes.cascade(user.userId, dto)
  }

  /**
   * Valide les écritures INTERNES retenues.
   *
   * ⚠️ Il n'existe volontairement AUCUNE route jumelle pour les brouillons
   * externes. Le mail de suivi et la relance ne s'envoient pas depuis Bellum :
   * le commercial les relit et les envoie lui-même. L'absence de route est la
   * garantie — une route « qui n'enverrait que sur approbation » finirait par
   * envoyer.
   */
  @Post('cascade/approve')
  // La seule sortie branchée pose des tâches dans le CRM de l'espace — une
  // fiche créée, donc `records:write`. Un `viewer` prépare la cascade et la
  // relit ; il ne la pose pas.
  @RequirePermission('records:write')
  @HttpCode(200)
  async approveInternal(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ApproveInternalDto,
  ): Promise<MeetingApprovalResult> {
    return this.notes.approveInternal(user.userId, dto, await this.businessUnitScopeIfAvailable(user.userId))
  }

  @Post('tasks')
  @HttpCode(200)
  createTasks(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateTasksDto,
  ): Promise<{ created: number; failed: Array<{ subject: string; reason: string }> }> {
    return this.notes.createTasks(user.userId, dto.tasks)
  }
}
