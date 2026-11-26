import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le log d'ENVOI (PDF 6 §5.2, règle f).
 *
 * La table `activities` existait, et son `external_id` était rempli par la
 * synchronisation de LECTURE : on y retrouvait les messages qu'on avait relus
 * dans la boîte, jamais ceux qu'on avait envoyés. Aucun chemin d'envoi
 * n'écrivait d'activité — le `draftId` rendu par l'API n'était persisté nulle
 * part.
 *
 * Conséquence concrète : impossible de répondre à « ai-je déjà relancé ce
 * client, et par quel canal ». La règle (f) veut « canal, type, verdict,
 * identifiant externe après envoi » ; il manquait le canal et le verdict.
 *
 * `verdict` est le mot du document, et il porte plus que « ça a marché » : un
 * envoi peut être PARTIEL (trois destinataires sur cinq), et le compter comme
 * réussi ou échoué serait faux dans les deux sens.
 */
export class ActivityDeliveryLog1789784612907 implements MigrationInterface {
  public name = 'ActivityDeliveryLog1789784612907'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE activities
        ADD COLUMN IF NOT EXISTS channel text,
        ADD COLUMN IF NOT EXISTS verdict text
    `)
    await queryRunner.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_verdict_check`)
    await queryRunner.query(`
      ALTER TABLE activities ADD CONSTRAINT activities_verdict_check
        CHECK (verdict IS NULL OR verdict IN ('sent', 'drafted', 'failed', 'partial', 'unknown'))
    `)
    await queryRunner.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_channel_check`)
    await queryRunner.query(`
      ALTER TABLE activities ADD CONSTRAINT activities_channel_check
        CHECK (channel IS NULL OR channel IN ('mail_draft', 'chat_message', 'crm_task', 'in_app'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_channel_check`)
    await queryRunner.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_verdict_check`)
    await queryRunner.query(`
      ALTER TABLE activities
        DROP COLUMN IF EXISTS channel,
        DROP COLUMN IF EXISTS verdict
    `)
  }
}
