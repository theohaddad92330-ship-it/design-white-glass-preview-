import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1596.6-10 / #1628.1 — LES INDEX de `searchByFilters`, la recherche PAR
 * FILTRE de la mémoire marché.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AJOUT SEULEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette migration ne crée aucune table, ne retire ni ne rétrécit aucune
 * contrainte, et ne touche aucune ligne existante : six index de plus sur des
 * tables déjà en place (`market_company_signal`, `market_company_stack`,
 * `market_esn_client`). `IF NOT EXISTS` partout, pour rester rejouable sans
 * douleur si une exécution partielle a déjà posé l'un d'eux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES INDEX D'EXPRESSION (`lower(...)`), PAS DES INDEX SIMPLES
 * ─────────────────────────────────────────────────────────────────────────────
 * `searchByFilters` compare en `ILIKE` sur une valeur normalisée : un index
 * B-tree ordinaire sur `techno`, `esn_name`, `city`, `region` ou `country` ne
 * sert à rien face à une comparaison insensible à la casse. Un index sur
 * `lower(colonne)` correspond exactement à `WHERE lower(colonne) ILIKE
 * lower(:valeur)` — et reste un index BTREE ordinaire, pas une extension à
 * activer.
 *
 * ⚠️ Un `ILIKE '%motif%'` (les deux côtés du terme entourés de `%`) ne peut de
 * toute façon PAS emprunter un index B-tree, expression ou non — seul un index
 * trigramme (extension `pg_trgm`, non installée ici) le pourrait. Ces index
 * accélèrent donc le cas fréquent d'un terme qui commence pareil
 * (`ILIKE 'paris%'`) et la recherche EXACTE insensible à la casse ; le corpus
 * de la mémoire marché reste de taille modeste, et une recherche par filtre
 * n'est pas un `SELECT *` sans borne — elle porte déjà un `LIMIT` et le seuil
 * `paths_total >= 3`. Élargir au trigramme reste possible plus tard, en ADD
 * seul, le jour où le volume le justifie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `role_families` : GIN, PAS D'EXPRESSION
 * ─────────────────────────────────────────────────────────────────────────────
 * La colonne est un jsonb `[{ family, persons }]` (voir l'entité). Un GIN sur
 * la colonne entière couvre les recherches de containment (`@>`) que ce
 * chantier n'exploite pas encore lui-même (`searchByFilters` déplie le tableau
 * avec `jsonb_array_elements` pour comparer `family` insensible à la casse),
 * mais c'est l'index STANDARD pour ce type de colonne et il ne coûte qu'à
 * l'écriture — laquelle n'existe pas ici (table en lecture seule côté
 * application, écrite seulement par l'import). Il profite immédiatement à
 * toute requête future qui testerait `role_families @> '[{"family":"Data"}]'`.
 */
export class MarketMemorySearchIndexes1791935000000 implements MigrationInterface {
  public name = 'MarketMemorySearchIndexes1791935000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `market_company_signal` — effectif, zone observée, familles de rôles.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_company_signal_headcount_min ON market_company_signal (headcount_min)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_company_signal_headcount_max ON market_company_signal (headcount_max)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_company_signal_city_lower ON market_company_signal (lower(city))`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_company_signal_region_lower ON market_company_signal (lower(region))`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_company_signal_country_lower ON market_company_signal (lower(country))`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_company_signal_role_families_gin ON market_company_signal USING gin (role_families)`,
    )

    // `market_company_stack` — la jointure de `technology` (EXISTS corrélé sur
    // `company_key`, déjà indexé depuis `MarketMemory1791743186247` ; ce qui
    // manquait était la comparaison insensible à la casse sur `techno`).
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_company_stack_techno_lower ON market_company_stack (lower(techno))`,
    )

    // `market_esn_client` — le filtre `esn` compare le LIBELLÉ (`esn_name`),
    // pas la clé corpus `esn_key` (déjà indexée) : un commercial tape
    // « Capgemini », pas la clé interne du corpus.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_esn_client_esn_name_lower ON market_esn_client (lower(esn_name))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Symétrique de `up` — retirer un index ne perd aucune donnée.
    await queryRunner.query(`DROP INDEX IF EXISTS idx_market_esn_client_esn_name_lower`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_market_company_stack_techno_lower`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_market_company_signal_role_families_gin`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_market_company_signal_country_lower`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_market_company_signal_region_lower`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_market_company_signal_city_lower`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_market_company_signal_headcount_max`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_market_company_signal_headcount_min`)
  }
}
