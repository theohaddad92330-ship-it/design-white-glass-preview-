import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Staging DATAFORGE V10 (mail Théo du 24/08, `agent_docs/dataforge-v10-plan.md`).
 *
 * Deux tables PARTAGÉES (GA-16 — le pack décrit le MARCHÉ, pas un espace) :
 *
 * - `dataforge_accounts` : 1 195 comptes, les colonnes `account__*` que le CSV
 *   répète 66 fois normalisées ici UNE fois. Porte `resolution_status` : seuls
 *   4 comptes arrivent avec un vrai SIREN (mesuré — 30 autres portent un
 *   marque-place « à compléter »), le reste se résout en tâche de fond par
 *   lots (mécanique `esn_directory`), et le mapping vers les comptes Bellum se
 *   fait par SIREN — jamais par nom (doctrine tome 2).
 * - `dataforge_account_domains` : 78 870 lignes compte × domaine, chacune avec
 *   son tier de preuve (A/B/C/D) et ses policies d'usage écrites par le pack.
 *   97,5 % sont des priors sectoriels (Tier D) qui ne s'affichent JAMAIS comme
 *   des faits.
 *
 * Pas de contrainte CHECK sur le tier : la table est du staging et le parseur
 * (`dataforge-csv.ts`) est la porte — une valeur hors {A,B,C,D} écarte la ligne
 * avec sa raison au lieu de faire tomber une insertion par lot de 1 000.
 */
export class DataforgeStaging1790000841267 implements MigrationInterface {
  name = 'DataforgeStaging1790000841267'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dataforge_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        data_version text NOT NULL,
        source_id text NOT NULL,
        name text NOT NULL,
        normalized_name text NOT NULL,
        group_name text,
        sector text,
        cluster_id text,
        cluster_primary_id text,
        is_cluster_primary boolean NOT NULL DEFAULT false,
        is_duplicate_variant boolean NOT NULL DEFAULT false,
        siren text,
        siren_siret_raw text,
        website text,
        procurement_route text,
        procurement_policy text,
        procurement_inheritance_warning text,
        market_role text,
        research_tier text,
        tier_a_domain_count integer,
        tier_b_domain_count integer,
        account_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        resolution_status text NOT NULL DEFAULT 'pending',
        resolution_reason text,
        legal_name text,
        naf_code text,
        resolved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS dataforge_accounts_source_id_unique ON dataforge_accounts (source_id)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS dataforge_accounts_siren_idx ON dataforge_accounts (siren)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dataforge_account_domains (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        data_version text NOT NULL,
        source_id text NOT NULL,
        domain_code text NOT NULL,
        evidence_tier text NOT NULL,
        evidence_status text,
        user_claim_policy text,
        scoring_policy text,
        sector_prior_demand_score real,
        sector_prior_externalization_score real,
        public_activity_signal_score real,
        demand_intensity_score real,
        externalizable_demand_score real,
        internal_competition_score real,
        direct_access_score real,
        mediated_access_score real,
        commercial_opportunity_score real,
        data_confidence_score real,
        evidence_item_count integer,
        strongest_evidence_strength text,
        median_observed_tjm real,
        buyer_personas text,
        likely_contract_models text,
        qualification_or_barriers text,
        evidence_summary text,
        evidence_sources text,
        manual_verification_task text,
        domain_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // Idempotence de l'ingestion : rejouer le script ne duplique rien.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS dataforge_account_domains_unique
         ON dataforge_account_domains (source_id, domain_code, data_version)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS dataforge_account_domains_source_idx ON dataforge_account_domains (source_id)`,
    )
    // La lecture produit filtre toujours par tier (les D restent en scoring interne).
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS dataforge_account_domains_tier_idx ON dataforge_account_domains (evidence_tier)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS dataforge_account_domains`)
    await queryRunner.query(`DROP TABLE IF EXISTS dataforge_accounts`)
  }
}
