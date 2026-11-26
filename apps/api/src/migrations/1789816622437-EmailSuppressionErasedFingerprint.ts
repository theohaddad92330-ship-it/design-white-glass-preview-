import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2297.51 — L'OPPOSITION D'UNE PERSONNE EFFACÉE EST GARDÉE, EN EMPREINTE
 * (décision Louis du 19/09/2026).
 *
 * Quand une personne prospectée exerce son droit à l'effacement (RGPD art. 17),
 * sa ligne `email_suppressions` n'est PAS supprimée : c'est elle qui empêche
 * qu'on lui écrive encore. Mais elle ne garde plus son adresse en clair — la
 * colonne `email` reçoit l'EMPREINTE HMAC-SHA-256 de l'adresse
 * (`person-erasure-fingerprint.ts`, clé `PERSON_ERASURE_HMAC_KEY`), et le
 * contrôle d'envoi (`SuppressionService.isSuppressed`) reconnaît les deux
 * formes.
 *
 *   - `erased_at` : QUAND l'adresse a été remplacée par son empreinte. NULL =
 *     une opposition ordinaire, adresse en clair — toutes les lignes
 *     existantes, qui restent à l'identique.
 *   - `email_suppressions_erased_form_check` : une ligne marquée effacée ne
 *     porte QU'UNE empreinte hexadécimale de 64 caractères. Une adresse en
 *     clair glissée par erreur sur une ligne effacée est refusée par la base.
 *
 * Additive : aucune ligne réécrite, aucune supprimée. La contrainte ne vise que
 * `erased_at IS NOT NULL`, qu'aucune ligne existante ne porte — elle ne peut
 * pas faire échouer le déploiement. Rejouable.
 */
export class EmailSuppressionErasedFingerprint1789816622437 implements MigrationInterface {
  public name = 'EmailSuppressionErasedFingerprint1789816622437'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE email_suppressions ADD COLUMN IF NOT EXISTS erased_at timestamptz NULL`)
    await queryRunner.query(
      `ALTER TABLE email_suppressions DROP CONSTRAINT IF EXISTS email_suppressions_erased_form_check`,
    )
    await queryRunner.query(
      `ALTER TABLE email_suppressions ADD CONSTRAINT email_suppressions_erased_form_check CHECK (erased_at IS NULL OR email ~ '^[0-9a-f]{64}$')`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE email_suppressions DROP CONSTRAINT IF EXISTS email_suppressions_erased_form_check`,
    )
    await queryRunner.query(`ALTER TABLE email_suppressions DROP COLUMN IF EXISTS erased_at`)
  }
}
