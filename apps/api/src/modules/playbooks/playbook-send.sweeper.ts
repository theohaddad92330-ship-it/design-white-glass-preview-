import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { MAX_BATCH_RECIPIENTS, type PlaybookBlockReason, type PlaybookKey } from '@bellum/contracts'
import { PlaybookSubscriptionEntity } from '../../database/entities/playbook-subscription.entity'
import { Correlated } from '../../correlation-id/background-correlation'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { NotificationsService } from '../notifications/notifications.service'
import { SuppressionService } from '../mailer/suppression.service'
import { PlaybookTargetsService, type PlaybookTarget } from './playbook-targets.service'
import { PlaybooksService } from './playbooks.service'
import { killSwitchCut } from '../../common/kill-switches'

/**
 * Ce qui PRÉPARE les playbooks de niveau 5 — et ne fait plus partir un seul
 * e-mail tout seul.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ARBITRAGE DU 26/08/2026, ET CE QU'IL CHANGE ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce balayeur envoyait. Les six garde-fous tenaient — et ils ne répondent pas à
 * la même question : ils disent « cette cible est relançable », jamais « ce
 * texte peut partir chez ce client aujourd'hui ». Louis a tranché : le niveau
 * reste N5, mais une notification demande la validation avant l'envoi.
 *
 * Le balayeur COMPOSE donc le message, RÉSERVE la cible et DEMANDE. L'envoi
 * lui-même part du clic, dans le contrôleur — ce qui a une conséquence utile :
 * ce fichier n'a plus aucun accès à la messagerie. Il ne PEUT plus envoyer.
 *
 * La notification part une fois par vague et par propriétaire : renotifier à
 * chaque passage de cron produirait vingt messages par jour, et la première
 * chose que ferait l'utilisateur serait de désarmer le playbook.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI PRÉCÈDE (et reste vrai)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce qui EXÉCUTE les playbooks de niveau 5 — la moitié qui manquait.
 *
 * Le chantier avait livré l'écran, les six garde-fous testés, la table
 * d'idempotence et l'interrupteur d'armement. Il manquait l'appelant :
 * `evaluate()` et `reserveSend()` n'étaient invoqués de nulle part. Armer un
 * playbook persistait donc une préférence et ne déclenchait rien, jamais — la
 * « fausse automatisation » que le rapport range lui-même parmi ses
 * anti-patterns (§34) et que la mémoire du dépôt a déjà rencontrée sur la file
 * d'intervention.
 *
 * Rien n'a été réimplémenté ici. Le balayeur ORCHESTRE des pièces existantes :
 *
 *  - les cibles viennent de `PlaybookTargetsService`, la même source que la
 *    simulation — sinon l'écran montrerait autre chose que ce qui part ;
 *  - la décision vient de `PlaybooksService.evaluate`, qui délègue aux six
 *    garde-fous purs ;
 *  - **l'envoi passe par `MailboxService.sendBatch`**, et jamais par un second
 *    chemin. C'est lui qui porte déjà l'opt-out destinataire par destinataire,
 *    la déduplication, l'arrêt après trois échecs consécutifs, la signature du
 *    compte connecté et le contrôle de capacité. Un émetteur maison aurait dû
 *    redémontrer tout cela, et aurait fini par en oublier une partie.
 *
 * Ordre des opérations, et il compte : on RÉSERVE avant d'envoyer. Rater une
 * relance se répare ; en envoyer deux ne se rattrape pas. Un envoi réservé mais
 * non parti est journalisé — c'est le sens qu'on donne au silence.
 *
 * Interrupteur d'urgence : `PLAYBOOKS_SEND_DISABLED=true`. Il coupe l'exécution
 * sans toucher aux abonnements, donc sans rien perdre de ce que les espaces ont
 * réglé.
 */
@Injectable()
export class PlaybookSendSweeper {
  private readonly logger = new Logger(PlaybookSendSweeper.name)

  constructor(
    @InjectRepository(PlaybookSubscriptionEntity)
    private readonly subscriptions: Repository<PlaybookSubscriptionEntity>,
    private readonly playbooks: PlaybooksService,
    private readonly targets: PlaybookTargetsService,
    private readonly notifications: NotificationsService,
    private readonly suppression: SuppressionService,
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  /**
   * Toutes les 30 minutes, en semaine et en journée.
   *
   * Le cron est LARGE et les heures calmes restent tranchées par le garde-fou :
   * une fenêtre trop étroite ici ferait perdre des occurrences sans trace, et le
   * dépôt a déjà payé cette leçon sur les routines. La granularité de 30 min
   * évite par ailleurs qu'un espace voie partir ses vingt-cinq relances dans la
   * même seconde.
   */
  @Cron('*/30 8-18 * * 1-5', { name: 'playbook-send-sweep', timeZone: 'Europe/Paris' })
  @Correlated('cron:playbooks.send')
  async runSweep(): Promise<void> {
    await withSingletonLock(this.locks, 'playbook-send-sweep', async () => {
      await this.sweep()
    })
  }

  /**
   * Balaye les espaces ARMÉS et envoie ce qui doit l'être.
   *
   * Rend le nombre d'envois réellement partis. Public pour être testable et
   * pour servir un « exécuter maintenant » depuis le back-office.
   */
  async sweep(now: Date = new Date()): Promise<number> {
    if (killSwitchCut('playbooks.send')) {
      this.logger.log('Envoi des playbooks désactivé (PLAYBOOKS_SEND_DISABLED=true)')
      return 0
    }

    // On ne part QUE des abonnements armés. Balayer tous les espaces pour
    // découvrir ensuite qu'aucun n'a armé coûterait trois requêtes lourdes par
    // passage, toutes les trente minutes, pour rien.
    // Périmer AVANT de collecter : une demande de plus de trois jours ne part
    // pas, et la laisser en attente ferait croire qu'un clic suffirait encore.
    await this.playbooks.expireStale(now)

    const armed = await this.subscriptions.find({ where: { enabled: true } })
    if (!armed.length) return 0

    let sent = 0
    for (const subscription of armed) {
      try {
        sent += await this.sweepOne(subscription.workspace_id, subscription.playbook as PlaybookKey, now)
      } catch (error) {
        // Un espace isolé : un jeton de messagerie expiré chez un client ne doit
        // pas priver tous les autres de leurs relances.
        this.logger.error(`Playbook « ${subscription.playbook} » en échec pour un espace`, {
          error,
          workspaceId: subscription.workspace_id,
        })
      }
    }
    this.logger.log(`Balayage des playbooks terminé — ${sent} relance(s) en attente de validation`)
    return sent
  }

  /** Un espace, un playbook. */
  private async sweepOne(workspaceId: string, playbook: PlaybookKey, now: Date): Promise<number> {
    const targets = await this.targets.collect(playbook, workspaceId, MAX_BATCH_RECIPIENTS)
    if (!targets.length) return 0

    const refused: Partial<Record<PlaybookBlockReason, number>> = {}
    /** Les envois retenus, groupés par propriétaire : c'est SA messagerie. */
    const byOwner = new Map<string, PlaybookTarget[]>()
    /** Ce qui attendait déjà chaque propriétaire avant cette vague. */
    const alreadyWaiting = new Map<string, number>()

    for (const target of targets) {
      const optedOut = target.recipient ? await this.suppression.isSuppressed(workspaceId, target.recipient) : false
      const verdict = await this.playbooks.evaluate(
        workspaceId,
        playbook,
        {
          id: target.targetId,
          hasReply: target.hasReply,
          optedOut,
          silenceDays: target.silenceDays,
          recipient: target.recipient,
        },
        now,
      )
      if (!verdict.allowed) {
        if (verdict.reason) refused[verdict.reason] = (refused[verdict.reason] ?? 0) + 1
        continue
      }
      // Une cible sans propriétaire n'a pas de messagerie d'où partir. On ne
      // choisit PAS un expéditeur de remplacement : un client qui reçoit une
      // relance d'un collègue qu'il ne connaît pas est un incident, pas une
      // relance.
      if (!target.ownerId || !target.recipient) {
        refused.no_recipient = (refused.no_recipient ?? 0) + 1
        continue
      }

      // Combien de relances attendaient DÉJÀ ce propriétaire, AVANT cette vague.
      // C'est ce nombre qui décide s'il faut le prévenir : une file déjà
      // ouverte n'a pas besoin d'une notification de plus.
      if (!alreadyWaiting.has(target.ownerId)) {
        alreadyWaiting.set(target.ownerId, await this.playbooks.countPendingFor(target.ownerId, playbook))
      }

      // RÉSERVER AVANT DE DEMANDER. Deux balayages concurrents passeraient tous
      // deux le contrôle ci-dessus ; l'index unique tranche.
      if (
        !(await this.playbooks.requestApproval(
          workspaceId,
          playbook,
          {
            targetId: target.targetId,
            recipient: target.recipient,
            ownerId: target.ownerId,
            subject: target.subject,
            body: target.body,
          },
          now,
        ))
      ) {
        refused.already_sent = (refused.already_sent ?? 0) + 1
        continue
      }

      const list = byOwner.get(target.ownerId) ?? []
      list.push(target)
      byOwner.set(target.ownerId, list)
    }

    let sent = 0
    for (const [ownerId, items] of byOwner) {
      sent += items.length
      if ((alreadyWaiting.get(ownerId) ?? 0) === 0) await this.notify(ownerId, playbook, items.length)
    }

    if (Object.keys(refused).length) {
      // Un playbook qui n'envoie rien DIT pourquoi. Sans ce journal, « rien
      // n'est parti » est indistinguable d'une panne, et personne ne peut
      // décider s'il faut réparer ou s'en réjouir.
      this.logger.log(`Playbook « ${playbook} » — écartés : ${JSON.stringify(refused)}`, { workspaceId })
    }
    return sent
  }

  /**
   * Prévenir le propriétaire qu'il a des relances à valider.
   *
   * `origin: 'user_triggered'` et non `'proactive'`, et c'est un choix : le
   * plafond de proactivité protège d'une SUGGESTION de trop. Ici, une
   * notification avalée signifie qu'un envoi préparé ne partira jamais — il
   * périme en trois jours sans que personne ne l'ait vu. Et le geste est bien
   * celui de l'utilisateur : c'est lui qui a armé le playbook.
   *
   * Une notification qui échoue ne fait pas tomber le balayage : les demandes
   * sont déjà en base et visibles dans le centre d'actions.
   */
  private async notify(ownerId: string, playbook: PlaybookKey, count: number): Promise<void> {
    try {
      await this.notifications.createNotification(ownerId, {
        type: 'system',
        title: count === 1 ? '1 relance automatique attend ta validation' : `${count} relances automatiques à valider`,
        body: 'Rien ne partira sans ton accord. Les demandes non tranchées expirent au bout de trois jours.',
        link: '/actions',
        origin: 'user_triggered',
      })
    } catch (error) {
      this.logger.error(`Notification de validation impossible pour un propriétaire`, { error, ownerId, playbook })
    }
  }
}
