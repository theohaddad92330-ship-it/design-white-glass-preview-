import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'échéance d'un référencement, en COLONNE (tome 1, F08).
 *
 * `lockFactFromAwards` calcule déjà le jour où la consultation de
 * renouvellement se prépare — et ne le range que dans la phrase française du
 * `detail` (« consultation de renouvellement à préparer vers le 12/03/2029 »).
 * Une alerte à T-9, T-6 et T-3 mois devrait donc relire de la prose pour
 * retrouver une date, ce qui est exactement le raisonnement que le dépôt
 * s'interdit partout ailleurs : on ne conclut pas d'un texte.
 *
 * Colonne additive et nullable : un fait qui n'en porte pas n'alerte jamais.
 * C'est la même règle qu'ailleurs — « échéance inconnue » n'est pas « imminent ».
 */
export class AccessFactReopensOn1789997584210 implements MigrationInterface {
  name = 'AccessFactReopensOn1789997584210'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE access_facts ADD COLUMN IF NOT EXISTS reopens_on date`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS access_facts_reopens_idx ON access_facts (reopens_on) WHERE reopens_on IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS access_facts_reopens_idx`)
    await queryRunner.query(`ALTER TABLE access_facts DROP COLUMN IF EXISTS reopens_on`)
  }
}
