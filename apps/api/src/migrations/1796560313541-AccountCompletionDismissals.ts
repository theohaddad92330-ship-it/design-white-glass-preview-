import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4055.10 (18/10) — « Complète ce compte » ne repropose plus une personne que la personne a ÉCARTÉE.
 *
 * Une ligne par (espace, personne, compte, nom normalisé) : l'écart est PAR PERSONNE et PAR COMPTE, jamais
 * partagé avec un collègue. La clé primaire composite EST la portée — écarter deux fois la même personne est
 * un no-op. `ON DELETE CASCADE` sur le compte : un compte supprimé emporte ses écarts (rien d'autre n'y
 * pointe). La contrainte précède le code qui écrit (GA-11/GA-12) : cette migration est déployée avant l'outil.
 */
export class AccountCompletionDismissals1796560313541 implements MigrationInterface {
  name = 'AccountCompletionDismissals1796560313541'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_completion_dismissals (
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name_key text NOT NULL,
        full_name text NOT NULL,
        dismissed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, user_id, account_id, name_key)
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_completion_dismissals`)
  }
}
