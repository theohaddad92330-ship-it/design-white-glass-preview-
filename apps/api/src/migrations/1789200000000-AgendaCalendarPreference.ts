import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `agenda_provider` / `agenda_calendar_id` — QUEL agenda Bellum lit pour cet
 * utilisateur.
 *
 * Jusqu'ici le code lisait l'agenda par défaut du compte, en dur (`primary`
 * côté Google, l'agenda par défaut côté Graph). Un commercial en a rarement
 * un seul : le sien, celui de l'équipe, un agenda partagé de rendez-vous
 * clients — et, quand deux comptes sont branchés, deux fournisseurs à la fois.
 * Lire toujours le principal affiche « journée vide » à quelqu'un dont la
 * journée est pleine, ailleurs, ce qui est pire qu'un écran absent.
 *
 * Le choix vit sur le PROFIL et non dans le navigateur : le brief du jour, les
 * routines et les propositions de créneaux se calculent côté serveur. Un choix
 * gardé côté client ferait diverger ce que l'écran montre et ce sur quoi les
 * relances sont calculées — deux vérités pour la même journée.
 *
 * NULL = aucun choix : on lit l'agenda par défaut, exactement comme avant.
 */
export class AgendaCalendarPreference1789200000000 implements MigrationInterface {
  public name = 'AgendaCalendarPreference1789200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agenda_provider text`)
    await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agenda_calendar_id text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles DROP COLUMN IF EXISTS agenda_calendar_id`)
    await queryRunner.query(`ALTER TABLE profiles DROP COLUMN IF EXISTS agenda_provider`)
  }
}
