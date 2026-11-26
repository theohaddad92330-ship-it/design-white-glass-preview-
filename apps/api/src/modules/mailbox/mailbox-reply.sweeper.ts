import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { killSwitchCut } from '../../common/kill-switches'
import { MailboxService } from './mailbox.service'
import { MAILBOX_SINGLETON_LOCK, type MailboxUnderSingletonLock } from './module-tokens'

/**
 * #3718.6 — « aucune relance après réponse parce que le module local a disparu ».
 *
 * La réconciliation réponse → séquence existait (`MailboxService.search`,
 * #2381) mais ne partait QU'À L'OUVERTURE de la messagerie : tant que personne
 * ne l'ouvrait, une réponse restait inconnue des relances. Ce balayeur la fait
 * partir chaque heure, pour les seuls utilisateurs qui ont une séquence
 * vivante, sur les seuls contacts concernés, par adresse EXACTE.
 *
 * Il ne lit aucune boîte d'un collègue (chaque utilisateur, SA boîte), jamais
 * le corps d'un message, et n'envoie rien : le seul effet est d'arrêter ou
 * mettre en pause une séquence, avec le même journal que le chemin manuel.
 * Interrupteur d'urgence : `MAILBOX_REPLY_SWEEP_DISABLED=true`.
 */
@Injectable()
export class MailboxReplySweeper {
  private readonly logger = new Logger(MailboxReplySweeper.name)

  constructor(
    private readonly mailbox: MailboxService,
    @Inject(MAILBOX_SINGLETON_LOCK) private readonly underLock: MailboxUnderSingletonLock = (_name, run) => run(),
  ) {}

  @Cron('23 * * * *', { name: 'mailbox-reply-sweep', timeZone: 'Europe/Paris' })
  @Correlated('cron:mailbox.reply-sweep')
  async runSweep(): Promise<void> {
    await this.underLock('mailbox-reply-sweep', async () => {
      await this.sweep()
    })
  }

  /** Rend le nombre d'adresses relues. Public pour être testable. */
  async sweep(): Promise<number> {
    if (killSwitchCut('mailbox.reply-sweep')) {
      this.logger.log('Détection des réponses désactivée (MAILBOX_REPLY_SWEEP_DISABLED=true)')
      return 0
    }
    let read = 0
    for (const userId of await this.mailbox.usersWithLiveSequences()) {
      try {
        read += await this.mailbox.reconcileLiveSequenceReplies(userId)
      } catch (error) {
        // Un utilisateur en échec ne bloque pas les suivants.
        this.logger.warn(`Reply sweep failed for one user: ${(error as Error).message}`)
      }
    }
    // #4016.13e — « Envoyé » détecté = preuve : même balayage, autre population
    // (les contacts à action de prise de contact ouverte), même interrupteur.
    for (const userId of await this.mailbox.usersWithOpenContactActions()) {
      try {
        read += await this.mailbox.reconcileOpenActionSentProofs(userId)
      } catch (error) {
        this.logger.warn(`Sent-proof sweep failed for one user: ${(error as Error).message}`)
      }
    }
    return read
  }
}
