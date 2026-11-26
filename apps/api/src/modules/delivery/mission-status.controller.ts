import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { createZodDto, ZodValidationPipe } from 'nestjs-zod'
import {
  createMissionDocumentSchema,
  MISSION_START_DECLARED_KEYS,
  MISSION_RUNNING_STATUSES,
  missionBusinessUnitTransferInputSchema,
  missionStartCheckInputSchema,
  statusChangeSchema,
  updateMissionDocumentStatusSchema,
  type MissionDocument,
  type MissionBusinessUnitTransferResult,
  type MissionStartDeclaredKey,
  type ConsultantEngagementResult,
  type MissionStartReadiness,
  type RecordFieldAudit,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { MissionStatusService, type MissionFieldSources, type StatusChange } from './mission-status.service'
import { MissionStartReadinessService } from './mission-start-readiness.service'
import { MissionDocumentsService } from './mission-documents.service'
import { MissionBusinessUnitService } from './mission-business-unit.service'
import { ProvenanceService } from '../crm-core/provenance.service'
import { ConsultantEngagementService } from '../consultants/consultant-engagement.service'

const RUNNING_STATUSES: readonly string[] = MISSION_RUNNING_STATUSES

class StatusChangeDto extends createZodDto(statusChangeSchema) {}
class MissionStartCheckDto extends createZodDto(missionStartCheckInputSchema) {}
class CreateMissionDocumentDto extends createZodDto(createMissionDocumentSchema) {}
class UpdateMissionDocumentStatusDto extends createZodDto(updateMissionDocumentStatusSchema) {}

/**
 * #2407.5 / #2407.6 — changer le statut d'une mission ou d'une affectation,
 * selon la table STRICTE (decisions §9). Même permission que le déplacement
 * d'une carte sur le tableau (`records:write`) : c'est le même geste.
 */
@Controller('delivery/missions/:missionId')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MissionStatusController {
  constructor(
    private readonly statuses: MissionStatusService,
    private readonly startReadiness: MissionStartReadinessService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly provenance: ProvenanceService,
    private readonly documents: MissionDocumentsService,
    private readonly businessUnit: MissionBusinessUnitService,
    private readonly engagement: ConsultantEngagementService,
  ) {}

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /**
   * #2193.50 (épopée #2953) — « qui a corrigé quoi sur cette mission ? ».
   * `ProvenanceService.history()` lit déjà n'importe quel `entity_type`
   * (`'mission'` est dans `PROVENANCE_ENTITY_TYPES` depuis #2407) ; rien ne
   * l'appelait pour une mission. Même lecteur générique que compte/contact
   * (`AccountRecordController.history`) — pas une seconde classification.
   */
  @Get('history')
  @WorkspaceRead()
  async history(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
  ): Promise<{ items: RecordFieldAudit[] }> {
    const workspaceId = await this.scope(user.userId)
    return { items: await this.provenance.history(workspaceId, 'mission', missionId) }
  }

  /** #3413 « autre BU » — la BU propriétaire de la mission, nommée (la sienne, ou celle de son compte). */
  @Get('business-unit')
  @WorkspaceRead()
  async currentBusinessUnit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
  ): Promise<{ businessUnit: { id: string; name: string } | null; inherited: boolean }> {
    return this.businessUnit.current(await this.scope(user.userId), missionId)
  }

  /**
   * #3413 « autre BU » (décision Louis 02/10) — le TRANSFERT RÉEL de la mission vers
   * une autre BU de l'espace. Geste explicite (`confirm: true` littéral, refusé
   * sinon), journalisé dans `record_field_audit` — qui, quand, BU source → cible —
   * donc lu par « Historique » de la fiche. Le journal est écrit ICI, au contrôleur
   * qui orchestre (GA-07) ; s'il échoue, le transfert est annulé.
   */
  @Post('business-unit/transfer')
  @RequirePermission('records:write')
  async transferBusinessUnit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body(new ZodValidationPipe(missionBusinessUnitTransferInputSchema))
    body: { targetBusinessUnitId: string; confirm: true },
  ): Promise<MissionBusinessUnitTransferResult> {
    const workspaceId = await this.scope(user.userId)
    return this.businessUnit.transfer(workspaceId, user.userId, missionId, body, change =>
      this.provenance.commit({
        workspaceId,
        entityType: 'mission',
        entityId: missionId,
        source: 'human',
        actorId: user.userId,
        rule: 'mission_business_unit_transfer',
        changes: [change],
      }),
    )
  }

  @Post('status')
  @RequirePermission('records:write')
  async changeMissionStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: StatusChangeDto,
  ): Promise<StatusChange & { engagement?: ConsultantEngagementResult[] }> {
    const workspaceId = await this.scope(user.userId)
    const change = await this.statuses.changeMissionStatus(workspaceId, user.userId, missionId, body)
    // #4196 — le DÉMARRAGE (entrée dans un statut « en cours », en avant) met les
    // consultants affectés « en mission ». Orchestré ici (GA-07), jamais dans le service.
    if (
      change.direction !== 'forward' ||
      !RUNNING_STATUSES.includes(change.to) ||
      RUNNING_STATUSES.includes(change.from)
    ) {
      return change
    }
    const facts = await this.statuses.lifecycleFacts(workspaceId, missionId)
    if (!facts || facts.consultantIds.length === 0) return change
    return {
      ...change,
      engagement: await this.engagement.startEngagement(workspaceId, user.userId, facts.consultantIds, facts.endsOn),
    }
  }

  /** #2407.3 — la provenance des champs principaux (client, intitulé, dates, TJM) : source et date de la dernière écriture. */
  @Get('field-sources')
  @WorkspaceRead()
  async fieldSources(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
  ): Promise<MissionFieldSources> {
    return this.statuses.fieldSources(await this.scope(user.userId), missionId)
  }

  /** #2338 / #2409 — le double accord et la checklist de démarrage, avec le verdict. */
  @Get('start-readiness')
  @WorkspaceRead()
  async readStartReadiness(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
  ): Promise<MissionStartReadiness> {
    return this.startReadiness.readiness(await this.scope(user.userId), missionId)
  }

  /** #2338 / #2409.7 — enregistrer un accord ou un prérequis : geste humain, daté, avec sa preuve. */
  @Post('start-checks')
  @RequirePermission('records:write')
  async confirmStartCheck(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: MissionStartCheckDto,
  ): Promise<MissionStartReadiness> {
    return this.startReadiness.confirm(await this.scope(user.userId), user.userId, missionId, body)
  }

  /** Retirer un accord ou un prérequis : il est ARCHIVÉ, jamais supprimé. */
  @Post('start-checks/:item/withdraw')
  @RequirePermission('records:write')
  async withdrawStartCheck(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('item') item: string,
  ): Promise<MissionStartReadiness> {
    if (!(MISSION_START_DECLARED_KEYS as readonly string[]).includes(item)) {
      throw new BadRequestException('Prérequis de démarrage inconnu.')
    }
    return this.startReadiness.withdraw(
      await this.scope(user.userId),
      user.userId,
      missionId,
      item as MissionStartDeclaredKey,
    )
  }

  @Post('assignments/:assignmentId/status')
  @RequirePermission('records:write')
  async changeAssignmentStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: StatusChangeDto,
  ): Promise<StatusChange> {
    return this.statuses.changeAssignmentStatus(
      await this.scope(user.userId),
      user.userId,
      missionId,
      assignmentId,
      body,
    )
  }

  /**
   * #2193.51 (épopée #2953) — les DOCUMENTS d'une mission (contrat signé,
   * avenant, NDA). Voir le docblock de `MissionDocumentsService` — PAS de
   * fichier joint dans cette tranche, même choix que
   * `projects/:id/documents` (#2171.24).
   */
  @Get('documents')
  @WorkspaceRead()
  async listMissionDocuments(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
  ): Promise<{ items: MissionDocument[] }> {
    return { items: await this.documents.list(await this.scope(user.userId), missionId) }
  }

  @Post('documents')
  @RequirePermission('records:write')
  async createMissionDocument(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: CreateMissionDocumentDto,
  ): Promise<MissionDocument> {
    return this.documents.create(await this.scope(user.userId), missionId, body)
  }

  @Patch('documents/:documentId/status')
  @RequirePermission('records:write')
  async updateMissionDocumentStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() body: UpdateMissionDocumentStatusDto,
  ): Promise<MissionDocument> {
    return this.documents.updateStatus(await this.scope(user.userId), missionId, documentId, body.status)
  }
}
