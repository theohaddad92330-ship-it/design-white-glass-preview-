import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3387.10 — « qui intervient en renfort transversal ». Un drapeau sur le
 * membre : additif, faux par défaut, donc aucun membre existant n'est désigné
 * le jour du déploiement (jamais une désignation devinée).
 */
export class WorkspaceMemberCrossTeamSupport1796420137421 implements MigrationInterface {
  name = 'WorkspaceMemberCrossTeamSupport1796420137421'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS cross_team_support boolean NOT NULL DEFAULT false`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspace_members DROP COLUMN IF EXISTS cross_team_support`)
  }
}
