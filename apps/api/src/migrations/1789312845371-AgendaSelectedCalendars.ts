import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `agenda_calendar_ids` — les agendas lus, au PLURIEL.
 *
 * Les deux migrations précédentes savaient répondre à « lequel ? »
 * (`agenda_provider` + `agenda_calendar_id`) puis à « tous ? »
 * (`agenda_read_all`). Aucune ne sait répondre à « ceux-là » — or c'est la
 * réponse juste pour la plupart des gens : mon agenda ET celui de l'équipe,
 * mais pas les jours fériés, pas les numéros de semaine, pas l'agenda de
 * quelqu'un d'autre partagé il y a trois ans.
 *
 * Une colonne `jsonb` et non une table de liaison : c'est une PRÉFÉRENCE
 * d'affichage, jamais jointe ni agrégée, toujours lue en entier avec le
 * profil. Une table pour ça ajouterait une jointure à chaque brief du matin
 * sans rien rendre en échange.
 *
 * Le choix déjà posé est REPRIS (`agenda_provider` + `agenda_calendar_id` →
 * une liste d'un élément) : quelqu'un qui avait désigné son agenda partagé ne
 * doit pas retrouver l'agenda par défaut au prochain déploiement, sans rien
 * pour le lui dire.
 */
export class AgendaSelectedCalendars1789312845371 implements MigrationInterface {
  public name = 'AgendaSelectedCalendars1789312845371'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agenda_calendar_ids jsonb`)
    await queryRunner.query(
      `UPDATE profiles
          SET agenda_calendar_ids = jsonb_build_array(
                jsonb_build_object('provider', agenda_provider, 'calendarId', agenda_calendar_id))
        WHERE agenda_calendar_ids IS NULL
          AND agenda_provider IS NOT NULL
          AND agenda_calendar_id IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Le premier agenda de la liste retourne dans les colonnes historiques : un
    // retour arrière doit rendre une journée AMPUTÉE (un agenda sur trois), pas
    // une journée vide.
    await queryRunner.query(
      `UPDATE profiles
          SET agenda_provider = agenda_calendar_ids -> 0 ->> 'provider',
              agenda_calendar_id = agenda_calendar_ids -> 0 ->> 'calendarId'
        WHERE jsonb_typeof(agenda_calendar_ids) = 'array'
          AND jsonb_array_length(agenda_calendar_ids) > 0`,
    )
    await queryRunner.query(`ALTER TABLE profiles DROP COLUMN IF EXISTS agenda_calendar_ids`)
  }
}
