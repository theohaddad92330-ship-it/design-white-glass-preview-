import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * RGPD droit à l'effacement (art. 17) : marque de tombstone `anonymized_at` sur
 * les deux tables qui portent des données à caractère personnel d'une personne
 * physique et que le flux de suppression SCRUB (au lieu de hard-delete) :
 *   - `profiles`  — l'identité de l'utilisateur (email, prénom, nom, avatar) ;
 *   - `contacts`  — les prospects collectés (nom, email, téléphone, LinkedIn…).
 *
 * `anonymized_at IS NOT NULL` = la ligne a été anonymisée par
 * `POST /privacy/delete-account` ; ses champs PII portent alors les marqueurs
 * `[supprimé]` / `null` / un email haché. C'est aussi le point d'ancrage de la
 * politique de rétention (purge éventuelle d'un anonymisé après N jours — voir
 * `agent_docs/legal/privacy-retention-policy.md`).
 *
 * Additif + idempotent (`ADD COLUMN IF NOT EXISTS`). Aucune donnée existante
 * n'est touchée (colonne nullable, défaut NULL). RLS inchangé. Migration
 * possédée par NestJS (owner des tables métier).
 */
export class PrivacyAnonymizedAt1785750000000 implements MigrationInterface {
  public name = 'PrivacyAnonymizedAt1785750000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS anonymized_at timestamptz`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS anonymized_at timestamptz`)
    // Partial indexes so the retention sweep (WHERE anonymized_at < cutoff) stays
    // cheap without weighing on the common `anonymized_at IS NULL` hot path.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_profiles_anonymized_at ON profiles (anonymized_at) WHERE anonymized_at IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_contacts_anonymized_at ON contacts (anonymized_at) WHERE anonymized_at IS NOT NULL`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
