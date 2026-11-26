import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Plans d'attaque de besoin (décision Louis 31/07, D9 option A).
 *
 * L'unicité `(workspace_id, need_key)` n'est pas un détail de schéma : c'est la
 * règle commerciale. Le plan appartient à l'ÉQUIPE, donc un deuxième siège qui
 * ouvre le même besoin relit le plan au lieu d'en payer un second.
 */
export class NeedPlays1788400000000 implements MigrationInterface {
  public name = 'NeedPlays1788400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS need_plays (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  UUID NOT NULL,
        account_id    UUID NOT NULL,
        need_key      TEXT NOT NULL,
        need_label    TEXT NOT NULL,
        content       JSONB NOT NULL,
        generated_by  UUID NOT NULL,
        generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS need_plays_workspace_key_unique
        ON need_plays (workspace_id, need_key)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS need_plays_account_idx ON need_plays (account_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
