import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2855 — la PROVENANCE d'une écriture CRM : qui/quoi a composé la
 * proposition (compte rendu, appel, routine, MCP), jamais un recalcul après
 * coup. ADDITIVE, nullable : les lignes déjà en base n'ont pas de provenance
 * tracée, ce qui se lit « non renseigné », jamais « aucune ».
 *
 * `jsonb`, sans CHECK : la forme (`{ kind, ref? }`) est portée par
 * `writeSourceSchema` côté contrat, pas par une contrainte SQL — comme
 * `payload`/`preview` sur cette même table.
 */
export class OutboundWriteRequestSource1796001551585 implements MigrationInterface {
  public name = 'OutboundWriteRequestSource1796001551585'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outbound_write_requests ADD COLUMN IF NOT EXISTS source jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outbound_write_requests DROP COLUMN IF EXISTS source`)
  }
}
