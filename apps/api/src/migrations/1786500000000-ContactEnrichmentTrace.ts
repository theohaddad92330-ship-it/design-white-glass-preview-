import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Trace de la dernière tentative d'enrichissement sur `contacts` — le socle de
 * l'idempotence (règle complète : `@bellum/contracts` → `contact-enrichment.ts`).
 *
 * Avant : aucune colonne ne disait qu'un contact avait DÉJÀ été passé au
 * provider. Les seuls marqueurs (`apollo_enrichment`, `lifecycle_state`,
 * `source`) sont indirects et muets sur une tentative revenue vide, si bien
 * qu'un contact qu'Apollo ne peut plus compléter était reproposé — et redébité —
 * à l'infini.
 *
 * - `last_enrichment_at`       : date de la dernière tentative (match ou non)
 * - `last_enrichment_provider` : qui a répondu (apollo / dropcontact)
 * - `last_enrichment_result`   : 'matched' | 'no_new_data'
 * - `last_enrichment_missing`  : canaux encore vides à l'issue de la tentative
 *
 * Additif + idempotent (`ADD COLUMN IF NOT EXISTS`), colonnes nullables, aucune
 * donnée existante touchée, RLS inchangée. Migration possédée par NestJS.
 * Les lignes antérieures restent à NULL = « jamais tenté » → aucun contact
 * existant n'est bloqué par la nouvelle garde.
 */
export class ContactEnrichmentTrace1786500000000 implements MigrationInterface {
  public name = 'ContactEnrichmentTrace1786500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_enrichment_at timestamptz`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_enrichment_provider text`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_enrichment_result text`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_enrichment_missing jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS last_enrichment_missing`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS last_enrichment_result`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS last_enrichment_provider`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS last_enrichment_at`)
  }
}
