import type { MigrationInterface, QueryRunner } from 'typeorm'
import { CASE_BUYING_MODELS, CASE_STRATEGIES } from '@bellum/contracts'

/**
 * #3246 / #3210.3 (lot W9, décision Louis 11/10/2026) — deux dimensions de
 * similarité à VOCABULAIRE FERMÉ : la stratégie d'approche et le modèle
 * d'achat, saisis sur le REX (`rex_entries`) et sur l'opportunité
 * (`opportunities`, lue pour les cas perdus).
 *
 * Additif uniquement, nullable, sans défaut : NULL = personne ne l'a dit, pas
 * une valeur devinée. Les CHECK sont posées ICI, avant le code qui écrit
 * (GA-11 / GA-12), et reprennent les listes de `@bellum/contracts`.
 */
const list = (codes: readonly string[]): string => codes.map(code => `'${code}'`).join(', ')

const TABLES = ['rex_entries', 'opportunities'] as const

export class CaseStrategyBuyingModel1796440123457 implements MigrationInterface {
  public name = 'CaseStrategyBuyingModel1796440123457'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS strategy text`)
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS buying_model text`)
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_strategy_check`)
      await queryRunner.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${table}_strategy_check CHECK (strategy IS NULL OR strategy IN (${list(CASE_STRATEGIES)}))`,
      )
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_buying_model_check`)
      await queryRunner.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${table}_buying_model_check CHECK (buying_model IS NULL OR buying_model IN (${list(CASE_BUYING_MODELS)}))`,
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_buying_model_check`)
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_strategy_check`)
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS buying_model`)
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS strategy`)
    }
  }
}
