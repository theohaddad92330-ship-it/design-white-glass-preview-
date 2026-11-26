import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3245 (reste de #3209.6) — LE PROFIL DE PARI, DÉCLARÉ.
 *
 * « Uniquement de très grands comptes fermés », « uniquement des paris
 * longs », « plusieurs comptes qui réclament la même ressource » n'avaient
 * aucune mesure structurée : `estimatedDealSize` est un texte libre du
 * modèle, `employees` un format libre. La source se BRANCHE (décision Louis
 * 30/09) : quatre colonnes que le commercial DÉCLARE, jamais remplies par le
 * système. Toutes nullables, aucun backfill — « non déclaré » n'est ni
 * « court », ni « petit », ni « ouvert ».
 *
 * GA-11/GA-12 — cette migration ARRIVE AVANT le code qui écrit ces valeurs.
 */
export class AccountBetProfile1796413395732 implements MigrationInterface {
  name = 'AccountBetProfile1796413395732'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS bet_horizon text,
        ADD COLUMN IF NOT EXISTS bet_size text,
        ADD COLUMN IF NOT EXISTS bet_access text,
        ADD COLUMN IF NOT EXISTS bet_resource text
    `)
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD CONSTRAINT accounts_bet_horizon_check CHECK (bet_horizon IS NULL OR bet_horizon IN ('short','long')),
        ADD CONSTRAINT accounts_bet_size_check CHECK (bet_size IS NULL OR bet_size IN ('standard','very_large')),
        ADD CONSTRAINT accounts_bet_access_check CHECK (bet_access IS NULL OR bet_access IN ('open','closed')),
        ADD CONSTRAINT accounts_bet_resource_check CHECK (bet_resource IS NULL OR char_length(bet_resource) <= 60)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        DROP CONSTRAINT IF EXISTS accounts_bet_horizon_check,
        DROP CONSTRAINT IF EXISTS accounts_bet_size_check,
        DROP CONSTRAINT IF EXISTS accounts_bet_access_check,
        DROP CONSTRAINT IF EXISTS accounts_bet_resource_check,
        DROP COLUMN IF EXISTS bet_horizon,
        DROP COLUMN IF EXISTS bet_size,
        DROP COLUMN IF EXISTS bet_access,
        DROP COLUMN IF EXISTS bet_resource
    `)
  }
}
