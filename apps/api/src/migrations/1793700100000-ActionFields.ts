import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2123.21-.31 — les champs qu'une action doit porter pour être exécutable.
 *
 * Une carte disait « Rappeler le DSI » et rien d'autre : ni pourquoi, ni sur
 * quelle information, ni ce qu'elle coûte, ni ce qu'il faut avoir fait avant.
 * Le commercial arbitrait au doigt mouillé entre quinze lignes équivalentes.
 *
 *  - `reason` — POURQUOI cette action, en une phrase.
 *  - `depends_on_item_id` — l'action à faire AVANT (même table).
 *  - `source` / `source_at` — la provenance : la source ET sa date, jamais
 *    l'une sans l'autre. Le vocabulaire est celui de `FIELD_SOURCES`
 *    (`human` / `connector` / `pipeline` / `model`), pas un second (GA-26).
 *  - `confidence` — trois crans. **NULL = non mesurée**, ce qui n'est PAS
 *    « faible » : la colonne est nullable pour que l'absence reste un état.
 *  - `cost_credits` — le coût annoncé AVANT le geste qui le facture. NULL =
 *    non mesuré ; 0 voudrait dire gratuit, ce qui est une autre affirmation,
 *    d'où l'absence de DEFAULT 0 (un défaut à zéro aurait transformé « on ne
 *    sait pas » en « c'est gratuit » sur toutes les lignes existantes).
 *
 * Le contact lié existe déjà (`contact_id`, moteur de cadence) : il est
 * RÉUTILISÉ, pas dupliqué. La page propriétaire (#2123.33) ne prend aucune
 * colonne — elle se dérive de la nature de l'objet visé, à un seul endroit.
 *
 * ⚠️ **Ajout seulement**, posée AVANT le code qui écrit (GA-11 / GA-12), chaque
 * énoncé idempotent.
 */
export class ActionFields1793700100000 implements MigrationInterface {
  public name = 'ActionFields1793700100000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS reason TEXT`)
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS depends_on_item_id UUID`)
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS source TEXT`)
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS source_at TIMESTAMPTZ`)
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS confidence TEXT`)
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS cost_credits INTEGER`)

    await queryRunner.query(`ALTER TABLE action_plan_items DROP CONSTRAINT IF EXISTS action_plan_items_source_check`)
    await queryRunner.query(
      `ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_source_check
         CHECK (source IS NULL OR source IN ('human', 'connector', 'pipeline', 'model'))`,
    )

    await queryRunner.query(
      `ALTER TABLE action_plan_items DROP CONSTRAINT IF EXISTS action_plan_items_confidence_check`,
    )
    await queryRunner.query(
      `ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_confidence_check
         CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low'))`,
    )

    // Un coût négatif serait un remboursement, qui ne s'écrit pas ici.
    await queryRunner.query(`ALTER TABLE action_plan_items DROP CONSTRAINT IF EXISTS action_plan_items_cost_check`)
    await queryRunner.query(
      `ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_cost_check
         CHECK (cost_credits IS NULL OR cost_credits >= 0)`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
