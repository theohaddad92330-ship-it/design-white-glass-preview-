import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La shortlist comme OBJET (PDF 4 §9, BEL-MTC-302).
 *
 * `shortlisted` n'était qu'une étape d'un positionnement : on savait qu'un
 * profil avait été retenu, jamais CE QUI avait été proposé ensemble ni quand.
 *
 * Les fiches courtes sont RECOPIÉES dans `shortlist_entries` plutôt que jointes
 * au vivier. Le vivier évolue — un TJM change, une compétence est ajoutée — et
 * une shortlist jointe raconterait alors ce qui est vrai aujourd'hui, pas ce
 * que le client a reçu. Une jointure aurait été plus élégante et aurait perdu
 * l'information qui compte.
 */
export class Shortlists1789604173952 implements MigrationInterface {
  public name = 'Shortlists1789604173952'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shortlists (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        need_id uuid REFERENCES project_needs(id) ON DELETE SET NULL,
        need_role text NOT NULL DEFAULT '',
        account_name text,
        status text NOT NULL DEFAULT 'draft',
        source_run_id uuid REFERENCES match_runs(id) ON DELETE SET NULL,
        duplicated_from uuid REFERENCES shortlists(id) ON DELETE SET NULL,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shortlists_status_check CHECK (status IN ('draft', 'shared'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS shortlists_need_idx ON shortlists (need_id, created_at DESC)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS shortlists_workspace_idx ON shortlists (workspace_id, created_at DESC)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shortlist_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shortlist_id uuid NOT NULL REFERENCES shortlists(id) ON DELETE CASCADE,
        consultant_id uuid,
        rank integer NOT NULL,
        snapshot jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS shortlist_entries_list_idx ON shortlist_entries (shortlist_id, rank)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS shortlist_entries`)
    await queryRunner.query(`DROP TABLE IF EXISTS shortlists`)
  }
}
