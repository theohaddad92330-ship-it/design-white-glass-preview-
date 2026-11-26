import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4067 — lot DECOUVRIR-COLLECTE (Louis 13/10) : le cache PARTAGÉ des faits publics.
 *
 * La table `source_cache` est créée par le service IA à sa première utilisation
 * (`apps/ia/app/services/source_cache.py`, DDL idempotente, patron `checkpoints*`).
 * Elle devient la « base interne » des faits PUBLICS par entreprise, relue par
 * TOUS les espaces (`public_facts.py`) — elle n'avait ni RLS ni aucune garde SQL.
 *
 * Ajout seulement :
 * - `CREATE TABLE IF NOT EXISTS` à la forme EXACTE du DDL IA (no-op si elle existe) ;
 * - RLS ACTIVÉE, SANS politique : aucun rôle client (`anon`, `authenticated`) ne la
 *   lit ni ne l'écrit ; seul le service (propriétaire / rôle de service) y accède ;
 * - la base dit NON à une famille privée d'un espace (CRM, notes, documents, Drive,
 *   missions, corrections, listes…) — frontière non négociable, tenue aussi en SQL ;
 * - les natures de faits publics sont bornées (mêmes listes que `public_facts.py`,
 *   relues par `apps/ia/tests/test_public_facts.py`). Posée ICI, avant toute
 *   écriture `public_facts` en production (GA-11/GA-12).
 */
export class SourceCachePublicFactsBoundary1796461934273 implements MigrationInterface {
  public name = 'SourceCachePublicFactsBoundary1796461934273'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS source_cache (
        company_key TEXT NOT NULL,
        source      TEXT NOT NULL,
        category    TEXT NOT NULL DEFAULT '',
        payload     JSONB NOT NULL,
        fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at  TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (source, category, company_key)
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS source_cache_expires_at_idx ON source_cache (expires_at)`)
    await queryRunner.query(`ALTER TABLE source_cache ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`ALTER TABLE source_cache DROP CONSTRAINT IF EXISTS source_cache_no_private_family`)
    await queryRunner.query(`
      ALTER TABLE source_cache
      ADD CONSTRAINT source_cache_no_private_family
      CHECK (source NOT IN ('crm', 'notes', 'documents', 'drive', 'missions', 'corrections', 'lists', 'contacts', 'signal_history'))
    `)
    await queryRunner.query(`ALTER TABLE source_cache DROP CONSTRAINT IF EXISTS source_cache_public_fact_natures`)
    await queryRunner.query(`
      ALTER TABLE source_cache
      ADD CONSTRAINT source_cache_public_fact_natures
      CHECK (source <> 'public_facts' OR category IN ('jobs', 'news', 'legal', 'tenders', 'registry'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE source_cache DROP CONSTRAINT IF EXISTS source_cache_public_fact_natures`)
    await queryRunner.query(`ALTER TABLE source_cache DROP CONSTRAINT IF EXISTS source_cache_no_private_family`)
    await queryRunner.query(`ALTER TABLE source_cache DISABLE ROW LEVEL SECURITY`)
  }
}
