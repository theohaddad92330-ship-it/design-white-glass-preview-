import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4270.1 (18/10/2026, décision Louis) — LE PROFIL D'ESPACE « FORFAIT / CONSEIL ».
 *
 * Une réponse du profil ESN comme les autres (le profil n'a pas de blob : chaque
 * réponse a sa colonne, l'écriture passe par le `merge` de l'entité). Posée à
 * l'onboarding, modifiée là où se modifient les autres réponses de l'entreprise
 * (GA-26). Voir `workspace-profile.ts` (`@bellum/contracts`).
 *
 * NULLABLE, sans défaut : `NULL` = aucun choix = comportement d'avant, à
 * l'octet près, pour tous les espaces existants. Le `CHECK` copie
 * `WORKSPACE_PROFILES` (GA-12) et arrive AVANT le code qui l'écrit (GA-11).
 *
 * Additive et idempotente. Aucune clé étrangère : rien à cascader.
 */
export class EsnWorkspaceProfile1796560286663 implements MigrationInterface {
  name = 'EsnWorkspaceProfile1796560286663'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS workspace_profile text`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP CONSTRAINT IF EXISTS esn_profiles_workspace_profile_check`)
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD CONSTRAINT esn_profiles_workspace_profile_check CHECK (
        workspace_profile IS NULL OR workspace_profile IN ('staffing', 'forfait_conseil')
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles DROP CONSTRAINT IF EXISTS esn_profiles_workspace_profile_check`)
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS workspace_profile`)
  }
}
