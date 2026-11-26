import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Temps 2 — le complément de profil, demandé APRÈS la première analyse.
 *
 * Deux ajouts, tous deux additifs et idempotents :
 *
 * 1. `esn_profiles` gagne les trois colonnes qui manquaient aux questions du
 *    complément. Les deux autres (`decision_maker_personas`, `avg_sales_cycle`)
 *    existent depuis la création de la table (migration 1780000000000) et
 *    n'ont jamais été remplies — c'est précisément ce que le Temps 2 corrige.
 *    - `avg_tjm`           → prompt « TJM moyen : {avgTJM} EUR »
 *    - `client_references` → prompt « References clients : … »
 *    - `no_go_sectors`     → `bellum_strategy` (`noGoSectors`)
 *
 * 2. `user_onboarding_state` gagne le cycle de vie du complément. Trois
 *    horodatages nullables plutôt qu'une colonne de statut avec CHECK : un
 *    CHECK sur un vocabulaire est exactement ce qui a déjà fait échouer des
 *    écritures en prod (incident `account_vocabulary.kind`), et l'état se
 *    dérive sans ambiguïté de ces trois dates. NULL partout = « à proposer »,
 *    c'est-à-dire le comportement par défaut de tous les comptes existants.
 *
 * Aucun backfill, aucune RLS touchée (les policies user-scoped des deux tables
 * couvrent les nouvelles colonnes), aucun impact sur le Temps 1.
 */
export class OnboardingProfileComplement1787961204338 implements MigrationInterface {
  public name = 'OnboardingProfileComplement1787961204338'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS avg_tjm TEXT`)
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_references TEXT[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS no_go_sectors TEXT[] NOT NULL DEFAULT '{}'`,
    )

    await queryRunner.query(
      `ALTER TABLE user_onboarding_state ADD COLUMN IF NOT EXISTS complement_snoozed_until TIMESTAMPTZ`,
    )
    await queryRunner.query(
      `ALTER TABLE user_onboarding_state ADD COLUMN IF NOT EXISTS complement_completed_at TIMESTAMPTZ`,
    )
    await queryRunner.query(
      `ALTER TABLE user_onboarding_state ADD COLUMN IF NOT EXISTS complement_dismissed_at TIMESTAMPTZ`,
    )

    await queryRunner.query(`
      COMMENT ON COLUMN user_onboarding_state.complement_snoozed_until IS
        'Temps 2 postponed until this instant ("plus tard"). NULL = not snoozed.'
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN user_onboarding_state.complement_dismissed_at IS
        'Temps 2 refused for good ("ne plus me le proposer"). NULL = still proposable.'
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
