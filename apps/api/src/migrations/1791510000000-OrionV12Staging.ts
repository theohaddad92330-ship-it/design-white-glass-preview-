import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Staging ORION_DATAPACK_V12 (comparaison avec DATAFORGE V10 du 31/08/2026,
 * `agent_docs/orion-v12-2026-08-31.md`).
 *
 * ORION V12 est le SUCCESSEUR du pack DATAFORGE V10 déjà partiellement ingéré
 * (`1790000841267-DataforgeStaging.ts`) : même espace de clés `DF-XXXX`
 * (`bellum_account_source_id` = `account_id`), même grain compte × domaine
 * (78 870 = 1 195 × 66) pour son propre `30_FAIT_COMPTE_DOMAINE_V10.csv` — ce
 * fichier-là n'est PAS ré-ingéré ici : c'est une décomposition normalisée du
 * MÊME CSV canonique à 158 colonnes que `ingest-dataforge.ts` sait déjà lire,
 * pas une deuxième donnée. Ce lot ajoute trois CAPACITÉS nouvelles que
 * DATAFORGE V10 ne portait pas :
 *
 * - `dataforge_rag_chunks` (`5_RAG/50_CHUNKS_INDEXABLES.csv`) : 3 849 unités de
 *   texte prêtes à vectoriser. `account_id` est NULL par construction sur les
 *   20 chunks `GARDE_FOU_QUALITE` (une alerte qualité globale) et 87 chunks de
 *   référentiel/gatekeeper — jamais un oubli d'ingestion.
 * - `dataforge_account_statuses` (`1_COMPTES/10_COMPTES_MASTER.csv`) : le
 *   statut de sales-readiness de 1 195 comptes (`statut_code`, 9 valeurs
 *   fermées) — DIFFÉRENT de `dataforge_accounts` (qui porte les attributs bruts
 *   V10), rejoint par le même `source_id`, sans contrainte FK (les deux packs
 *   s'ingèrent indépendamment).
 * - `dataforge_data_anomalies` (`6_QUALITE/60_ANOMALIES_ET_CORRECTIONS.csv`) :
 *   20 anomalies dont 6 critiques (mesuré — le pack et la demande initiale en
 *   annonçaient 7).
 *
 * Toutes PARTAGÉES (GA-16, même raison que DATAFORGE V10) : un référentiel de
 * marché, pas le portefeuille d'un client.
 *
 * GA-11/GA-12 : les listes fermées (`statut_code`, `severite`) sont posées ICI,
 * en CHECK, avant tout code qui écrit une ligne — jamais l'inverse.
 */
export class OrionV12Staging1791510000000 implements MigrationInterface {
  name = 'OrionV12Staging1791510000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dataforge_rag_chunks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        data_version text NOT NULL,
        chunk_id text NOT NULL,
        account_id text,
        entreprise text,
        type_chunk text NOT NULL,
        titre text,
        texte text NOT NULL,
        source text,
        niveau_confiance text,
        date_verification text,
        priorite_indexation smallint NOT NULL,
        longueur integer,
        -- extensions.vector : l'extension pgvector est déjà créée dans ce
        -- schéma par 1767225600000-Init.ts — pas de second CREATE EXTENSION.
        -- Pas d'index ivfflat : à 3849 lignes, un balayage séquentiel avec
        -- distance cosinus est trivial, et un ivfflat construit sur une table
        -- VIDE (avant que l'opérateur lance l'ingestion) resterait dégradé
        -- jusqu'à un REINDEX manuel -- un coût opérationnel pour un gain nul
        -- à ce volume.
        embedding extensions.vector(1536),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT dataforge_rag_chunks_priorite_check CHECK (priorite_indexation IN (0, 1, 2))
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS dataforge_rag_chunks_chunk_id_unique ON dataforge_rag_chunks (chunk_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS dataforge_rag_chunks_account_idx ON dataforge_rag_chunks (account_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS dataforge_rag_chunks_type_idx ON dataforge_rag_chunks (type_chunk)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS dataforge_rag_chunks_priorite_idx ON dataforge_rag_chunks (priorite_indexation)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dataforge_account_statuses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        data_version text NOT NULL,
        source_id text NOT NULL,
        snapshot text,
        entreprise text,
        company_normalized_name text,
        legal_name text,
        siren_siret text,
        group_name text,
        sector text,
        city text,
        headquarters text,
        size_category text,
        website text,
        account_market_role text,
        statut_code text NOT NULL,
        statut_cible text,
        penetrabilite_score real,
        platform_consolidated text,
        platform_source text,
        barriere_plateforme boolean NOT NULL DEFAULT false,
        barriere_publique boolean NOT NULL DEFAULT false,
        procurement_page text,
        supplier_portal text,
        referencing_name text,
        referencing_process_found text,
        sales_accessibility_level text,
        sales_accessibility_score real,
        account_potential_score real,
        it_signal_score real,
        procurement_visibility_score real,
        data_confidence_score real,
        priority_level text,
        recommended_entry_point text,
        recommended_persona text,
        recommended_strategy text,
        next_action text,
        main_risk text,
        internal_contacts_count integer,
        internal_missions_count integer,
        internal_decideurs_count integer,
        chaleur_interne integer,
        couverture_v9 integer,
        couverture_orion integer,
        couverture_totale integer,
        jamais_enrichi boolean NOT NULL DEFAULT false,
        est_doublon boolean NOT NULL DEFAULT false,
        doublon_de text,
        v10_cluster_id text,
        v10_cluster_primary_id text,
        v10_cluster_size integer,
        enrichment_status text,
        enrichment_batch text,
        last_checked text,
        source_quality text,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        -- Neuf valeurs mesurées le 31/08/2026 sur les 1 195 lignes du pack —
        -- somme exacte. GA-08 : n'en retire jamais une, n'en insère jamais une
        -- au milieu ; ajouter n'est possible qu'à la fin de la liste.
        CONSTRAINT dataforge_account_statuses_statut_code_check CHECK (statut_code IN (
          'CIBLE_PRIORITAIRE',
          'CIBLE_SECONDAIRE',
          'CANAL_PARTENAIRE',
          'VERROUILLE_PLATEFORME',
          'VERROUILLE_PUBLIC',
          'VERROUILLE_IT_EXTERNALISEE',
          'EXCLU_ESN_EDITEUR',
          'EXCLU_DOUBLON',
          'A_QUALIFIER'
        ))
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS dataforge_account_statuses_source_id_unique ON dataforge_account_statuses (source_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS dataforge_account_statuses_statut_code_idx ON dataforge_account_statuses (statut_code)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dataforge_data_anomalies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        data_version text NOT NULL,
        anomalie_id text NOT NULL,
        code text NOT NULL,
        portee text,
        objet text,
        constat text,
        impact_commercial text,
        action_recommandee text,
        severite text NOT NULL,
        source text,
        detecte_le text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT dataforge_data_anomalies_severite_check CHECK (severite IN ('CRITIQUE', 'MAJEUR', 'MINEUR'))
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS dataforge_data_anomalies_anomalie_id_unique ON dataforge_data_anomalies (anomalie_id)`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS dataforge_data_anomalies_code_unique ON dataforge_data_anomalies (code)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS dataforge_data_anomalies_severite_idx ON dataforge_data_anomalies (severite)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS dataforge_data_anomalies`)
    await queryRunner.query(`DROP TABLE IF EXISTS dataforge_account_statuses`)
    await queryRunner.query(`DROP TABLE IF EXISTS dataforge_rag_chunks`)
  }
}
