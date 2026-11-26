import { ConflictException, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { DEFAULT_ENTRY_STAGE, type PipelineDetection, type PipelineDetectionList } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { killSwitchCut } from '../../common/kill-switches'
import { JwtGuard } from '../auth/jwt.guard'
import { SubmissionsService } from '../consultants/submissions.service'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { ProjectPipelineService } from '../projects/project-pipeline.service'
import { ProjectsService } from '../projects/projects.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { PipelineDetectionsService, type PipelineDetectionRecord } from './pipeline-detections.service'

/** La vue du contrat — `needId` reste côté serveur. */
function toView({ needId: _needId, ...view }: PipelineDetectionRecord): PipelineDetection {
  return view
}

/**
 * #4016 L6 — LE PIPE « DÉTECTÉ, À REVOIR » : la lecture, et les deux gestes.
 *
 * ⚠️ CONFIRMER EST UN GESTE D'HUMAIN, et il passe par les portes EXISTANTES —
 * appelées ICI, dans un contrôleur derrière `JwtGuard` +
 * `WorkspacePermissionGuard('records:write')`, jamais depuis le balayeur :
 *  · intérêt → `ProjectsService.createForWorkspace` (#2195.33 : le clic EST la
 *    décision), à la première colonne du pipe, au nom de celui qui clique ;
 *  · shortlist → `SubmissionsService.create`, en `shortlisted` : retenu, pas
 *    envoyé ;
 *  · entretien → AUCUNE création : une mission exige l'accord du client ET du
 *    consultant (#2320.21), que ce clic n'atteste pas. La ligne est prise en
 *    main ; le dossier de mission se signe dans son formulaire.
 * Rien n'est écrit dans le CRM du client.
 */
@Controller('pipeline-detections')
@RequireFeature('needs')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class PipelineDetectionsController {
  constructor(
    private readonly detections: PipelineDetectionsService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly projects: ProjectsService,
    private readonly submissions: SubmissionsService,
    private readonly pipeline: ProjectPipelineService,
  ) {}

  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<PipelineDetectionList> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const items = await this.detections.listDetected(workspaceId)
    return { items: items.map(toView), autoDetect: killSwitchCut('pipeline.auto_detect') ? 'off' : 'on' }
  }

  @Post(':id/confirm')
  @RequirePermission('records:write')
  @HttpCode(200)
  async confirm(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PipelineDetection> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const row = await this.detections.getDetected(workspaceId, id)
    let createdObjectId: string | null = null
    if (row.kind === 'interest_to_opportunity') {
      const project = await this.projects.createForWorkspace(workspaceId, {
        accountId: row.accountId,
        label: row.label,
        stage: DEFAULT_ENTRY_STAGE,
        ownerId: user.userId,
      })
      // `null` : compte disparu, ou une affaire du même libellé existe déjà.
      // La ligne reste « détecté » — jamais dite confirmée sans son affaire.
      if (!project) throw new ConflictException('L’affaire n’a pas pu être ouverte : elle existe peut-être déjà.')
      createdObjectId = project.id
      // #2152.13 — la confirmation HUMAINE laisse aussi un besoin à qualifier (cohérent #2323.1 : jamais à la
      // détection seule). Statut non posé ici : le défaut du service est `to_qualify`. `provenance: 'pipeline'` =
      // proposition acceptée par un clic. Idempotent : un besoin déjà posé pour cette piste n'est pas redoublé.
      const existing = await this.pipeline.listNeeds(workspaceId, project.id)
      const alreadyThere = existing.some(need => need.title === row.label && need.provenance === 'pipeline')
      if (!alreadyThere) {
        await this.pipeline.addNeedForAccount(
          workspaceId,
          row.accountId,
          { title: row.label, source: 'from_account', provenance: 'pipeline', project_id: project.id },
          user.userId,
        )
      }
    } else if (row.kind === 'shortlist_to_submission' && row.projectId && row.consultantId) {
      const submission = await this.submissions.create(user.userId, {
        projectId: row.projectId,
        consultantId: row.consultantId,
        needId: row.needId ?? undefined,
        stage: 'shortlisted',
        proposedRateCents: null,
      })
      createdObjectId = submission.id
    }
    return toView(await this.detections.decide(workspaceId, id, user.userId, { status: 'confirmed', createdObjectId }))
  }

  @Post(':id/dismiss')
  @RequirePermission('records:write')
  @HttpCode(200)
  async dismiss(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PipelineDetection> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return toView(await this.detections.decide(workspaceId, id, user.userId, { status: 'dismissed' }))
  }
}
