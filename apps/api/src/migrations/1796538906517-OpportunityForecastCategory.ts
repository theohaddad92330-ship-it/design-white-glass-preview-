import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L2 Pilotage › Pipe (Louis 14/10/2026) — deux ajouts, ADDITIFS :
 *
 * 1. `opportunities.forecast_category` — la catégorie DÉCLARÉE par le commercial
 *    (`commit` / `best_case` / `pipeline` / `omitted`). Une déclaration humaine,
 *    PAS une probabilité. NULLABLE : une opportunité existante n'a rien déclaré,
 *    et « non déclarée » est une réponse honnête, jamais devinée depuis l'étape.
 *    Le CHECK est posé ICI, AVANT le code qui écrit la colonne (GA-11/GA-12) ; la
 *    liste vit dans `FORECAST_CATEGORIES` (`@bellum/contracts`).
 *
 * 2. `opportunity_field_changes` — le journal APPEND-ONLY, alimenté par trigger des changements de
 *    montant et de date prévue. Sans lui, « montant baissé », « date repoussée
 *    deux fois » et le waterfall du pipe (+ montées / − baissées) n'ont aucune
 *    source : l'ancienne valeur était écrasée. Les valeurs sont en texte (centimes
 *    ou date ISO), `NULL` = pas de valeur. Les lignes d'avant ce journal n'ont
 *    pas d'historique et n'en inventent pas.
 */
export class OpportunityForecastCategory1796538906517 implements MigrationInterface {
  name = 'OpportunityForecastCategory1796538906517'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS forecast_category text NULL
    `)
    await queryRunner.query(`
      ALTER TABLE opportunities
        DROP CONSTRAINT IF EXISTS opportunities_forecast_category_check,
        ADD CONSTRAINT opportunities_forecast_category_check
          CHECK (forecast_category IS NULL OR forecast_category IN ('commit', 'best_case', 'pipeline', 'omitted'))
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS opportunity_field_changes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NULL,
        opportunity_id uuid NOT NULL,
        field text NOT NULL,
        from_value text NULL,
        to_value text NULL,
        actor_id uuid NULL,
        occurred_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      ALTER TABLE opportunity_field_changes
        DROP CONSTRAINT IF EXISTS opportunity_field_changes_field_check,
        ADD CONSTRAINT opportunity_field_changes_field_check
          CHECK (field IN ('amount_cents', 'expected_close_on'))
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS opportunity_field_changes_opportunity_idx
        ON opportunity_field_changes (opportunity_id, occurred_at)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS opportunity_field_changes_workspace_idx
        ON opportunity_field_changes (workspace_id, occurred_at)
    `)
    await queryRunner.query(`ALTER TABLE opportunity_field_changes ENABLE ROW LEVEL SECURITY`)
    // Le journal s'écrit par TRIGGER, pas par chaque appelant : le montant et la
    // date prévue s'écrivent par plusieurs chemins (édition, conversion, synchro
    // CRM) et un chemin oublié laisserait un trou dans l'historique.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION log_opportunity_field_changes() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER AS $$
      DECLARE ws uuid;
      BEGIN
        ws := COALESCE(NEW.workspace_id, (SELECT workspace_id FROM accounts WHERE id = NEW.account_id));
        IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents THEN
          INSERT INTO opportunity_field_changes (workspace_id, opportunity_id, field, from_value, to_value)
          VALUES (ws, NEW.id, 'amount_cents', OLD.amount_cents::text, NEW.amount_cents::text);
        END IF;
        IF NEW.expected_close_on IS DISTINCT FROM OLD.expected_close_on THEN
          INSERT INTO opportunity_field_changes (workspace_id, opportunity_id, field, from_value, to_value)
          VALUES (ws, NEW.id, 'expected_close_on', OLD.expected_close_on::text, NEW.expected_close_on::text);
        END IF;
        RETURN NEW;
      END
      $$
    `)
    await queryRunner.query(`DROP TRIGGER IF EXISTS opportunities_log_field_changes ON opportunities`)
    await queryRunner.query(`
      CREATE TRIGGER opportunities_log_field_changes
        AFTER UPDATE OF amount_cents, expected_close_on ON opportunities
        FOR EACH ROW EXECUTE FUNCTION log_opportunity_field_changes()
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS opportunities_log_field_changes ON opportunities`)
    await queryRunner.query(`DROP FUNCTION IF EXISTS log_opportunity_field_changes()`)
    await queryRunner.query(`DROP TABLE IF EXISTS opportunity_field_changes`)
    await queryRunner.query(`ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_forecast_category_check`)
    await queryRunner.query(`ALTER TABLE opportunities DROP COLUMN IF EXISTS forecast_category`)
  }
}
