import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2995 (#2403.33) — la SIXIÈME forme de réaction, `refused_handled_elsewhere`.
 *
 * GA-11/GA-12 : la contrainte s'élargit AVANT le code qui écrit la valeur
 * (`LauraService.react`, voir sa doc). Repart de la DERNIÈRE liste déclarée
 * (`1796344220000-LauraInterventionRefusedStaleData.ts`), jamais d'une plus
 * ancienne.
 *
 * `refused_handled_elsewhere` dit « déjà traité, ailleurs », distinct de
 * `refused` ordinaire (« pas maintenant ») et de `refused_stale_data`
 * (« c'était faux ») : un refus sur une entité qui a déjà reçu une action
 * (`user_actions` — le journal d'actions, CRM branché compris) depuis que la
 * trace a été posée. `isRefusal()` (`@bellum/contracts`) traite les trois
 * IDENTIQUEMENT partout où `refused` comptait déjà (cooldown, PRÉFÉRENCE,
 * taux d'acceptation) — cette migration n'élargit qu'une COLONNE, aucun
 * comportement existant ne change tant que rien n'écrit la valeur neuve.
 */
export class LauraInterventionRefusedHandledElsewhere1796349710628 implements MigrationInterface {
  public name = 'LauraInterventionRefusedHandledElsewhere1796349710628'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE laura_interventions DROP CONSTRAINT IF EXISTS laura_interventions_reaction_check`,
    )
    await queryRunner.query(`
      ALTER TABLE laura_interventions ADD CONSTRAINT laura_interventions_reaction_check CHECK (
        reaction IS NULL OR reaction IN ('acted', 'ignored', 'closed_unread', 'refused', 'refused_stale_data', 'refused_handled_elsewhere')
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE laura_interventions DROP CONSTRAINT IF EXISTS laura_interventions_reaction_check`,
    )
    await queryRunner.query(`
      ALTER TABLE laura_interventions ADD CONSTRAINT laura_interventions_reaction_check CHECK (
        reaction IS NULL OR reaction IN ('acted', 'ignored', 'closed_unread', 'refused', 'refused_stale_data')
      )
    `)
  }
}
