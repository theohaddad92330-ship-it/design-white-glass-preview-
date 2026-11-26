import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `agenda_bellum_created_event.account_id` DEVIENT OPTIONNEL — épopée #2770
 * (#2770.49/.50/.51, plan de journée « focus plan »).
 *
 * La table (migration `1796350021011`) posait `account_id NOT NULL` parce
 * que sa seule porte d'écriture jusqu'ici (`confirmSlotProposal`) proposait
 * toujours un créneau POUR un compte. `confirmFocusPlanBlock` (ce lot) écrit
 * le même genre de preuve locale pour un bloc du plan de journée
 * (`propose_focus_plan`, #2391) — un type de bloc, jamais un compte
 * (« session d'appels », « tâches administratives »…). Élargir la contrainte
 * SQL AVANT le code qui écrit une ligne sans compte (GA-11/GA-12), plutôt que
 * d'inventer un compte qui n'existe pas pour ce bloc.
 */
export class AgendaBellumCreatedEventAccountOptional1796350215111 implements MigrationInterface {
  public name = 'AgendaBellumCreatedEventAccountOptional1796350215111'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE agenda_bellum_created_event ALTER COLUMN account_id DROP NOT NULL
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
