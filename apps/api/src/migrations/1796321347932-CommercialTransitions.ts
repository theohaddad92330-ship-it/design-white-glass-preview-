import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2320.23 (épopée #2967) — « Historique de transition complet :
 * état/auteur/date/preuve/action suivante ».
 *
 * `contact_lifecycle_transitions` (P0 « Contact states + providers ») gardait
 * déjà ce motif pour UN objet (le contact) : append-only, `from_state`
 * nullable pour la première ligne, `actor` nullable pour une transition
 * système. Cette table l'étend à toute la CHAÎNE commerciale — besoin,
 * shortlist, positionnement, mission — au lieu d'une quatrième table
 * spécialisée par objet (GA-26 : un réglage, une forme, un seul endroit).
 *
 * `subject_type` est une liste FERMÉE (CHECK), comme `EXCLUSION_REASONS` et
 * les autres énumérations fermées du dépôt : une valeur hors liste ne se
 * devine pas, elle est refusée à l'écriture — élargie ICI, avant le code qui
 * écrirait une cinquième valeur (GA-11/GA-12).
 */
export class CommercialTransitions1796321347932 implements MigrationInterface {
  name = 'CommercialTransitions1796321347932'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commercial_transitions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NULL,
        subject_type text NOT NULL,
        subject_id uuid NOT NULL,
        from_state text NULL,
        to_state text NOT NULL,
        actor_id uuid NULL,
        proof text NULL,
        next_action text NULL,
        occurred_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      ALTER TABLE commercial_transitions
        DROP CONSTRAINT IF EXISTS commercial_transitions_subject_type_check,
        ADD CONSTRAINT commercial_transitions_subject_type_check
          CHECK (subject_type IN ('need', 'shortlist', 'submission', 'mission'))
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS commercial_transitions_subject_idx
        ON commercial_transitions (subject_type, subject_id, occurred_at)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS commercial_transitions_workspace_idx
        ON commercial_transitions (workspace_id, occurred_at)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS commercial_transitions`)
  }
}
