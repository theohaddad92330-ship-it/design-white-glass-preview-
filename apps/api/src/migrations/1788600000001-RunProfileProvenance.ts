import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La provenance du profil sur chaque run (recette finale §13, §53 — P0-02).
 *
 * Le dossier Société Générale écrivait « profil ESN non précisé » sans que rien,
 * nulle part, ne permette de savoir QUEL profil avait conditionné le run ni
 * pourquoi il était générique. `seller_context` gardait bien un instantané des
 * réponses, mais un instantané ne dit ni sa version, ni s'il était exploitable :
 * on ne pouvait donc ni reproduire, ni expliquer.
 *
 * Une colonne, pas une table. La provenance n'a de sens qu'attachée à son run,
 * elle est écrite une fois et jamais mise à jour — une table séparée n'ajouterait
 * qu'une jointure et une occasion de désynchronisation.
 *
 * NULL = run antérieur à cette colonne. Volontairement pas de valeur par
 * défaut : « on ne sait pas » et « générique » sont deux choses différentes, et
 * un défaut à `generic` ferait mentir l'historique dans un sens comme dans
 * l'autre.
 */
export class RunProfileProvenance1788600000001 implements MigrationInterface {
  name = 'RunProfileProvenance1788600000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS profile_provenance jsonb`)
    await queryRunner.query(`
      COMMENT ON COLUMN analysis_runs.profile_provenance IS
        'Profil qui a conditionné ce run : mode (personalised|generic), raison du générique, versions esn_profiles et profiles.profile_context_version, réponses obligatoires renseignées. NULL = run antérieur à la colonne (inconnu, pas générique).'
    `)

    // Le questionnaire volontairement reporté. Sans cette trace, un utilisateur
    // qui clique « Plus tard » est renvoyé au questionnaire à chaque navigation
    // — et c'est précisément pour éviter cette boucle que le code utilisait
    // « ce compte a déjà une offre » comme preuve de complétion, ce qui faisait
    // sauter l'onboarding aux comptes bêta (§13).
    await queryRunner.query(`ALTER TABLE user_onboarding_state ADD COLUMN IF NOT EXISTS skipped_at timestamptz`)
    await queryRunner.query(`
      COMMENT ON COLUMN user_onboarding_state.skipped_at IS
        'Quand l''utilisateur a explicitement reporté le questionnaire. Distinct de status : un report n''est pas une complétion, et les analyses lancées ensuite sont marquées génériques.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE user_onboarding_state DROP COLUMN IF EXISTS skipped_at`)
    await queryRunner.query(`ALTER TABLE analysis_runs DROP COLUMN IF EXISTS profile_provenance`)
  }
}
