import { MigrationInterface, QueryRunner } from 'typeorm'

export class UserContactFavorites1783700000001 implements MigrationInterface {
  public name = 'UserContactFavorites1783700000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_contact_favorites (
        user_id uuid NOT NULL,
        contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, contact_id)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_user_contact_favorites_contact_id ON user_contact_favorites(contact_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_contact_favorites`)
  }
}
