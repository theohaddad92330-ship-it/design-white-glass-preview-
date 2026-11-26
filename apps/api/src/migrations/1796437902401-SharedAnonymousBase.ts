import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * P05 (#3246, lot du 09/10/2026) — LA BASE ANONYME COMMUNE ENTRE ESPACES.
 * Renversement de doctrine daté (Louis 09/10/2026) : `c92_base_anonyme_commune`.
 *
 * Trois tables d'AGRÉGATS, jamais une ligne brute copiée d'un espace :
 *  · `shared_action_outcome_aggregates` (P05.a) — issues déclarées des actions
 *    par cadence / route / priorité, coupées par secteur (division NAF) et
 *    catégorie de taille INSEE ;
 *  · `shared_case_outcome_aggregates` (P05.b) — cas gagnés / perdus par
 *    secteur, taille, position de groupe ;
 *  · `shared_signal_deal_aggregates` (P05.c) — un type de signal suivi d'une
 *    affaire ouverte sous 90 jours.
 *
 * Les garde-fous sont dans le SCHÉMA, pas seulement dans le code qui écrit :
 *  · aucune colonne de portée ni d'identité (`workspace_id`, `account_id`,
 *    nom…) — GA-43 le relit ;
 *  · `contributing_workspaces >= 3` — une cellule portée par moins de trois
 *    espaces est REFUSÉE par PostgreSQL ;
 *  · chaque colonne texte est un JETON fermé (`IN (…)` ou motif `^[a-z]…`) :
 *    une raison sociale, un nom de personne, une phrase n'y entrent pas ;
 *  · `scope` sépare la salle de démonstration du réel (craft rule 9).
 *
 * Contraintes NOMMÉES (GA-177), déclarées à GA-12, posées ICI avant tout code
 * qui écrit (GA-11). RLS activée sans politique : seul le service (clé de
 * service) lit et écrit ; aucun client ne lit ces tables en direct.
 */
export class SharedAnonymousBase1796437902401 implements MigrationInterface {
  public name = 'SharedAnonymousBase1796437902401'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shared_action_outcome_aggregates (
        scope text NOT NULL,
        dimension text NOT NULL,
        value text NOT NULL,
        sector_key text NOT NULL,
        size_band text NOT NULL,
        positive integer NOT NULL,
        judged integer NOT NULL,
        contributing_workspaces integer NOT NULL,
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (scope, dimension, value, sector_key, size_band),
        CONSTRAINT shared_action_outcome_aggregates_scope_check CHECK (scope IN ('live', 'demo')),
        CONSTRAINT shared_action_outcome_aggregates_dimension_check CHECK (dimension IN ('cadence', 'route', 'priority')),
        CONSTRAINT shared_action_outcome_aggregates_size_band_check CHECK (size_band IN ('all', 'tpe', 'pme', 'eti', 'ge')),
        CONSTRAINT shared_action_outcome_aggregates_value_token_check CHECK (value ~ '^[a-z][a-z0-9_]{0,47}$'),
        CONSTRAINT shared_action_outcome_aggregates_sector_token_check CHECK (sector_key ~ '^[a-z][a-z0-9_]{0,47}$'),
        CONSTRAINT shared_action_outcome_aggregates_counts_check CHECK (positive >= 0 AND judged >= positive),
        CONSTRAINT shared_action_outcome_aggregates_k_check CHECK (contributing_workspaces >= 3)
      )
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shared_case_outcome_aggregates (
        scope text NOT NULL,
        dimension text NOT NULL,
        value text NOT NULL,
        won integer NOT NULL,
        lost integer NOT NULL,
        contributing_workspaces integer NOT NULL,
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (scope, dimension, value),
        CONSTRAINT shared_case_outcome_aggregates_scope_check CHECK (scope IN ('live', 'demo')),
        CONSTRAINT shared_case_outcome_aggregates_dimension_check CHECK (dimension IN ('sector', 'size', 'group_role')),
        CONSTRAINT shared_case_outcome_aggregates_value_token_check CHECK (value ~ '^[a-z][a-z0-9_]{0,47}$'),
        CONSTRAINT shared_case_outcome_aggregates_counts_check CHECK (won >= 0 AND lost >= 0),
        CONSTRAINT shared_case_outcome_aggregates_k_check CHECK (contributing_workspaces >= 3)
      )
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shared_signal_deal_aggregates (
        scope text NOT NULL,
        signal_type text NOT NULL,
        sector_key text NOT NULL,
        signals integer NOT NULL,
        followed_by_deal integer NOT NULL,
        window_days integer NOT NULL,
        contributing_workspaces integer NOT NULL,
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (scope, signal_type, sector_key),
        CONSTRAINT shared_signal_deal_aggregates_scope_check CHECK (scope IN ('live', 'demo')),
        CONSTRAINT shared_signal_deal_aggregates_signal_token_check CHECK (signal_type ~ '^[a-z][a-z0-9_]{0,47}$'),
        CONSTRAINT shared_signal_deal_aggregates_sector_token_check CHECK (sector_key ~ '^[a-z][a-z0-9_]{0,47}$'),
        CONSTRAINT shared_signal_deal_aggregates_counts_check CHECK (followed_by_deal >= 0 AND signals >= followed_by_deal AND window_days > 0),
        CONSTRAINT shared_signal_deal_aggregates_k_check CHECK (contributing_workspaces >= 3)
      )
    `)
    for (const table of [
      'shared_action_outcome_aggregates',
      'shared_case_outcome_aggregates',
      'shared_signal_deal_aggregates',
    ]) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    }
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
