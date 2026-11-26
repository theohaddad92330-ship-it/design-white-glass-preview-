import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../../correlation-id/background-correlation'
import { SingletonLockService, withSingletonLock } from '../../locks/singleton-lock.service'
import { DiscoverAlertEventSweeper } from './discover-alert-event.sweeper'
import { DiscoverAlertService } from './discover-alert.service'

/**
 * L'APPELANT DE L'ÉMETTEUR — sans lui, le canal est branché et rien ne part.
 *
 * C'est le défaut n°1 de ce dépôt : du code juste, calculé, testé, que personne
 * n'appelle. `saved_views.alert_frequency` et `alert_channel` s'écrivaient et
 * s'affichaient depuis le 15/09 sans qu'aucune ligne de production ne les lise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 07:30 EUROPE/PARIS, UNE FOIS PAR JOUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Un seul tick quotidien sert les deux cadences : l'émetteur décide lui-même de
 * ce qui est dû (`isDiscoverAlertDue`), donc un hebdomadaire ne part qu'un jour
 * sur sept. Un tick horaire n'apporterait rien — les sources publiques ne
 * bougent pas dans l'heure — et multiplierait par vingt-quatre les occasions de
 * se tromper.
 *
 * L'heure est décalée de celle des digests de veille (07:00) : deux passages
 * qui lisent et écrivent au même moment se disputent les mêmes connexions pour
 * rien.
 *
 * ⚠️ GA-76 — `ScheduleModule.forRoot()` est monté une fois pour tout le
 * processus : à N répliques, CHAQUE réplique découvre ce `@Cron` et le
 * déclenche. Le corps tourne donc sous le verrou de tick. Sans verrou câblé
 * (`@Optional()`), le comportement reste celui d'une instance unique.
 *
 * ⚠️ L'interrupteur d'opérateur n'est PAS ici : il est dans l'émetteur, avant
 * la première lecture. Le mettre à deux endroits en ferait deux réglages.
 */
@Injectable()
export class DiscoverAlertScheduler {
  private readonly logger = new Logger(DiscoverAlertScheduler.name)

  constructor(
    private readonly alerts: DiscoverAlertService,
    // #2151.14 — le balayage qui fait APPARAÎTRE les événements. Optionnel pour
    // que les specs qui construisent ce planificateur par position n'aient rien
    // à changer ; en production il est toujours câblé.
    @Optional() private readonly sweeper?: DiscoverAlertEventSweeper,
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  @Cron('30 7 * * *', { name: 'discover-alerts', timeZone: 'Europe/Paris' })
  @Correlated('cron:discoverAlerts.run')
  async runDiscoverAlerts(): Promise<void> {
    await withSingletonLock(this.locks, 'discover-alerts', async () => {
      try {
        // ─────────────────────────────────────────────────────────────────
        // #2151.14 — DÉTECTER D'ABORD, DÉLIVRER ENSUITE, DANS CE TICK.
        // ─────────────────────────────────────────────────────────────────
        // L'ordre n'est pas cosmétique : l'émetteur ne délivre plus que ce que
        // le registre porte (« une alerte surveille l'apparition d'un
        // événement »). Balayer APRÈS ferait toujours délivrer les événements
        // de la veille — un jour de retard, tous les jours.
        //
        // Un balayage en échec ne doit pas empêcher la délivrance de ce qui a
        // déjà été détecté hier : il est isolé.
        if (this.sweeper) {
          try {
            const swept = await this.sweeper.run()
            this.logger.log(
              `Événements de Découvrir : ${swept.recorded} consigné(s), ${swept.duplicates} déjà connu(s), ` +
                `${swept.workspaces} espace(s), ${swept.failed} en échec${swept.switchOff ? ' (coupé)' : ''}`,
            )
          } catch (error) {
            this.logger.warn('Balayage des événements de Découvrir en échec (non fatal)', {
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }

        const counts = await this.alerts.run()
        // Le compte est JOURNALISÉ avec ses raisons : « 0 envoyé » tout seul ne
        // distingue pas « personne n'était dû » de « la clé manque depuis trois
        // semaines ». C'est le zéro qui ment, appliqué à un passage de cron.
        this.logger.log(
          `Alertes Découvrir : ${counts.scanned} périmètre(s) lus, ${counts.inApp} dans l’application, ` +
            `${counts.outbound} envoi(s) sortant(s), non envoyés : ${JSON.stringify(counts.skipped)}`,
        )
      } catch (error) {
        // Un tick qui lève laisse le planificateur dans un état incertain :
        // on journalise et on rend la main, le passage de demain reprend.
        this.logger.warn('Passage des alertes Découvrir en échec (non fatal)', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }
}
