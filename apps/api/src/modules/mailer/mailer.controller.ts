import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { MailerService } from './mailer.service'

type SendTestEmailBody = {
  to?: string
  subject?: string
}

/**
 * Mailer smoke-test endpoint. Guarded by the shared internal secret
 * (`x-internal-secret`) so it can't be called from the public internet —
 * an unguarded `/emails/test` lets anyone send mail from our verified domain
 * (spam / deliverability-reputation / Resend-cost abuse vector).
 */
@Controller('emails')
@UseGuards(InternalSecretGuard)
export class MailerController {
  constructor(private readonly mailerService: MailerService) {}

  @Post('test')
  async sendTestEmail(@Body() body: SendTestEmailBody) {
    if (!body.to || !body.to.includes('@')) {
      throw new BadRequestException('Field "to" must be a valid email.')
    }

    const sent = await this.mailerService.sendTestMail({ to: body.to, subject: body.subject })
    return { status: 'queued', ...sent }
  }
}
