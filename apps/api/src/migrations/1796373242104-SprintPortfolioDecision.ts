import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BEL-SC-228 (#3257) — portefeuille Focus / Sprint / Veille / Partenaire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANTÉRIORITÉ (instruction commune #3249, règles 1-3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le board d'effort du ticket EXISTE déjà (`accounts.sprint`, tome 5 §28-31,
 * migration `1789996184270-AccountSprint.ts`) : focus / extension / volume /
 * no_go. Il est plus mature que ce que le ticket décrit à nouveau (plafond dur,
 * plan de compte exigé, bascules automatiques/proposées, files arbitrage/
 * exécution) — la doctrine impose de le GARDER, pas de le redoubler.
 *
 * Ce que le ticket nomme et qui manquait VRAIMENT :
 *  - `watch` et `partner_route`, deux niveaux ajoutés EN FIN (GA-08) —
 *    voir `packages/contracts/src/schemas/sprint.ts` ;
 *  - une DÉCISION générique par compte (raison, effort estimé, date de revue,
 *    conditions de promotion/déclassement) — les cinq colonnes ci-dessous.
 *    `owner` et « prochaine action » ne sont PAS dupliqués ici : ils vivent
 *    déjà sur `accounts.assigned_to` / `action_plans` (doctrine #3249 règle 4 —
 *    jamais un second objet concurrent).
 *
 * GA-11/GA-12 : la contrainte `accounts_sprint_check` s'élargit ICI, AVANT tout
 * code qui pourrait écrire `watch`/`partner_route` — c'est ce que la garde
 * `check-constraints-cover-enums.spec.ts` vérifie automatiquement
 * (`accounts_sprint_check: 'SPRINT_LEVELS'`).
 */
export class SprintPortfolioDecision1796373242104 implements MigrationInterface {
  name = 'SprintPortfolioDecision1796373242104'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        DROP CONSTRAINT IF EXISTS accounts_sprint_check,
        ADD CONSTRAINT accounts_sprint_check
        CHECK (sprint IS NULL OR sprint IN ('focus', 'extension', 'volume', 'no_go', 'watch', 'partner_route'))
    `)

    // Cinq colonnes NULLABLES, aucun backfill : une décision qui n'a jamais été
    // écrite reste absente, jamais devinée (même doctrine que `sprint` lui-même
    // à sa création — « aucun compte n'entre dans un sprint sans que quelqu'un
    // l'y mette »).
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sprint_reason text`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sprint_effort_estimate text`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sprint_review_at timestamptz`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sprint_promotion_condition text`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sprint_demotion_condition text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS sprint_demotion_condition`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS sprint_promotion_condition`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS sprint_review_at`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS sprint_effort_estimate`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS sprint_reason`)
    await queryRunner.query(`
      ALTER TABLE accounts
        DROP CONSTRAINT IF EXISTS accounts_sprint_check,
        ADD CONSTRAINT accounts_sprint_check
        CHECK (sprint IS NULL OR sprint IN ('focus', 'extension', 'volume', 'no_go'))
    `)
  }
}
