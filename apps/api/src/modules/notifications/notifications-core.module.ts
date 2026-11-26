import { Logger, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { NotificationEntity } from '../../database/entities/notification.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { NotificationSmsChannelEntity } from '../../database/entities/notification-sms-channel.entity'
import { DiscoverAlertEventEntity } from '../../database/entities/discover-alert-event.entity'
import { DiscoverAlertEventService } from './discover-alerts/discover-alert-event.service'
import { IntegrationsModule } from '../integrations/integrations.module'
import { AccountFactsModule } from '../account-facts/account-facts.module'
import { NotificationsService } from './notifications.service'
import { SmsChannelService } from './sms/sms-channel.service'
import { createSmsSender, SMS_SENDER, type SmsSender } from './sms/sms-sender'

/**
 * Lightweight core: just `NotificationsService` and the three repos it needs
 * (no mailer, no scheduler, no controller). Trigger sites like the analysis
 * worker import THIS module so they can drop notifications without pulling the
 * mailer/queue graph into their own DI (and tests).
 *
 * #1938.4 — décision Louis 13/09 batch 13 : le canal SMS des alertes urgentes
 * vit ICI, à côté du passage obligé qu'il relaie (`createNotification`), pour
 * que chaque module qui importe ce cœur relaie aussi — un relais fourni dans le
 * seul module « navigateur » laisserait le worker d'analyse et les crédits
 * créer des alertes qui ne partent jamais par SMS. Le port d'envoi est
 * construit une fois, au démarrage : aucun fournisseur n'est choisi, il ne sait
 * donc rien envoyer.
 */
@Module({
  imports: [
    // #4072.4 — le lecteur unique des faits du compte (récurrence d'un besoin passé).
    AccountFactsModule,
    TypeOrmModule.forFeature([
      NotificationEntity,
      NotificationPreferenceEntity,
      AccountEntity,
      NotificationSmsChannelEntity,
      // #2151.14 / #2151.25 — le registre des événements de Découvrir vit ICI,
      // pour la MÊME raison que le port SMS juste au-dessus : ses producteurs
      // sont des sites de déclenchement (le rafraîchissement des comptes
      // suivis, le balayage), et un registre fourni dans le seul module
      // « navigateur » laisserait ces producteurs sans porte où passer.
      DiscoverAlertEventEntity,
    ]),
    IntegrationsModule,
  ],
  providers: [
    NotificationsService,
    SmsChannelService,
    DiscoverAlertEventService,
    {
      provide: SMS_SENDER,
      useFactory: (): SmsSender => {
        const logger = new Logger('SmsSender')
        return createSmsSender(process.env, message => logger.warn(message))
      },
    },
  ],
  // `SMS_SENDER` est EXPORTÉ pour que les alertes de Découvrir (canal `sms`)
  // réutilisent le MÊME port, construit une fois : une seconde fabrique ferait
  // une seconde façon de dire « le SMS est branché », et les deux divergeraient.
  exports: [NotificationsService, SmsChannelService, SMS_SENDER, DiscoverAlertEventService],
})
export class NotificationsCoreModule {}
