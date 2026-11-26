import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2059 — « Comment as-tu connu {{brand}} ? », l'attribution marketing.
 *
 * EN AJOUT SEULEMENT, nullable et sans défaut (GA-11 / GA-12 : la colonne
 * existe avant le code qui l'écrit). Aucune ligne existante ne change de sens,
 * et `NULL` veut dire « facultative, jamais répondue » — jamais une valeur
 * devinée à la place de l'utilisateur (#2059.7).
 *
 * 🔴 Cette colonne ne doit JAMAIS entrer dans un chemin de notation ni dans un
 * prompt (#2059.9/.10) — voir la garde
 * `packages/contracts/src/schemas/heard-about-bellum-attribution.guard.test.ts`.
 */
export class EsnProfileHeardAboutBellum1794200200000 implements MigrationInterface {
  public name = 'EsnProfileHeardAboutBellum1794200200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS heard_about_bellum text`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
