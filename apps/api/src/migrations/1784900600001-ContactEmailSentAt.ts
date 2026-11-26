import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Per-contact outbound-email send-state (Palier 1 « Envoie l'email » —
 * agent_docs/vision-copilote-actions.md). Records when a rep sent the drafted
 * `email_message` to the contact from inside Bellum, so the UI can show
 * "envoyé", the send is idempotent (no accidental double-send), and the
 * `user_actions` log stops being purely declarative.
 *
 * SAFE : ajout d'une colonne nullable sur `contacts`, aucune donnée existante
 * touchée, aucune contrainte dure.
 *
 * NOTE timestamp : porté de 1784900600000 → 1784900600001 pour lever le doublon
 * d'horodatage avec `AnalysisRuns1784900600000` (deux migrations partageaient le
 * même préfixe, donc un ordre d'exécution non déterministe entre elles). L'ordre
 * global est inchangé (cette migration s'exécutait déjà après AnalysisRuns par
 * tri alphabétique) et un `up()` idempotent (`ADD COLUMN IF NOT EXISTS`) rend un
 * éventuel re-run (nom de classe changé) sans effet.
 */
export class ContactEmailSentAt1784900600001 implements MigrationInterface {
  public name = 'ContactEmailSentAt1784900600001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_sent_at timestamptz`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS email_sent_at`)
  }
}
