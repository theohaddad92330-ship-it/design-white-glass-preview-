import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2369.12 (reste, épopée #2768) — RELIER le style appliqué au message
 * préparé, pour pouvoir un jour mesurer par style (jamais par personne,
 * GA-240/241) : taux de modification / validation / réponse / désinscription.
 *
 * Snapshot, jamais une relecture : `message_style_template_version` fige la
 * version du style AU MOMENT de la préparation — un template modifié depuis
 * ne change pas ce qui a déjà été mesuré (comme `outreach_messages.channel`,
 * qui ne relit jamais le contact).
 *
 * Les deux colonnes sont NULLABLES ensemble : tout message préparé AVANT ce
 * lot n'a simplement aucun style relié — « non mesuré », jamais deviné
 * (GA-18/19). Aucun `NOT NULL`/`DEFAULT` n'invente une valeur pour l'existant.
 *
 * FK vers `message_style_templates(id)` : un style s'archive, il ne se
 * supprime jamais (« on archive, on ne supprime pas ») — `ON DELETE SET NULL`
 * documente l'intention sans jamais s'exécuter en pratique.
 */
export class OutreachMessageStyleTemplate1796322780100 implements MigrationInterface {
  public name = 'OutreachMessageStyleTemplate1796322780100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outreach_messages
      ADD COLUMN IF NOT EXISTS message_style_template_id uuid REFERENCES message_style_templates(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS message_style_template_version integer
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS outreach_messages_style_template_idx
      ON outreach_messages (message_style_template_id, message_style_template_version)
      WHERE message_style_template_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS outreach_messages_style_template_idx`)
    await queryRunner.query(`
      ALTER TABLE outreach_messages
      DROP COLUMN IF EXISTS message_style_template_version,
      DROP COLUMN IF EXISTS message_style_template_id
    `)
  }
}
