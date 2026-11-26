import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2897 (#2091.36) — « BellumAI a été repensé » pour les comptes dont
 * l'onboarding s'est terminé AVANT la refonte de l'écran Welcome
 * (`WELCOME_REDESIGN_DATE`, `packages/contracts/src/schemas/welcome-redesign.ts`).
 *
 * UN horodatage nullable, même discipline que
 * `user_onboarding_state.complement_dismissed_at`
 * (`1787961204338-OnboardingProfileComplement.ts`) : NULL = jamais fermée,
 * un compte existant ne l'a par construction jamais fermée. « Fermée » n'a
 * pas de date de report ni de « plus tard » — la bannière ne revient pas
 * (même choix produit que « ne plus me le proposer » sur le complément).
 */
export class WelcomeRedesignBannerDismissed1796350894461 implements MigrationInterface {
  public name = 'WelcomeRedesignBannerDismissed1796350894461'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE user_onboarding_state ADD COLUMN IF NOT EXISTS redesign_banner_dismissed_at TIMESTAMPTZ`,
    )
    await queryRunner.query(`
      COMMENT ON COLUMN user_onboarding_state.redesign_banner_dismissed_at IS
        'Welcome-redesign banner (#2897) closed by the user. NULL = never closed.'
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
