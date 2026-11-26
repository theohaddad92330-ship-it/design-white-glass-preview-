import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2151.3 / .6 / .7 / .10 / .11 / .12 — les recherches enregistrées de Découvrir
 * rejoignent `saved_views`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS UNE TABLE NEUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une recherche enregistrée de Découvrir EST une vue enregistrée : un nom, des
 * critères, un propriétaire, un partage. `saved_views` portait déjà les quatre
 * — avec sa borne, ses trois routes et son `owner_id` — et n'avait qu'un seul
 * appelant web. Créer `discover_saved_searches` aurait fait un second mécanisme
 * pour un besoin, donc deux bornes, deux partages et deux façons de diverger.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTE « AJOUT SEULEMENT »
 * ─────────────────────────────────────────────────────────────────────────────
 * La contrainte de scope s'ÉLARGIT (elle ne perd aucune valeur, GA-11), les
 * quatre colonnes arrivent NULLABLES ou avec un défaut — une colonne `NOT NULL`
 * sans défaut casserait les vues déjà enregistrées par les autres écrans.
 *
 * `alert_frequency` vaut `manual` par défaut et `alert_channel` reste `NULL` :
 * une alerte ne s'allume pas parce que quelqu'un a enregistré un filtre, et
 * « aucun canal » n'est pas « dans l'application ».
 *
 * `last_run_at` reste `NULL` tant que le périmètre n'a pas été rejoué. Le
 * remplir avec `created_at` inventerait une exécution qui n'a pas eu lieu.
 */
export class DiscoverSavedSearches1793700500000 implements MigrationInterface {
  name = 'DiscoverSavedSearches1793700500000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. La contrainte s'élargit AVANT le code qui écrit (GA-11 / GA-12).
    await queryRunner.query(`ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_scope_check`)
    await queryRunner.query(`
      ALTER TABLE saved_views ADD CONSTRAINT saved_views_scope_check
        CHECK (scope IN ('accounts', 'contacts', 'projects', 'talents', 'missions', 'discover'))
    `)

    // 2. Les quatre champs qu'un périmètre rejouable porte en plus d'un filtre.
    await queryRunner.query(`ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS objective text`)
    await queryRunner.query(
      `ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS alert_frequency text NOT NULL DEFAULT 'manual'`,
    )
    await queryRunner.query(`ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS alert_channel text`)
    await queryRunner.query(`ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS last_run_at timestamptz`)

    await queryRunner.query(`ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_alert_frequency_check`)
    await queryRunner.query(`
      ALTER TABLE saved_views ADD CONSTRAINT saved_views_alert_frequency_check
        CHECK (alert_frequency IN ('manual', 'daily', 'weekly'))
    `)
    await queryRunner.query(`ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_alert_channel_check`)
    await queryRunner.query(`
      ALTER TABLE saved_views ADD CONSTRAINT saved_views_alert_channel_check
        CHECK (alert_channel IS NULL OR alert_channel IN ('in_app', 'email', 'sms'))
    `)
  }

  /**
   * On retire ce que cette migration a ajouté, et RIEN de plus : la contrainte
   * de scope revient à ses cinq valeurs d'origine — ce qui suppose qu'aucune
   * ligne `discover` ne subsiste, donc le retrait des lignes d'abord. Retirer
   * les colonnes détruirait des objectifs écrits par des gens : c'est le prix
   * assumé d'un `down`, qui ne se joue qu'à la main.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_alert_channel_check`)
    await queryRunner.query(`ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_alert_frequency_check`)
    await queryRunner.query(`ALTER TABLE saved_views DROP COLUMN IF EXISTS last_run_at`)
    await queryRunner.query(`ALTER TABLE saved_views DROP COLUMN IF EXISTS alert_channel`)
    await queryRunner.query(`ALTER TABLE saved_views DROP COLUMN IF EXISTS alert_frequency`)
    await queryRunner.query(`ALTER TABLE saved_views DROP COLUMN IF EXISTS objective`)
    await queryRunner.query(`DELETE FROM saved_views WHERE scope = 'discover'`)
    await queryRunner.query(`ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_scope_check`)
    await queryRunner.query(`
      ALTER TABLE saved_views ADD CONSTRAINT saved_views_scope_check
        CHECK (scope IN ('accounts', 'contacts', 'projects', 'talents', 'missions'))
    `)
  }
}
