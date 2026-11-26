import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2952 (#2305.13/.14/.15/.16/.18) — LA COLONNE QUE `convergence.ts` N'AVAIT
 * PAS : le contrat (quatre niveaux + invariant « aucune transition
 * automatique ») existait sans porteur. `project_needs` est le bon porteur —
 * pas une nouvelle table : un besoin y existe déjà SANS projet
 * (`project_id IS NULL`, #2558.1), donc c'est déjà l'objet qui va du signal
 * au projet, pas seulement du besoin qualifié à la mission.
 *
 * `NULL` = jamais évalué, JAMAIS un défaut `projet_plausible` deviné — même
 * raisonnement que `urgency`/`source` juste au-dessus dans l'entité.
 *
 * La contrainte porte les QUATRE valeurs du contrat (GA-11/12 : la contrainte
 * SQL s'élargit avant le code qui écrit dessus — ici les deux naissent
 * ensemble, rien n'écrit encore).
 */
export class NeedConvergenceState1796321998392 implements MigrationInterface {
  public name = 'NeedConvergenceState1796321998392'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE project_needs ADD COLUMN IF NOT EXISTS convergence_state text`)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_convergence_state_check
        CHECK (convergence_state IS NULL OR convergence_state IN ('projet_plausible', 'projet_confirme', 'besoin_detecte', 'besoin_exprime'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_convergence_state_check`)
    await queryRunner.query(`ALTER TABLE project_needs DROP COLUMN IF EXISTS convergence_state`)
  }
}
