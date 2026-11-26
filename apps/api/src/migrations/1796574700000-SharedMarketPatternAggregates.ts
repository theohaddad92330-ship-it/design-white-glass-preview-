import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4286.15.c — `market_pattern` : LES TENDANCES DE MARCHÉ ENTRE ESPACES (décision Louis 22/10/2026,
 * `c127_market_pattern_tendances_entre_espaces`, contrat `market-pattern.ts`).
 *
 * Une table d'AGRÉGATS de la base anonyme commune, de la même famille que
 * `SharedAnonymousBase1796437902401` — les garde-fous sont dans le SCHÉMA, posés ICI avant le code qui
 * écrit (GA-11 / GA-12), et GA-43 les relit :
 *  · une cellule = (famille de métier recruté, secteur NAF, taille INSEE, région) — chaque colonne texte
 *    est un vocabulaire FERMÉ ; `all` est la cellule « tous » ;
 *  · des COMPTES (`observations`), jamais un taux, un coût, un prix ni un TJM ;
 *  · `contributing_workspaces >= 3` — sous trois espaces, PostgreSQL refuse la ligne (k-anonymat) ;
 *  · aucune colonne de portée ni d'identité (espace, client, nom) ; `scope` sépare la salle de démo du réel.
 *
 * ADDITIVE (une table neuve). Contraintes NOMMÉES (GA-177). RLS activée sans politique : seul le service
 * (clé de service) lit et écrit.
 */
export class SharedMarketPatternAggregates1796574700000 implements MigrationInterface {
  public name = 'SharedMarketPatternAggregates1796574700000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shared_market_pattern_aggregates (
        scope text NOT NULL,
        topic text NOT NULL,
        sector_key text NOT NULL,
        size_band text NOT NULL,
        region_key text NOT NULL,
        observations integer NOT NULL,
        window_days integer NOT NULL,
        contributing_workspaces integer NOT NULL,
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (scope, topic, sector_key, size_band, region_key),
        CONSTRAINT shared_market_pattern_aggregates_scope_check CHECK (scope IN ('live', 'demo')),
        CONSTRAINT shared_market_pattern_aggregates_topic_check CHECK (topic IN ('web', 'mobile', 'systemes', 'data', 'cloud', 'securite', 'progiciels', 'pilotage')),
        CONSTRAINT shared_market_pattern_aggregates_sector_token_check CHECK (sector_key ~ '^[a-z][a-z0-9_]{0,47}$' AND sector_key ~ '^(all|naf_[0-9]{2})$'),
        CONSTRAINT shared_market_pattern_aggregates_size_band_check CHECK (size_band IN ('all', 'tpe', 'pme', 'eti', 'ge')),
        CONSTRAINT shared_market_pattern_aggregates_region_key_check CHECK (region_key IN ('all', 'ile_de_france', 'auvergne_rhone_alpes', 'hauts_de_france', 'pays_de_la_loire', 'nouvelle_aquitaine', 'occitanie', 'provence_alpes_cote_d_azur', 'grand_est', 'bretagne', 'normandie', 'centre_val_de_loire', 'bourgogne_franche_comte', 'corse')),
        CONSTRAINT shared_market_pattern_aggregates_counts_check CHECK (observations > 0 AND window_days > 0),
        CONSTRAINT shared_market_pattern_aggregates_k_check CHECK (contributing_workspaces >= 3)
      )
    `)
    await queryRunner.query(`ALTER TABLE shared_market_pattern_aggregates ENABLE ROW LEVEL SECURITY`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
