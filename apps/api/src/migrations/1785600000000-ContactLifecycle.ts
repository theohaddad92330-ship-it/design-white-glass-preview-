import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Persist the contact lifecycle state + journal its transitions (P0 « Contact
 * states + providers » — détecté → identité vérifiée → qualifié → enrichi →
 * actionnable).
 *
 * Until now the state was recomputed on read (`computeContactLifecycleState`),
 * so "détecté le X / vérifié le Y" was untraceable — no date, no provenance per
 * passage. This migration:
 *
 *  1. Adds `contacts.lifecycle_state` (text) — the persisted position, kept in
 *     sync by the deterministic computation on every create/verify/enrich.
 *  2. Creates the append-only `contact_lifecycle_transitions` journal (one row
 *     per passage, with the driving provider `source` and the REAL `occurred_at`).
 *  3. Backfills `lifecycle_state` for existing rows via the SAME deterministic
 *     ladder as `computeContactLifecycleState` (kept byte-for-byte equivalent to
 *     the TS function — identity ≥ 2 name tokens + anchor, known role, reachable,
 *     enriched). No transition rows are backfilled: we don't know WHEN each
 *     historical passage happened and never invent a date — the journal only
 *     records passages going forward (existing contacts fall back to their
 *     `created_at` for the "détecté" date in the UI).
 */
export class ContactLifecycle1785600000000 implements MigrationInterface {
  public name = 'ContactLifecycle1785600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Persisted state column on contacts.
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lifecycle_state text`)

    // 2. Append-only transition journal.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contact_lifecycle_transitions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        from_state text,
        to_state text NOT NULL,
        source text,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        actor text
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_contact_lifecycle_transitions_contact
        ON contact_lifecycle_transitions (contact_id, occurred_at)
    `)

    // RLS parity with the other métier tables (the API uses the service role, so
    // this is defence-in-depth): a row is visible to the owner of its parent
    // contact. Guarded — Postgres has no IF NOT EXISTS for CREATE POLICY, so a
    // re-run (partial prior apply / racing `migration:run`) must not 42710.
    await queryRunner.query(`ALTER TABLE contact_lifecycle_transitions ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'contact_lifecycle_transitions'
            AND policyname = 'Users can read their own contact lifecycle transitions'
        ) THEN
          CREATE POLICY "Users can read their own contact lifecycle transitions"
            ON contact_lifecycle_transitions
            FOR SELECT
            USING (
              EXISTS (
                SELECT 1 FROM contacts c
                WHERE c.id = contact_lifecycle_transitions.contact_id
                  AND c.user_id = auth.uid()
              )
            );
        END IF;
      END $$;
    `)

    // 3. Backfill lifecycle_state — mirror of computeContactLifecycleState:
    //      identity = full name (≥ 2 tokens) AND an anchor (title/entity/linkedin)
    //      role_known = decision_role in the known set
    //      reachable = email | phone | linkedin
    //      enriched  = email | phone
    //      actionnable ⇐ identity && role_known && reachable
    //      qualifie   ⇐ identity && role_known
    //      enrichi    ⇐ enriched
    //      identite_verifiee ⇐ identity
    //      detecte    ⇐ otherwise
    await queryRunner.query(`
      WITH computed AS (
        SELECT
          id,
          (
            cardinality(array_remove(regexp_split_to_array(btrim(coalesce(full_name, '')), '\\s+'), '')) >= 2
            AND (
              coalesce(btrim(title), '') <> ''
              OR coalesce(btrim(entity), '') <> ''
              OR coalesce(linkedin_url, '') <> ''
            )
          ) AS identity,
          (
            lower(coalesce(decision_role, '')) IN (
              'economic', 'technical', 'user', 'champion',
              'procurement', 'purchasing', 'influencer', 'blocker', 'sponsor'
            )
          ) AS role_known,
          (coalesce(email, '') <> '' OR coalesce(phone, '') <> '' OR coalesce(linkedin_url, '') <> '') AS reachable,
          (coalesce(email, '') <> '' OR coalesce(phone, '') <> '') AS enriched
        FROM contacts
        WHERE lifecycle_state IS NULL
      )
      UPDATE contacts c
      SET lifecycle_state = CASE
        WHEN comp.identity AND comp.role_known AND comp.reachable THEN 'actionnable'
        WHEN comp.identity AND comp.role_known THEN 'qualifie'
        WHEN comp.enriched THEN 'enrichi'
        WHEN comp.identity THEN 'identite_verifiee'
        ELSE 'detecte'
      END
      FROM computed comp
      WHERE c.id = comp.id
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
