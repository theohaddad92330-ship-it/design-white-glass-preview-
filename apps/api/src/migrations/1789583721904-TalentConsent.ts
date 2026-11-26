import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le consentement d'un talent (PDF 3 §7.3).
 *
 * La rétention existait déjà — deux ans après le dernier contact, plafond CNIL
 * — mais elle est PAR ESPACE et se calcule sur une inactivité. Le §7.3 demande
 * autre chose : ce que la PERSONNE a accepté, quand, et sur quelle base.
 *
 * Ce sont deux questions différentes, et la seconde est celle qu'un candidat
 * pose : « qu'est-ce que vous avez de moi, et pourquoi ? » Une politique de
 * rétention ne répond pas à ça.
 *
 * Trois colonnes seulement, et c'est délibéré : une table de consentements
 * versionnés serait un registre à tenir, et un registre que personne ne tient
 * vaut moins qu'une date à jour.
 */
export class TalentConsent1789583721904 implements MigrationInterface {
  public name = 'TalentConsent1789583721904'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Quand la personne a donné son accord. NULL = jamais recueilli — ce qui
    // est une information, et non un défaut à combler.
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS consent_given_at timestamptz`)
    // Jusqu'à quand il vaut. NULL = pas d'échéance connue.
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS consent_expires_at timestamptz`)
    // La base légale, en clair : « candidature spontanée », « cooptation »,
    // « accord donné en entretien ». Texte libre PARCE QUE la formulation
    // engage l'ESN et qu'une liste fermée la ferait choisir au hasard.
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS consent_basis text`)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultants_consent_expiry_idx
        ON consultants (workspace_id, consent_expires_at)
        WHERE consent_expires_at IS NOT NULL AND archived_at IS NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS consultants_consent_expiry_idx`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS consent_basis`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS consent_expires_at`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS consent_given_at`)
  }
}
