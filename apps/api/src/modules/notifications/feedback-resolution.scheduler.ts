import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { NotificationsService } from './notifications.service'

/**
 * #2444.10 — L'APPELANT DE `FeedbackService.notifyResolvedReports` — sans lui,
 * le calcul reste juste et personne ne le déclenche jamais (le défaut n°1 de
 * ce dépôt).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PORT, PAS UN IMPORT DE `FeedbackService`
 * ─────────────────────────────────────────────────────────────────────────────
 * `FeedbackService` vit dans un module voisin. GA-07 est un cliquet AU
 * PLAFOND (`module-boundaries.spec.ts`) : ce fichier ne peut pas l'importer
 * sans faire échouer la CI. Même patron que `ENGAGEMENT_AGENDA_PORT` /
 * `OPS_WEEKLY_REPORT_LOCK` — la composition (`useExisting: FeedbackService`,
 * la fabrique du verrou) se fait dans `notifications.module.ts`, qui n'est pas
 * mesuré par ce cliquet.
 *
 * `NotificationsService` reste une importation NORMALE : ce fichier vit dans
 * SON module (`modules/notifications/`), donc `./notifications.service` n'est
 * pas un franchissement de frontière.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 07:20 EUROPE/PARIS, UNE FOIS PAR JOUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Décalé des autres digests (07:00 veille, 07:30 Découvrir, 07:40 engagement)
 * pour la même raison : deux passages qui lisent/écrivent au même instant se
 * disputent les mêmes connexions pour rien.
 * `FeedbackService.notifyResolvedReports` fait sa propre déduplication
 * (`notified_fixed_at`), donc un tick manqué se rattrape de lui-même au
 * suivant.
 *
 * « Notifier selon préférences » (#2444.10) : `feedback_resolved` n'a pas de
 * bascule dédiée — même famille que `system` (jamais un envoi sortant,
 * toujours affiché) : c'est une réponse au geste de la personne (déposer un
 * signalement), jamais une invitation à revenir.
 */
type FeedbackResolutionPort = {
  notifyResolvedReports(notify: (userId: string, issueNumber: number) => Promise<void>): Promise<number>
}
export const FEEDBACK_RESOLUTION_PORT = Symbol('FEEDBACK_RESOLUTION_PORT')

/** Le verrou de tick, en PORT — même patron que `OPS_WEEKLY_REPORT_LOCK` / `ENGAGEMENT_ALERTS_LOCK`. */
export const FEEDBACK_RESOLUTION_LOCK = 'FEEDBACK_RESOLUTION_LOCK'
type UnderSingletonLock = (name: string, run: () => Promise<void>) => Promise<void>

@Injectable()
export class FeedbackResolutionScheduler {
  private readonly logger = new Logger(FeedbackResolutionScheduler.name)

  constructor(
    @Inject(FEEDBACK_RESOLUTION_PORT) private readonly feedback: FeedbackResolutionPort,
    private readonly notifications: NotificationsService,
    // Sans verrou câblé, le balayage tourne tel quel : c'est le comportement
    // mono-instance, et c'est ce qui permet de construire cette classe à la
    // main en test.
    @Optional() @Inject(FEEDBACK_RESOLUTION_LOCK) private readonly underLock?: UnderSingletonLock,
  ) {}

  @Cron('20 7 * * *', { name: 'feedback-resolved', timeZone: 'Europe/Paris' })
  async runFeedbackResolvedNotifications(): Promise<void> {
    const sweep = async (): Promise<void> => {
      try {
        const notified = await this.feedback.notifyResolvedReports(async (userId, issueNumber) => {
          await this.notifications.createNotification(userId, {
            type: 'feedback_resolved',
            title: 'Ton signalement a été corrigé',
            // #2444.10 — jamais « toutes les conséquences historiques sont
            // corrigées » (doctrine : pas de promesse de backfill non fait).
            body: `Le signalement #${issueNumber} est corrigé. Tu peux retester.`,
            link: '/settings/reports',
            origin: 'user_triggered',
          })
        })
        this.logger.log(`Signalements corrigés : ${notified} notification(s) envoyée(s)`)
      } catch (error) {
        this.logger.warn('Notifications de signalements corrigés en échec (non fatal)', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    if (this.underLock) await this.underLock('feedback-resolved', sweep)
    else await sweep()
  }
}
