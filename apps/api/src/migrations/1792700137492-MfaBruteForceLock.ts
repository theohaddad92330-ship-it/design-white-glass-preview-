import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Verrou anti-bourrage sur le second facteur (finding pentest #4, MOYENNE).
 *
 * `POST /auth/2fa/challenge` n'avait ni plafond de tentatives par utilisateur,
 * ni anti-rejeu : un attaquant détenant un mot de passe volé demandait autant de
 * `mfaToken` que voulu et testait les codes à 6 chiffres. Trois colonnes,
 * AJOUT SEULEMENT, portent l'état du verrou côté compte (pas seulement l'IP) :
 *
 *  - `mfa_failed_attempts` : le compte de codes erronés consécutifs ; remis à 0
 *    au premier succès.
 *  - `mfa_locked_until` : quand le verrou s'ouvre après trop d'échecs. `NULL` =
 *    pas verrouillé (une absence, pas un 0).
 *  - `mfa_last_code` : le dernier code accepté, pour refuser sa RÉ-soumission
 *    dans sa fenêtre de validité (~90 s). `NULL` = aucun code encore utilisé.
 *
 * Toutes nullables / à défaut sûr : une ligne d'avant ce lot lit « jamais
 * verrouillée, aucun code déjà utilisé », ce qui est vrai.
 */
export class MfaBruteForceLock1792700137492 implements MigrationInterface {
  public name = 'MfaBruteForceLock1792700137492'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_mfa
        ADD COLUMN IF NOT EXISTS mfa_failed_attempts integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS mfa_locked_until timestamptz,
        ADD COLUMN IF NOT EXISTS mfa_last_code text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_mfa
        DROP COLUMN IF EXISTS mfa_failed_attempts,
        DROP COLUMN IF EXISTS mfa_locked_until,
        DROP COLUMN IF EXISTS mfa_last_code
    `)
  }
}
