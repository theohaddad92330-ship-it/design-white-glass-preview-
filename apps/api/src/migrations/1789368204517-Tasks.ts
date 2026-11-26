import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les TÂCHES (T3) — ce qu'il reste à faire, avec une date et un propriétaire.
 *
 * `due_on` est un `date` et NOT NULL, deux décisions qui tiennent ensemble :
 *
 *  - **NOT NULL** parce qu'une tâche sans échéance ne remonte dans aucune vue,
 *    donc n'est jamais faite, donc pourrit la liste jusqu'à ce que plus personne
 *    ne l'ouvre. La contrainte est en base et pas seulement dans le schéma zod :
 *    la base est le dernier endroit où une règle tient encore quand un chemin
 *    d'écriture est ajouté sans relire le contrat.
 *  - **`date` et non `timestamptz`** parce qu'une tâche n'a pas d'heure. Un
 *    horodatage obligerait chaque lecture à choisir un fuseau, et « demain »
 *    basculerait au jour suivant pour la moitié de l'équipe.
 *
 * L'index couvre la requête de l'écran « Aujourd'hui » : les tâches OUVERTES
 * d'un propriétaire, par échéance. Partiel sur `status = 'todo'` — l'historique
 * des tâches faites grossit sans fin et n'est jamais lu par cette vue.
 */
export class Tasks1789368204517 implements MigrationInterface {
  public name = 'Tasks1789368204517'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        owner_id uuid,
        created_by uuid,
        title text NOT NULL,
        details text,
        status text NOT NULL DEFAULT 'todo',
        priority text NOT NULL DEFAULT 'normal',
        due_on date NOT NULL,
        account_id uuid,
        contact_id uuid,
        project_id uuid,
        completed_at timestamptz,
        completed_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT tasks_status_check CHECK (status IN ('todo', 'done', 'cancelled')),
        CONSTRAINT tasks_priority_check CHECK (priority IN ('normal', 'high'))
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS tasks_open_by_owner_idx
        ON tasks (workspace_id, owner_id, due_on)
        WHERE status = 'todo'
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS tasks_account_idx ON tasks (account_id, due_on)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS tasks_contact_idx ON tasks (contact_id, due_on)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks (project_id, due_on)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tasks`)
  }
}
