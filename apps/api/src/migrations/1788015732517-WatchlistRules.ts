import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Règles PERSONNELLES de veille (restitution V2 §11 — « tout ce qui manque »
 * pour que la Veille soit personnalisée). Un commercial déclare ce qu'il veut
 * suivre : SECTEUR, TECHNO, COMPTE, BESOIN ou PERSONNE. La table est portée par
 * le workspace (la veille est une affaire d'équipe) ; `user_id` reste comme
 * attribution « créée par ».
 *
 * Additive + idempotente (IF NOT EXISTS partout) : re-run sûr. Un index unique
 * (workspace, kind, value) empêche les doublons — deux fois la même règle = une
 * seule ligne. RLS `auth.uid() = user_id` = défense en profondeur (l'API tourne
 * en service-role qui bypass ; la vraie barrière est le scoping workspace côté
 * service).
 */
export class WatchlistRules1788015732517 implements MigrationInterface {
  public name = 'WatchlistRules1788015732517'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS watchlist_rules (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        kind         text NOT NULL
          CHECK (kind IN ('sector', 'techno', 'account', 'need', 'person')),
        value        text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS watchlist_rules_workspace_idx
        ON watchlist_rules (workspace_id)
    `)
    // Identité d'une règle = (workspace, type, valeur). Deux commerciaux d'une
    // même équipe qui ajoutent « ServiceNow » ne créent qu'UNE règle partagée.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS watchlist_rules_workspace_kind_value_uidx
        ON watchlist_rules (workspace_id, kind, value)
    `)

    await queryRunner.query(`ALTER TABLE watchlist_rules ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'watchlist_rules'
            AND policyname = 'Users can manage their own watchlist rules'
        ) THEN
          CREATE POLICY "Users can manage their own watchlist rules"
            ON watchlist_rules
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
