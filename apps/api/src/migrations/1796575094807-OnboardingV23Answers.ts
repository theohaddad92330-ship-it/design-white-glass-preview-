import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo O onboarding-couverture (22/10/2026) — LES 26 CLÉS NEUVES DE L'ONBOARDING V23.
 *
 * Une réponse du profil ESN comme les autres : le profil n'a pas de blob, chaque réponse a sa colonne, et l'écriture
 * passe par le `merge` de l'entité (voir `answers-v23.ts`, `@bellum/contracts`). Les vingt-six sont facultatives :
 * `NULL` (texte) ou `'{}'` (liste) = pas de réponse = le comportement d'avant, à l'octet près, pour tous les espaces
 * existants. Une absence n'est jamais « 0 ».
 *
 * AUCUN `CHECK` sur les valeurs : comme toute réponse du catalogue, elles sont persistées verbatim (le catalogue vit
 * au contrat, GA-12) et une incertitude garde son libellé (#2027). Rien à élargir avant le code qui les écrit (GA-11) :
 * la contrainte n'existe pas, cette migration n'en pose pas.
 *
 * Additive et idempotente (`IF NOT EXISTS`). Aucune clé étrangère : rien à cascader.
 */
export class OnboardingV23Answers1796575094807 implements MigrationInterface {
  name = 'OnboardingV23Answers1796575094807'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS target_nature TEXT[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS target_size TEXT[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS language_capabilities TEXT[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS priority_expertise TEXT[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS skill_technos TEXT[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS activity_nature TEXT[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS data_sources TEXT[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tools TEXT[] NOT NULL DEFAULT '{}'`)
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS delivery_frictions TEXT[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS recruiting_priorities TEXT[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(
      `ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS country_scope TEXT[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS account_access TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS horizon TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS success_target TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS offer_pitch TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS workflow_pain TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS autonomy TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS context_policy TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS commercial_limits TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS currency TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS first_name TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS scope_level TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS scope_unit TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS bench_status TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS geography_detail TEXT`)
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS no_go TEXT`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS target_nature`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS target_size`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS language_capabilities`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS priority_expertise`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS skill_technos`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS activity_nature`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS data_sources`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tools`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS delivery_frictions`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS recruiting_priorities`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS country_scope`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS account_access`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS horizon`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS success_target`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS offer_pitch`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS workflow_pain`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS autonomy`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS context_policy`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS commercial_limits`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS currency`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS first_name`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS scope_level`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS scope_unit`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS bench_status`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS geography_detail`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS no_go`)
  }
}
