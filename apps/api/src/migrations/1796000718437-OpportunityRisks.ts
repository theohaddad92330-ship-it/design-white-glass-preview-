import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2324.37 — les RISQUES d'une opportunité.
 *
 * Une opportunité (`opportunities`, l'entité « projet ») n'avait aucun champ
 * risque : ni colonne, ni route, ni écran. Laura ne pouvait donc pas en
 * proposer un dans `propose_opportunity_update`, et le glisser dans la
 * qualification BTMMP ou dans une tâche aurait déformé la donnée.
 *
 * Colonne texte NULLABLE : `NULL` = personne ne les a écrits — l'écran n'en
 * montre aucune ligne (« on n'affiche pas ce qu'on n'a pas »). Aucun CHECK :
 * la longueur est bornée par le contrat (`updateProjectRisksSchema`, 2 000).
 *
 * Additive + idempotente (`ADD COLUMN IF NOT EXISTS`) : aucune donnée touchée,
 * aucun backfill (on ne devine aucun risque).
 */
export class OpportunityRisks1796000718437 implements MigrationInterface {
  public name = 'OpportunityRisks1796000718437'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS risks text`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
