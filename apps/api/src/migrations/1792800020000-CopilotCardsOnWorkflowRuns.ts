import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1931/#1930/#1943/#1952/#1959 — lot 4's foundation: a chat card BECOMES a
 * `workflow_runs` row, instead of living only in a chat response's
 * `context.pending_actions` (D1 of the lot-4 plan: nothing was persisted, so a
 * card disappeared on reload).
 *
 * Additive only — no existing column changes shape, nothing is backfilled,
 * nothing is dropped. Every new column is NULLABLE: an existing run (created
 * before this migration) reads `null` on all seven, which `cardStateOf`
 * (`packages/contracts/src/schemas/copilot-card.ts`) already treats as "no
 * preview yet" rather than as an error.
 *
 * `workflow_runs`:
 *  - `intents` — the concrete `ActionIntent`s the runner will dispatch, once a
 *    click resolves them. Distinct from `preview`: this is what EXECUTES, the
 *    other is what a human SEES before deciding.
 *  - `preview` — the eight-line `CardPreview` (#1930), computed once Action OS
 *    has resolved a target. `null` is what makes `cardStateOf` tell "Suggérée"
 *    (Laura just raised it) apart from "Préparée" (ready for a click) — both
 *    are `status = 'planned'` otherwise.
 *  - `result` — the after-action `CardResult` (#1931's "résultat / date /
 *    acteur / objet / destination / identifiant / coût / prochaine étape").
 *  - `conversation_id` / `turn_id` / `proposal_index` — where a card CAME
 *    from: which thread, which turn in it, which rank among that turn's
 *    proposals. Together they form the card's stable key
 *    (`copilotCardIdempotencyKey`, `packages/contracts`): one run per
 *    (thread, turn, rank).
 *  - `snoozed_until` — the reporter's target date, read only while
 *    `status = 'snoozed'`.
 *
 * `chat_messages.turn_id` — the other half of the card's key: a chat message
 * does not carry a turn identifier today, so a card born from an assistant
 * turn has nothing stable to reference back to. Nullable: existing messages
 * simply predate turns.
 *
 * No `CHECK` constraint touches `workflow_runs.status` or `.trigger` — both
 * are plain `text NOT NULL` since `1788270000000-ActionOs.ts` created them, so
 * the two enum values added alongside this migration
 * (`packages/contracts/src/schemas/action-os.ts`: `snoozed`, `superseded`,
 * `copilot_proposal`) need no widening here. Verified against
 * `check-constraints-cover-enums.spec.ts`'s own `MAPPING` (GA-12): neither
 * column appears in it.
 */
export class CopilotCardsOnWorkflowRuns1792800020000 implements MigrationInterface {
  public name = 'CopilotCardsOnWorkflowRuns1792800020000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workflow_runs
        ADD COLUMN IF NOT EXISTS intents jsonb,
        ADD COLUMN IF NOT EXISTS preview jsonb,
        ADD COLUMN IF NOT EXISTS result jsonb,
        ADD COLUMN IF NOT EXISTS conversation_id text,
        ADD COLUMN IF NOT EXISTS turn_id uuid,
        ADD COLUMN IF NOT EXISTS proposal_index smallint,
        ADD COLUMN IF NOT EXISTS snoozed_until timestamptz
    `)
    // The read the Action Center's "carte de copilote" screen (L4) will run:
    // all cards for a given thread/turn. Partial on `conversation_id` would
    // exclude runs from before this feature; a plain composite index over
    // nullable columns is a normal, cheap default for a column that starts
    // NULL on every existing row and is set on every new one going forward.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS workflow_runs_conversation_turn_idx
      ON workflow_runs (workspace_id, conversation_id, turn_id)
    `)

    await queryRunner.query(`
      ALTER TABLE chat_messages
        ADD COLUMN IF NOT EXISTS turn_id uuid
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
