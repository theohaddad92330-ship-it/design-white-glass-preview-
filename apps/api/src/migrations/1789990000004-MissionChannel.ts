import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Par quel CHEMIN une mission est arrivée (PDF 8 §5.3).
 *
 * L'écart de marge entre le direct et le passage par un intermédiaire est ce que
 * le document appelle « l'indicateur le plus stratégique » : c'est lui qui
 * justifie ou non un chantier de référencement rang 2 → rang 1. Sans lui, la
 * décision se prend au feeling.
 *
 * ⚠️ Le canal est SAISI, pas déduit. On pourrait croire qu'un partenaire connu
 * sur le compte suffit à conclure « rang 2 » : c'est faux une fois sur deux — un
 * compte peut être servi en direct ET via un intermédiaire, parfois la même
 * année. Un canal deviné produirait un écart chiffré, présenté comme l'argument
 * d'un chantier d'un an, et fondé sur une supposition.
 *
 * `unknown` par défaut, et compté À PART dans les calculs : verser les missions
 * non renseignées dans « direct » parce que c'est le cas le plus fréquent
 * fausserait précisément la comparaison qu'on cherche à faire.
 */
export class MissionChannel1789990000004 implements MigrationInterface {
  name = 'MissionChannel1789990000004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE mission_commercial_terms ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'unknown'`,
    )
    await queryRunner.query(
      `ALTER TABLE mission_commercial_terms DROP CONSTRAINT IF EXISTS mission_terms_channel_check`,
    )
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms ADD CONSTRAINT mission_terms_channel_check CHECK (
        channel IN ('direct', 'partner', 'subcontracting', 'unknown')
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE mission_commercial_terms DROP CONSTRAINT IF EXISTS mission_terms_channel_check`,
    )
    await queryRunner.query(`ALTER TABLE mission_commercial_terms DROP COLUMN IF EXISTS channel`)
  }
}
