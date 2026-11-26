import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * CE QU'UNE ALERTE SURVEILLE — #2151.14 à .25, #2166.66 à .70 (16/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX CHOSES, ET ELLES VONT ENSEMBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. `discover_alert_events` — la mémoire des faits apparus. Sans elle, une
 *    alerte de Découvrir ne pouvait sonner que sur une horloge : chaque jour,
 *    y compris les jours où rien n'était apparu.
 * 2. `saved_views.result_type` — #2151.5, ce que le périmètre RAMÈNE. Nullable
 *    et sans défaut : « personne ne l'a qualifié » est un état, et retomber sur
 *    `accounts` attribuerait un choix à qui n'en a fait aucun.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INDEX UNIQUE EST LA FONCTIONNALITÉ, PAS UNE OPTIMISATION
 * ─────────────────────────────────────────────────────────────────────────────
 * `(workspace_id, event_key)` est ce qui tient #2151.25 : un même événement
 * re-détecté au balayage suivant ne produit pas une seconde arrivée. Le tenir
 * par une lecture préalable (« l'ai-je déjà vu ? ») ne marcherait pas : deux
 * répliques qui lisent en même temps voient toutes les deux « non ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTE « AJOUT SEULEMENT » (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Une table neuve, une colonne nullable, deux contraintes de valeur qui portent
 * sur des colonnes que ce lot crée. Rien n'est retiré, rien n'est resserré,
 * aucune ligne existante n'est réécrite. Les `CHECK` listent les valeurs
 * d'aujourd'hui et s'élargissent AVANT le code qui en écrirait une de plus —
 * jamais l'inverse.
 */
export class DiscoverAlertEvents1794200000001 implements MigrationInterface {
  name = 'DiscoverAlertEvents1794200000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS discover_alert_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        kind text NOT NULL,
        event_key text NOT NULL,
        subject_id uuid,
        subject_label text NOT NULL DEFAULT '',
        saved_view_id uuid,
        surface text,
        occurred_at timestamptz NOT NULL,
        acknowledged_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    // #2151.25 — LA garantie anti-doublon. `IF NOT EXISTS` pour que le rejeu
    // d'une migration sur une base déjà migrée ne casse pas.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS discover_alert_events_workspace_key_uidx
        ON discover_alert_events (workspace_id, event_key)
    `)
    // La lecture d'Aujourd'hui et celle du panneau de Découvrir portent toutes
    // deux sur (espace, date) : sans cet index, elles balaient la table.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS discover_alert_events_workspace_occurred_idx
        ON discover_alert_events (workspace_id, occurred_at DESC)
    `)

    // Les sept genres d'aujourd'hui. ⚠️ Un genre AJOUTÉ au contrat élargit
    // cette contrainte AVANT que le code ne l'écrive (GA-11 / GA-12).
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE discover_alert_events
          ADD CONSTRAINT discover_alert_events_kind_check
          CHECK (kind IN ('new_signal','new_matching_company','new_confirmed_need',
                          'new_relationship','analysis_refreshed','mission_ended','new_access_path'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
    // Les trois surfaces de DÉLIVRANCE. `laura` n'y est pas, et c'est le point :
    // elle LIT les événements, elle n'en délivre aucun (#2151.25).
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE discover_alert_events
          ADD CONSTRAINT discover_alert_events_surface_check
          CHECK (surface IS NULL OR surface IN ('today','notification','outbound'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // #2151.5 — le type de résultat d'un périmètre enregistré.
    await queryRunner.query(`ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS result_type text`)
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE saved_views
          ADD CONSTRAINT saved_views_result_type_check
          CHECK (result_type IS NULL OR result_type IN ('accounts','contacts','needs_signals','partners'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
  }

  /**
   * Le `down` efface l'histoire des événements délivrés — donc la mémoire qui
   * empêche de les re-délivrer. Il ne se joue qu'à la main, en connaissance de
   * cause : le premier balayage suivant re-détecterait tout ce que la table
   * contenait et le ferait arriver une seconde fois.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_result_type_check`)
    await queryRunner.query(`ALTER TABLE saved_views DROP COLUMN IF EXISTS result_type`)
    await queryRunner.query(`DROP TABLE IF EXISTS discover_alert_events`)
  }
}
