import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Pipeline valorisé (cockpit manager §10) — un montant d'affaire estimé sur les
 * opportunités.
 *
 * Jusqu'ici un besoin/opportunité ne portait aucune valeur : impossible de
 * chiffrer un pipeline. Cette migration ajoute une colonne `estimated_amount`
 * NULLABLE (numeric, devise implicite EUR) que le commercial saisit depuis le
 * détail du besoin. `NULL` = jamais renseigné (le champ existe, la donnée non) :
 * le pipeline € ne somme QUE des montants réellement saisis, un besoin sans
 * montant n'est jamais compté comme 0 € (règle « jamais de montant inventé »).
 *
 * Additive + idempotente (`ADD COLUMN IF NOT EXISTS`) : re-run sûr, aucune donnée
 * touchée, backfill volontairement absent (on NE devine aucun montant).
 */
export class OpportunityEstimatedAmount1788230417238 implements MigrationInterface {
  public name = 'OpportunityEstimatedAmount1788230417238'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS estimated_amount numeric`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
