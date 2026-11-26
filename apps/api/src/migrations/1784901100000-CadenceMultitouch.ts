import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Moteur de cadence multi-touch (Drive #8, méthode Théo).
 *
 * Adds two nullable discriminator columns to `action_plan_items` so a contact's
 * relance sequence (J+3 relance → J+6 preuve sociale → J+9 close-loop) lives in
 * the SAME table as the plan checklist and is reminded by the SAME daily cron
 * ("Rappels de relance") — no second cron, no second table:
 *   - `contact_id`   — the contact this follow-up touch belongs to (NULL for a
 *                      normal plan item). ON DELETE CASCADE: drop a contact ⇒
 *                      drop its scheduled relances.
 *   - `cadence_step` — the touch's stable key (`relance`|`preuve_sociale`|
 *                      `close_loop`). NON-NULL ⟺ this is a cadence row.
 *
 * The plan checklist (`ActionPlanItemsService.listForAccount`) filters to
 * `cadence_step IS NULL`; the relance cron scans by `due_date`/`done` and so
 * covers both kinds. A partial index keeps "cadence items for a contact"
 * (idempotency + the `GET /contacts/:id/cadence` read) cheap.
 *
 * Migration owned here (NestJS = owner of the métier tables).
 */
export class CadenceMultitouch1784901100000 implements MigrationInterface {
  public name = 'CadenceMultitouch1784901100000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE action_plan_items
        ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS cadence_step TEXT
    `)

    // Cadence reads: "the scheduled touches for this contact" (idempotent
    // scheduling + the cadence endpoint). Partial — only cadence rows carry it.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS action_plan_items_contact_cadence_idx
        ON action_plan_items (contact_id)
        WHERE cadence_step IS NOT NULL
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
