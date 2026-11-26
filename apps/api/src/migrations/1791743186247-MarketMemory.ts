import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LA MÉMOIRE MARCHÉ BELLUM — quatre tables PARTAGÉES, en lecture seule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI AUCUNE NE PORTE `workspace_id`
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce qu'elles portent est un fait de MARCHÉ : quelles entreprises ont vu passer
 * des parcours, quelles sociétés de services gravitent autour d'elles, quelles
 * technologies y ont été citées. C'est identique pour tous les espaces, et le
 * stocker par espace multiplierait soixante mille lignes par client pour un
 * contenu strictement égal. La décision est déclarée dans `table-scopes.ts`
 * (GA-16), avec sa raison — jamais en silence.
 *
 * Ce qui appartient à un espace reste scopé : le compte suivi (`accounts`), ses
 * faits d'accès (`access_facts`), ses corrections. Et une correction d'espace
 * PRIME sur l'observation partagée à la lecture, sans jamais la réécrire : on ne
 * modifie pas une mémoire commune depuis un seul espace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS CHOIX DE SCHÉMA QUI PORTENT UNE DOCTRINE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **`externalization_score` et `rotation_ratio` sont NULLABLE, sans DEFAULT.**
 *    Un `DEFAULT 0` transformerait « pas assez d'observations pour noter » en
 *    « noté zéro » — l'exacte confusion que la doctrine interdit. La colonne
 *    n'a pas de valeur par défaut parce que l'absence est une réponse.
 *
 * 2. **Aucune colonne d'identité de personne, nulle part.** Les quatre tables ne
 *    portent que des comptages agrégés par organisation. Le fichier d'identités
 *    et de coordonnées livré avec le corpus n'est pas importé : sa base légale
 *    de collecte, l'information des personnes concernées et la finalité n'ont
 *    pas été tranchées, et aucun usage produit n'en a besoin. Ce qui n'est pas
 *    dans le schéma ne peut pas fuiter.
 *
 * 3. **`corpus_label` est une colonne d'AUDIT.** Elle existe pour qu'on sache
 *    d'où vient une ligne. Aucune lecture produit ne la rend, et aucune n'a le
 *    droit de la rendre : une date de corpus n'apporte rien à l'utilisateur et
 *    fait douter d'un signal qui est frais. C'est pour ça qu'elle ne remonte
 *    dans aucun schéma de `market-memory.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne crée aucun `account`, n'en fusionne aucun, et ne pose aucune clé
 * étrangère vers `accounts`. Le rattachement d'une entreprise du corpus à un
 * compte de portefeuille se fait à la LECTURE, par clé résolue. Poser la
 * jointure en base ouvrirait un second chemin d'écriture vers `accounts` — et
 * deux homonymes du corpus ont déjà toutes les chances de désigner deux
 * entreprises différentes.
 */
export class MarketMemory1791743186247 implements MigrationInterface {
  public name = 'MarketMemory1791743186247'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_company_signal (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_key text NOT NULL,
        company_name text NOT NULL,
        is_service_company boolean NOT NULL DEFAULT false,
        paths_total integer NOT NULL DEFAULT 0,
        paths_current integer NOT NULL DEFAULT 0,
        paths_past integer NOT NULL DEFAULT 0,
        externalization_score numeric NULL,
        role_families jsonb NOT NULL DEFAULT '[]'::jsonb,
        headcount_bracket text NULL,
        headcount_min integer NULL,
        headcount_max integer NULL,
        city text NULL,
        region text NULL,
        country text NULL,
        website text NULL,
        website_domain text NULL,
        match_key text NOT NULL,
        esn_observed_count integer NOT NULL DEFAULT 0,
        technos_observed_count integer NOT NULL DEFAULT 0,
        ex_esn_present integer NOT NULL DEFAULT 0,
        rotation_ratio numeric NULL,
        has_ceased boolean NOT NULL DEFAULT false,
        connector_count integer NOT NULL DEFAULT 0,
        corpus_label text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_market_company_signal_key ON market_company_signal (company_key)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_company_signal_domain ON market_company_signal (website_domain)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_company_signal_match ON market_company_signal (match_key)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_esn_client (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        esn_key text NOT NULL,
        esn_name text NOT NULL,
        client_key text NOT NULL,
        client_name text NOT NULL,
        persons integer NOT NULL,
        corpus_label text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_market_esn_client_pair ON market_esn_client (esn_key, client_key)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_market_esn_client_esn ON market_esn_client (esn_key)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_market_esn_client_client ON market_esn_client (client_key)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_company_stack (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_key text NOT NULL,
        techno text NOT NULL,
        persons integer NOT NULL,
        corpus_label text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_market_company_stack_pair ON market_company_stack (company_key, techno)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_company_stack_company ON market_company_stack (company_key)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_ex_esn_at_client (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        esn_origin_key text NOT NULL,
        esn_origin_name text NOT NULL,
        client_key text NOT NULL,
        client_name text NOT NULL,
        persons integer NOT NULL,
        corpus_label text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_market_ex_esn_pair ON market_ex_esn_at_client (esn_origin_key, client_key)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_ex_esn_client ON market_ex_esn_at_client (client_key)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_ex_esn_origin ON market_ex_esn_at_client (esn_origin_key)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS market_ex_esn_at_client`)
    await queryRunner.query(`DROP TABLE IF EXISTS market_company_stack`)
    await queryRunner.query(`DROP TABLE IF EXISTS market_esn_client`)
    await queryRunner.query(`DROP TABLE IF EXISTS market_company_signal`)
  }
}
