import { MigrationInterface, QueryRunner } from 'typeorm'

export class ProfileContextRevisions1780000000007 implements MigrationInterface {
  public name = 'ProfileContextRevisions1780000000007'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS profile_context_revisions (
        id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID         NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
        version         INTEGER      NOT NULL,
        schema_version  INTEGER      NOT NULL,
        profile_context JSONB        NOT NULL,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        UNIQUE (user_id, version)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS profile_context_revisions_user_id_idx ON profile_context_revisions (user_id)`,
    )

    // Seed the live content of existing profiles as revision 1 so history is
    // never empty and the current row is itself addressable for restore.
    await queryRunner.query(`
      INSERT INTO profile_context_revisions (user_id, version, schema_version, profile_context)
      SELECT user_id, 1, 1, profile_context
      FROM profiles
      WHERE profile_context IS NOT NULL
      ON CONFLICT (user_id, version) DO NOTHING
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
