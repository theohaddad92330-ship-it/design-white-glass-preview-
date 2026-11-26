import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2378.6 / #2378.7 — l'origine d'une séquence.
 *
 * - `template_key` : le gabarit d'où la cadence est partie, gardé même quand
 *   elle a été personnalisée pour UN contact (il ne décide plus du rythme, il
 *   reste nommé). NULL = composée à la main. Les séquences existantes restent
 *   NULL : on ne devine pas après coup de quel gabarit elles venaient.
 * - `duplicated_from` : la séquence dont celle-ci est la copie pour un autre
 *   contact. ON DELETE SET NULL : effacer l'originale (RGPD, cascade contact)
 *   n'emporte pas la copie, qui appartient à quelqu'un d'autre.
 *
 * Aucune contrainte CHECK sur `template_key` : la liste des gabarits vit au
 * contrat (`OUTREACH_SEQUENCE_TEMPLATES`) et la valeur est validée par zod
 * avant toute écriture.
 */
export class OutreachSequenceOrigin1795999318402 implements MigrationInterface {
  name = 'OutreachSequenceOrigin1795999318402'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS template_key text`)
    await queryRunner.query(
      `ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS duplicated_from uuid REFERENCES outreach_sequences(id) ON DELETE SET NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outreach_sequences DROP COLUMN IF EXISTS duplicated_from`)
    await queryRunner.query(`ALTER TABLE outreach_sequences DROP COLUMN IF EXISTS template_key`)
  }
}
