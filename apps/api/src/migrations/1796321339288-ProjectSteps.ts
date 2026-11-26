import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `project_steps` — la section « Actions et prochaines étapes » de la fiche
 * opportunité (#2171.22), COCHABLE — même objet que `need_steps` (migration
 * `1790974000002-NeedSteps.ts`), porté cette fois par l'OPPORTUNITÉ.
 *
 * Distincte de la LECTURE dérivée `next_action` (`ProjectRow.next_action`,
 * projects.service.ts) : cette dernière disparaît d'elle-même quand la
 * donnée sous-jacente change et n'a jamais été cochable. Ce que l'épopée
 * demande est un second objet, une LISTE que le commercial écrit lui-même
 * (« relancer le sponsor », « envoyer le devis ») et coche au fil de l'eau —
 * les deux coexistent, comme côté besoin.
 *
 * Trois statuts (`todo`/`pending`/`done`), même raison que `need_steps` : une
 * étape qui attend une réponse du client n'est pas la même chose qu'une
 * étape pas encore commencée.
 */
export class ProjectSteps1796321339288 implements MigrationInterface {
  public name = 'ProjectSteps1796321339288'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_steps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        project_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        label text NOT NULL,
        status text NOT NULL DEFAULT 'todo',
        position integer NOT NULL DEFAULT 0,
        done_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT project_steps_status_check CHECK (status IN ('todo', 'pending', 'done'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS project_steps_project_idx ON project_steps (project_id, position ASC)
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS project_steps_workspace_idx ON project_steps (workspace_id)`)
    await queryRunner.query(`
      COMMENT ON TABLE project_steps IS
        'Les prochaines etapes cochables d''une opportunite - fiche opportunite, #2171.22. Distinct de ProjectRow.next_action (derivation non persistee) : un objet ECRIT par le commercial, pas calcule.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS project_steps`)
  }
}
