import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { type Job } from 'bullmq'
import { MailerService } from './mailer.service'
import { EMAIL_EVENT_TYPES, type Email } from './mailer.queue'
import { Correlated } from '../../correlation-id/background-correlation'

@Processor('mailer')
@Injectable()
export class MailerWorker extends WorkerHost {
  private readonly logger = new Logger(MailerWorker.name)

  constructor(private readonly mailerService: MailerService) {
    super()
  }

  @Correlated('worker:mailer')
  async process(job: Job<Email>): Promise<void> {
    // Narrow on `data.type` (the BellumEvent discriminant) instead of
    // `job.name`: TS can then resolve each branch to the matching payload
    // shape, so no `as` casts are needed.
    const data = job.data
    switch (data.type) {
      case EMAIL_EVENT_TYPES.SEND_WELCOME: {
        const { type: _type, emailType: _emailType, ...payload } = data
        await this.mailerService.sendWelcomeEmail(payload)
        return
      }
      case EMAIL_EVENT_TYPES.SEND_RESET_PASSWORD: {
        const { type: _type, emailType: _emailType, ...payload } = data
        await this.mailerService.sendResetPasswordEmail(payload)
        return
      }
      case EMAIL_EVENT_TYPES.SEND_OTP: {
        const { type: _type, emailType: _emailType, ...payload } = data
        await this.mailerService.sendOtpEmail(payload)
        return
      }
      default: {
        // Compile-time guard: adding a new variant to `Email` without a
        // case here turns this into a TS error instead of a silent skip.
        const _exhaustive: never = data
        this.logger.warn(`Unknown mailer job: ${job.name}`, { unhandled: _exhaustive })
      }
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, err: Error): void {
    this.logger.error('Mailer job failed', {
      jobId: job?.id,
      name: job?.name,
      attemptsMade: job?.attemptsMade,
      message: err.message,
      stack: err.stack,
    })
  }
}
