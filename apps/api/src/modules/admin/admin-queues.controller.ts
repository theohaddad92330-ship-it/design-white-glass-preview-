import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AdminQueuesService, type AdminQueueJobsPage, type AdminQueueSummary } from './admin-queues.service'
import { CleanQueueQueryDto } from './dto/clean-queue-query.dto'
import { ListQueueJobsQueryDto } from './dto/list-queue-jobs-query.dto'
import { QueueActorDto } from './dto/queue-actor.dto'

const DEFAULT_PAGE_LIMIT = 50
const DEFAULT_ACTOR = 'backoffice'

/**
 * Operator BullMQ queue viewer — lists the INDIVIDUAL jobs in the pipeline
 * queues and, for failed jobs, their `failedReason` + last stack line (the live
 * incident tool). Sibling of {@link AdminOpsController} / {@link
 * AdminAnalysesController}: same `internal/admin` prefix, same
 * `InternalSecretGuard` (header secret, no end-user JWT). Removing the guard
 * would expose the pipeline queues — and their retry/remove/clean mutations — to
 * anyone; it must never be removed.
 *
 * The retry/remove/clean mutations are audit-logged inside {@link
 * AdminQueuesService}. The `:name` param is validated against an allowlist in the
 * service so an arbitrary queue can't be reached.
 */
@Controller('internal/admin/queues')
@UseGuards(InternalSecretGuard)
export class AdminQueuesController {
  constructor(private readonly queues: AdminQueuesService) {}

  @Get()
  list(): Promise<AdminQueueSummary[]> {
    return this.queues.listQueues()
  }

  @Get(':name/jobs')
  jobs(@Param('name') name: string, @Query() query: ListQueueJobsQueryDto): Promise<AdminQueueJobsPage> {
    return this.queues.listJobs(name, query.state, query.limit ?? DEFAULT_PAGE_LIMIT, query.offset ?? 0)
  }

  @Post(':name/jobs/:id/retry')
  retry(@Param('name') name: string, @Param('id') id: string, @Body() body: QueueActorDto) {
    return this.queues.retryJob(name, id, body.actor ?? DEFAULT_ACTOR)
  }

  @Post(':name/jobs/:id/remove')
  remove(@Param('name') name: string, @Param('id') id: string, @Body() body: QueueActorDto) {
    return this.queues.removeJob(name, id, body.actor ?? DEFAULT_ACTOR)
  }

  @Post(':name/clean')
  clean(@Param('name') name: string, @Query() query: CleanQueueQueryDto, @Body() body: QueueActorDto) {
    return this.queues.cleanState(name, query.state, body.actor ?? DEFAULT_ACTOR)
  }
}
