import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { LocksModule } from '../locks/locks.module'
import { MailerModule } from '../mailer/mailer.module'
import { ChangelogNewsletterAdminController } from './changelog-newsletter.admin.controller'
import { ChangelogNewsletterScheduler } from './changelog-newsletter.scheduler'
import { ChangelogNewsletterService } from './changelog-newsletter.service'

/**
 * Newsletter Changelog — l'envoi bimensuel du delta de nouveautés.
 *
 * Module autonome (règle #7) : il ne détient aucune table à lui. Le retirer de
 * `AppModule` arrête l'envoi et ne casse rien d'autre — les préférences, la
 * sidebar « Nouveautés » et le reste du produit continuent exactement pareil.
 * Il emprunte le mailer (+ suppression list) et le lock de cron, comme les
 * autres envois périodiques.
 *
 * ⚠️ Il expose depuis le 06/09/2026 UNE route de lecture,
 * `GET internal/admin/changelog`, qui sert l'écran « Changelog » du back-office
 * (demande de Louis). Elle est ICI et non dans `AdminModule` pour ne pas
 * inverser la dépendance : retirer la newsletter doit retirer l'envoi ET
 * l'écran qui le suit, jamais casser le back-office. La phrase « il n'expose
 * aucune route » de la version précédente n'est donc plus vraie, et c'est dit
 * plutôt que laissé à découvrir.
 */
@Module({
  imports: [
    MailerModule,
    LocksModule,
    TypeOrmModule.forFeature([ProfileEntity, NotificationPreferenceEntity, WorkspaceMemberEntity]),
  ],
  controllers: [ChangelogNewsletterAdminController],
  providers: [ChangelogNewsletterService, ChangelogNewsletterScheduler],
})
export class ChangelogNewsletterModule {}
