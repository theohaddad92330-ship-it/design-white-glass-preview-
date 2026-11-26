import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmailSuppressionEntity } from '../../database/entities/email-suppression.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { MailerController } from './mailer.controller'
import { MailerQueue } from './mailer.queue'
import { MailerService } from './mailer.service'
import { MailerWorker } from './mailer.worker'
import { SuppressionService } from './suppression.service'
import { UnsubscribeController } from './unsubscribe.controller'

@Module({
  imports: [
    // `WorkspaceMemberEntity` en lecture seule : `isSuppressedForUser` a besoin
    // des espaces d'un membre pour qu'un opt-out posé dans l'un fasse taire les
    // envois périodiques partout. C'est une entité partagée, pas un service
    // importé — la frontière de module tient.
    TypeOrmModule.forFeature([EmailSuppressionEntity, WorkspaceMemberEntity]),
    BullModule.registerQueue({
      name: 'mailer',
      defaultJobOptions: {
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 604_800 },
      },
    }),
  ],
  controllers: [MailerController, UnsubscribeController],
  providers: [MailerService, MailerQueue, MailerWorker, InternalSecretGuard, SuppressionService],
  exports: [MailerService, MailerQueue, SuppressionService],
})
export class MailerModule {}
