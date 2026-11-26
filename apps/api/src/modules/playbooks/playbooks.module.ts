import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InterventionEntity } from '../../database/entities/intervention.entity'
import { PlaybookSendEntity } from '../../database/entities/playbook-send.entity'
import { PlaybookSubscriptionEntity } from '../../database/entities/playbook-subscription.entity'
import { DecisionGatesModule } from '../decision-gates/decision-gates.module'
import { LocksModule } from '../locks/locks.module'
import { MailboxModule } from '../mailbox/mailbox.module'
import { MailerModule } from '../mailer/mailer.module'
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { TriggerRegistryModule } from '../trigger-registry/trigger-registry.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { InterventionsSweeper } from './interventions.sweeper'
import { PlaybookSendSweeper } from './playbook-send.sweeper'
import { PlaybookTargetsService } from './playbook-targets.service'
import { PlaybooksController } from './playbooks.controller'
import { PlaybooksService } from './playbooks.service'

/**
 * Playbooks de niveau 5 et file d'intervention (T11).
 *
 * Module autonome (règle #7) : le retirer éteint les automatisations et la file
 * du responsable, sans toucher au reste.
 *
 * Il importe `MailboxModule` — et c'est le contraire d'une entorse à la règle
 * « un seul chemin d'envoi » : c'est ce qui la fait respecter. Le module a
 * longtemps n'en importé aucun, ce qui semblait prudent et ne l'était pas :
 * personne n'appelait `evaluate()` ni la réservation, si bien qu'armer un
 * playbook persistait une préférence sans jamais rien déclencher. Passer par
 * `MailboxService.sendBatch` réutilise l'opt-out destinataire par destinataire,
 * la déduplication, l'arrêt après trois échecs consécutifs et la signature du
 * compte connecté, au lieu de les redémontrer ici — et d'en oublier une part.
 *
 * ⚠️ Depuis le 26/08/2026, `MailboxService` n'est plus injecté dans le BALAYEUR
 * mais dans le CONTRÔLEUR : l'envoi part d'un clic de validation, plus d'un
 * cron. Le balayeur n'a donc plus aucun accès à la messagerie — il ne PEUT plus
 * envoyer, ce qui vaut mieux qu'une consigne de ne pas le faire.
 */
@Module({
  imports: [
    WorkspaceModule,
    // Porte G5 : armer un playbook est la décision la plus engageante du
    // produit — à partir de ce clic, des messages partent seuls.
    DecisionGatesModule,
    LocksModule,
    MailboxModule,
    MailerModule,
    // La notification qui demande la validation : sans elle, une relance
    // préparée périmerait en trois jours sans que personne ne l'ait vue.
    // ⚠️ `NotificationsCoreModule` et non `NotificationsModule` : c'est le
    // premier qui EXPORTE `NotificationsService`. Le second n'exporte rien, et
    // l'erreur ne se verrait qu'au démarrage — donc au healthcheck de
    // déploiement, jamais dans un test unitaire (GA-42).
    NotificationsCoreModule,
    // #2875/#2402.1 — le registre canonique des déclencheurs commerciaux :
    // `InterventionsSweeper` y persiste désormais les treize natures, en plus
    // de la file d'intervention (ci-dessous), jamais à sa place.
    TriggerRegistryModule,
    TypeOrmModule.forFeature([PlaybookSubscriptionEntity, PlaybookSendEntity, InterventionEntity]),
  ],
  controllers: [PlaybooksController],
  // Les DEUX balayeurs sont ce qui rend le module vivant : l'un remplit la file
  // du responsable, l'autre exécute les playbooks armés. Sans eux, les écrans
  // existent et ne font rien — ce qui se lit « tout va bien ».
  providers: [PlaybooksService, PlaybookTargetsService, InterventionsSweeper, PlaybookSendSweeper],
  exports: [PlaybooksService],
})
export class PlaybooksModule {}
