import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La GOUVERNANCE du CRM natif (T10) — vues, champs personnalisés, doublons.
 *
 * Trois tables, trois bornes délibérées :
 *
 *  - `saved_views` stocke les CRITÈRES (`filters` jsonb), jamais les résultats.
 *    Une vue qui garderait des identifiants se périmerait le lendemain et
 *    afficherait une liste qui ne correspond plus à son nom.
 *  - `custom_field_defs` porte une clé machine STABLE et un index unique par
 *    objet : les exports s'adossent à la clé, et deux champs de même clé
 *    rendraient une colonne d'export non déterministe. Un champ retiré est
 *    ARCHIVÉ, pas supprimé — effacer la définition rendrait ses valeurs
 *    illisibles.
 *  - `duplicate_pairs` porte une clé de paire INDÉPENDANTE DE L'ORDRE. Sans
 *    elle, (A, B) et (B, A) seraient deux propositions : écarter l'une
 *    laisserait l'autre revenir, et la liste ne se viderait jamais — donc
 *    personne ne l'ouvrirait.
 */
export class Governance1789411862049 implements MigrationInterface {
  public name = 'Governance1789411862049'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS saved_views (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        owner_id uuid,
        scope text NOT NULL,
        name text NOT NULL,
        -- Les CRITÈRES, jamais les résultats.
        filters jsonb NOT NULL DEFAULT '{}'::jsonb,
        shared boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT saved_views_scope_check CHECK (
          scope IN ('accounts', 'contacts', 'projects', 'talents', 'missions')
        )
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS saved_views_lookup_idx ON saved_views (workspace_id, scope, owner_id)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS custom_field_defs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        entity_type text NOT NULL,
        key text NOT NULL,
        label text NOT NULL,
        type text NOT NULL DEFAULT 'text',
        options text[] NOT NULL DEFAULT '{}',
        -- Archivé, jamais supprimé : effacer la définition rendrait ses valeurs
        -- illisibles, et il y en a peut-être trois ans.
        archived boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT custom_field_defs_type_check CHECK (type IN ('text', 'number', 'date', 'boolean', 'select')),
        CONSTRAINT custom_field_defs_entity_check CHECK (
          entity_type IN ('account', 'contact', 'project', 'consultant')
        )
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS custom_field_defs_unique
        ON custom_field_defs (workspace_id, entity_type, key)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS custom_field_values (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        field_id uuid NOT NULL REFERENCES custom_field_defs(id) ON DELETE CASCADE,
        entity_id uuid NOT NULL,
        value jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS custom_field_values_unique ON custom_field_values (field_id, entity_id)
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS custom_field_values_entity_idx ON custom_field_values (entity_id)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS duplicate_pairs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        entity_type text NOT NULL,
        -- Clé INDÉPENDANTE DE L'ORDRE : sans elle, (A,B) et (B,A) reviendraient
        -- toutes les deux et la liste ne se viderait jamais.
        pair_key text NOT NULL,
        left_id uuid NOT NULL,
        right_id uuid NOT NULL,
        reason text NOT NULL,
        confidence numeric(4, 3) NOT NULL,
        decision text NOT NULL DEFAULT 'pending',
        decided_at timestamptz,
        decided_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT duplicate_pairs_entity_check CHECK (entity_type IN ('account', 'contact')),
        CONSTRAINT duplicate_pairs_decision_check CHECK (decision IN ('pending', 'merged', 'dismissed'))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS duplicate_pairs_unique ON duplicate_pairs (workspace_id, entity_type, pair_key)
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS duplicate_pairs_pending_idx ON duplicate_pairs (workspace_id, decision, confidence DESC)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS duplicate_pairs`)
    await queryRunner.query(`DROP TABLE IF EXISTS custom_field_values`)
    await queryRunner.query(`DROP TABLE IF EXISTS custom_field_defs`)
    await queryRunner.query(`DROP TABLE IF EXISTS saved_views`)
  }
}
