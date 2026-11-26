import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3403.12 — LA CHALEUR RELATIONNELLE D'UN LIEN, DÉCLARÉE.
 *
 * Le retour #3403 demandait « chaleur relationnelle » comme attribut de voie.
 * Aucune source ne la calcule (un lien « probable » ne dit pas si on dîne avec
 * la personne ou si on lui a serré la main une fois) : elle est donc SAISIE,
 * par le commercial qui connaît le lien, sur `ContactWarmIntroCard`.
 *
 * `warmth` est NULLABLE, sans défaut : une ligne existante n'a jamais déclaré
 * de chaleur, et `distant` par défaut affirmerait une distance que personne n'a
 * jugée. Contrainte élargie AVANT le code qui l'écrit (trois niveaux fermés,
 * `RELATIONAL_WARMTHS` de @bellum/contracts).
 */
export class IntroductionAuthorizationWarmth1796425310417 implements MigrationInterface {
  public name = 'IntroductionAuthorizationWarmth1796425310417'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE introduction_authorizations
        ADD COLUMN IF NOT EXISTS warmth text
    `)
    await queryRunner.query(`
      ALTER TABLE introduction_authorizations
        DROP CONSTRAINT IF EXISTS introduction_authorizations_warmth_check
    `)
    await queryRunner.query(`
      ALTER TABLE introduction_authorizations
        ADD CONSTRAINT introduction_authorizations_warmth_check
        CHECK (warmth IS NULL OR warmth IN ('distant', 'cordial', 'close'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
