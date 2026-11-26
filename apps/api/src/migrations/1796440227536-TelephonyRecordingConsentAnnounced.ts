import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4016 L12 (Louis 11/10) — analyser des appels enregistrés, AVEC consentement
 * annoncé. L'ESN déclare, case cochée par elle, que l'enregistrement est annoncé
 * aux deux parties en début d'appel ; sans cette déclaration, aucun appel n'est
 * analysé (art. 226-1 du Code pénal — non négociable).
 *
 * Additive : deux colonnes, AUCUNE contrainte (GA-11 / GA-12), et surtout AUCUN
 * rétro-remplissage — `DEFAULT false` partout : une connexion créée avant ce lot
 * n'a rien déclaré, et un consentement ne se suppose pas. La date dit QUAND la
 * déclaration a été faite (`NULL` = jamais), pour qu'elle soit opposable.
 */
export class TelephonyRecordingConsentAnnounced1796440227536 implements MigrationInterface {
  public name = 'TelephonyRecordingConsentAnnounced1796440227536'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE telephony_connections
        ADD COLUMN IF NOT EXISTS recording_consent_announced boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS recording_consent_announced_at timestamptz
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
