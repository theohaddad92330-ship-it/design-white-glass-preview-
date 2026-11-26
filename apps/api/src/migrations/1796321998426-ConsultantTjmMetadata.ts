import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2948 (#2329.12/.13/.14/.16) — devise, source, contexte, date et
 * confidentialité d'un TJM (`TjmMetadata`, `packages/contracts/src/schemas/consultant.ts`).
 *
 * `jsonb`, pas des colonnes séparées : la forme est un petit objet validé côté
 * contrat (`tjmMetadataSchema`), même patron que `btmmp`/`access_path` sur
 * `opportunities` — aucune contrainte SQL ne porte sur son intérieur, la
 * fermeture du catalogue vit dans le zod.
 */
export class ConsultantTjmMetadata1796321998426 implements MigrationInterface {
  public name = 'ConsultantTjmMetadata1796321998426'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS tjm_metadata jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS tjm_metadata`)
  }
}
