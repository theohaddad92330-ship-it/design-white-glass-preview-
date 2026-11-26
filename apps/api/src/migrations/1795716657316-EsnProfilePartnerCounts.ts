import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2067.2 (décision Louis du 18/09/2026, reprise du lot H26) — AVEC COMBIEN de
 * partenaires (ESN, cabinets, rangs 1) la personne travaille réellement
 * aujourd'hui, réguliers puis ponctuels.
 *
 * Deux colonnes TEXT nullable, additives : `partners_regular_count` et
 * `partners_occasional_count`, une valeur verbatim du catalogue
 * `PARTNER_COUNT_BANDS` (`profile-questionnaire.ts`, « Je ne sais pas »
 * compris). Aucune contrainte SQL : les autres réponses du profil progressif
 * (`partner_relationship` juste à côté) n'en portent pas, le catalogue est tenu
 * par le contrat. Un profil qui ne répond à rien reste exactement ce qu'il était.
 *
 * Horodatage RÉEL (`Date.now()` au moment de l'écriture), pas un préfixe rond ni
 * recopié : les colonnes s'ajoutent à `esn_profiles`, qui existe depuis
 * longtemps — aucune migration plus récente n'en dépend.
 */
export class EsnProfilePartnerCounts1795716657316 implements MigrationInterface {
  name = 'EsnProfilePartnerCounts1795716657316'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS partners_regular_count text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS partners_occasional_count text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS partners_regular_count;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS partners_occasional_count;
    `)
  }
}
