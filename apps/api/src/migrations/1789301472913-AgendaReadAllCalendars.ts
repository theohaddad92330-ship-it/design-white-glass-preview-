import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `agenda_read_all` — lire TOUS les agendas de l'utilisateur, et pas un seul.
 *
 * Le choix posé par la migration précédente (`agenda_provider` +
 * `agenda_calendar_id`) répond à « lequel ? ». Il ne répond pas à « tous ».
 * Or un commercial sous Workspace a couramment cinq agendas — le sien, celui
 * de l'équipe, un agenda de rendez-vous clients — et son prochain rendez-vous
 * peut être dans n'importe lequel. Lui demander de désigner LE bon agenda,
 * c'est lui demander de deviner où sera son prochain rendez-vous.
 *
 * Une colonne à part et non une valeur sentinelle dans `agenda_calendar_id` :
 * un identifiant d'agenda est OPAQUE et vient du fournisseur ; y glisser une
 * valeur maison (`*`, `all`) ferait un jour collision avec un vrai identifiant,
 * et le bug serait invisible.
 *
 * Défaut `false` : le comportement de tous les comptes existants est inchangé
 * tant qu'ils n'ont rien coché.
 */
export class AgendaReadAllCalendars1789301472913 implements MigrationInterface {
  public name = 'AgendaReadAllCalendars1789301472913'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agenda_read_all boolean NOT NULL DEFAULT false`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles DROP COLUMN IF EXISTS agenda_read_all`)
  }
}
