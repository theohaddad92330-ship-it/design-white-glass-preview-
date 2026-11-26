import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { ChangelogNewsletterService } from './changelog-newsletter.service'
import { Correlated } from '../../correlation-id/background-correlation'
import { killSwitchCut } from '../../common/kill-switches'

/** Break-glass kill switch (same posture as the other crons: ON by default,
 *  opt-OUT only). Set `CHANGELOG_NEWSLETTER_DISABLED=true` to freeze sends. */
export function changelogNewsletterDisabled(): boolean {
  return killSwitchCut('changelog.newsletter')
}

/**
 * « Bimensuel » au sens de l'écran : DEUX FOIS PAR MOIS. Le 1er et le 15, à
 * 09:00 Europe/Paris — après le café, jamais la nuit, et à date fixe pour que
 * le rythme soit lisible par le lecteur.
 *
 * Même forme que les autres crons du repo : `@nestjs/schedule` est déjà
 * bootstrappé app-wide, le tick part sur CHAQUE replica, donc le corps tourne
 * sous le lock singleton (exactement un replica envoie). Le lock FAIL OPEN ; la
 * deuxième couche d'idempotence est le repère `newsletter_last_entry_id` posé
 * par lecteur avant l'envoi — un double tick ne peut pas ré-envoyer.
 */
@Injectable()
export class ChangelogNewsletterScheduler {
  private readonly logger = new Logger(ChangelogNewsletterScheduler.name)

  constructor(
    private readonly newsletter: ChangelogNewsletterService,
    // Cron-tick lock — `@Optional()` so direct-`new` specs need no stub;
    // without it the cron runs unlocked (single-instance behaviour).
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  @Cron('0 9 1,15 * *', { name: 'changelog-newsletter', timeZone: 'Europe/Paris' })
  @Correlated('cron:changelog-newsletter.runChangelogNewsletter')
  async runChangelogNewsletter(): Promise<void> {
    if (changelogNewsletterDisabled()) {
      this.logger.log('Changelog newsletter disabled (CHANGELOG_NEWSLETTER_DISABLED=true) — skipping')
      return
    }
    await withSingletonLock(this.locks, 'changelog-newsletter', async () => {
      await this.newsletter.run()
    })
  }
}
