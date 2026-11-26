import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2082.16 / #2091.24 — « aucune case précochée », appliqué au QUATRIÈME
 * endroit où ce défaut vivait.
 *
 * `defaultNotificationPreferences` (contrat) était le premier ; deux gardes
 * d'envoi qui redérivaient « absence de ligne = ON » étaient les deuxième et
 * troisième. Le quatrième est ici : les colonnes `weekly_digest` et
 * `newsletter_changelog` portaient `DEFAULT true` en base. Ce n'était pas
 * théorique — `ChangelogNewsletterService.markSeeded` insère une ligne avec
 * le SEUL repère de newsletter (`newsletter_last_entry_id`), donc Postgres
 * ÉCRIVAIT `true` dans ces deux colonnes pour un lecteur qui n'avait jamais
 * rien coché. Une case précochée persistée est pire qu'un défaut en mémoire :
 * elle ressemble ensuite à un choix.
 *
 * ⚠️ Cette migration ne touche AUCUNE ligne existante — `ALTER COLUMN … SET
 * DEFAULT` ne réécrit pas les lignes déjà là, et c'est voulu : une préférence
 * déjà en base est peut-être un choix réel de son propriétaire, et l'effacer
 * serait un second défaut. Les comptes existants gardent donc leur valeur ;
 * ce qui change, ce sont les insertions à partir de maintenant. Un éventuel
 * balayage des lignes écrites par le défaut de base est une décision
 * séparée — elle se simule et se compte avant d'écrire, elle ne se glisse pas
 * dans une migration.
 *
 * Additif, idempotent, aucune contrainte rétrécie (GA-11 / GA-12 : rien
 * n'interdit une valeur qui était permise hier).
 */
export class NotificationOutboundDefaultsOff1792800260000 implements MigrationInterface {
  public name = 'NotificationOutboundDefaultsOff1792800260000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE notification_preferences ALTER COLUMN weekly_digest SET DEFAULT false`)
    await queryRunner.query(`ALTER TABLE notification_preferences ALTER COLUMN newsletter_changelog SET DEFAULT false`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
