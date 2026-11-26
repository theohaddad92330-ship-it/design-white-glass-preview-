import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4996 L8 (Refs #4731) — RÉTRÉCIR (conception §2.4) : `account_team_members.account_id` n'avait aucune FK.
 *
 * - FK posée `NOT VALID` (n'examine pas l'existant, ne verrouille pas longtemps), puis les orphelins sont COMPTÉS ;
 *   s'il y en a, la migration ÉCHOUE en le disant — elle ne supprime rien (on archive, on ne supprime pas) ;
 *   sinon `VALIDATE CONSTRAINT`. L'échec annule la transaction : la FK NOT VALID ne reste pas posée.
 * - `account_team_scopes` : ses FK (`accounts`, `account_entities`) sont déjà posées valides à la création (L1), table
 *   neuve : rien à valider.
 * - FK composite `(entity_id, account_id) → account_entities(id, account_id)` : ÉCARTÉE. Elle exige `SET NULL (entity_id)`
 *   à la suppression (sinon `account_id` NOT NULL passerait à NULL) — syntaxe PostgreSQL 15+, non vérifiée sur la
 *   version de Supabase. Le service garde l'invariant « entité du même compte » (`addTeamScope`), testé.
 */
export class AccountTeamFks1796610035217 implements MigrationInterface {
  public name = 'AccountTeamFks1796610035217'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_team_members_account_fk') THEN
          ALTER TABLE account_team_members
            ADD CONSTRAINT account_team_members_account_fk
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE NOT VALID;
        END IF;
      END $$;
    `)
    const rows = (await queryRunner.query(`
      SELECT count(*) AS n
        FROM account_team_members
        LEFT JOIN accounts ON accounts.id = account_team_members.account_id
       WHERE accounts.id IS NULL
    `)) as { n: string | number }[] | undefined
    const orphans = Number(rows?.[0]?.n ?? 0)
    if (orphans > 0) {
      throw new Error(
        `AccountTeamFks : ${orphans} ligne(s) orpheline(s) dans account_team_members (account_id sans compte). ` +
          `Rien n'a été supprimé : archiver ou rattacher ces lignes (commande de rattrapage), puis relancer.`,
      )
    }
    await queryRunner.query(`ALTER TABLE account_team_members VALIDATE CONSTRAINT account_team_members_account_fk`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE account_team_members DROP CONSTRAINT IF EXISTS account_team_members_account_fk`,
    )
  }
}
