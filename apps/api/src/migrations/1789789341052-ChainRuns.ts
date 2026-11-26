import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les parcours de chaîne (PDF 6 §6, ticket BEL-AUT-502).
 *
 * UNE table, et c'est délibéré. Le document en décrit quatre — `chain`,
 * `chain_step`, `chain_gate`, `chain_run` — mais les trois premières décrivent
 * le CATALOGUE, qui vit dans le code comme celui des workflows et des routines
 * (décision D42). Les mettre en base ferait un chemin d'exécution que personne
 * ne relit, et il faudrait ensuite garder les deux en phase.
 *
 * Ce qui va en base est ce qui varie d'un dossier à l'autre : où en est CE
 * compte, CE besoin, CETTE mission — et ce qu'on a répondu à ses portes.
 *
 * `gate_answers` est un jsonb indexé par position plutôt qu'une table de
 * réponses : une porte a une réponse ou n'en a pas, et l'historique des
 * franchissements vit déjà dans `decision_gate_crossings`, qui est le journal
 * d'audit. Deux tables pour la même chose finiraient par diverger.
 */
export class ChainRuns1789789341052 implements MigrationInterface {
  public name = 'ChainRuns1789789341052'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chain_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        chain_key text NOT NULL,
        subject_type text NOT NULL,
        subject_id uuid NOT NULL,
        current_position integer NOT NULL DEFAULT 1,
        state text NOT NULL DEFAULT 'running',
        gate_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
        started_at timestamptz NOT NULL DEFAULT now(),
        ended_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      ALTER TABLE chain_runs ADD CONSTRAINT chain_runs_state_check
        CHECK (state IN ('running', 'blocked', 'done', 'abandoned'))
    `)
    // Un sujet ne suit une chaîne donnée qu'une fois : reprendre un compte
    // dans « ouverture » ne crée pas un second parcours, il reprend le premier.
    // Sans cette unicité, l'écran afficherait le même dossier à deux positions.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS chain_runs_unique
        ON chain_runs (workspace_id, chain_key, subject_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chain_runs_position_idx
        ON chain_runs (workspace_id, chain_key, current_position)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS chain_runs`)
  }
}
