import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4452 — `provider_costs.units` était un `int`, mais le service IA décompte
 * des fractions (Firecrawl : 0,1666… page par appel partagé). L'insertion en
 * lot échouait en entier (« invalid input syntax for type integer ») et le
 * coût de TOUT le tour était perdu (« Provider cost not recorded »).
 *
 * La colonne s'élargit AVANT le code qui écrit des fractions (GA-11/GA-12).
 * `int → numeric` est sans perte : chaque valeur existante se relit à
 * l'identique. Le retour arrondit plutôt que d'échouer sur une fraction.
 */
export class ProviderCostUnitsNumeric1796574508901 implements MigrationInterface {
  name = 'ProviderCostUnitsNumeric1796574508901'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE provider_costs ALTER COLUMN units TYPE numeric USING units::numeric`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE provider_costs ALTER COLUMN units TYPE int USING round(units)::int`)
  }
}
