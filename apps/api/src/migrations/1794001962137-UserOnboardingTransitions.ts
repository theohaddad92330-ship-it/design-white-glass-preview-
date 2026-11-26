import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2004.12 — la machine d'état canonique de l'onboarding doit AUDITER chaque
 * changement d'état : `1793583494449-OnboardingStatusStates` a élargi la
 * contrainte de `user_onboarding_state.status` aux douze valeurs, mais rien
 * ne trace QUI/QUAND/POURQUOI une ligne est passée de l'une à l'autre.
 *
 * Table NEUVE, porte « ajout seulement » : `user_onboarding_transitions`,
 * append-only, une ligne par transition RÉELLEMENT appliquée par
 * `OnboardingService.transitionTo`.
 *
 * `from_status` et `to_status` portent chacun une contrainte `CHECK` qui
 * couvre EXACTEMENT `onboardingStatusSchema` (douze valeurs, même ordre) —
 * puisque la table est neuve, la contrainte naît déjà large : GA-11/GA-12 ne
 * s'appliquent qu'à l'élargissement d'une contrainte EXISTANTE, pas à la
 * création d'une table et de sa contrainte dans le même geste.
 *
 * Pas de policy RLS (même choix que `1793700400000-TargetLists` : RLS activée,
 * aucune policy — table API-owned, jamais lue par un client Supabase direct).
 */
export class UserOnboardingTransitions1794001962137 implements MigrationInterface {
  name = 'UserOnboardingTransitions1794001962137'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ La liste des douze valeurs est écrite EN CLAIR deux fois (jamais
    // interpolée depuis une constante partagée) : la garde GA-12
    // (`check-constraints-cover-enums.spec.ts`) lit le TEXTE SOURCE de la
    // migration pour comparer une contrainte à son énumération TypeScript —
    // une valeur assemblée par interpolation JS est invisible à cette
    // lecture et la ferait échouer en pensant la contrainte vide.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_onboarding_transitions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        from_status text NOT NULL,
        to_status text NOT NULL,
        reason text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT user_onboarding_transitions_from_status_check CHECK (
          from_status IN (
            'not_started', 'in_progress', 'completed',
            'identity_in_progress', 'audit_in_progress', 'audit_generating',
            'audit_to_review', 'audit_validated', 'data_enrichment_optional',
            'first_value_ready', 'activated', 'refresh_required'
          )
        ),
        CONSTRAINT user_onboarding_transitions_to_status_check CHECK (
          to_status IN (
            'not_started', 'in_progress', 'completed',
            'identity_in_progress', 'audit_in_progress', 'audit_generating',
            'audit_to_review', 'audit_validated', 'data_enrichment_optional',
            'first_value_ready', 'activated', 'refresh_required'
          )
        )
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS user_onboarding_transitions_user_idx ON user_onboarding_transitions (user_id, created_at)`,
    )
    await queryRunner.query(`ALTER TABLE user_onboarding_transitions ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_onboarding_transitions`)
  }
}
