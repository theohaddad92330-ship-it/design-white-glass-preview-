import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `account_vocabulary` — the per-account "grille de lecture" (Théo 2026-07-06):
 * the group's meaningful terms (entities, programmes, internal competitors,
 * ERP/tools, traps/noise) each with a kind, meaning and commercial rationale.
 *
 * Promoted OUT of the `raw_analysis` blob into a normalized table so it is
 * queryable, updatable per-term and mergeable on a partial re-run (the "règle
 * d'or" of the knowledge-architecture doc). Unique on (account_id, term_key)
 * so a re-run upserts instead of duplicating; enriched fields survive a
 * deterministic re-derive (see AccountVocabularyService.saveVocabulary).
 */
export class AccountVocabulary1783400000000 implements MigrationInterface {
  public name = 'AccountVocabulary1783400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_vocabulary (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        term TEXT NOT NULL,
        term_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN (
          'entity', 'program', 'internal_competitor', 'tool_erp',
          'trap_noise', 'angle', 'person', 'acronym'
        )),
        meaning TEXT,
        commercial_why TEXT,
        aliases JSONB DEFAULT '[]',
        related_entity TEXT,
        truth_status TEXT,
        source_refs JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE (account_id, term_key)
      )
    `)

    await queryRunner.query(`ALTER TABLE account_vocabulary ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can manage their own account vocabulary"
        ON account_vocabulary
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    `)

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS account_vocabulary_account_id_idx ON account_vocabulary (account_id)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS account_vocabulary_user_id_idx ON account_vocabulary (user_id)`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
