import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Contact dedup — DB-level guarantee.
 *
 * `contacts` had no unique constraint and no upsert: `bulkInsert` did a read
 * then a write with no lock, so the same person could be inserted twice
 * (accent variant, or two analyses running concurrently on the same account).
 * The application now dedupes on a normalised identity, but the application is
 * not where a data guarantee belongs.
 *
 * Three steps:
 *   1. an IMMUTABLE `bellum_normalize_name` mirroring the TS `normalizeFullName`
 *      (accents stripped, punctuation → space, lowercase, whitespace collapsed);
 *   2. a one-shot merge of the duplicates already stored — the survivor absorbs
 *      the losers' non-null fields and inherits their action history, favorites
 *      and cadence steps, so nothing the user did is lost;
 *   3. a unique index on `(account_id, normalised name)`.
 *
 * Note the index covers the exact-order name only. The sorted-token match
 * ("DUPONT Jean" ≡ "Jean Dupont") and the email / LinkedIn identities stay
 * application-level — they are merge heuristics, too aggressive to hard-enforce
 * in a constraint that can abort an analysis mid-run.
 *
 * ── Amended after a production incident ──────────────────────────────────────
 * As first written this migration lost data in two ways, both fixed below.
 *
 * 1. ACCENTS. `bellum_normalize_name` was used only as a comparison key — it was
 *    never written back, so the original hypothesis ("the migration stores the
 *    normalised value") is wrong. The damage came from the survivor RANKING:
 *    it ordered by how many columns were filled and never looked at the name,
 *    so between "Sébastien Chauffray" and "Sebastien Chauffray" the accented row
 *    could lose and be DELETED. `full_name` was also absent from the COALESCE
 *    absorb list, so the survivor could not inherit the better spelling either.
 *    Both are corrected: the survivor now absorbs the most-accented spelling
 *    among the rows being merged. That is a choice between values that really
 *    exist in the table — no accent is ever synthesised.
 *
 * 2. TRACEABILITY. The loser's id was deleted with no forwarding address, so
 *    every link already shared to it answered « Contact introuvable » for a
 *    person who still existed under a new id. Each merge is now recorded in
 *    `contact_merges`, which the API reads to resolve a retired id.
 *
 * Amending an applied migration is normally off-limits. It is done here because
 * the defect DESTROYS DATA on every database that has not run it yet (fresh
 * dev, CI, staging, any future environment), and TypeORM will not re-run it
 * where it already succeeded — so production is unaffected by the edit. The
 * companion migration 1786709384712 repairs those already-migrated databases as
 * far as is possible without inventing anything.
 */
export class ContactIdentityDedup1786623491782 implements MigrationInterface {
  name = 'ContactIdentityDedup1786623491782'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Normalisation function ────────────────────────────────────────────
    // IMMUTABLE is required to index on it. `unaccent()` is only STABLE (it
    // depends on a dictionary), so we translate the Latin-1/Latin-A range
    // explicitly — the same set the TS side folds.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION bellum_normalize_name(input text)
      RETURNS text
      LANGUAGE sql
      IMMUTABLE
      PARALLEL SAFE
      AS $$
        SELECT NULLIF(
          btrim(
            regexp_replace(
              regexp_replace(
                translate(
                  lower(
                    replace(replace(replace(replace(lower(coalesce(input, '')),
                      'œ', 'oe'), 'æ', 'ae'), 'ß', 'ss'), 'ø', 'o')
                  ),
                  'àáâãäåāăąçćĉċčďđèéêëēĕėęěĝğġģĥħìíîïĩīĭįıĵķĺļľłñńņňòóôõöōŏőŕŗřśŝşšţťŧùúûüũūŭůűųŵýÿŷźżž',
                  'aaaaaaaaacccccddeeeeeeeeegggghhiiiiiiiiijkllllnnnnooooooooorrrsssstttuuuuuuuuuuwyyyzzz'
                ),
                '[^a-z0-9]+', ' ', 'g'
              ),
              '\\s+', ' ', 'g'
            )
          ),
          ''
        );
      $$;
    `)

    // How much of the original orthography a spelling still carries. `translate`
    // with an empty target DELETES the listed characters, so the length lost is
    // the number of accented letters. Used to rank two spellings of one name —
    // never to produce a spelling.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION bellum_name_accent_score(input text)
      RETURNS int
      LANGUAGE sql
      IMMUTABLE
      PARALLEL SAFE
      AS $$
        SELECT length(lower(coalesce(input, ''))) - length(
          translate(
            lower(coalesce(input, '')),
            'àáâãäåāăąçćĉċčďđèéêëēĕėęěĝğġģĥħìíîïĩīĭįĵķĺļľłñńņňòóôõöōŏőŕŗřśŝşšţťŧùúûüũūŭůűųŵýÿŷźżžœæßø',
            ''
          )
        );
      $$;
    `)

    // ── 2. Merge the duplicates already in the table ─────────────────────────
    // Survivor per (account_id, normalised name): the most-enriched row, then
    // the oldest. Ranking by filled-field count keeps the row the user has
    // actually worked on (email, phone, messages, notes) rather than an
    // arbitrary one.
    await queryRunner.query(`
      CREATE TEMP TABLE contact_dedup_map AS
      WITH ranked AS (
        SELECT
          id,
          account_id,
          bellum_normalize_name(full_name) AS norm,
          ROW_NUMBER() OVER (
            PARTITION BY account_id, bellum_normalize_name(full_name)
            ORDER BY
              (
                (email IS NOT NULL)::int + (phone IS NOT NULL)::int +
                (linkedin_url IS NOT NULL)::int + (title IS NOT NULL)::int +
                (decision_role IS NOT NULL)::int + (profile_summary IS NOT NULL)::int +
                (email_message IS NOT NULL)::int + (note IS NOT NULL)::int +
                (raw_data IS NOT NULL)::int
              ) DESC,
              created_at ASC,
              id ASC
          ) AS rn
        FROM contacts
        WHERE bellum_normalize_name(full_name) IS NOT NULL
      )
      SELECT
        loser.id     AS loser_id,
        winner.id    AS winner_id
      FROM ranked loser
      JOIN ranked winner
        ON winner.account_id = loser.account_id
       AND winner.norm = loser.norm
       AND winner.rn = 1
      WHERE loser.rn > 1;
    `)

    // Record where every merged-away id went, BEFORE the delete makes it
    // unknowable. `IF NOT EXISTS` because migration 1786709384712 creates the
    // same table for databases that ran an earlier version of this file.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contact_merges (
        loser_id        uuid PRIMARY KEY,
        winner_id       uuid NOT NULL,
        account_id      uuid NOT NULL,
        reason          text NOT NULL,
        loser_full_name text,
        merged_at       timestamptz NOT NULL DEFAULT now()
      );
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contact_merges_winner ON contact_merges (winner_id);
    `)
    await queryRunner.query(`
      INSERT INTO contact_merges (loser_id, winner_id, account_id, reason, loser_full_name)
      SELECT m.loser_id, m.winner_id, l.account_id, 'migration:1786623491782', l.full_name
      FROM contact_dedup_map m
      JOIN contacts l ON l.id = m.loser_id
      ON CONFLICT (loser_id) DO NOTHING;
    `)

    // Adopt the best spelling of the name available in the group. De-accenting
    // is lossy and one-way, so among rows that normalise to the SAME key the
    // most-accented spelling is the one closest to the source. Ties keep the
    // survivor's own value: casing is a separate axis and guessing it would be
    // inventing data. Every candidate here is a value that already exists in
    // the table — nothing is reconstructed.
    await queryRunner.query(`
      UPDATE contacts w
      SET full_name = best.full_name
      FROM (
        SELECT DISTINCT ON (winner_id) winner_id, full_name
        FROM (
          SELECT m.winner_id, c.full_name, bellum_name_accent_score(c.full_name) AS score, 0 AS self
          FROM contact_dedup_map m JOIN contacts c ON c.id = m.loser_id
          UNION ALL
          SELECT DISTINCT m.winner_id, c.full_name, bellum_name_accent_score(c.full_name) AS score, 1 AS self
          FROM contact_dedup_map m JOIN contacts c ON c.id = m.winner_id
        ) candidates
        -- Highest accent score wins; the self DESC tie-break keeps the
        -- survivor's own spelling, so an equal-quality name is never churned.
        ORDER BY winner_id, score DESC, self DESC
      ) best
      WHERE w.id = best.winner_id AND w.full_name IS DISTINCT FROM best.full_name;
    `)

    // Absorb every non-null field the losers had and the survivor lacks.
    await queryRunner.query(`
      UPDATE contacts w
      SET
        title           = COALESCE(w.title, src.title),
        entity          = COALESCE(w.entity, src.entity),
        family          = COALESCE(w.family, src.family),
        decision_role   = COALESCE(w.decision_role, src.decision_role),
        priority        = COALESCE(w.priority, src.priority),
        email           = COALESCE(w.email, src.email),
        phone           = COALESCE(w.phone, src.phone),
        linkedin_url    = COALESCE(w.linkedin_url, src.linkedin_url),
        profile_summary = COALESCE(w.profile_summary, src.profile_summary),
        why_contact     = COALESCE(w.why_contact, src.why_contact),
        email_message   = COALESCE(w.email_message, src.email_message),
        linkedin_message= COALESCE(w.linkedin_message, src.linkedin_message),
        phone_script    = COALESCE(w.phone_script, src.phone_script),
        note            = COALESCE(w.note, src.note),
        raw_data        = COALESCE(w.raw_data, src.raw_data),
        email_sent_at   = COALESCE(w.email_sent_at, src.email_sent_at)
      FROM (
        SELECT
          m.winner_id,
          (ARRAY_AGG(l.title           ORDER BY l.created_at) FILTER (WHERE l.title IS NOT NULL))[1]           AS title,
          (ARRAY_AGG(l.entity          ORDER BY l.created_at) FILTER (WHERE l.entity IS NOT NULL))[1]          AS entity,
          (ARRAY_AGG(l.family          ORDER BY l.created_at) FILTER (WHERE l.family IS NOT NULL))[1]          AS family,
          (ARRAY_AGG(l.decision_role   ORDER BY l.created_at) FILTER (WHERE l.decision_role IS NOT NULL))[1]   AS decision_role,
          (ARRAY_AGG(l.priority        ORDER BY l.created_at) FILTER (WHERE l.priority IS NOT NULL))[1]        AS priority,
          (ARRAY_AGG(l.email           ORDER BY l.created_at) FILTER (WHERE l.email IS NOT NULL))[1]           AS email,
          (ARRAY_AGG(l.phone           ORDER BY l.created_at) FILTER (WHERE l.phone IS NOT NULL))[1]           AS phone,
          (ARRAY_AGG(l.linkedin_url    ORDER BY l.created_at) FILTER (WHERE l.linkedin_url IS NOT NULL))[1]    AS linkedin_url,
          (ARRAY_AGG(l.profile_summary ORDER BY l.created_at) FILTER (WHERE l.profile_summary IS NOT NULL))[1] AS profile_summary,
          (ARRAY_AGG(l.why_contact     ORDER BY l.created_at) FILTER (WHERE l.why_contact IS NOT NULL))[1]     AS why_contact,
          (ARRAY_AGG(l.email_message   ORDER BY l.created_at) FILTER (WHERE l.email_message IS NOT NULL))[1]   AS email_message,
          (ARRAY_AGG(l.linkedin_message ORDER BY l.created_at) FILTER (WHERE l.linkedin_message IS NOT NULL))[1] AS linkedin_message,
          (ARRAY_AGG(l.phone_script    ORDER BY l.created_at) FILTER (WHERE l.phone_script IS NOT NULL))[1]    AS phone_script,
          (ARRAY_AGG(l.note            ORDER BY l.created_at) FILTER (WHERE l.note IS NOT NULL))[1]            AS note,
          (ARRAY_AGG(l.raw_data        ORDER BY l.created_at) FILTER (WHERE l.raw_data IS NOT NULL))[1]        AS raw_data,
          (ARRAY_AGG(l.email_sent_at   ORDER BY l.created_at) FILTER (WHERE l.email_sent_at IS NOT NULL))[1]   AS email_sent_at
        FROM contact_dedup_map m
        JOIN contacts l ON l.id = m.loser_id
        GROUP BY m.winner_id
      ) src
      WHERE w.id = src.winner_id;
    `)

    // Repoint the children so history/favorites survive the delete. Without
    // this, user_actions would be SET NULL and favorites/cadence CASCADE-deleted.
    await queryRunner.query(`
      UPDATE user_actions a SET contact_id = m.winner_id
      FROM contact_dedup_map m WHERE a.contact_id = m.loser_id;
    `)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.user_contact_favorites') IS NOT NULL THEN
          -- The survivor may already be a favorite; drop the redundant row first
          -- so the repoint cannot violate the (user_id, contact_id) uniqueness.
          DELETE FROM user_contact_favorites f
          USING contact_dedup_map m
          WHERE f.contact_id = m.loser_id
            AND EXISTS (
              SELECT 1 FROM user_contact_favorites k
              WHERE k.user_id = f.user_id AND k.contact_id = m.winner_id
            );
          UPDATE user_contact_favorites f SET contact_id = m.winner_id
          FROM contact_dedup_map m WHERE f.contact_id = m.loser_id;
        END IF;
      END $$;
    `)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'action_plan_items' AND column_name = 'contact_id'
        ) THEN
          UPDATE action_plan_items i SET contact_id = m.winner_id
          FROM contact_dedup_map m WHERE i.contact_id = m.loser_id;
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      DELETE FROM contacts c USING contact_dedup_map m WHERE c.id = m.loser_id;
    `)
    await queryRunner.query(`DROP TABLE IF EXISTS contact_dedup_map;`)

    // ── 3. The guarantee ─────────────────────────────────────────────────────
    // Partial: rows whose name normalises to nothing (non-Latin script only)
    // are left unconstrained rather than collapsed into a single NULL bucket.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_normalized_name
        ON contacts (account_id, bellum_normalize_name(full_name))
        WHERE bellum_normalize_name(full_name) IS NOT NULL;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The merged rows are not restorable — only the schema objects come back.
    // `contact_merges` is deliberately KEPT: it is the only remaining record of
    // what was collapsed into what, and dropping it would destroy the audit
    // trail this migration exists to leave behind.
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contacts_account_normalized_name;`)
    await queryRunner.query(`DROP FUNCTION IF EXISTS bellum_normalize_name(text);`)
    await queryRunner.query(`DROP FUNCTION IF EXISTS bellum_name_accent_score(text);`)
  }
}
