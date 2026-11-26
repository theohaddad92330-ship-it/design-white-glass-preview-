import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Append-only credit ledger (Théo §14 — « ledger crédits fiable »). The
 * `subscriptions` counters (`accounts_used`, `enrichment_credits`) hold a
 * balance but no history, so a consumed-then-refunded slot or a disputed
 * enrichment left no trace. This table records every movement — consume /
 * refund / grant / top-up — for the shared workspace pool.
 *
 * SAFE : nouvelle table isolée, aucune dépendance FK dure (owner/actor/account
 * en `uuid` nu pour survivre à une suppression de compte sans casser l'audit),
 * aucun changement sur les tables existantes. Le remplissage se fait au fil de
 * l'eau depuis `CreditsService` — pas de backfill (l'historique commence ici).
 */
export class CreditLedger1784900500000 implements MigrationInterface {
  public name = 'CreditLedger1784900500000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS credit_ledger (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        owner_user_id uuid NOT NULL,
        workspace_id uuid,
        actor_user_id uuid,
        kind text NOT NULL,
        resource text NOT NULL,
        delta integer NOT NULL,
        reason text,
        account_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS credit_ledger_owner_created_idx
      ON credit_ledger (owner_user_id, created_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS credit_ledger_owner_created_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS credit_ledger`)
  }
}
