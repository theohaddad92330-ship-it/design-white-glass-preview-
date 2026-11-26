import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UserDailyBriefEntity } from '../../database/entities/user-daily-brief.entity'
import { zonedDateKey } from '../agenda/time-zone'
import { resolveTimeZone } from './time-zone-input'

/**
 * LE SIGNAL « PREMIÈRE OUVERTURE DU JOUR » (#1936, lot 7A).
 *
 * Décision de Louis du 12/09/2026 : la première ouverture de Laura dans la
 * journée EST le brief du matin. Ce service ne compose AUCUN contenu — il
 * répond à une seule question, de façon atomique : cet utilisateur a-t-il
 * déjà consommé son « premier du jour » aujourd'hui, dans SON fuseau ?
 *
 * ⚠️ Consommé UNIQUEMENT par l'amorce de Laura (`POST
 * /briefing/first-open-today`), jamais par l'affichage de l'écran
 * `/briefing` — sinon ouvrir le brief le matin volerait la primeur à Laura
 * avant qu'elle n'ait pu parler la première.
 *
 * Un seul appel SQL, en INSERT-ou-UPDATE SANS COURSE : `INSERT ... ON
 * CONFLICT (user_id) DO UPDATE ... WHERE last_shown_on IS DISTINCT FROM
 * $date RETURNING`. Le `WHERE` du `DO UPDATE` est ce qui rend l'opération
 * sûre pour deux appareils le même jour : le second appel entre en conflit,
 * sa clause `WHERE` est fausse (la date n'a pas changé), `RETURNING` ne rend
 * donc AUCUNE ligne — c'est le signal `false` sans second aller-retour ni
 * verrou explicite. Postgres sérialise les deux branches d'un même `INSERT
 * ... ON CONFLICT` au niveau de la ligne : il n'existe pas de fenêtre où deux
 * appels concurrents verraient tous les deux `RETURNING` non vide pour la
 * même date.
 *
 * Best-effort, comme `LastSeenService.markSeen` : une panne de lecture ou
 * d'écriture rend `false` et le journalise — le brief ne doit jamais être
 * bloqué par cette mesure annexe.
 */
@Injectable()
export class DailyBriefMarkerService {
  private readonly logger = new Logger(DailyBriefMarkerService.name)

  constructor(
    @InjectRepository(UserDailyBriefEntity)
    private readonly repo: Repository<UserDailyBriefEntity>,
  ) {}

  /**
   * Consomme le marqueur « premier du jour » pour `userId`, dans le fuseau
   * `timeZoneCandidate` (repli sur {@link DEFAULT_TIME_ZONE} via
   * {@link resolveTimeZone} s'il est absent ou invalide).
   *
   * @returns `true` UNE fois par jour civil (dans ce fuseau) et par
   *   utilisateur ; `false` sur tout appel suivant le même jour, ou sur toute
   *   panne de lecture/écriture.
   */
  async consumeFirstOpenToday(
    userId: string,
    timeZoneCandidate: string | null | undefined,
    now: Date = new Date(),
  ): Promise<boolean> {
    const timeZone = resolveTimeZone(timeZoneCandidate)
    const date = zonedDateKey(now, timeZone)

    try {
      const rows = await this.repo.manager.query(
        `
        INSERT INTO user_daily_brief (user_id, last_shown_on, updated_at)
        VALUES ($1, $2, now())
        ON CONFLICT (user_id) DO UPDATE SET
          last_shown_on = EXCLUDED.last_shown_on,
          updated_at = now()
        WHERE user_daily_brief.last_shown_on IS DISTINCT FROM EXCLUDED.last_shown_on
        RETURNING user_id
        `,
        [userId, date],
      )
      return Array.isArray(rows) && rows.length > 0
    } catch (error) {
      this.logger.warn(`Marqueur « premier du jour » illisible pour ${userId} : ${(error as Error).message}`)
      return false
    }
  }
}
