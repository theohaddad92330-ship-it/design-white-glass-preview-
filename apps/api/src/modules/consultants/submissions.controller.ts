import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  advanceSubmissionSchema,
  advanceSubstatusSchema,
  createSubmissionSchema,
  recordConsultantFeedbackSchema,
  recordFeedbackSchema,
  recordInterviewOutcomeSchema,
  recordSubmissionDetailsSchema,
  recordSubmissionNextActionSchema,
  scheduleInterviewSchema,
  submissionStageSchema,
  type Interview,
  type Submission,
  type SubmissionConsultantFeedback,
  type SubmissionFeedback,
  type SubmissionFunnel,
  type SubmissionPreview,
  type SubmissionTimelineEvent,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { SubmissionsService } from './submissions.service'

const listSubmissionsSchema = z
  .object({
    projectId: z.string().guid().optional(),
    consultantId: z.string().guid().optional(),
    stage: submissionStageSchema.optional(),
  })
  .strict()

class ListSubmissionsDto extends createZodDto(listSubmissionsSchema) {}
class CreateSubmissionDto extends createZodDto(createSubmissionSchema) {}
class AdvanceSubmissionDto extends createZodDto(advanceSubmissionSchema) {}
class AdvanceSubstatusDto extends createZodDto(advanceSubstatusSchema) {}
class RecordSubmissionDetailsDto extends createZodDto(recordSubmissionDetailsSchema) {}
class RecordSubmissionNextActionDto extends createZodDto(recordSubmissionNextActionSchema) {}
class ScheduleInterviewDto extends createZodDto(scheduleInterviewSchema) {}
class RecordInterviewOutcomeDto extends createZodDto(recordInterviewOutcomeSchema) {}
class RecordFeedbackDto extends createZodDto(recordFeedbackSchema) {}
class RecordConsultantFeedbackDto extends createZodDto(recordConsultantFeedbackSchema) {}

/** Les positionnements : qui a été proposé, où ça en est, ce que le client a dit. */
@Controller('submissions')
@RequireFeature('ats_native')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListSubmissionsDto,
  ): Promise<{ items: Submission[]; funnel: SubmissionFunnel }> {
    return this.submissions.list(user.userId, query)
  }

  @Post()
  @RequirePermission('records:write')
  create(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateSubmissionDto): Promise<Submission> {
    return this.submissions.create(user.userId, body)
  }

  // #2953 (#2193.48) — LE dossier d'UN positionnement, la page de destination
  // qui manquait à tout lien vers un `submission_id` (mission, pré-analyse).
  @Get(':id')
  get(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<Submission> {
    return this.submissions.get(user.userId, id)
  }

  @Patch(':id')
  @RequirePermission('records:write')
  advance(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdvanceSubmissionDto,
  ): Promise<Submission> {
    return this.submissions.advance(user.userId, id, body)
  }

  // #2177.11 / .12 / .13 / .15 / .20 / .21 — fait avancer le SOUS-statut,
  // route SÉPARÉE de `advance` ci-dessus : `stage` ne bouge jamais ici.
  @Patch(':id/substatus')
  @RequirePermission('records:write')
  advanceSubstatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdvanceSubstatusDto,
  ): Promise<Submission> {
    return this.submissions.advanceSubstatus(user.userId, id, body)
  }

  // #2177.6 / .8 / .24 / .25 / .28 / .30 — le DÉTAIL d'un positionnement :
  // destinataire, canal, message préparé, disponibilité, conditions.
  @Patch(':id/details')
  @RequirePermission('records:write')
  recordDetails(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RecordSubmissionDetailsDto,
  ): Promise<Submission> {
    return this.submissions.recordDetails(user.userId, id, body)
  }

  // #2189.39 — la prochaine action de ce positionnement, toujours datée et
  // attribuée. Route SÉPARÉE de `recordDetails` : ces trois champs ne portent
  // ni étape ni sous-statut.
  @Patch(':id/next-action')
  @RequirePermission('records:write')
  recordNextAction(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RecordSubmissionNextActionDto,
  ): Promise<Submission> {
    return this.submissions.recordNextAction(user.userId, id, body)
  }

  // #2189.10-.16 — l'aperçu d'une présentation, lecture seule.
  @Get(':id/preview')
  preview(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<SubmissionPreview> {
    return this.submissions.preview(user.userId, id)
  }

  // #2335.3 — chaque étape avec sa date, la fiche d'UN positionnement.
  @Get(':id/timeline')
  async timeline(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: SubmissionTimelineEvent[] }> {
    return { items: await this.submissions.listTimeline(user.userId, id) }
  }

  @Get(':id/interviews')
  async interviews(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: Interview[] }> {
    return { items: await this.submissions.listInterviews(user.userId, id) }
  }

  @Post(':id/interviews')
  @RequirePermission('records:write')
  scheduleInterview(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScheduleInterviewDto,
  ): Promise<Interview> {
    return this.submissions.scheduleInterview(user.userId, id, body)
  }

  @Patch(':id/interviews/:interviewId')
  @RequirePermission('records:write')
  recordInterviewOutcome(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('interviewId', ParseUUIDPipe) interviewId: string,
    @Body() body: RecordInterviewOutcomeDto,
  ): Promise<Interview> {
    return this.submissions.recordInterviewOutcome(user.userId, id, interviewId, body)
  }

  // #2875/#3398 (BM) — posé à la première ouverture du brief d'entretien.
  // Permission déclarée (GA-05, intégration P1) : la route écrit une colonne.
  @Post(':id/interviews/:interviewId/brief-viewed')
  @RequirePermission('records:write')
  markInterviewBriefViewed(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('interviewId', ParseUUIDPipe) interviewId: string,
  ): Promise<Interview> {
    return this.submissions.markInterviewBriefViewed(user.userId, id, interviewId)
  }

  @Get(':id/feedback')
  async feedback(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: SubmissionFeedback[] }> {
    return { items: await this.submissions.listFeedback(user.userId, id) }
  }

  @Post(':id/feedback')
  @RequirePermission('records:write')
  recordFeedback(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RecordFeedbackDto,
  ): Promise<SubmissionFeedback> {
    return this.submissions.recordFeedback(user.userId, id, body)
  }

  // #2335.5 — le retour CONSULTANT, sur une route séparée du retour client
  // ci-dessus : jamais le même objet, jamais le même endpoint.
  @Get(':id/consultant-feedback')
  async consultantFeedback(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: SubmissionConsultantFeedback[] }> {
    return { items: await this.submissions.listConsultantFeedback(user.userId, id) }
  }

  @Post(':id/consultant-feedback')
  @RequirePermission('records:write')
  recordConsultantFeedback(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RecordConsultantFeedbackDto,
  ): Promise<SubmissionConsultantFeedback> {
    return this.submissions.recordConsultantFeedback(user.userId, id, body)
  }
}
