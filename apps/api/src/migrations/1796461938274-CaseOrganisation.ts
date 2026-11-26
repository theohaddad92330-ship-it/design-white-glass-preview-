import type { MigrationInterface, QueryRunner } from 'typeorm'
import { CASE_ORGANISATIONS } from '@bellum/contracts'

/**
 * #3246 / #3210.3 (lot cloud 14/10) — troisième dimension de similarité à
 * VOCABULAIRE FERMÉ : l'organisation de la décision, saisie sur le REX
 * (`rex_entries`) et sur l'opportunité (`opportunities`, lue pour les cas
 * perdus) — même patron que `1796440123457-CaseStrategyBuyingModel`.
 *
 * Additif uniquement, nullable, sans défaut : NULL = personne ne l'a dit, pas
 * une valeur devinée. Le CHECK est posé ICI, avant le code qui écrit
 * (GA-11 / GA-12), et reprend la liste de `@bellum/contracts`.
 */
const list = (codes: readonly string[]): string => codes.map(code => `'${code}'`).join(', ')

const TABLES = ['rex_entries', 'opportunities'] as const

export class CaseOrganisation1796461938274 implements MigrationInterface {
  public name = 'CaseOrganisation1796461938274'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS organisation text`)
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_organisation_check`)
      await queryRunner.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${table}_organisation_check CHECK (organisation IS NULL OR organisation IN (${list(CASE_ORGANISATIONS)}))`,
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_organisation_check`)
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS organisation`)
    }
  }
}
