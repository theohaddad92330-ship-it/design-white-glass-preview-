import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2995 (#2403.33) — la CINQUIÈME forme de réaction, `refused_stale_data`.
 *
 * GA-11/GA-12 : la contrainte s'élargit AVANT le code qui écrit la valeur
 * (`LauraService.react`, voir sa doc). Repart de la DERNIÈRE liste déclarée
 * (`1789990000005-LauraProduct.ts`), jamais d'une plus ancienne.
 *
 * `refused_stale_data` dit « c'était faux », distinct de `refused` ordinaire
 * (« pas maintenant ») : un refus sur une entité dont un humain a corrigé un
 * fait depuis que la trace a été posée (#2403.38, `field_provenance` /
 * `record_field_audit`). `isRefusal()` (`@bellum/contracts`) traite les deux
 * IDENTIQUEMENT partout où `refused` comptait déjà (cooldown, PRÉFÉRENCE,
 * taux d'acceptation) — cette migration n'élargit qu'une COLONNE, aucun
 * comportement existant ne change tant que rien n'écrit la valeur neuve.
 */
export class LauraInterventionRefusedStaleData1796344220000 implements MigrationInterface {
  public name = 'LauraInterventionRefusedStaleData1796344220000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE laura_interventions DROP CONSTRAINT IF EXISTS laura_interventions_reaction_check`,
    )
    await queryRunner.query(`
      ALTER TABLE laura_interventions ADD CONSTRAINT laura_interventions_reaction_check CHECK (
        reaction IS NULL OR reaction IN ('acted', 'ignored', 'closed_unread', 'refused', 'refused_stale_data')
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE laura_interventions DROP CONSTRAINT IF EXISTS laura_interventions_reaction_check`,
    )
    await queryRunner.query(`
      ALTER TABLE laura_interventions ADD CONSTRAINT laura_interventions_reaction_check CHECK (
        reaction IS NULL OR reaction IN ('acted', 'ignored', 'closed_unread', 'refused')
      )
    `)
  }
}
