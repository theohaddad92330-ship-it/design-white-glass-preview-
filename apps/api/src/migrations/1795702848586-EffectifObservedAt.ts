import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2035.8 — « conserver période et fraîcheur » : QUAND chaque bande
 * d'effectif a été répondue, par clé.
 *
 * `esn_profiles` porte les VALEURS d'effectif (`consultant_size`,
 * `consultant_size_group_band`, `consultant_size_business_unit_band`,
 * `consultants_managed_by_user_band`, `available_consultants_band`) sans
 * jamais dater QUAND chacune a été donnée. Une colonne JSONB, comme
 * `answer_meta` (migration `1795000000001-OnboardingAnswerMeta`) : clé
 * d'`EsnAnswers` → ISO de la dernière écriture humaine, plutôt que cinq
 * colonnes de date une par une.
 *
 * ADDITIVE SEULEMENT (GA-11/GA-12) : `NOT NULL DEFAULT '{}'::jsonb` — une
 * ligne existante n'a d'entrée pour AUCUNE clé, ce qui se lit
 * `never_observed` (`readEffectifFreshness`, @bellum/contracts), jamais une
 * fausse fraîcheur ni une fausse péremption.
 */
export class EffectifObservedAt1795702848586 implements MigrationInterface {
  name = 'EffectifObservedAt1795702848586'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS effectif_observed_at jsonb NOT NULL DEFAULT '{}'::jsonb;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS effectif_observed_at;
    `)
  }
}
