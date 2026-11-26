import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Merge audit trail — for the databases that already ran 1786623491782.
 *
 * That migration merged duplicate contacts and deleted the losers with no
 * forwarding address. Production consequence: a contact id that a rep had
 * bookmarked or pasted into an email answered « Contact introuvable », while
 * the person carried on existing under a new id. Nothing in the schema recorded
 * the correspondence.
 *
 * This creates `contact_merges` so the API can resolve a retired id, and so
 * every FUTURE merge leaves a trace. The amended 1786623491782 creates the same
 * table (`IF NOT EXISTS` on both sides) and fills it as it merges, which covers
 * databases that had not yet migrated.
 *
 * ── What this does NOT do ────────────────────────────────────────────────────
 * It does not backfill the merges that already happened. Those loser rows were
 * DELETEd; their ids exist in no table, in no column, in no `raw_data` blob. The
 * mapping is not derivable — only a point-in-time restore of the pre-migration
 * database can produce it. Guessing it is not on the table.
 *
 * It likewise does not re-accent any name. Where a merge kept the de-accented
 * spelling and deleted the accented one, the accented string is simply gone:
 * `raw_data` stores `apolloDetails` (organisation, seniority, employment
 * history) and never the person's name. Reconstructing "Sébastien" from
 * "Sebastien" would mean consulting a dictionary of French first names and
 * writing a guess into a prospect's identity — the one thing worse than showing
 * a name without its accents. The recovery path is re-enrichment from the
 * provider that holds the real spelling (`raw_data.apolloId` → Apollo
 * People-Match by id), which is a fact, not a reconstruction.
 */
export class ContactMergeAudit1786709384712 implements MigrationInterface {
  name = 'ContactMergeAudit1786709384712'

  public async up(queryRunner: QueryRunner): Promise<void> {
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

    // No FK to `contacts`: the winner can itself be merged away later, and a
    // cascade would then delete the very row that explains where it went. The
    // API follows the chain instead.

    // The accent-score helper is created by 1786623491782, but a database that
    // ran the pre-amendment version of that file does not have it. Create it
    // here too so the ordering is stable whichever version was applied.
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contact_merges;`)
    await queryRunner.query(`DROP FUNCTION IF EXISTS bellum_name_accent_score(text);`)
  }
}
