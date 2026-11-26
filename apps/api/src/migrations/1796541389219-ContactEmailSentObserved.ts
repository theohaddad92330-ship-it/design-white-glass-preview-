import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4179.2 — « VU DANS LES ÉLÉMENTS ENVOYÉS » : ce que la base doit accepter
 * AVANT le code qui l'écrit (GA-11/GA-12).
 *
 * `contacts.email_sent_observed_at` — l'instant d'un message SORTANT effectivement
 * lu dans la boîte connectée du commercial, vers ce contact, APRÈS la tentative
 * d'envoi par cette boîte. `NULL` = jamais observé : l'écran ne promet alors
 * AUCUN « à retrouver dans les éléments envoyés » (Graph répond 202 sans corps,
 * `saveToSentItems` n'est pas une preuve). Aucun backfill — on ne réinvente pas
 * ce qu'on n'a pas vu.
 *
 * Additive seulement : aucune ligne existante n'est touchée.
 */
export class ContactEmailSentObserved1796541389219 implements MigrationInterface {
  public name = 'ContactEmailSentObserved1796541389219'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_sent_observed_at timestamptz`)
    await queryRunner.query(`
      COMMENT ON COLUMN contacts.email_sent_observed_at IS
        '#4179.2 - instant du message sortant lu dans la boite connectee apres une tentative d''envoi par cette boite. NULL = jamais observe.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS email_sent_observed_at`)
  }
}
