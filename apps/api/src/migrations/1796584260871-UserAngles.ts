import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4739 (retour Bedros × Adel, 28/10) — « Mes angles » : les angles d'approche qu'un commercial écrit
 * lui-même sur « Contacter », sauvegardés et retrouvés à chaque message.
 *
 * Table NEUVE, additive, idempotente — la table `attack_angles` (angles calculés) n'est pas touchée :
 * un angle à soi n'est pas une preuve du produit, il ne se mélange pas à ses lignes.
 * Personnel à son créateur : RLS `auth.uid() = user_id`, comme les sept autres tables. On archive, on
 * ne supprime pas (`archived_at`). `source` est contraint ICI, avant le code qui l'écrit (GA-11/GA-12).
 */
export class UserAngles1796584260871 implements MigrationInterface {
  public name = 'UserAngles1796584260871'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_angles (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid NOT NULL,
        workspace_id  uuid,
        title         text NOT NULL,
        content       text NOT NULL,
        source        text NOT NULL DEFAULT 'human',
        archived_at   timestamptz,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT user_angles_source_check CHECK (source IN ('human'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS user_angles_user_active_idx
        ON user_angles (user_id, updated_at DESC) WHERE archived_at IS NULL
    `)
    await queryRunner.query(`ALTER TABLE user_angles ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'user_angles' AND policyname = 'Users manage their own angles'
        ) THEN
          CREATE POLICY "Users manage their own angles"
            ON user_angles
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
